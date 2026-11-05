-- K3 — 107 SONRASI ayna doğrulaması (salt okunur). Beklenen: her satırda eksik_tr=0, icerik_fark=0,
--      slug_fark=0 (108 öncesi) → durum=OK. 108 sonrası slug_fark>0 = admin'in TR slug'ı değiştirmesi (normal).
BEGIN TRANSACTION READ ONLY;
SELECT tablo, ana_kayit, eksik_tr, icerik_fark, slug_fark,
       CASE WHEN eksik_tr = 0 AND icerik_fark = 0 AND coalesce(slug_fark,0) = 0 THEN 'OK' ELSE 'HATA/İNCELE' END AS durum
FROM (
  SELECT 'villa' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.description,t.badge,t.seo_title,t.seo_description) IS DISTINCT FROM row(b.description,b.badge,b.seo_title,b.seo_description)) AS icerik_fark,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN b.slug END) AS slug_fark
    FROM public.villa b LEFT JOIN public.villa_translations t ON t.villa_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'villa_types' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.name IS DISTINCT FROM b.name) AS icerik_fark,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN b.slug END) AS slug_fark
    FROM public.villa_types b LEFT JOIN public.villa_type_translations t ON t.type_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'villa_features' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.name IS DISTINCT FROM b.name) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.villa_features b LEFT JOIN public.villa_feature_translations t ON t.feature_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'rule_items' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.title IS DISTINCT FROM b.title) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.rule_items b LEFT JOIN public.rule_item_translations t ON t.rule_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'price_include_items' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.title IS DISTINCT FROM b.title) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.price_include_items b LEFT JOIN public.price_include_item_translations t ON t.include_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'blog_posts' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.title,t.body,t.excerpt,t.seo_title,t.seo_description) IS DISTINCT FROM row(b.title,b.body,b.excerpt,b.seo_title,b.seo_description)) AS icerik_fark,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN b.slug END) AS slug_fark
    FROM public.blog_posts b LEFT JOIN public.blog_post_translations t ON t.blog_post_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'pages' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.title,t.body,t.excerpt,t.seo_title,t.seo_description,t.sections) IS DISTINCT FROM row(b.title,b.body,b.excerpt,b.seo_title,b.seo_description,b.sections)) AS icerik_fark,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN b.slug END) AS slug_fark
    FROM public.pages b LEFT JOIN public.page_translations t ON t.page_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'faqs' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.question,t.answer) IS DISTINCT FROM row(b.question,b.answer)) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.faqs b LEFT JOIN public.faq_translations t ON t.faq_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'menu' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.name IS DISTINCT FROM b.name) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.menu b LEFT JOIN public.menu_translations t ON t.menu_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'payment_methods' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.name IS DISTINCT FROM b.name) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.payment_methods b LEFT JOIN public.payment_method_translations t ON t.payment_method_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'settings' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.footer_copyright,t.default_meta_title,t.default_meta_description,t.hero_title,t.hero_subtitle,t.hero_badge_text,t.hero_primary_cta_text,t.hero_secondary_cta_text,t.business_hours) IS DISTINCT FROM row(b.footer_copyright,b.default_meta_title,b.default_meta_description,b.hero_title,b.hero_subtitle,b.hero_badge_text,b.hero_primary_cta_text,b.hero_secondary_cta_text,b.business_hours)) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.settings b LEFT JOIN public.settings_translations t ON t.settings_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'site_popup' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.title,t.description,t.highlight_text,t.stats,t.button_text,t.button_url) IS DISTINCT FROM row(b.title,b.description,b.highlight_text,b.stats,b.button_text,b.button_url)) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.site_popup b LEFT JOIN public.site_popup_translations t ON t.popup_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'homepage_collections' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.custom_title IS DISTINCT FROM b.custom_title) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.homepage_collections b LEFT JOIN public.homepage_collection_translations t ON t.collection_id = b.id AND t.locale = 'tr'
UNION ALL
  SELECT 'discount_collections' AS tablo, count(*) AS ana_kayit, count(*) FILTER (WHERE t.id IS NULL) AS eksik_tr,
         count(*) FILTER (WHERE t.id IS NOT NULL AND t.custom_title IS DISTINCT FROM b.custom_title) AS icerik_fark,
         NULL::bigint AS slug_fark
    FROM public.discount_collections b LEFT JOIN public.discount_collection_translations t ON t.collection_id = b.id AND t.locale = 'tr'
) x ORDER BY tablo;
SELECT 'content_mirror_mode()' AS kontrol, public.content_mirror_mode() AS deger;
SELECT 'locale+slug tekrarı (villa/tip/blog/sayfa)' AS kontrol, (
  (SELECT count(*) FROM (SELECT locale, slug FROM public.villa_translations WHERE slug IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) a)
+ (SELECT count(*) FROM (SELECT locale, slug FROM public.villa_type_translations WHERE slug IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) a)
+ (SELECT count(*) FROM (SELECT locale, slug FROM public.blog_post_translations WHERE slug IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) a)
+ (SELECT count(*) FROM (SELECT locale, slug FROM public.page_translations WHERE slug IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) a)) AS deger, '0' AS beklenen;
ROLLBACK;
