/* ===============================================================
   🌐 MIGRATION 101 — site_locales (dil bazlı açma/kapama)
   ===============================================================
   AMAÇ (Çok Dilli Mimari — Faz 1):
     Public sitedeki her dilin (bugün tr/en/de) BAĞIMSIZ olarak açılıp
     kapatılabilmesi. Ana (kök) dil kaynağı DEĞİŞMEZ:
     `settings.public_default_locale` (migration 081) olarak kalır —
     ikinci bir "ana dil" alanı açılmaz (çift kaynak / drift yok).

   EKLENEN:
     1) public.site_locales tablosu
          code        text PK  (dil kodu; ör. 'tr', 'en', 'de', 'pt-br')
          is_enabled  boolean  NOT NULL DEFAULT false
          sort_order  integer  NOT NULL DEFAULT 0
          created_at / updated_at
        Dil etiketi, hreflang ve og:locale gibi metadata KODDA
        (lib/i18n/locale-registry.ts) tutulur: yeni bir dil zaten
        sözlük + kod gerektirir; DB yalnız yayın durumunu tutar.
     2) Seed: tr, en, de → is_enabled = true (BUGÜNKÜ davranış: çoklu
        dil açıkken üç dil de yayında). ON CONFLICT DO NOTHING → tekrar
        çalıştırmada mevcut satırlar EZİLMEZ.
     3) Kurallar (trigger):
          • Ana dil (settings.public_default_locale) KAPATILAMAZ ve
            SİLİNEMEZ.
          • settings.public_default_locale yalnız site_locales'te
            AKTİF olan bir dile değiştirilebilir (yalnız değer
            DEĞİŞTİĞİNDE kontrol edilir — mevcut ayar kayıtları
            etkilenmez).
        Ana dil daima aktif olduğundan "en az bir aktif dil" kuralı
        kendiliğinden sağlanır.
     4) public.set_site_locales_enabled(p_enabled text[]) RETURNS void
        Admin'in aktif dil listesini TEK UPDATE ile (atomik) yazar.
        Bilinmeyen kod → hata. Ana dil listede yoksa → trigger hatası,
        hiçbir satır değişmez.

   DOKUNULMAYAN:
     • public.settings: kolon/constraint/veri DEĞİŞMEZ (yalnız trigger
       eklenir; trigger yalnız public_default_locale DEĞİŞTİĞİNDE
       çalışır).
     • get_public_settings() RPC: DEĞİŞMEZ (site_locales uygulama
       katmanında ayrı, dar bir sorguyla okunur — migration 083 deseni).
     • Rezervasyon, fiyat, ödeme, villa, kullanıcı tabloları: YOK.
     • Çeviri tabloları ve içerikleri: YOK (kapalı dilin çevirileri
       silinmez).

   GERİYE DÖNÜK UYUMLULUK / DEPLOY SIRASI:
     Kod, tablo yokken (migration uygulanmadan) "tüm diller aktif"
     varsayımına düşer → bugünkü davranış. Migration koddan önce veya
     sonra uygulanabilir. Admin'de dil anahtarlarını kaydetmek için
     migration uygulanmış olmalıdır.

   IDEMPOTENT: CREATE TABLE IF NOT EXISTS, INSERT … ON CONFLICT DO
   NOTHING, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.

   ROLLBACK (gerekirse, veri kaybı yok — yalnız yayın durumu):
     DROP TRIGGER IF EXISTS settings_root_locale_enabled_guard ON public.settings;
     DROP TRIGGER IF EXISTS site_locales_root_guard ON public.site_locales;
     DROP TRIGGER IF EXISTS site_locales_touch_updated_at ON public.site_locales;
     DROP FUNCTION IF EXISTS public.set_site_locales_enabled(text[]);
     DROP FUNCTION IF EXISTS public.trg_settings_root_locale_enabled();
     DROP FUNCTION IF EXISTS public.trg_site_locales_root_guard();
     DROP TABLE IF EXISTS public.site_locales;
   =============================================================== */

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'trg_touch_updated_at'
  ) THEN
    RAISE EXCEPTION
      'Migration 101, 082_translation_tables.sql''in public.trg_touch_updated_at() fonksiyonuna bağlıdır. Önce 082''yi uygulayın.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'settings'
      AND column_name = 'public_default_locale'
  ) THEN
    RAISE EXCEPTION
      'Migration 101, 081_settings_multilingual.sql''in settings.public_default_locale kolonuna bağlıdır. Önce 081''i uygulayın.';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 1) Tablo
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_locales (
  code        text PRIMARY KEY,
  is_enabled  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_locales_code_format_check
    CHECK (code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$')
);

COMMENT ON TABLE public.site_locales IS
  'Public site dillerinin yayın durumu (dil bazlı açma/kapama). Ana dil '
  'settings.public_default_locale''dir ve kapatılamaz. Dil metadatası '
  '(etiket, hreflang, og:locale) kodda tutulur. Kapalı dilin içerik ve '
  'çevirileri SİLİNMEZ.';

DROP TRIGGER IF EXISTS site_locales_touch_updated_at ON public.site_locales;
CREATE TRIGGER site_locales_touch_updated_at
  BEFORE UPDATE ON public.site_locales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Seed — bugünkü davranış (üç dil de aktif). Mevcut satırlar ezilmez.
-- ----------------------------------------------------------------------------
INSERT INTO public.site_locales (code, is_enabled, sort_order) VALUES
  ('tr', true, 10),
  ('en', true, 20),
  ('de', true, 30)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3a) Ana dil kapatılamaz / silinemez
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_site_locales_root_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_root text;
BEGIN
  SELECT s.public_default_locale INTO v_root
  FROM public.settings s
  LIMIT 1;

  IF v_root IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.code = v_root THEN
      RAISE EXCEPTION 'Ana dil (%) silinemez.', v_root
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.code IS DISTINCT FROM OLD.code AND OLD.code = v_root THEN
    RAISE EXCEPTION 'Ana dilin (%) kodu değiştirilemez.', v_root
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.code = v_root AND NEW.is_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Ana dil (%) kapatılamaz.', v_root
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_locales_root_guard ON public.site_locales;
CREATE TRIGGER site_locales_root_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.site_locales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_site_locales_root_guard();

