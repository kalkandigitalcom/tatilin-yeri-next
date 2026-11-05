/* ===============================================================
   🌐 MIGRATION 105 — Simetrik içerik modeli: temel (Seçenek D, Faz 1)
   ===============================================================
   AMAÇ:
     TR, EN ve DE dillerinin AYNI veri modelinde (çeviri tabloları,
     `locale` koduyla) saklanabilmesi için ŞEMA temelini hazırlar.
     VERİ TAŞIMAZ. Mevcut ana kolonlar, mevcut çeviri satırları ve
     uygulama davranışı DEĞİŞMEZ.

   EKLENEN / DEĞİŞEN:
     1) `settings_translations` ve `site_popup_translations` locale
        CHECK'i ('en','de') → ('tr','en','de'). Diğer 10 çeviri tablosu
        zaten 'tr' kabul ediyor (082/086/088/089).
     2) `public.content_mirror_mode()` — içerik geçiş modunu DB'de
        tanımlar:
          'base'         → ana tablolardaki (TR) kolonlar yetkili kaynak;
                           `locale='tr'` çeviri satırları YALNIZ ayna
                           (Faz 2 backfill / ayna trigger'ı) tarafından
                           yazılabilir.
          'translations' → `locale='tr'` çeviri satırları yetkili kaynak
                           (Faz 5+ migration'ı tarafından açılır).
        Fonksiyon YOKSA 'base' ile oluşturulur; VARSA DOKUNULMAZ (bu
        migration'ı sonradan tekrar çalıştırmak modu geri ÇEVİRMEZ).
     3) Ayna bayrağı sözleşmesi: ayna/backfill kodu yazmadan önce
        `set_config('app.content_mirror', 'on', true)` (transaction-local)
        çağırır. Guard'lar bu bayrağı tanır.
     4) `public.trg_content_tr_guard()` — çeviri tablolarında
        `locale='tr'` satırına 'base' modunda ayna dışı INSERT / UPDATE /
        DELETE'i REDDEDER. Ana kayıt silinirken cascade ile gelen silme
        serbesttir. EN/DE satırları HİÇ etkilenmez.
        12 aktif çeviri tablosuna + aşağıdaki 2 yeni tabloya bağlanır.
     5) `public.trg_content_base_guard()` — 'translations' modunda ana
        tablo çevrilebilir kolonlarına ayna dışı yazmayı reddedecek
        fonksiyon. BU MIGRATION'DA HİÇBİR TABLOYA BAĞLANMAZ (ana tablo
        şeması depoda yok; kolon listeleri Faz 2 öncesi canlı şemadan
        doğrulanıp ilgili migration'da bağlanır).
     6) `homepage_collection_translations`, `discount_collection_translations`
        — villa kartı `custom_title` çevirileri (082 deseni: parent FK
        ON DELETE CASCADE, UNIQUE(parent, locale), locale CHECK,
        updated_at trigger'ı). Boş başlar.

   DOKUNULMAYAN: ana tabloların kolonları ve verileri, mevcut çeviri
     satırları, url_redirects ve 103 slug-geçmişi trigger'ları,
     site_locales / ana dil (101, 104), rezervasyon, fiyat, ödeme,
     voucher tabloları.

   UYGULAMA ETKİSİ: Uygulama bugün `locale='tr'` çeviri satırı YAZMAZ
     (servis whitelist'leri en/de) → guard mevcut hiçbir akışı engellemez.

   BAĞIMLILIK: 082 (trg_touch_updated_at, çeviri tabloları), 083, 086,
     088, 089, 096, 012 (homepage_collections), 062 (discount_collections).
   IDEMPOTENT: DROP/ADD CONSTRAINT, CREATE TABLE IF NOT EXISTS,
     CREATE OR REPLACE FUNCTION (mod fonksiyonu hariç: yalnız yoksa),
     DROP TRIGGER IF EXISTS.

   ROLLBACK (veri kaybı yok; `locale='tr'` satırı varken CHECK geri
   alınamaz — önce o satırların olmadığı doğrulanmalı):
     DROP TABLE IF EXISTS public.homepage_collection_translations;
     DROP TABLE IF EXISTS public.discount_collection_translations;
     -- her çeviri tablosu için:
     --   DROP TRIGGER IF EXISTS <tablo>_content_tr_guard ON public.<tablo>;
     DROP FUNCTION IF EXISTS public.trg_content_tr_guard();
     DROP FUNCTION IF EXISTS public.trg_content_base_guard();
     DROP FUNCTION IF EXISTS public.content_mirror_mode();
     ALTER TABLE public.settings_translations DROP CONSTRAINT settings_translations_locale_check,
       ADD CONSTRAINT settings_translations_locale_check CHECK (locale IN ('en','de'));
     ALTER TABLE public.site_popup_translations DROP CONSTRAINT site_popup_translations_locale_check,
       ADD CONSTRAINT site_popup_translations_locale_check CHECK (locale IN ('en','de'));
   (Hazır betik: raporda "Geri dönüş planı".)
   =============================================================== */

