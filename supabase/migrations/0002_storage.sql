-- =====================================================================
-- Úložiště souborů (fotky, účtenky, loga)
-- Spustit po 0001_schema.sql
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Přílohy: cesta je "<id kontroly>/<soubor>"
create policy attachments_files_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and public.can_read_inspection(public.try_uuid(split_part(name, '/', 1))));

create policy attachments_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and public.can_edit_inspection(public.try_uuid(split_part(name, '/', 1))));

create policy attachments_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and public.can_edit_inspection(public.try_uuid(split_part(name, '/', 1))));

-- Loga firem: číst může kdokoli, nahrávat jen správce
create policy logos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.is_admin());
create policy logos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.is_admin());
create policy logos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.is_admin());
