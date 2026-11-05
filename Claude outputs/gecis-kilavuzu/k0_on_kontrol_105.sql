-- K0 — 105 ÖNCESİ ön kontrol (salt okunur). Her satırda durum=OK beklenir.
BEGIN TRANSACTION READ ONLY;
SELECT kontrol, deger, beklenen, CASE WHEN ok THEN 'OK' ELSE 'HATA' END AS durum FROM (
  SELECT 'pg_surum' AS kontrol, current_setting('server_version') AS deger, '>= 13' AS beklenen,
         current_setting('server_version_num')::int >= 130000 AS ok
  UNION ALL SELECT 'veritabani', current_database(), '(canlı DB adı)', true
  UNION ALL SELECT 'm081 public_default_locale',
         (SELECT count(*)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='settings' AND column_name='public_default_locale'), '1',
         (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='settings' AND column_name='public_default_locale') = 1
  UNION ALL SELECT 'm082 trg_touch_updated_at', (to_regprocedure('public.trg_touch_updated_at()') IS NOT NULL)::text, 'true',
         to_regprocedure('public.trg_touch_updated_at()') IS NOT NULL
  UNION ALL SELECT 'm101 site_locales', (to_regclass('public.site_locales') IS NOT NULL)::text, 'true', to_regclass('public.site_locales') IS NOT NULL
  UNION ALL SELECT 'm101 trigger', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
         ('site_locales_touch_updated_at','site_locales_root_guard','settings_root_locale_enabled_guard')), '3',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
         ('site_locales_touch_updated_at','site_locales_root_guard','settings_root_locale_enabled_guard')) = 3
  UNION ALL SELECT 'm102 slug kolon', (SELECT count(*)::text FROM information_schema.columns WHERE table_schema='public' AND column_name='slug'
         AND table_name IN ('villa_translations','villa_type_translations','blog_post_translations','page_translations')), '4',
         (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='slug'
         AND table_name IN ('villa_translations','villa_type_translations','blog_post_translations','page_translations')) = 4
  UNION ALL SELECT 'm102 slug index', (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexname IN
         ('villa_translations_locale_slug_key','villa_type_translations_locale_slug_key','blog_post_translations_locale_slug_key','page_translations_locale_slug_key')), '4',
         (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN
         ('villa_translations_locale_slug_key','villa_type_translations_locale_slug_key','blog_post_translations_locale_slug_key','page_translations_locale_slug_key')) = 4
  UNION ALL SELECT 'm103 url_redirects', (to_regclass('public.url_redirects') IS NOT NULL)::text, 'true', to_regclass('public.url_redirects') IS NOT NULL
  UNION ALL SELECT 'm103 slug_history trigger', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_slug\_history' ESCAPE '\'), '8',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%\_slug\_history' ESCAPE '\') = 8
  UNION ALL SELECT 'm104 change_public_root_locale', (to_regprocedure('public.change_public_root_locale(text,text)') IS NOT NULL)::text, 'true',
         to_regprocedure('public.change_public_root_locale(text,text)') IS NOT NULL
  UNION ALL SELECT 'm104 multilingual_root_guard', (SELECT count(*)::text FROM pg_trigger WHERE NOT tgisinternal AND tgname='settings_multilingual_root_guard'), '1',
         (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname='settings_multilingual_root_guard') = 1
  UNION ALL SELECT 'm105 HENÜZ YOK (content_mirror_mode)', (to_regprocedure('public.content_mirror_mode()') IS NULL)::text, 'true',
         to_regprocedure('public.content_mirror_mode()') IS NULL
  UNION ALL SELECT 'm105 HENÜZ YOK (koleksiyon çeviri tablosu)', (to_regclass('public.homepage_collection_translations') IS NULL)::text, 'true',
         to_regclass('public.homepage_collection_translations') IS NULL
  UNION ALL SELECT 'bağlanan rol', current_user || CASE WHEN (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN ' (superuser)' ELSE '' END, '(tabloların sahibi ya da superuser)', true
  UNION ALL SELECT 'sahibi olunmayan tablo (ALTER/TRIGGER yetkisi)',
         (SELECT count(*)::text FROM pg_tables WHERE schemaname='public' AND tablename IN
           ('villa','villa_types','villa_features','rule_items','price_include_items','blog_posts','pages','faqs','menu','payment_methods','settings','site_popup','homepage_collections','discount_collections',
            'villa_translations','villa_type_translations','villa_feature_translations','rule_item_translations','price_include_item_translations','blog_post_translations','page_translations','faq_translations','menu_translations','payment_method_translations','settings_translations','site_popup_translations')
           AND tableowner <> current_user AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)), '0',
         (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN
           ('villa','villa_types','villa_features','rule_items','price_include_items','blog_posts','pages','faqs','menu','payment_methods','settings','site_popup','homepage_collections','discount_collections',
            'villa_translations','villa_type_translations','villa_feature_translations','rule_item_translations','price_include_item_translations','blog_post_translations','page_translations','faq_translations','menu_translations','payment_method_translations','settings_translations','site_popup_translations')
           AND tableowner <> current_user AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)) = 0
  UNION ALL SELECT 'CREATE yetkisi (public şema)', has_schema_privilege('public','CREATE')::text, 'true', has_schema_privilege('public','CREATE')
  UNION ALL SELECT 'settings satır sayısı', (SELECT count(*)::text FROM public.settings), '1', (SELECT count(*) FROM public.settings) = 1
  UNION ALL SELECT 'ana dil', (SELECT public_default_locale FROM public.settings LIMIT 1), 'tr', (SELECT public_default_locale FROM public.settings LIMIT 1) = 'tr'
  UNION ALL SELECT 'mevcut tr çeviri satırı (Q7)', (
           (SELECT count(*) FROM public.villa_translations WHERE locale='tr') + (SELECT count(*) FROM public.villa_type_translations WHERE locale='tr')
         + (SELECT count(*) FROM public.villa_feature_translations WHERE locale='tr') + (SELECT count(*) FROM public.rule_item_translations WHERE locale='tr')
         + (SELECT count(*) FROM public.price_include_item_translations WHERE locale='tr') + (SELECT count(*) FROM public.blog_post_translations WHERE locale='tr')
         + (SELECT count(*) FROM public.page_translations WHERE locale='tr') + (SELECT count(*) FROM public.faq_translations WHERE locale='tr')
         + (SELECT count(*) FROM public.menu_translations WHERE locale='tr') + (SELECT count(*) FROM public.payment_method_translations WHERE locale='tr'))::text,
         '0 (değilse 107 öncesi incele)',
           (SELECT count(*) FROM public.villa_translations WHERE locale='tr') + (SELECT count(*) FROM public.blog_post_translations WHERE locale='tr')
         + (SELECT count(*) FROM public.page_translations WHERE locale='tr') + (SELECT count(*) FROM public.villa_type_translations WHERE locale='tr') = 0
  UNION ALL SELECT 'tekrarlı villa teknik anahtarı (Q9)', (SELECT count(*)::text FROM (SELECT slug FROM public.villa WHERE slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' GROUP BY slug HAVING count(*)>1) x), '0',
         (SELECT count(*) FROM (SELECT slug FROM public.villa WHERE slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' GROUP BY slug HAVING count(*)>1) x) = 0
  UNION ALL SELECT 'tekrarlı sayfa teknik anahtarı (Q9)', (SELECT count(*)::text FROM (SELECT slug FROM public.pages WHERE slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' GROUP BY slug HAVING count(*)>1) x), '0',
         (SELECT count(*) FROM (SELECT slug FROM public.pages WHERE slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' GROUP BY slug HAVING count(*)>1) x) = 0
  UNION ALL SELECT 'boş ödeme yöntemi adı', (SELECT count(*)::text FROM public.payment_methods WHERE btrim(coalesce(name,''))=''), '0',
         (SELECT count(*) FROM public.payment_methods WHERE btrim(coalesce(name,''))='') = 0
  UNION ALL SELECT 'çeviride "" gövde (blog+sayfa)', ((SELECT count(*) FROM public.blog_post_translations WHERE body='') + (SELECT count(*) FROM public.page_translations WHERE body=''))::text, '0',
         (SELECT count(*) FROM public.blog_post_translations WHERE body='') + (SELECT count(*) FROM public.page_translations WHERE body='') = 0
  UNION ALL SELECT '30 sn''den eski açık transaction', (SELECT count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND xact_start < now() - interval '30 seconds' AND pid <> pg_backend_pid()), '0',
         (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND xact_start < now() - interval '30 seconds' AND pid <> pg_backend_pid()) = 0
) k;
-- Bilgi: biçim dışı teknik anahtarlar (tr.slug NULL alacak; URL teknik anahtarla çalışmaya devam eder)
SELECT 'villa' AS tablo, slug FROM public.villa WHERE slug IS NOT NULL AND slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
UNION ALL SELECT 'villa_types', slug FROM public.villa_types WHERE slug IS NULL OR slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
UNION ALL SELECT 'blog_posts', slug FROM public.blog_posts WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
UNION ALL SELECT 'pages', slug FROM public.pages WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
-- Bilgi: pages.content kolonu ve kullanım
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pages' AND column_name='content') AS pages_content_kolonu_var;
ROLLBACK;