BEGIN;

/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
   lock_timeout aşılırsa migration 105 hiçbir değişiklik bırakmadan geri alınır
   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

/* ---------------------------------------------------------------
   0) Bağımlılık kontrolü
--------------------------------------------------------------- */
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'trg_touch_updated_at'
  ) THEN
    RAISE EXCEPTION 'Migration 105, 082''deki public.trg_touch_updated_at() fonksiyonuna bağlıdır.';
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'villa_translations','villa_type_translations','villa_feature_translations',
    'rule_item_translations','price_include_item_translations','blog_post_translations',
    'page_translations','faq_translations','menu_translations','payment_method_translations',
    'settings_translations','site_popup_translations',
    'homepage_collections','discount_collections'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Migration 105: public.% tablosu yok (önceki migration''lar uygulanmalı).', t;
    END IF;
  END LOOP;
END
$$;

/* ---------------------------------------------------------------
   1) settings / popup çevirileri TR kabul eder
--------------------------------------------------------------- */
ALTER TABLE public.settings_translations
  DROP CONSTRAINT IF EXISTS settings_translations_locale_check;
ALTER TABLE public.settings_translations
  ADD CONSTRAINT settings_translations_locale_check
  CHECK (locale IN ('tr', 'en', 'de'));

ALTER TABLE public.site_popup_translations
  DROP CONSTRAINT IF EXISTS site_popup_translations_locale_check;
ALTER TABLE public.site_popup_translations
  ADD CONSTRAINT site_popup_translations_locale_check
  CHECK (locale IN ('tr', 'en', 'de'));

/* ---------------------------------------------------------------
   2) Geçiş modu — yalnız YOKSA oluşturulur (mod geri çevrilmez)
--------------------------------------------------------------- */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'content_mirror_mode'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.content_mirror_mode()
      RETURNS text
      LANGUAGE sql
      STABLE
      SET search_path = pg_catalog, public
      AS $body$ SELECT 'base'::text $body$
    $fn$;
    EXECUTE $c$
      COMMENT ON FUNCTION public.content_mirror_mode() IS
        'Simetrik içerik geçiş modu: base = ana (TR) kolonlar yetkili; '
        'translations = locale=tr çeviri satırları yetkili. Yalnız '
        'migration ile değiştirilir (CREATE OR REPLACE).'
    $c$;
  END IF;
END
$$;

