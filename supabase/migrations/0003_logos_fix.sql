-- =====================================================================
-- Oprava nahrávání log firem
-- Úložiště potřebuje k nahrání souboru i oprávnění ke čtení (SELECT).
-- Bucket „logos“ je veřejný, čtení proto povolíme všem přihlášeným.
--
-- Spustit v Supabase: SQL Editor -> vložit celý soubor -> Run
-- =====================================================================

drop policy if exists logos_read on storage.objects;
create policy logos_read on storage.objects for select to authenticated
  using (bucket_id = 'logos');
