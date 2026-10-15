-- =====================================================================
-- Mystery shopping platforma – databázové schéma
-- Spustit v Supabase: SQL Editor -> vložit celý soubor -> Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Číselníky
-- ---------------------------------------------------------------------
create type public.user_role as enum ('admin', 'client', 'agent');

create type public.inspection_status as enum (
  'planned',      -- naplánovaná, bez agenta
  'assigned',     -- přiřazená agentovi
  'in_progress',  -- agent začal vyplňovat
  'submitted',    -- odeslaná ke schválení
  'returned',     -- vrácená agentovi k opravě
  'approved',     -- schválená, vidí ji klient
  'cancelled'     -- zrušená
);

create type public.question_type as enum (
  'yes_no', 'yes_no_na', 'scale', 'single_choice', 'multi_choice',
  'number', 'duration', 'datetime', 'short_text', 'long_text', 'file'
);

create type public.schedule_interval as enum ('weekly', 'monthly', 'quarterly');

-- ---------------------------------------------------------------------
-- Firmy, provozovny, uživatelé
-- ---------------------------------------------------------------------
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  ico           text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  logo_url      text,
  note          text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.branches (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies on delete cascade,
  name           text not null,
  address        text,
  note_for_agent text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index branches_company_idx on public.branches (company_id);

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  role          public.user_role not null,
  full_name     text not null default '',
  email         text not null,
  phone         text,
  company_id    uuid references public.companies on delete cascade,
  all_branches  boolean not null default true,
  active        boolean not null default true,
  notify_digest boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint profiles_client_company check ((role = 'client') = (company_id is not null))
);
create index profiles_company_idx on public.profiles (company_id);

-- Klientský uživatel s omezeným přístupem vidí jen tyto provozovny
create table public.profile_branches (
  profile_id uuid not null references public.profiles on delete cascade,
  branch_id  uuid not null references public.branches on delete cascade,
  primary key (profile_id, branch_id)
);

-- ---------------------------------------------------------------------
-- Šablony dotazníků
-- ---------------------------------------------------------------------
create table public.templates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies on delete cascade,
  name        text not null,
  description text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index templates_company_idx on public.templates (company_id);

create table public.template_topics (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates on delete cascade,
  title       text not null,
  position    int not null default 0,
  weight      numeric not null default 1 check (weight >= 0)
);
create index template_topics_template_idx on public.template_topics (template_id);

create table public.template_questions (
  id                  uuid primary key default gen_random_uuid(),
  topic_id            uuid not null references public.template_topics on delete cascade,
  text                text not null,
  help_text           text,
  type                public.question_type not null,
  required            boolean not null default true,
  weight              numeric not null default 1 check (weight >= 0),
  options             jsonb not null default '[]'::jsonb,  -- [{id, label, points}]
  config              jsonb not null default '{}'::jsonb,  -- scale {min,max}; number/duration {threshold, mode, unit}
  comment_on_negative boolean not null default false,
  position            int not null default 0
);
create index template_questions_topic_idx on public.template_questions (topic_id);

