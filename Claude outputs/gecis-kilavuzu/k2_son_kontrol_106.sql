-- K2 — 106 SONRASI (107 öncesi) kontrol (salt okunur). durum=OK beklenir.
BEGIN TRANSACTION READ ONLY;
SELECT kontrol, deger, beklenen, CASE WHEN ok THEN 'OK' ELSE 'HATA' END AS durum FROM (
  SELECT 'content_mirror_mode()' AS kontrol, public.content_mirror_mode() AS deger, 'base' AS beklenen, public.content_mirror_mode() = 'base' AS ok
  UNION ALL SELECT 'tr_guard', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_tr\_guard' ESCAPE '\'), '14',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_tr\_guard' ESCAPE '\') = 14
  UNION ALL SELECT 'mirror_to_tr', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_mirror\_to\_tr' ESCAPE '\'), '14',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_mirror\_to\_tr' ESCAPE '\') = 14
  UNION ALL SELECT 'mirror_to_base', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_mirror\_to\_base' ESCAPE '\'), '14',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_mirror\_to\_base' ESCAPE '\') = 14
  UNION ALL SELECT 'base_guard', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_base\_guard' ESCAPE '\'), '14',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_base\_guard' ESCAPE '\') = 14
  UNION ALL SELECT 'devre dışı içerik trigger''ı', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_%' ESCAPE '\' AND tgenabled <> 'O'), '0',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_%' ESCAPE '\' AND tgenabled <> 'O') = 0
  UNION ALL SELECT 'slug_history trigger', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_slug\_history' ESCAPE '\'), '8',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_slug\_history' ESCAPE '\') = 8
  UNION ALL SELECT '108 HENÜZ YOK', (to_regprocedure('public.content_language_slugs_separated()') IS NULL)::text, 'true',
         to_regprocedure('public.content_language_slugs_separated()') IS NULL
) k;
ROLLBACK;
