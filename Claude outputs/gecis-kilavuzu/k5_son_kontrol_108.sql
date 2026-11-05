-- K5 — 108 SONRASI kontrol (salt okunur). durum=OK beklenir. Ayrıca K3 tekrar çalıştırılır.
BEGIN TRANSACTION READ ONLY;
SELECT kontrol, deger, beklenen, CASE WHEN ok THEN 'OK' ELSE 'HATA' END AS durum FROM (
  SELECT 'content_language_slugs_separated()' AS kontrol, (to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL)::text AS deger, 'true' AS beklenen,
         to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok
  UNION ALL SELECT 'content_mirror_mode()', public.content_mirror_mode(), 'base', public.content_mirror_mode() = 'base'
  UNION ALL SELECT 'ayna fonksiyonu 108 sürümü', (position('108' IN (SELECT prosrc FROM pg_proc WHERE oid='public.trg_content_mirror_base_to_tr()'::regprocedure)) > 0)::text, 'true',
         position('108' IN (SELECT prosrc FROM pg_proc WHERE oid='public.trg_content_mirror_base_to_tr()'::regprocedure)) > 0
  UNION ALL SELECT 'tr_guard 108 sürümü', (position('108' IN (SELECT prosrc FROM pg_proc WHERE oid='public.trg_content_tr_guard()'::regprocedure)) > 0)::text, 'true',
         position('108' IN (SELECT prosrc FROM pg_proc WHERE oid='public.trg_content_tr_guard()'::regprocedure)) > 0
  UNION ALL SELECT 'içerik trigger''ları (toplam)', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_%' ESCAPE '\'), '56',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_%' ESCAPE '\') = 56
) k;
ROLLBACK;
