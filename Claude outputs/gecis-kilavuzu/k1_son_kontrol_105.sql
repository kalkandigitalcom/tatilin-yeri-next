-- K1 — 105 SONRASI (106 öncesi) kontrol (salt okunur). durum=OK beklenir.
BEGIN TRANSACTION READ ONLY;
SELECT kontrol, deger, beklenen, CASE WHEN ok THEN 'OK' ELSE 'HATA' END AS durum FROM (
  SELECT 'content_mirror_mode()' AS kontrol, public.content_mirror_mode() AS deger, 'base' AS beklenen, public.content_mirror_mode() = 'base' AS ok
  UNION ALL SELECT 'tr_guard trigger', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_tr\_guard' ESCAPE '\'), '14',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_tr\_guard' ESCAPE '\') = 14
  UNION ALL SELECT 'base_guard bağlı değil (106 bağlar)', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_base\_guard' ESCAPE '\'), '0',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_content\_base\_guard' ESCAPE '\') = 0
  UNION ALL SELECT 'koleksiyon çeviri tabloları', ((to_regclass('public.homepage_collection_translations') IS NOT NULL) AND (to_regclass('public.discount_collection_translations') IS NOT NULL))::text, 'true',
         (to_regclass('public.homepage_collection_translations') IS NOT NULL) AND (to_regclass('public.discount_collection_translations') IS NOT NULL)
  UNION ALL SELECT 'settings_translations CHECK tr içeriyor', (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='settings_translations_locale_check'), '…''tr''…',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='settings_translations_locale_check') LIKE '%''tr''%'
  UNION ALL SELECT 'site_popup_translations CHECK tr içeriyor', (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='site_popup_translations_locale_check'), '…''tr''…',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='site_popup_translations_locale_check') LIKE '%''tr''%'
  UNION ALL SELECT 'ayna fonksiyonu HENÜZ YOK (106)', (to_regprocedure('public.trg_content_mirror_base_to_tr()') IS NULL)::text, 'true',
         to_regprocedure('public.trg_content_mirror_base_to_tr()') IS NULL
) k;
ROLLBACK;
