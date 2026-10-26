-- =====================================================================
-- Útrata agenta při kontrole (Kč) – pro záložku Účetnictví
-- Agent ji vyplní ve formuláři kontroly, správce ji může upravit v detailu.
--
-- Spustit v Supabase: SQL Editor -> vložit celý soubor -> Run
-- =====================================================================

alter table public.inspections
  add column if not exists expense numeric(10,2) check (expense is null or expense >= 0);

create or replace function public.set_expense(p_id uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_inspection(p_id) then
    raise exception 'Kontrolu nelze upravit' using errcode = '42501';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'Útrata nemůže být záporná' using errcode = '22023';
  end if;
  update public.inspections set expense = p_amount where id = p_id;
end
$$;

grant execute on function public.set_expense(uuid, numeric) to authenticated;
