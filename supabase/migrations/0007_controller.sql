-- =====================================================================
-- Role Kontrolor
-- Smí plánovat kontroly, přiřazovat agenty, kontrolovat a opravovat odpovědi,
-- schvalovat a vracet kontroly a spravovat agenty. Nesmí měnit šablony ani
-- otázky, nevidí účetnictví, klienty ani správce.
--
-- Spustit v Supabase: SQL Editor -> vložit celý soubor -> Run
-- =====================================================================

alter type public.user_role add value if not exists 'controller';

-- správce nebo kontrolor (role::text, aby šlo použít ve stejné transakci jako přidání hodnoty)
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('admin', 'controller') from public.profiles where id = auth.uid() and active), false)
$$;

-- Funkce, které dosud pouštěly jen správce, nově pouští i kontrolora
create or replace function public.can_read_inspection(p_inspection uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.inspections i
    where i.id = p_inspection and (
      (i.agent_id = auth.uid() and i.status not in ('planned', 'cancelled'))
      or (i.status = 'approved' and public.client_sees_branch(i.branch_id))
    ))
$$;

create or replace function public.can_edit_inspection(p_inspection uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1 from public.inspections i
    where i.id = p_inspection and i.agent_id = auth.uid()
      and i.status in ('assigned', 'in_progress', 'returned'))
$$;

create or replace function public.set_visit_at(p_id uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_inspection(p_id) then
    raise exception 'Kontrolu nelze upravit' using errcode = '42501';
  end if;
  update public.inspections
     set visit_at = p_at,
         status = case when status = 'assigned' and not public.is_staff()
                       then 'in_progress'::public.inspection_status else status end
   where id = p_id;
end
$$;

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

  if st = 'assigned' and not public.is_staff() then
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
  if not (public.is_staff() or public.is_service()) then
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

create or replace function public.approve_inspection(p_id uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_score numeric;
begin
  if not public.is_staff() then
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
  if not public.is_staff() then
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
  if not public.is_staff() then
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

create or replace function public.reopen_inspection(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Nedostatečná oprávnění' using errcode = '42501';
  end if;
  update public.inspections
     set status = 'submitted', approved_at = null, approved_by = null
   where id = p_id and status in ('approved', 'cancelled');
  insert into public.audit_log (inspection_id, actor_id, action)
  values (p_id, auth.uid(), 'reopened');
end
$$;

-- Oprávnění v tabulkách
create policy companies_staff_read on public.companies for select to authenticated
  using (public.is_staff());
create policy branches_staff_read on public.branches for select to authenticated
  using (public.is_staff());

-- kontrolor vidí agenty, kontrolory a správce (kvůli jménům v historii), ne uživatele klientů
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_admin() or id = auth.uid() or (public.is_staff() and role::text <> 'client'));

-- šablony kontrolor jen čte (výběr dotazníku při plánování), měnit je nesmí
create policy templates_staff_read on public.templates for select to authenticated
  using (public.is_staff());
create policy template_topics_staff_read on public.template_topics for select to authenticated
  using (public.is_staff());
create policy template_questions_staff_read on public.template_questions for select to authenticated
  using (public.is_staff());

drop policy if exists schedules_admin on public.schedules;
create policy schedules_staff on public.schedules for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists inspections_admin on public.inspections;
create policy inspections_staff on public.inspections for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists audit_log_admin on public.audit_log;
create policy audit_log_staff on public.audit_log for select to authenticated
  using (public.is_staff());