/* ---------------------------------------------------------------
   3) TR çeviri satırı guard'ı (çeviri tabloları)
      TG_ARGV[0] = ana tablo, TG_ARGV[1] = parent FK kolonu
--------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.trg_content_tr_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent_table text := TG_ARGV[0];
  v_fk_col       text := TG_ARGV[1];
  v_touches_tr   boolean;
  v_parent_id    text;
  v_parent_alive boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_touches_tr := NEW.locale = 'tr';
  ELSIF TG_OP = 'UPDATE' THEN
    v_touches_tr := NEW.locale = 'tr' OR OLD.locale = 'tr';
  ELSE
    v_touches_tr := OLD.locale = 'tr';
  END IF;

  IF NOT v_touches_tr
     OR public.content_mirror_mode() = 'translations'
     OR current_setting('app.content_mirror', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Ana kayıt silinirken (ON DELETE CASCADE) gelen silme serbest.
  IF TG_OP = 'DELETE' THEN
    v_parent_id := to_jsonb(OLD) ->> v_fk_col;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id::text = $1)', v_parent_table)
       INTO v_parent_alive
      USING v_parent_id;
    IF NOT v_parent_alive THEN
      RETURN OLD;
    END IF;
  END IF;

  RAISE EXCEPTION
    'content_mirror_guard: % tablosunda locale=tr satırı yalnız ayna tarafından yazılabilir (mod: base).',
    TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

COMMENT ON FUNCTION public.trg_content_tr_guard() IS
  'base modunda locale=tr çeviri satırına ayna dışı yazmayı reddeder; '
  'app.content_mirror=on (transaction-local) ayna/backfill içindir.';

/* ---------------------------------------------------------------
   4) Ana tablo guard'ı — TANIMLI, BAĞLI DEĞİL (Faz 2+)
--------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.trg_content_base_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.content_mirror_mode() = 'translations'
     AND current_setting('app.content_mirror', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'content_mirror_guard: % çevrilebilir kolonları artık çeviri tablosundan yönetiliyor (mod: translations).',
      TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_content_base_guard() IS
  'translations modunda ana tablo çevrilebilir kolonlarına ayna dışı '
  'yazmayı reddeder. Faz 2+ migration''ında kolon listesiyle bağlanır.';

/* ---------------------------------------------------------------
   5) custom_title çeviri tabloları (082 deseni)
--------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS public.homepage_collection_translations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  uuid NOT NULL REFERENCES public.homepage_collections (id) ON DELETE CASCADE,
  locale         text NOT NULL,
  custom_title   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT homepage_collection_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT homepage_collection_translations_collection_locale_key UNIQUE (collection_id, locale)
);

COMMENT ON TABLE public.homepage_collection_translations IS
  'homepage_collections.custom_title (villa kartı başlık override) çevirileri. '
  'Boş başlar; ana kolon kalıcı ayna olarak kalır.';

DROP TRIGGER IF EXISTS homepage_collection_translations_touch_updated_at ON public.homepage_collection_translations;
CREATE TRIGGER homepage_collection_translations_touch_updated_at
  BEFORE UPDATE ON public.homepage_collection_translations
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.discount_collection_translations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  uuid NOT NULL REFERENCES public.discount_collections (id) ON DELETE CASCADE,
  locale         text NOT NULL,
  custom_title   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_collection_translations_locale_check CHECK (locale IN ('tr', 'en', 'de')),
  CONSTRAINT discount_collection_translations_collection_locale_key UNIQUE (collection_id, locale)
);

COMMENT ON TABLE public.discount_collection_translations IS
  'discount_collections.custom_title çevirileri. Boş başlar; ana kolon '
  'kalıcı ayna olarak kalır.';

DROP TRIGGER IF EXISTS discount_collection_translations_touch_updated_at ON public.discount_collection_translations;
CREATE TRIGGER discount_collection_translations_touch_updated_at
  BEFORE UPDATE ON public.discount_collection_translations
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();

/* ---------------------------------------------------------------
   6) TR guard'ını 14 çeviri tablosuna bağla
--------------------------------------------------------------- */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('villa_translations',               'villa',                'villa_id'),
    ('villa_type_translations',          'villa_types',          'type_id'),
    ('villa_feature_translations',       'villa_features',       'feature_id'),
    ('rule_item_translations',           'rule_items',           'rule_id'),
    ('price_include_item_translations',  'price_include_items',  'include_id'),
    ('blog_post_translations',           'blog_posts',           'blog_post_id'),
    ('page_translations',                'pages',                'page_id'),
    ('faq_translations',                 'faqs',                 'faq_id'),
    ('menu_translations',                'menu',                 'menu_id'),
    ('payment_method_translations',      'payment_methods',      'payment_method_id'),
    ('settings_translations',            'settings',             'settings_id'),
    ('site_popup_translations',          'site_popup',           'popup_id'),
    ('homepage_collection_translations', 'homepage_collections', 'collection_id'),
    ('discount_collection_translations', 'discount_collections', 'collection_id')
  ) AS t(tbl, parent, fk)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tbl || '_content_tr_guard', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.trg_content_tr_guard(%L, %L)',
      r.tbl || '_content_tr_guard', r.tbl, r.parent, r.fk
    );
  END LOOP;
END
$$;

COMMIT;
