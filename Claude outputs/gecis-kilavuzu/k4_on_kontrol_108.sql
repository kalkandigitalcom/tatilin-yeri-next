-- K4 — 108 ÖNCESİ kontrol (salt okunur): 105–107 yerinde, 108 yok, ayna farkı 0. Ardından K3 çalıştırılır.
BEGIN TRANSACTION READ ONLY;
SELECT kontrol, deger, beklenen, CASE WHEN ok THEN 'OK' ELSE 'HATA' END AS durum FROM (
  SELECT 'content_mirror_mode()' AS kontrol, public.content_mirror_mode() AS deger, 'base' AS beklenen, public.content_mirror_mode() = 'base' AS ok
  UNION ALL SELECT 'içerik trigger''ları (toplam)', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_%' ESCAPE '\'), '56',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_%' ESCAPE '\') = 56
  UNION ALL SELECT 'ayna/guard fonksiyon sahibi = bağlanan rol', (SELECT string_agg(DISTINCT pg_get_userbyid(proowner), ',') FROM pg_proc WHERE oid IN ('public.trg_content_mirror_base_to_tr()'::regprocedure,'public.trg_content_tr_guard()'::regprocedure)), current_user,
         (SELECT bool_and(pg_get_userbyid(proowner) = current_user) FROM pg_proc WHERE oid IN ('public.trg_content_mirror_base_to_tr()'::regprocedure,'public.trg_content_tr_guard()'::regprocedure))
         OR (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)
  UNION ALL SELECT '108 HENÜZ YOK', (to_regprocedure('public.content_language_slugs_separated()') IS NULL)::text, 'true',
         to_regprocedure('public.content_language_slugs_separated()') IS NULL
  UNION ALL SELECT 'ayna fonksiyonu 106 sürümü (108 değil)', (position('108' IN (SELECT prosrc FROM pg_proc WHERE oid='public.trg_content_mirror_base_to_tr()'::regprocedure)) = 0)::text, 'true',
         position('108' IN (SELECT prosrc FROM pg_proc WHERE oid='public.trg_content_mirror_base_to_tr()'::regprocedure)) = 0
  UNION ALL SELECT '30 sn''den eski açık transaction', (SELECT count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND xact_start < now() - interval '30 seconds' AND pid <> pg_backend_pid()), '0',
         (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND xact_start < now() - interval '30 seconds' AND pid <> pg_backend_pid()) = 0
) k;
ROLLBACK;
