/* ===============================================================
   🌐 MIGRATION 106 — Simetrik içerik: ayna mekanizması + slug geçmişi
                      düzeltmesi (Seçenek D, Faz 2 / 1. adım)
   ===============================================================
   AMAÇ:
     Ana tablolardaki TR kolonları (kalıcı ayna) ile `locale='tr'`
     çeviri satırları arasında TEK YÖNLÜ, `content_mirror_mode()` ile
     seçilen senkronu kurar. VERİ AKTARMAZ (backfill = migration 107).
     Bu migration önce gelir: 107'nin backfill'i ile canlı yazmalar
     arasında aynasız bir pencere kalmaz.

   1) Şema doğrulaması (güvenli değilse DUR):
        Her içerik varlığının ana tablosunda çevrilebilir kolonların
        VAR olduğu ve tiplerinin uyumlu olduğu (text ↔ text/varchar,
        jsonb ↔ jsonb) kontrol edilir; ana tablonun `id` kolonu olmalı.
        Ana tablo şeması depoda olmadığı için bu kontrol canlı şemaya
        karşı ÇALIŞMA ANINDA yapılır.
   2) Ayna fonksiyonları (yön DB'den okunur, aynı anda tek yön):
        trg_content_mirror_base_to_tr() — ana tablo AFTER INSERT/UPDATE:
          mod 'base' ise ana kolonları `locale='tr'` satırına upsert eder.
          Slug'lı varlıklarda tr.slug = ana slug (102 formatına uymuyorsa
          veya başka kaydın tr slug'ıyla çakışıyorsa NULL → URL teknik
          anahtardan aynen çözülür). Mod 'translations' ise HİÇBİR ŞEY
          yapmaz.
        trg_content_mirror_tr_to_base() — çeviri tablosu AFTER
          INSERT/UPDATE (locale='tr'): mod 'translations' ise ana
          kolonları günceller (slug HARİÇ; NOT NULL ana kolonda boş TR
          değeri ana değeri korur). Mod 'base' ise HİÇBİR ŞEY yapmaz.
        Ayna yazarken `app.content_mirror` bayrağını açar ve ÖNCEKİ
        değerine geri döndürür (aynı transaction'daki sonraki ayna dışı
        yazma guard'dan kaçamaz).
   3) Guard'lar:
        • trg_content_tr_guard (105) yeniden tanımlanır: ana kaydı
          yaşayan `locale='tr'` satırının tek başına silinmesi HER İKİ
          modda engellenir (ayna kopyası bayatlamasın). Diğer davranış
          aynı.
        • trg_content_base_guard (105) ana tablolara BEFORE UPDATE OF
          <çevrilebilir kolonlar> olarak BAĞLANIR. 'base' modunda etkisiz.
   4) Slug geçmişi (103) düzeltmesi — trg_record_slug_history yeniden
      tanımlanır (imza ve trigger'lar AYNI):
        • Çeviri tablosu DELETE'i ana kayıt artık yokken (cascade) geçmiş
          YAZMAZ → silinmiş içeriğe işaret eden yetim kayıt oluşmaz.
        • Ayna bayrağı açıkken çeviri tablosundaki slug olayları geçmiş
          yazmaz/silmez: ayna slug'ı ana tablodan kopyalar, ana tablonun
          kendi trigger'ı geçmişi zaten yönetir (çift kayıt olmaz; backfill
          url_redirects'e dokunmaz).
      Mevcut url_redirects kayıtlarına bu migration DOKUNMAZ (yetim
      kayıt temizliği ayrı, isteğe bağlı sorgu — rapor §5).

   DOKUNULMAYAN: ana tabloların ve çeviri tablolarının verisi, EN/DE
     satırları, content_mirror_mode() değeri ('base' kalır), site_locales,
     ana dil, rezervasyon / fiyat / ödeme / voucher tabloları.

   UYGULAMA ETKİSİ ('base' modunda): admin ana tabloya her yazdığında
     aynı transaction'da `locale='tr'` satırı güncellenir. Okuma yolları
     değişmediği için public/admin davranışı AYNI.

   BAĞIMLILIK: 105 (content_mirror_mode, guard fonksiyonları), 102, 103.
   IDEMPOTENT: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.
   ROLLBACK: rapor §8 (trigger'lar düşer, 103 ve 105 fonksiyonları
     önceki tanımlarına döner; veri değişmez).
   =============================================================== */