-- ----------------------------------------------------------------------------
-- 3b) settings.public_default_locale yalnız aktif bir dile değiştirilebilir
--     (yalnız değer DEĞİŞTİĞİNDE; diğer ayar kayıtları etkilenmez)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_settings_root_locale_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.public_default_locale IS DISTINCT FROM OLD.public_default_locale THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.site_locales l
      WHERE l.code = NEW.public_default_locale
        AND l.is_enabled = true
    ) THEN
      RAISE EXCEPTION 'Ana dil yalnız aktif bir dil olabilir (%).',
        NEW.public_default_locale
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settings_root_locale_enabled_guard ON public.settings;
CREATE TRIGGER settings_root_locale_enabled_guard
  BEFORE UPDATE OF public_default_locale ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_settings_root_locale_enabled();

-- ----------------------------------------------------------------------------
-- 4) Admin yazma fonksiyonu — aktif dil listesini atomik yazar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_site_locales_enabled(p_enabled text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_unknown text;
BEGIN
  IF p_enabled IS NULL OR cardinality(p_enabled) = 0 THEN
    RAISE EXCEPTION 'En az bir dil aktif olmalıdır.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c INTO v_unknown
  FROM unnest(p_enabled) AS c
  WHERE NOT EXISTS (SELECT 1 FROM public.site_locales l WHERE l.code = c)
  LIMIT 1;

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Bilinmeyen dil kodu: %', v_unknown
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.site_locales l
  SET is_enabled = (l.code = ANY (p_enabled))
  WHERE l.is_enabled IS DISTINCT FROM (l.code = ANY (p_enabled));
END;
$$;

COMMENT ON FUNCTION public.set_site_locales_enabled(text[]) IS
  'Aktif dil listesini tek UPDATE ile yazar. Ana dil listede yoksa '
  'site_locales_root_guard trigger''ı hata verir; hiçbir satır değişmez.';

COMMIT;
