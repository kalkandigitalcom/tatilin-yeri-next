-- G107 — 107 geri alma (Faz 2 §6). YALNIZ 108 ÖNCESİ güvenli; ana kayıtla birebir aynı tr satırlarını siler.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$
DECLARE r record; v_cmp text; v_n bigint;
BEGIN
  PERFORM set_config('app.content_mirror', 'on', true);
  FOR r IN SELECT * FROM (VALUES
    ('villa_translations','villa','villa_id','description,badge,seo_title,seo_description'),
    ('villa_type_translations','villa_types','type_id','name'),
    ('villa_feature_translations','villa_features','feature_id','name'),
    ('rule_item_translations','rule_items','rule_id','title'),
    ('price_include_item_translations','price_include_items','include_id','title'),
    ('blog_post_translations','blog_posts','blog_post_id','title,body,excerpt,seo_title,seo_description'),
    ('page_translations','pages','page_id','title,body,excerpt,seo_title,seo_description,sections'),
    ('faq_translations','faqs','faq_id','question,answer'),
    ('menu_translations','menu','menu_id','name'),
    ('payment_method_translations','payment_methods','payment_method_id','name'),
    ('settings_translations','settings','settings_id','footer_copyright,default_meta_title,default_meta_description,hero_title,hero_subtitle,hero_badge_text,hero_primary_cta_text,hero_secondary_cta_text,business_hours'),
    ('site_popup_translations','site_popup','popup_id','title,description,highlight_text,stats,button_text,button_url'),
    ('homepage_collection_translations','homepage_collections','collection_id','custom_title'),
    ('discount_collection_translations','discount_collections','collection_id','custom_title')
  ) AS t(tr_table, base_table, fk, fields) LOOP
    SELECT string_agg(format('t.%1$I IS NOT DISTINCT FROM b.%1$I', x), ' AND ') INTO v_cmp
      FROM unnest(string_to_array(r.fields, ',')) x;
    EXECUTE format('DELETE FROM public.%I t USING public.%I b WHERE t.locale = ''tr'' AND b.id = t.%I AND %s',
                   r.tr_table, r.base_table, r.fk, v_cmp);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'Rollback 107: % → % tr satırı silindi', r.tr_table, v_n;
  END LOOP;
END $$;
COMMIT;
