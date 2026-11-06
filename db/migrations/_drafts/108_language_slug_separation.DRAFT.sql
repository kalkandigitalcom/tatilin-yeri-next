/* ===============================================================
   🌐 MIGRATION 108 (TASLAK) — Teknik anahtar ile dil slug'larının
                                ayrılması (Seçenek D, Faz 5)
   ===============================================================
   ⚠️ TASLAK: Bu dosya `db/migrations/_drafts/` altındadır ve migration
   çalıştırıcısının taradığı kök klasörde DEĞİLDİR. Canlıya/staging'e
   uygulanması ayrı onay gerektirir. Faz 5'te YALNIZ tek kullanımlık
   izole test veritabanında doğrulandı.

   KARAR (Faz 5): ana tablodaki `slug` = TEKNİK ANAHTAR; dil
   değişiminden etkilenmez. TR, EN, DE URL slug'ları kendi çeviri
   satırlarında (`<t>_translations.slug`, migration 102) tutulur.

   NE DEĞİŞİR
     1) trg_content_mirror_base_to_tr (106) yeniden tanımlanır:
        • slug YALNIZ tr satırı İLK KEZ oluşurken (ana kayıt INSERT'i)
          teknik anahtardan tohumlanır (106 ile aynı biçim/çakışma
          kuralı → uymuyorsa NULL);
        • mevcut tr satırının slug'ı ayna tarafından ARTIK EZİLMEZ
          (ON CONFLICT DO UPDATE slug'ı içermez);
        • yalnız teknik anahtar değişirse tr satırına dokunulmaz.
     2) trg_content_tr_guard (106) yeniden tanımlanır: mod='base' iken
        tr satırında YALNIZ `slug` (ve updated_at) değişen UPDATE'e izin
        verilir — merkezi yazma servisi TR dil slug'ını böyle yazar.
        İçerik kolonları hâlâ yalnız ayna tarafından yazılabilir; tr
        satırı INSERT'i ve yaşayan kaydın tr satırı DELETE'i engelli.
     3) public.content_language_slugs_separated() — yetenek işareti;
        uygulama bu fonksiyon varsa TR slug yazımını açar.

   DEĞİŞMEYEN: içerik verisi (backfill YOK: 107 sonrası tr.slug zaten
     teknik anahtara eşit), content_mirror_mode() ('base' kalır),
     trg_record_slug_history (103/106), url_redirects, EN/DE satırları,
     ana tablo trigger bağlantıları (aynı fonksiyon adları).

   SLUG GEÇMİŞİ (davranış, değişiklik yok):
     • TR dil slug'ı değişimi → çeviri tablosu trigger'ı (ayna bayrağı
       kapalı) → url_redirects(kind, 'tr', eski)
     • teknik anahtar değişimi → ana tablo trigger'ı → (kind, 'tr', eski)
       (103 kuralı; routing bunu bütün dillerin yedek geçmişi olarak okur)

   ÖN KOŞUL (uygulamadan önce):
     • routing TR slug'ını çeviri satırından okuyan sürüm yayında
       (lib/i18n/routing: rowsToSlugMap TR dahil, toLocalizedSlug TR
       özel durumu yok) — Faz 5 kodu. Aksi halde farklılaşan TR slug'ı
       public URL'de görünmez.
     • 105, 106, 107 uygulanmış; mod='base'.

   ROLLBACK: 106'daki iki fonksiyon tanımı aynen yeniden çalıştırılır ve
     `DROP FUNCTION public.content_language_slugs_separated();`.
     Farklılaşmış TR slug'ları kalır; ilk ana kayıt güncellemesinde ayna
     onları teknik anahtara geri yazar (106 davranışı).
   =============================================================== */

BEGIN;

/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
   lock_timeout aşılırsa migration 108 hiçbir değişiklik bırakmadan geri alınır
   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_content_mirror_base_to_tr') THEN
    RAISE EXCEPTION 'Migration 108, 106_content_mirror.sql''e bağlıdır.';
  END IF;
  IF public.content_mirror_mode() <> 'base' THEN
    RAISE EXCEPTION 'Migration 108 (taslak) yalnız base modunda uygulanır (mevcut: %).', public.content_mirror_mode();
  END IF;
END
$$;

/* 1) Ayna: ana tablo → tr satırı; slug yalnız ilk oluşturmada */
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
  v_payload jsonb   := '{}'::jsonb;
  v_s       text;
  v_taken   boolean;
  v_prev    text;
  f         text;
BEGIN
  IF public.content_mirror_mode() <> 'base' THEN
    RETURN NEW;
  END IF;

  -- 108: yalnız İÇERİK kolonları değiştiyse yaz (teknik anahtar değişimi tr'ye dokunmaz).
  IF TG_OP = 'UPDATE' AND NOT EXISTS (
    SELECT 1 FROM unnest(v_fields) k WHERE (v_old -> k) IS DISTINCT FROM (v_new -> k)
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
  END IF;

  v_prev := current_setting('app.content_mirror', true);
  PERFORM set_config('app.content_mirror', 'on', true);

  -- INSERT kolonları: içerik (+ slug tohumu); UPDATE: YALNIZ içerik kolonları.
  EXECUTE format(
    'INSERT INTO public.%1$I (%2$I, locale, %3$s%6$s) '
    'SELECT $1, ''tr'', %4$s%7$s FROM jsonb_populate_record(NULL::public.%1$I, $2) r '
    'ON CONFLICT (%2$I, locale) DO UPDATE SET %5$s',
    v_tr,
    v_fk,
    (SELECT string_agg(quote_ident(k), ', ') FROM jsonb_object_keys(v_payload) k),
    (SELECT string_agg('r.' || quote_ident(k), ', ') FROM jsonb_object_keys(v_payload) k),
    (SELECT string_agg(format('%1$I = EXCLUDED.%1$I', k), ', ') FROM jsonb_object_keys(v_payload) k),
    CASE WHEN v_slug THEN ', slug' ELSE '' END,
    CASE WHEN v_slug THEN ', $3' ELSE '' END
  ) USING NEW.id, v_payload, v_s;

  PERFORM set_config('app.content_mirror', COALESCE(v_prev, ''), true);
  RETURN NEW;
END;
$$;

/* 2) TR guard'ı: base modunda yalnız slug değişen UPDATE serbest */
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
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'content_mirror_guard: % tablosunda ana kaydı yaşayan locale=tr satırı silinemez (içeriği boşaltmak için güncelleyin).',
      TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.content_mirror_mode() = 'translations' THEN
    RETURN NEW;
  END IF;

  -- 108: base modunda TR DİL SLUG'I (yalnız slug) güncellenebilir.
  IF TG_OP = 'UPDATE' AND OLD.locale = 'tr' AND NEW.locale = 'tr'
     AND (to_jsonb(NEW) - 'slug' - 'updated_at') = (to_jsonb(OLD) - 'slug' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'content_mirror_guard: % tablosunda locale=tr içerik kolonları yalnız ayna tarafından yazılabilir (mod: base).',
    TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

/* 3) Yetenek işareti */
CREATE OR REPLACE FUNCTION public.content_language_slugs_separated()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$ SELECT true $$;

COMMENT ON FUNCTION public.content_language_slugs_separated() IS
  'Migration 108: ana tablo slug''ı teknik anahtardır; TR/EN/DE URL slug''ları çeviri satırlarındadır.';

COMMIT;
