-- G105 — 105 geri alma (Faz 1 §7). Önce G107 ve G106 gerekir; koleksiyon çeviri tablolarındaki EN/DE başlıklar silinir.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '120s';
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['settings_translations','site_popup_translations'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE locale = %L', t, 'tr') INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'Rollback 105: % tablosunda % adet tr satırı var; önce kaldırılmalı.', t, n; END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'villa_translations','villa_type_translations','villa_feature_translations','rule_item_translations',
    'price_include_item_translations','blog_post_translations','page_translations','faq_translations',
    'menu_translations','payment_method_translations','settings_translations','site_popup_translations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_content_tr_guard', t);
  END LOOP;
END $$;
DROP TABLE IF EXISTS public.homepage_collection_translations;
DROP TABLE IF EXISTS public.discount_collection_translations;
DROP FUNCTION IF EXISTS public.trg_content_tr_guard();
DROP FUNCTION IF EXISTS public.trg_content_base_guard();
DROP FUNCTION IF EXISTS public.content_mirror_mode();
ALTER TABLE public.settings_translations DROP CONSTRAINT IF EXISTS settings_translations_locale_check;
ALTER TABLE public.settings_translations ADD CONSTRAINT settings_translations_locale_check CHECK (locale IN ('en','de'));
ALTER TABLE public.site_popup_translations DROP CONSTRAINT IF EXISTS site_popup_translations_locale_check;
ALTER TABLE public.site_popup_translations ADD CONSTRAINT site_popup_translations_locale_check CHECK (locale IN ('en','de'));
COMMIT;