-- ---------------------------------------------------------------------
-- Plány opakování
-- ---------------------------------------------------------------------
create table public.schedules (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies on delete cascade,
  template_id      uuid not null references public.templates on delete cascade,
  name             text not null,
  interval         public.schedule_interval not null,
  start_date       date not null,
  end_date         date,
  branch_ids       uuid[] not null default '{}',
  default_agent_id uuid references public.profiles on delete set null,
  instructions     text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index schedules_company_idx on public.schedules (company_id);

-- ---------------------------------------------------------------------
-- Kontroly (každá má vlastní kopii otázek)
-- ---------------------------------------------------------------------
create table public.inspections (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies on delete cascade,
  branch_id        uuid not null references public.branches on delete cascade,
  template_id      uuid references public.templates on delete set null,
  schedule_id      uuid references public.schedules on delete set null,
  title            text not null,
  window_start     date not null,
  window_end       date not null,
  agent_id         uuid references public.profiles on delete set null,
  status           public.inspection_status not null default 'planned',
  instructions     text,
  visit_at         timestamptz,
  score            numeric,
  topic_scores     jsonb,
  return_comment   text,
  submitted_at     timestamptz,
  approved_at      timestamptz,
  approved_by      uuid references public.profiles on delete set null,
  created_by       uuid references public.profiles on delete set null,
  reminder_sent_at timestamptz,
  overdue_sent_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint inspections_window check (window_end >= window_start)
);
create index inspections_company_idx on public.inspections (company_id);
create index inspections_branch_idx on public.inspections (branch_id);
create index inspections_agent_idx on public.inspections (agent_id);
create index inspections_status_idx on public.inspections (status);
create index inspections_window_idx on public.inspections (window_start);
create unique index inspections_schedule_period_uidx
  on public.inspections (schedule_id, branch_id, window_start) where schedule_id is not null;

create table public.inspection_topics (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections on delete cascade,
  title         text not null,
  position      int not null default 0,
  weight        numeric not null default 1 check (weight >= 0),
  score         numeric
);
create index inspection_topics_inspection_idx on public.inspection_topics (inspection_id);

create table public.inspection_questions (
  id                  uuid primary key default gen_random_uuid(),
  inspection_id       uuid not null references public.inspections on delete cascade,
  topic_id            uuid not null references public.inspection_topics on delete cascade,
  text                text not null,
  help_text           text,
  type                public.question_type not null,
  required            boolean not null default true,
  weight              numeric not null default 1 check (weight >= 0),
  options             jsonb not null default '[]'::jsonb,
  config              jsonb not null default '{}'::jsonb,
  comment_on_negative boolean not null default false,
  position            int not null default 0
);
create index inspection_questions_inspection_idx on public.inspection_questions (inspection_id);
create index inspection_questions_topic_idx on public.inspection_questions (topic_id);

create table public.answers (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections on delete cascade,
  question_id   uuid not null unique references public.inspection_questions on delete cascade,
  value         jsonb,
  comment       text,
  fraction      numeric,   -- 0..1, dopočítá se při schválení
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles on delete set null
);
create index answers_inspection_idx on public.answers (inspection_id);

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections on delete cascade,
  question_id   uuid references public.inspection_questions on delete cascade,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    int,
  created_by    uuid references public.profiles on delete set null,
  created_at    timestamptz not null default now()
);
create index attachments_inspection_idx on public.attachments (inspection_id);

create table public.audit_log (
  id            bigint generated always as identity primary key,
  inspection_id uuid references public.inspections on delete cascade,
  actor_id      uuid references public.profiles on delete set null,
  action        text not null,
  details       jsonb,
  created_at    timestamptz not null default now()
);
create index audit_log_inspection_idx on public.audit_log (inspection_id);

-- =====================================================================
-- Pomocné funkce pro oprávnění
-- =====================================================================
create or replace function public.is_service() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.client_sees_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    join public.branches b on b.company_id = p.company_id
    where p.id = auth.uid() and p.active and p.role = 'client' and b.id = p_branch
      and (p.all_branches or exists (
        select 1 from public.profile_branches pb where pb.profile_id = p.id and pb.branch_id = p_branch))
  )
$$;

create or replace function public.agent_has_company(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inspections i
                 where i.company_id = p_company and i.agent_id = auth.uid()
                   and i.status not in ('planned', 'cancelled'))
$$;

create or replace function public.agent_has_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inspections i
                 where i.branch_id = p_branch and i.agent_id = auth.uid()
                   and i.status not in ('planned', 'cancelled'))
$$;

-- může uživatel číst obsah kontroly (otázky, odpovědi, přílohy)?
create or replace function public.can_read_inspection(p_inspection uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.inspections i
    where i.id = p_inspection and (
      (i.agent_id = auth.uid() and i.status not in ('planned', 'cancelled'))
      or (i.status = 'approved' and public.client_sees_branch(i.branch_id))
    ))
$$;

-- může uživatel měnit odpovědi a přílohy kontroly?
create or replace function public.can_edit_inspection(p_inspection uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.inspections i
    where i.id = p_inspection and i.agent_id = auth.uid()
      and i.status in ('assigned', 'in_progress', 'returned'))
