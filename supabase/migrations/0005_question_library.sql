-- =====================================================================
-- Knihovna otázek pro „Vybrat z existujících“
-- Vrací otázky z témat se zadanými názvy ze všech šablon i z dřívějších
-- verzí šablon (otázky, které už v šabloně nejsou, ale byly použity
-- v kontrolách). Každá otázka se vrací jen jednou za šablonu.
--
-- Spustit v Supabase: SQL Editor -> vložit celý soubor -> Run
-- =====================================================================

create or replace function public.question_library(p_titles text[])
returns table (
  topic_title         text,
  text                text,
  help_text           text,
  type                public.question_type,
  required            boolean,
  weight              numeric,
  options             jsonb,
  config              jsonb,
  comment_on_negative boolean,
  template_id         uuid,
  template_name       text,
  company_name        text,
  source              text
)
language sql stable security definer set search_path = public as $$
  with titles as (
    select lower(btrim(x)) as ttl from unnest(p_titles) x
  ),
  candidates as (
    -- aktuální otázky šablon
    select tt.title as topic_title, q.text, q.help_text, q.type, q.required, q.weight, q.options, q.config,
           q.comment_on_negative, t.id as template_id, t.name as template_name, c.name as company_name,
           'template'::text as source, 0 as prio, t.updated_at as ts
      from public.template_questions q
      join public.template_topics tt on tt.id = q.topic_id
      join public.templates t on t.id = tt.template_id
      left join public.companies c on c.id = t.company_id
     where lower(btrim(tt.title)) in (select ttl from titles)
    union all
    -- otázky použité v kontrolách (i ty, které ze šablony mezitím zmizely)
    select it.title, q.text, q.help_text, q.type, q.required, q.weight, q.options, q.config,
           q.comment_on_negative, t.id, coalesce(t.name, 'Bez šablony'), c.name,
           'history', 1, i.created_at
      from public.inspection_questions q
      join public.inspection_topics it on it.id = q.topic_id
      join public.inspections i on i.id = q.inspection_id
      left join public.templates t on t.id = i.template_id
      left join public.companies c on c.id = i.company_id
     where lower(btrim(it.title)) in (select ttl from titles)
  )
  select distinct on (lower(btrim(topic_title)), lower(btrim(text)), template_id)
         topic_title, text, help_text, type, required, weight, options, config,
         comment_on_negative, template_id, template_name, company_name, source
    from candidates
   where public.is_admin()
   order by lower(btrim(topic_title)), lower(btrim(text)), template_id, prio, ts desc
$$;
