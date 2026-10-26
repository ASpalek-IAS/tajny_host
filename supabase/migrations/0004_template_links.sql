-- =====================================================================
-- Vazba otázek kontroly na šablonu + zpětné promítnutí úprav šablony
-- Spustit po 0001–0003 (SQL Editor -> vložit celý soubor -> Run)
-- =====================================================================

alter table public.inspection_topics
  add column if not exists template_topic_id uuid references public.template_topics on delete set null;
alter table public.inspection_questions
  add column if not exists template_question_id uuid references public.template_questions on delete set null;

create index if not exists inspection_topics_tt_idx on public.inspection_topics (template_topic_id);
create index if not exists inspection_questions_tq_idx on public.inspection_questions (template_question_id);

-- Doplnění vazeb u už existujících kontrol: téma podle názvu, otázka podle textu
update public.inspection_topics it
   set template_topic_id = tt.id
  from public.inspections i, public.template_topics tt
 where it.inspection_id = i.id
   and it.template_topic_id is null
   and tt.template_id = i.template_id
   and tt.title = it.title;

update public.inspection_questions iq
   set template_question_id = tq.id
  from public.inspection_topics it, public.template_questions tq
 where iq.topic_id = it.id
   and iq.template_question_id is null
   and tq.topic_id = it.template_topic_id
   and tq.text = iq.text;

-- Nové kontroly si vazbu ukládají rovnou
create or replace function public.create_inspection(
  p_template     uuid,
  p_branch       uuid,
  p_window_start date,
  p_window_end   date,
  p_agent        uuid default null,
  p_title        text default null,
  p_instructions text default null,
  p_schedule     uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_tpl     record;
  v_id      uuid;
  v_topic   record;
  v_new_topic uuid;
begin
  if not (public.is_admin() or public.is_service()) then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;

  select company_id into v_company from public.branches where id = p_branch;
  select * into v_tpl from public.templates where id = p_template;
  if v_company is null or v_tpl.id is null or v_tpl.company_id <> v_company then
    raise exception 'Šablona a provozovna nepatří ke stejné firmě';
  end if;
  if p_agent is not null and not exists (
       select 1 from public.profiles where id = p_agent and role = 'agent' and active) then
    raise exception 'Vybraný uživatel není aktivní agent';
  end if;

  insert into public.inspections
    (company_id, branch_id, template_id, schedule_id, title, window_start, window_end,
     agent_id, status, instructions, created_by)
  values
    (v_company, p_branch, p_template, p_schedule, coalesce(nullif(p_title, ''), v_tpl.name),
     p_window_start, p_window_end, p_agent,
     case when p_agent is null then 'planned' else 'assigned' end::public.inspection_status,
     p_instructions, auth.uid())
  returning id into v_id;

  for v_topic in
    select * from public.template_topics where template_id = p_template order by position
  loop
    insert into public.inspection_topics (inspection_id, title, position, weight, template_topic_id)
    values (v_id, v_topic.title, v_topic.position, v_topic.weight, v_topic.id)
    returning id into v_new_topic;

    insert into public.inspection_questions
      (inspection_id, topic_id, text, help_text, type, required, weight, options, config,
       comment_on_negative, position, template_question_id)
    select v_id, v_new_topic, text, help_text, type, required, weight, options, config,
           comment_on_negative, position, id
      from public.template_questions where topic_id = v_topic.id;
  end loop;

  insert into public.audit_log (inspection_id, actor_id, action)
  values (v_id, auth.uid(), 'created');

  return v_id;
end
$$;

-- Promítne aktuální znění otázky ze šablony do všech kontrol, které z ní vznikly.
-- Typ odpovědi se zpětně nemění (u kontrol s jiným typem se otázka přeskočí).
-- Vrací počet dotčených kontrol.
create or replace function public.propagate_template_question(p_tq uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_q record;
  v_ids uuid[];
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  select * into v_q from public.template_questions where id = p_tq;
  if v_q.id is null then return 0; end if;

  with upd as (
    update public.inspection_questions iq
       set text = v_q.text,
           help_text = v_q.help_text,
           required = v_q.required,
           weight = v_q.weight,
           options = v_q.options,
           config = v_q.config,
           comment_on_negative = v_q.comment_on_negative
     where iq.template_question_id = p_tq
       and iq.type = v_q.type
    returning iq.inspection_id
  )
  select array_agg(distinct inspection_id) into v_ids from upd;

  foreach v_id in array coalesce(v_ids, '{}') loop
    insert into public.audit_log (inspection_id, actor_id, action, details)
    values (v_id, auth.uid(), 'template_sync', jsonb_build_object('question', v_q.text));
    if exists (select 1 from public.inspections where id = v_id and status = 'approved') then
      perform public.compute_inspection_score(v_id);
    end if;
  end loop;
  return coalesce(array_length(v_ids, 1), 0);
end
$$;

-- Totéž pro název a váhu tématu
create or replace function public.propagate_template_topic(p_tt uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_t record;
  v_ids uuid[];
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  select * into v_t from public.template_topics where id = p_tt;
  if v_t.id is null then return 0; end if;

  with upd as (
    update public.inspection_topics it
       set title = v_t.title, weight = v_t.weight
     where it.template_topic_id = p_tt
    returning it.inspection_id
  )
  select array_agg(distinct inspection_id) into v_ids from upd;

  foreach v_id in array coalesce(v_ids, '{}') loop
    insert into public.audit_log (inspection_id, actor_id, action, details)
    values (v_id, auth.uid(), 'template_sync', jsonb_build_object('topic', v_t.title));
    if exists (select 1 from public.inspections where id = v_id and status = 'approved') then
      perform public.compute_inspection_score(v_id);
    end if;
  end loop;
  return coalesce(array_length(v_ids, 1), 0);
end
$$;

-- Počet kontrol, které by úprava otázky / tématu zasáhla (pro dialog v editoru)
create or replace function public.template_usage(p_template uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.inspections
   where template_id = p_template and status <> 'cancelled' and public.is_admin()
$$;

-- Klientský pohled: jen schválené kontroly (naplánované klient nevidí),
-- místo názvu kontroly se zobrazuje název dotazníku
create or replace view public.client_inspections as
select i.id,
       i.company_id,
       i.branch_id,
       b.name    as branch_name,
       b.address as branch_address,
       i.title,
       i.window_start,
       i.window_end,
       case when i.status = 'approved' then 'done' else 'planned' end as status,
       case when i.status = 'approved' then i.visit_at end     as visit_at,
       case when i.status = 'approved' then i.score end        as score,
       case when i.status = 'approved' then i.topic_scores end as topic_scores,
       case when i.status = 'approved' then i.approved_at end  as approved_at,
       i.template_id,
       t.name as template_name
  from public.inspections i
  join public.branches b on b.id = i.branch_id
  left join public.templates t on t.id = i.template_id
 where i.status = 'approved'
   and public.client_sees_branch(i.branch_id);