$$;

create or replace function public.try_uuid(p text) returns uuid
language sql immutable as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then p::uuid end
$$;

-- =====================================================================
-- Bodování
-- =====================================================================
-- Vrací podíl 0..1 pro bodovanou odpověď, nebo null (nebodováno / nelze posoudit)
create or replace function public.question_fraction(
  t public.question_type, v jsonb, opts jsonb, cfg jsonb
) returns numeric
language plpgsql immutable as $$
declare
  mn numeric; mx numeric; pts numeric; maxpts numeric; thr numeric; num numeric;
begin
  if v is null or v = 'null'::jsonb then
    return null;
  end if;

  if t in ('yes_no', 'yes_no_na') then
    if v #>> '{}' = 'yes' then return 1;
    elsif v #>> '{}' = 'no' then return 0;
    else return null;
    end if;

  elsif t = 'scale' then
    if jsonb_typeof(v) <> 'number' then return null; end if;
    mn := coalesce((cfg ->> 'min')::numeric, 1);
    mx := coalesce((cfg ->> 'max')::numeric, 5);
    if mx <= mn then return null; end if;
    return greatest(0, least(1, ((v #>> '{}')::numeric - mn) / (mx - mn)));

  elsif t = 'single_choice' then
    select max(coalesce((o ->> 'points')::numeric, 0)) into maxpts
      from jsonb_array_elements(opts) o;
    if coalesce(maxpts, 0) <= 0 then return null; end if;
    select coalesce((o ->> 'points')::numeric, 0) into pts
      from jsonb_array_elements(opts) o where o ->> 'id' = v #>> '{}';
    if pts is null then return null; end if;
    return greatest(0, least(1, pts / maxpts));

  elsif t = 'multi_choice' then
    if jsonb_typeof(v) <> 'array' then return null; end if;
    select sum(greatest(coalesce((o ->> 'points')::numeric, 0), 0)) into maxpts
      from jsonb_array_elements(opts) o;
    if coalesce(maxpts, 0) <= 0 then return null; end if;
    select coalesce(sum(coalesce((o ->> 'points')::numeric, 0)), 0) into pts
      from jsonb_array_elements(opts) o where v ? (o ->> 'id');
    return greatest(0, least(1, pts / maxpts));

  elsif t in ('number', 'duration') then
    thr := (cfg ->> 'threshold')::numeric;
    if thr is null or jsonb_typeof(v) <> 'number' then return null; end if;
    num := (v #>> '{}')::numeric;
    if coalesce(cfg ->> 'mode', 'lte') = 'gte' then
      return case when num >= thr then 1 else 0 end;
    else
      return case when num <= thr then 1 else 0 end;
    end if;
  end if;

  return null;
end
$$;

create or replace function public.compute_inspection_score(p_id uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  total numeric;
begin
  update public.answers a
     set fraction = case when q.weight > 0
                         then public.question_fraction(q.type, a.value, q.options, q.config) end
    from public.inspection_questions q
   where q.id = a.question_id and a.inspection_id = p_id;

  update public.inspection_topics set score = null where inspection_id = p_id;

  update public.inspection_topics t
     set score = s.score
    from (
      select q.topic_id,
             round(100 * sum(q.weight * a.fraction) / nullif(sum(q.weight), 0), 1) as score
        from public.inspection_questions q
        join public.answers a on a.question_id = q.id
       where q.inspection_id = p_id and a.fraction is not null and q.weight > 0
       group by q.topic_id
    ) s
   where t.id = s.topic_id;

  select round(sum(weight * score) / nullif(sum(weight), 0), 1) into total
    from public.inspection_topics
   where inspection_id = p_id and score is not null and weight > 0;

  update public.inspections
     set score = total,
         topic_scores = (
           select jsonb_agg(jsonb_build_object('title', title, 'score', score, 'weight', weight)
                            order by position)
             from public.inspection_topics where inspection_id = p_id)
   where id = p_id;

  return total;
end
$$;

-- =====================================================================
-- Triggery
-- =====================================================================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();

-- přiřazení / odebrání agenta mění stav
create or replace function public.inspections_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.agent_id is distinct from old.agent_id then
    if new.agent_id is not null and new.status = 'planned' then
      new.status := 'assigned';
    elsif new.agent_id is null and new.status = 'assigned' then
      new.status := 'planned';
    end if;
    new.reminder_sent_at := null;
    new.overdue_sent_at := null;
  end if;
  if new.window_end is distinct from old.window_end then
    new.reminder_sent_at := null;
    new.overdue_sent_at := null;
  end if;
  return new;
end
$$;

create trigger inspections_before_update before update on public.inspections
  for each row execute function public.inspections_before_update();

create or replace function public.answers_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select inspection_id into new.inspection_id
    from public.inspection_questions where id = new.question_id;
  if tg_op = 'INSERT'
     or new.value is distinct from old.value
     or new.comment is distinct from old.comment then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end
$$;

create trigger answers_before_write before insert or update on public.answers
  for each row execute function public.answers_before_write();

create or replace function public.answers_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  st public.inspection_status;
begin
  if tg_op = 'UPDATE'
     and new.value is not distinct from old.value
     and new.comment is not distinct from old.comment then
    return null;  -- jen přepočet skóre, nic dalšího
  end if;

  select status into st from public.inspections where id = new.inspection_id;

  if st = 'assigned' and not public.is_admin() then
    update public.inspections set status = 'in_progress' where id = new.inspection_id;
  end if;

  if st in ('submitted', 'approved') then
    insert into public.audit_log (inspection_id, actor_id, action, details)
    values (new.inspection_id, auth.uid(), 'answer_edited',
            jsonb_build_object(
              'question_id', new.question_id,
              'old_value', case when tg_op = 'UPDATE' then old.value end,
              'new_value', new.value,
              'old_comment', case when tg_op = 'UPDATE' then old.comment end,
              'new_comment', new.comment));
  end if;

  if st = 'approved' then
    perform public.compute_inspection_score(new.inspection_id);
  end if;

  return null;
end
$$;

create trigger answers_after_write after insert or update on public.answers
  for each row execute function public.answers_after_write();

-- =====================================================================
-- Funkce volané z aplikace
-- =====================================================================

-- Vytvoří kontrolu a zkopíruje do ní otázky ze šablony
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
    insert into public.inspection_topics (inspection_id, title, position, weight)
    values (v_id, v_topic.title, v_topic.position, v_topic.weight)
    returning id into v_new_topic;

    insert into public.inspection_questions
      (inspection_id, topic_id, text, help_text, type, required, weight, options, config,
       comment_on_negative, position)
    select v_id, v_new_topic, text, help_text, type, required, weight, options, config,
           comment_on_negative, position
      from public.template_questions where topic_id = v_topic.id;
  end loop;

  insert into public.audit_log (inspection_id, actor_id, action)
  values (v_id, auth.uid(), 'created');

  return v_id;
end
$$;

-- Agent uloží datum a čas návštěvy
create or replace function public.set_visit_at(p_id uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_inspection(p_id) then
    raise exception 'Kontrolu nelze upravit' using errcode = '42501';
  end if;
  update public.inspections
     set visit_at = p_at,
         status = case when status = 'assigned' and not public.is_admin()
                       then 'in_progress'::public.inspection_status else status end
   where id = p_id;
end
$$;

-- Seznam chybějících povinných údajů (prázdný = lze odeslat)
create or replace function public.inspection_missing(p_id uuid)
returns table (question_id uuid, reason text)
language sql stable security definer set search_path = public as $$
  select q.id,
         case
           when q.type = 'file' then 'missing_file'
           else 'missing_answer'
         end
    from public.inspection_questions q
    left join public.answers a on a.question_id = q.id
   where q.inspection_id = p_id and q.required
     and (
       (q.type = 'file' and not exists (
          select 1 from public.attachments f where f.question_id = q.id))
       or (q.type <> 'file' and (
          a.value is null or a.value = 'null'::jsonb
          or (jsonb_typeof(a.value) = 'string' and btrim(a.value #>> '{}') = '')
          or (jsonb_typeof(a.value) = 'array' and jsonb_array_length(a.value) = 0)))
     )
  union all
  select q.id, 'missing_comment'
    from public.inspection_questions q
    join public.answers a on a.question_id = q.id
   where q.inspection_id = p_id and q.comment_on_negative
     and public.question_fraction(q.type, a.value, q.options, q.config) = 0
     and coalesce(btrim(a.comment), '') = ''
$$;

create or replace function public.submit_inspection(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_insp record;
  v_missing jsonb;
begin
  select * into v_insp from public.inspections where id = p_id;
  if v_insp.id is null or v_insp.agent_id is distinct from auth.uid()
     or v_insp.status not in ('assigned', 'in_progress', 'returned') then
    raise exception 'Kontrolu nelze odeslat' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('question_id', question_id, 'reason', reason)), '[]'::jsonb)
    into v_missing from public.inspection_missing(p_id);

  if v_insp.visit_at is null then
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('question_id', null, 'reason', 'missing_visit_at'));
  end if;

  if jsonb_array_length(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'missing', v_missing);
  end if;

  update public.inspections
     set status = 'submitted', submitted_at = now()
   where id = p_id;

  insert into public.audit_log (inspection_id, actor_id, action)
  values (p_id, auth.uid(), case when v_insp.status = 'returned' then 'resubmitted' else 'submitted' end);

  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.approve_inspection(p_id uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_score numeric;
begin
  if not public.is_admin() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  if not exists (select 1 from public.inspections where id = p_id and status = 'submitted') then
    raise exception 'Schválit lze jen odeslanou kontrolu';
  end if;

  v_score := public.compute_inspection_score(p_id);

  update public.inspections
     set status = 'approved', approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  insert into public.audit_log (inspection_id, actor_id, action, details)
  values (p_id, auth.uid(), 'approved', jsonb_build_object('score', v_score));

  return v_score;
end
$$;

create or replace function public.return_inspection(p_id uuid, p_comment text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  if coalesce(btrim(p_comment), '') = '' then
    raise exception 'Napište agentovi, co má opravit';
  end if;
  if not exists (select 1 from public.inspections where id = p_id and status = 'submitted') then
    raise exception 'Vrátit lze jen odeslanou kontrolu';
  end if;

  update public.inspections
     set status = 'returned', return_comment = p_comment
   where id = p_id;

  insert into public.audit_log (inspection_id, actor_id, action, details)
  values (p_id, auth.uid(), 'returned', jsonb_build_object('comment', p_comment));
end
$$;

create or replace function public.cancel_inspection(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  if not exists (select 1 from public.inspections where id = p_id and status <> 'approved') then
    raise exception 'Schválenou kontrolu nelze zrušit';
  end if;
  update public.inspections set status = 'cancelled' where id = p_id;
  insert into public.audit_log (inspection_id, actor_id, action)
  values (p_id, auth.uid(), 'cancelled');
end
$$;

-- Vrácení schválené kontroly zpět ke schválení (např. po stížnosti klienta)
create or replace function public.reopen_inspection(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  update public.inspections
     set status = 'submitted', approved_at = null, approved_by = null
   where id = p_id and status in ('approved', 'cancelled');
  insert into public.audit_log (inspection_id, actor_id, action)
  values (p_id, auth.uid(), 'reopened');
end
$$;

-- Kopie šablony (např. pro jinou firmu nebo novou verzi)
create or replace function public.duplicate_template(p_template uuid, p_company uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_topic record;
  v_new_topic uuid;
begin
  if not public.is_admin() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  insert into public.templates (company_id, name, description)
  select p_company, p_name, description from public.templates where id = p_template
  returning id into v_id;

  for v_topic in select * from public.template_topics where template_id = p_template order by position
  loop
    insert into public.template_topics (template_id, title, position, weight)
    values (v_id, v_topic.title, v_topic.position, v_topic.weight)
    returning id into v_new_topic;
    insert into public.template_questions
      (topic_id, text, help_text, type, required, weight, options, config, comment_on_negative, position)
    select v_new_topic, text, help_text, type, required, weight, options, config, comment_on_negative, position
      from public.template_questions where topic_id = v_topic.id;
  end loop;
  return v_id;
end
$$;

-- Interní funkce nesmí volat přihlášení uživatelé
revoke execute on function public.compute_inspection_score(uuid) from public, anon, authenticated;

-- =====================================================================
-- Pohled pro klienty (skrývá agenta a interní poznámky)
-- =====================================================================
create view public.client_inspections as
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
       i.template_id
  from public.inspections i
  join public.branches b on b.id = i.branch_id
 where i.status <> 'cancelled'
   and public.client_sees_branch(i.branch_id);

revoke all on public.client_inspections from anon;
grant select on public.client_inspections to authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.companies            enable row level security;
alter table public.branches             enable row level security;
alter table public.profiles             enable row level security;
alter table public.profile_branches     enable row level security;
alter table public.templates            enable row level security;
alter table public.template_topics      enable row level security;
alter table public.template_questions   enable row level security;
alter table public.schedules            enable row level security;
alter table public.inspections          enable row level security;
alter table public.inspection_topics    enable row level security;
alter table public.inspection_questions enable row level security;
alter table public.answers              enable row level security;
alter table public.attachments          enable row level security;
alter table public.audit_log            enable row level security;

-- companies
create policy companies_admin on public.companies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy companies_client_read on public.companies for select to authenticated
  using (id = (select company_id from public.profiles where id = auth.uid() and active));
create policy companies_agent_read on public.companies for select to authenticated
  using (public.agent_has_company(id));

-- branches
create policy branches_admin on public.branches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy branches_client_read on public.branches for select to authenticated
  using (public.client_sees_branch(id));
create policy branches_agent_read on public.branches for select to authenticated
  using (public.agent_has_branch(id));

-- profiles (zápis rolí jen přes server se service klíčem)
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_admin() or id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone, notify_digest) on public.profiles to authenticated;

-- profile_branches
create policy profile_branches_read on public.profile_branches for select to authenticated
  using (public.is_admin() or profile_id = auth.uid());

-- šablony a plány: jen správce
create policy templates_admin on public.templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy templates_client_read on public.templates for select to authenticated
  using (company_id = (select company_id from public.profiles
                        where id = auth.uid() and active and role = 'client'));
create policy template_topics_admin on public.template_topics for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy template_questions_admin on public.template_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy schedules_admin on public.schedules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- inspections: klienti čtou přes pohled client_inspections, agent jen své
create policy inspections_admin on public.inspections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy inspections_agent_read on public.inspections for select to authenticated
  using (agent_id = auth.uid() and status not in ('planned', 'cancelled'));

-- obsah kontroly
create policy inspection_topics_admin on public.inspection_topics for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy inspection_topics_read on public.inspection_topics for select to authenticated
  using (public.can_read_inspection(inspection_id));

create policy inspection_questions_admin on public.inspection_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy inspection_questions_read on public.inspection_questions for select to authenticated
  using (public.can_read_inspection(inspection_id));

create policy answers_read on public.answers for select to authenticated
  using (public.can_read_inspection(inspection_id));
create policy answers_insert on public.answers for insert to authenticated
  with check (public.can_edit_inspection(
    (select q.inspection_id from public.inspection_questions q where q.id = question_id)));
create policy answers_update on public.answers for update to authenticated
  using (public.can_edit_inspection(inspection_id))
  with check (public.can_edit_inspection(inspection_id));
create policy answers_delete on public.answers for delete to authenticated
  using (public.can_edit_inspection(inspection_id));

create policy attachments_read on public.attachments for select to authenticated
  using (public.can_read_inspection(inspection_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.can_edit_inspection(inspection_id)
    and (question_id is null or exists (
      select 1 from public.inspection_questions q
       where q.id = question_id and q.inspection_id = attachments.inspection_id)));
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.can_edit_inspection(inspection_id));

create policy audit_log_admin on public.audit_log for select to authenticated
  using (public.is_admin());