BEGIN;

/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
   lock_timeout aşılırsa migration 106 hiçbir değişiklik bırakmadan geri alınır
   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

/* ---------------------------------------------------------------
   0) Bağımlılık
--------------------------------------------------------------- */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'content_mirror_mode') THEN
    RAISE EXCEPTION 'Migration 106, 105_symmetric_content_foundation.sql''e bağlıdır.';
  END IF;
  IF to_regclass('public.url_redirects') IS NULL THEN
    RAISE EXCEPTION 'Migration 106, 103_url_redirects.sql''e bağlıdır.';
  END IF;
  IF public.content_mirror_mode() <> 'base' THEN
    RAISE EXCEPTION 'Migration 106 yalnız base modunda uygulanır (mevcut: %).', public.content_mirror_mode();
  END IF;
END
$$;

/* ---------------------------------------------------------------
   1) Ayna: ana tablo → tr satırı (yalnız 'base' modunda etkin)
      TG_ARGV: 0 çeviri tablosu, 1 parent FK, 2 alanlar (virgüllü),
               3 'slug' | ''
--------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.trg_content_mirror_base_to_tr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tr      text    := TG_ARGV[0];
  v_fk      text    := TG_ARGV[1];
  v_fields  text[]  := string_to_array(TG_ARGV[2], ',');
  v_slug    boolean := TG_ARGV[3] = 'slug';
  v_new     jsonb   := to_jsonb(NEW);
  v_old     jsonb   := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_keys    text[];
  v_payload jsonb   := '{}'::jsonb;
  v_s       text;
  v_taken   boolean;
  v_prev    text;
  f         text;
BEGIN
  IF public.content_mirror_mode() <> 'base' THEN
    RETURN NEW;
  END IF;

  v_keys := v_fields || CASE WHEN v_slug THEN ARRAY['slug'] ELSE ARRAY[]::text[] END;

  -- Aynalanan kolonlarda değişiklik yoksa yazma (gereksiz satır kilidi yok).
  IF TG_OP = 'UPDATE' AND NOT EXISTS (
    SELECT 1 FROM unnest(v_keys) k WHERE (v_old -> k) IS DISTINCT FROM (v_new -> k)
  ) THEN
    RETURN NEW;
  END IF;

  FOREACH f IN ARRAY v_fields LOOP
    v_payload := v_payload || jsonb_build_object(f, v_new -> f);
  END LOOP;

  IF v_slug THEN
    v_s := v_new ->> 'slug';
    IF v_s IS NULL OR char_length(v_s) NOT BETWEEN 1 AND 160
       OR v_s !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      v_s := NULL;
    END IF;
    IF v_s IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE locale = ''tr'' AND slug = $1 AND %I IS DISTINCT FROM $2)',
        v_tr, v_fk
      ) INTO v_taken USING v_s, NEW.id;
      IF v_taken THEN
        v_s := NULL;
      END IF;
    END IF;
    v_payload := v_payload || jsonb_build_object('slug', v_s);
  END IF;

  v_prev := current_setting('app.content_mirror', true);
  PERFORM set_config('app.content_mirror', 'on', true);

  EXECUTE format(
    'INSERT INTO public.%1$I (%2$I, locale, %3$s) '
    'SELECT $1, ''tr'', %4$s FROM jsonb_populate_record(NULL::public.%1$I, $2) r '
    'ON CONFLICT (%2$I, locale) DO UPDATE SET %5$s',
    v_tr,
    v_fk,
    (SELECT string_agg(quote_ident(k), ', ') FROM jsonb_object_keys(v_payload) k),
    (SELECT string_agg('r.' || quote_ident(k), ', ') FROM jsonb_object_keys(v_payload) k),
    (SELECT string_agg(format('%1$I = EXCLUDED.%1$I', k), ', ') FROM jsonb_object_keys(v_payload) k)
  ) USING NEW.id, v_payload;

  PERFORM set_config('app.content_mirror', COALESCE(v_prev, ''), true);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_content_mirror_base_to_tr() IS
  'base modunda ana tablo çevrilebilir kolonlarını locale=tr çeviri satırına '
  'upsert eder (tek yön). translations modunda etkisiz.';

/* ---------------------------------------------------------------
   2) Ayna: tr satırı → ana tablo (yalnız 'translations' modunda etkin)
      TG_ARGV: 0 ana tablo, 1 parent FK, 2 alanlar, 3 NOT NULL ana
               kolonlar (virgüllü)
--------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.trg_content_mirror_tr_to_base()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_base    text   := TG_ARGV[0];
  v_fk      text   := TG_ARGV[1];
  v_fields  text[] := string_to_array(TG_ARGV[2], ',');
  v_notnull text[] := string_to_array(NULLIF(TG_ARGV[3], ''), ',');
  v_sets    text;
  v_prev    text;
BEGIN
  IF NEW.locale <> 'tr' OR public.content_mirror_mode() <> 'translations' THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(
           CASE WHEN f = ANY (COALESCE(v_notnull, ARRAY[]::text[]))
                THEN format('%1$I = COALESCE(r.%1$I, b.%1$I)', f)
                ELSE format('%1$I = r.%1$I', f) END,
           ', ')
    INTO v_sets
    FROM unnest(v_fields) f;

  v_prev := current_setting('app.content_mirror', true);
  PERFORM set_config('app.content_mirror', 'on', true);

  EXECUTE format(
    'UPDATE public.%1$I b SET %2$s FROM jsonb_populate_record(NULL::public.%3$I, $1) r WHERE b.id = r.%4$I',
    v_base, v_sets, TG_TABLE_NAME, v_fk
  ) USING to_jsonb(NEW);

  PERFORM set_config('app.content_mirror', COALESCE(v_prev, ''), true);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_content_mirror_tr_to_base() IS
  'translations modunda locale=tr çeviri satırını ana tablo kalıcı ayna '
  'kolonlarına yazar (slug hariç). base modunda etkisiz.';

/* ---------------------------------------------------------------
   3) TR guard'ı: yaşayan ana kaydın tr satırı HER İKİ modda tek başına
      silinemez (105 davranışı + bu kural)
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
  v_parent_alive boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_touches_tr := NEW.locale = 'tr';
  ELSIF TG_OP = 'UPDATE' THEN
    v_touches_tr := NEW.locale = 'tr' OR OLD.locale = 'tr';
  ELSE
    v_touches_tr := OLD.locale = 'tr';
  END IF;

  IF NOT v_touches_tr OR current_setting('app.content_mirror', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id::text = $1)', v_parent_table)
       INTO v_parent_alive
      USING to_jsonb(OLD) ->> v_fk_col;
    IF NOT v_parent_alive THEN
      RETURN OLD;   -- ana kayıt silinirken cascade
    END IF;
    RAISE EXCEPTION
      'content_mirror_guard: % tablosunda ana kaydı yaşayan locale=tr satırı silinemez (içeriği boşaltmak için güncelleyin).',
      TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.content_mirror_mode() = 'translations' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'content_mirror_guard: % tablosunda locale=tr satırı yalnız ayna tarafından yazılabilir (mod: base).',
    TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

/* ---------------------------------------------------------------
   4) Slug geçmişi (103) — yetim kayıt ve ayna çift kaydı düzeltmesi
--------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.trg_record_slug_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kind     text := TG_ARGV[0];
  v_id_col   text := TG_ARGV[1];
  v_mode     text := TG_ARGV[2];
  v_old      jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new      jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_old_slug text := v_old->>'slug';
  v_new_slug text := v_new->>'slug';
  v_locale   text;
  v_entity   uuid;
  v_parent   text;
  v_alive    boolean;
BEGIN
  BEGIN
    -- 106: ayna (veya backfill) çeviri slug'ını ana tablodan kopyalıyor;
    -- geçmişi ana tablonun kendi trigger'ı yönetir.
    IF v_mode = 'translation' AND current_setting('app.content_mirror', true) = 'on' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    v_locale := CASE WHEN v_mode = 'base' THEN 'tr'
                     ELSE COALESCE(v_new->>'locale', v_old->>'locale') END;
    v_entity := NULLIF(COALESCE(v_new->>v_id_col, v_old->>v_id_col), '')::uuid;

    IF TG_OP = 'DELETE' AND v_mode = 'base' THEN
      -- İçerik kalıcı silindi → ona ait yönlendirmeler de silinir.
      DELETE FROM public.url_redirects
       WHERE entity_kind = v_kind AND entity_id = v_entity;
      RETURN OLD;
    END IF;

    -- 106: çeviri satırı, ana kaydı silinirken (cascade) siliniyorsa
    -- silinmiş içeriğe işaret eden geçmiş YAZILMAZ.
    IF TG_OP = 'DELETE' AND v_mode = 'translation' THEN
      v_parent := CASE v_kind WHEN 'villa' THEN 'villa' WHEN 'villaType' THEN 'villa_types'
                              WHEN 'blog' THEN 'blog_posts' WHEN 'page' THEN 'pages' END;
      IF v_parent IS NOT NULL THEN
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', v_parent)
           INTO v_alive USING v_entity;
        IF NOT v_alive THEN
          RETURN OLD;
        END IF;
      END IF;
    END IF;

    -- Yeni slug canlıya alındıysa (yeniden kullanım) o slug'ın kaydı silinir.
    IF v_new_slug IS NOT NULL AND v_new_slug <> '' THEN
      DELETE FROM public.url_redirects
       WHERE entity_kind = v_kind
         AND old_slug = v_new_slug
         AND (v_mode = 'base' OR locale = v_locale);
    END IF;
    -- Eski slug değiştiyse / kaldırıldıysa geçmişe yazılır.
    IF v_old_slug IS NOT NULL AND v_old_slug <> ''
       AND v_old_slug IS DISTINCT FROM v_new_slug
       AND v_entity IS NOT NULL
       AND position('/' IN v_old_slug) = 0
       AND char_length(v_old_slug) <= 300 THEN
      INSERT INTO public.url_redirects (entity_kind, entity_id, locale, old_slug)
      VALUES (v_kind, v_entity, v_locale, v_old_slug)
      ON CONFLICT (entity_kind, locale, old_slug)
      DO UPDATE SET entity_id = EXCLUDED.entity_id, updated_at = now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Ana kayıt ASLA engellenmez.
    RAISE WARNING 'url_redirects kaydı yazılamadı (%): %', v_kind, SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

/* ---------------------------------------------------------------
   5) Şema doğrulaması + trigger'ların bağlanması
      (içerik kaydıyla birebir: lib/i18n/content/content-registry.ts)
--------------------------------------------------------------- */
DO $$
DECLARE
  r         record;
  f         text;
  v_type    text;
  v_trtype  text;
  v_notnull text[];
  v_events  text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('villa_translations',               'villa',                'villa_id',          'description,badge,seo_title,seo_description', true),
    ('villa_type_translations',          'villa_types',          'type_id',           'name', true),
    ('villa_feature_translations',       'villa_features',       'feature_id',        'name', false),
    ('rule_item_translations',           'rule_items',           'rule_id',           'title', false),
    ('price_include_item_translations',  'price_include_items',  'include_id',        'title', false),
    ('blog_post_translations',           'blog_posts',           'blog_post_id',      'title,body,excerpt,seo_title,seo_description', true),
    ('page_translations',                'pages',                'page_id',           'title,body,excerpt,seo_title,seo_description,sections', true),
    ('faq_translations',                 'faqs',                 'faq_id',            'question,answer', false),
    ('menu_translations',                'menu',                 'menu_id',           'name', false),
    ('payment_method_translations',      'payment_methods',      'payment_method_id', 'name', false),
    ('settings_translations',            'settings',             'settings_id',       'footer_copyright,default_meta_title,default_meta_description,hero_title,hero_subtitle,hero_badge_text,hero_primary_cta_text,hero_secondary_cta_text,business_hours', false),
    ('site_popup_translations',          'site_popup',           'popup_id',          'title,description,highlight_text,stats,button_text,button_url', false),
    ('homepage_collection_translations', 'homepage_collections', 'collection_id',     'custom_title', false),
    ('discount_collection_translations', 'discount_collections', 'collection_id',     'custom_title', false)
  ) AS t(tr_table, base_table, fk, fields, has_slug)
  LOOP
    IF to_regclass('public.' || r.base_table) IS NULL OR to_regclass('public.' || r.tr_table) IS NULL THEN
      RAISE EXCEPTION 'Migration 106: % veya % tablosu yok.', r.base_table, r.tr_table;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = r.base_table AND column_name = 'id') THEN
      RAISE EXCEPTION 'Migration 106: public.%.id kolonu yok.', r.base_table;
    END IF;

    v_notnull := ARRAY[]::text[];
    FOREACH f IN ARRAY string_to_array(r.fields, ',') || CASE WHEN r.has_slug THEN ARRAY['slug'] ELSE ARRAY[]::text[] END LOOP
      SELECT data_type INTO v_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.base_table AND column_name = f;
      SELECT data_type INTO v_trtype FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = r.tr_table AND column_name = f;
      IF v_type IS NULL THEN
        RAISE EXCEPTION 'Migration 106: ana tablo kolonu yok: public.%.% — ayna kurulamaz.', r.base_table, f;
      END IF;
      IF v_trtype IS NULL THEN
        RAISE EXCEPTION 'Migration 106: çeviri kolonu yok: public.%.%', r.tr_table, f;
      END IF;
      IF NOT (
        (v_type IN ('text', 'character varying') AND v_trtype IN ('text', 'character varying'))
        OR (v_type = 'jsonb' AND v_trtype = 'jsonb')
      ) THEN
        RAISE EXCEPTION 'Migration 106: tip uyumsuz: public.%.% (%) ↔ public.%.% (%)',
          r.base_table, f, v_type, r.tr_table, f, v_trtype;
      END IF;
      IF f <> 'slug' AND EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = r.base_table AND column_name = f AND is_nullable = 'NO'
      ) THEN
        v_notnull := v_notnull || f;
      END IF;
    END LOOP;

    -- Ana tablo → tr (base modunda)
    v_events := 'INSERT OR UPDATE OF ' || r.fields || CASE WHEN r.has_slug THEN ',slug' ELSE '' END;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.base_table || '_content_mirror_to_tr', r.base_table);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER %s ON public.%I FOR EACH ROW '
      'EXECUTE FUNCTION public.trg_content_mirror_base_to_tr(%L, %L, %L, %L)',
      r.base_table || '_content_mirror_to_tr', v_events, r.base_table,
      r.tr_table, r.fk, r.fields, CASE WHEN r.has_slug THEN 'slug' ELSE '' END
    );

    -- tr → ana tablo (translations modunda)
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tr_table || '_content_mirror_to_base', r.tr_table);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW '
      'WHEN (NEW.locale = ''tr'') '
      'EXECUTE FUNCTION public.trg_content_mirror_tr_to_base(%L, %L, %L, %L)',
      r.tr_table || '_content_mirror_to_base', r.tr_table,
      r.base_table, r.fk, r.fields, array_to_string(v_notnull, ',')
    );

    -- Ana tablo guard'ı (translations modunda ayna dışı yazmayı reddeder)
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.base_table || '_content_base_guard', r.base_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF %s ON public.%I FOR EACH ROW '
      'EXECUTE FUNCTION public.trg_content_base_guard()',
      r.base_table || '_content_base_guard', r.fields, r.base_table
    );
  END LOOP;
END
$$;

COMMIT;
