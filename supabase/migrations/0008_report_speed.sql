-- =====================================================================
-- Rychlejší reporty
-- „Slabá místa“ se počítají přímo v databázi místo stahování všech odpovědí
-- do aplikace (rychlost nezávislá na počtu kontrol, bez limitu 1000 řádků).
--
-- Spustit v Supabase: SQL Editor -> vložit celý soubor -> Run
-- =====================================================================

-- security invoker: platí běžná oprávnění (klient vidí jen své schválené kontroly)
create or replace function public.weak_points(p_ids uuid[], p_limit int default 10)
returns table (text text, topic text, total int, negative int)
language sql stable security invoker set search_path = public as $$
  select q.text,
         t.title,
         count(*)::int,
         (count(*) filter (where a.fraction = 0))::int
    from public.answers a
    join public.inspection_questions q on q.id = a.question_id
    join public.inspection_topics t on t.id = q.topic_id
   where a.inspection_id = any (p_ids)
     and a.fraction is not null
   group by t.title, q.text
  having count(*) filter (where a.fraction = 0) > 0
   order by (count(*) filter (where a.fraction = 0))::numeric / count(*) desc,
            4 desc
   limit p_limit
$$;

grant execute on function public.weak_points(uuid[], int) to authenticated;

-- indexy pro reporty (filtr podle stavu a data)
create index if not exists inspections_status_window_idx on public.inspections (status, window_start);

-- ---------------------------------------------------------------------
-- Rychlejší kontrola oprávnění (doporučení Supabase pro RLS)
-- Funkce is_admin()/is_staff()/auth.uid() v pravidlech se dosud volaly pro
-- každý řádek zvlášť. Obalené do (select …) se vyhodnotí jednou za dotaz.
-- ---------------------------------------------------------------------
do $$
declare
  p record;
  q text;
  c text;
  sql text;
  re constant text := '(?<!SELECT )\m(public\.)?(is_admin|is_staff)\(\)|(?<!SELECT )\mauth\.uid\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ re or coalesce(with_check, '') ~ re)
  loop
    q := regexp_replace(p.qual, re, '(SELECT \&)', 'g');
    c := regexp_replace(p.with_check, re, '(SELECT \&)', 'g');
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if c is not null then sql := sql || format(' with check (%s)', c); end if;
    execute sql;
  end loop;
end $$;

-- Čtení obsahu kontroly: správce/kontrolor projde hned, u ostatních se ověří konkrétní kontrola
alter policy answers_read on public.answers
  using ((select public.is_staff()) or public.can_read_inspection(inspection_id));
alter policy inspection_questions_read on public.inspection_questions
  using ((select public.is_staff()) or public.can_read_inspection(inspection_id));
alter policy inspection_topics_read on public.inspection_topics
  using ((select public.is_staff()) or public.can_read_inspection(inspection_id));
alter policy attachments_read on public.attachments
  using ((select public.is_staff()) or public.can_read_inspection(inspection_id));

-- Kontroly, jejichž obsah smí přihlášený agent/klient číst – spočítá se jednou za dotaz,
-- ne pro každou odpověď zvlášť (dřív can_read_inspection() u každého řádku)
create or replace function public.readable_inspections() returns setof uuid
language sql stable security definer set search_path = public as $$
  select i.id
    from public.inspections i
    join public.profiles p on p.id = auth.uid() and p.active
   where (i.agent_id = p.id and i.status not in ('planned', 'cancelled'))
      or (p.role::text = 'client' and i.status = 'approved' and i.company_id = p.company_id
          and (p.all_branches or exists (
                select 1 from public.profile_branches pb
                 where pb.profile_id = p.id and pb.branch_id = i.branch_id)))
$$;

alter policy answers_read on public.answers
  using ((select public.is_staff()) or inspection_id in (select public.readable_inspections()));
alter policy inspection_questions_read on public.inspection_questions
  using ((select public.is_staff()) or inspection_id in (select public.readable_inspections()));
alter policy inspection_topics_read on public.inspection_topics
  using ((select public.is_staff()) or inspection_id in (select public.readable_inspections()));
alter policy attachments_read on public.attachments
  using ((select public.is_staff()) or inspection_id in (select public.readable_inspections()));
