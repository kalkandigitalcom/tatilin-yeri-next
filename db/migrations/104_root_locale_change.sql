/* ===============================================================
   🌐 MIGRATION 104 — ana dil değişimi (Çok Dilli Mimari Faz 4)
   ===============================================================
   AMAÇ:
     Admin'in sitenin ana (kök URL) dilini TR / EN / DE arasında
     ATOMİK ve EŞ ZAMANLI İSTEKLERE KARŞI GÜVENLİ değiştirebilmesi.
     Ana dil kaynağı DEĞİŞMEZ: `settings.public_default_locale`
     (migration 081). Yeni kolon / tablo / ikinci ayar YOK.

   EKLENEN / DEĞİŞEN (yalnız fonksiyon + trigger):
     1) public.change_public_root_locale(p_expected text, p_new text)
          RETURNS text (eski ana dil)
        • settings satırını FOR UPDATE kilitler (eş zamanlı ana dil
          değişimleri ve dil aç/kapa işlemleri SIRAYA girer).
        • İyimser kilit: mevcut ana dil `p_expected` değilse hata
          (`root_locale_conflict`) → iki admin aynı anda değiştirirse
          ikincisi eski duruma göre yazamaz.
        • Hedef dil desteklenen (tr/en/de) ve site_locales'te AKTİF
          olmalı (satır FOR SHARE kilitlenir → aynı anda kapatılamaz).
        • TR dışı ana dil yalnız çoklu dil açıkken (kapalıyken uygulama
          ana dili daima TR kabul eder).
        • Aynı değer → no-op (eski = yeni döner).
     2) public.set_site_locales_enabled(text[]) — GÖVDE AYNI, başına
        settings satırının FOR SHARE kilidi eklendi → ana dil değişimiyle
        aynı anda çalışan dil kapatma, değişim bitene kadar bekler ve
        trigger GÜNCEL ana dile göre karar verir.
     3) settings_multilingual_root_guard trigger'ı: çoklu dil KAPALI
        iken TR dışı ana dil saklanamaz (çoklu dili kapatmak ana dili
        sessizce TR'ye çevirirdi). Yalnız bu iki kolon DEĞİŞTİĞİNDE
        kontrol edilir → mevcut kayıtlar ve normal ayar kayıtları
        etkilenmez.

   DOKUNULMAYAN: settings kolonları/verisi, site_locales verisi,
     url_redirects (içerik slug geçmişi — ana dil değişimi bu tabloya
     YAZMAZ; kök değişiminin URL geçişleri algoritmiktir), rezervasyon,
     fiyat, ödeme, kullanıcı tabloları.

   GEÇİŞ KAYDI: ayrı tablo YOK — mevcut admin_activity_logs'a
     `settings.root_locale_change` (uygulama katmanı) yazılır.

   BAĞIMLILIK: 081 (public_default_locale), 101 (site_locales).
   IDEMPOTENT: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.

   ROLLBACK (veri kaybı yok):
     DROP TRIGGER IF EXISTS settings_multilingual_root_guard ON public.settings;
     DROP FUNCTION IF EXISTS public.trg_settings_multilingual_root_guard();
     DROP FUNCTION IF EXISTS public.change_public_root_locale(text, text);
     -- set_site_locales_enabled: 101'deki tanım yeniden çalıştırılır.
   =============================================================== */

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.site_locales') IS NULL THEN
    RAISE EXCEPTION 'Migration 104, 101_site_locales.sql''e bağlıdır. Önce 101''i uygulayın.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.change_public_root_locale(p_expected text, p_new text)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_current text;
  v_multilingual boolean;
  v_enabled boolean;
BEGIN
  IF p_new IS NULL OR p_new NOT IN ('tr', 'en', 'de') THEN
    RAISE EXCEPTION 'Desteklenmeyen ana dil: %', p_new
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.id, s.public_default_locale, s.multilingual_enabled
    INTO v_id, v_current, v_multilingual
  FROM public.settings s
  ORDER BY s.id
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Settings satırı bulunamadı.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_expected IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'root_locale_conflict: ana dil değişmiş (beklenen %, mevcut %).',
      p_expected, v_current
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_new = v_current THEN
    RETURN v_current;
  END IF;

  IF p_new <> 'tr' AND v_multilingual IS NOT TRUE THEN
    RAISE EXCEPTION 'TR dışı ana dil için çoklu dil sistemi açık olmalıdır.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT l.is_enabled INTO v_enabled
  FROM public.site_locales l
  WHERE l.code = p_new
  FOR SHARE;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'Ana dil yalnız aktif bir dil olabilir (%).', p_new
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.settings
  SET public_default_locale = p_new
  WHERE id = v_id;

  RETURN v_current;
END;
$$;

COMMENT ON FUNCTION public.change_public_root_locale(text, text) IS
  'Ana dili atomik değiştirir: settings FOR UPDATE + iyimser kontrol '
  '(p_expected) + hedef dil aktif (FOR SHARE). Eski ana dili döndürür.';

CREATE OR REPLACE FUNCTION public.set_site_locales_enabled(p_enabled text[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_unknown text;
BEGIN
  /* Faz 4 — ana dil değişimiyle eş zamanlı çalışırsa önce onun
     bitmesini bekler; trigger güncel ana dile göre karar verir. */
  PERFORM 1 FROM public.settings FOR SHARE;

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

CREATE OR REPLACE FUNCTION public.trg_settings_multilingual_root_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.multilingual_enabled IS DISTINCT FROM OLD.multilingual_enabled
      OR NEW.public_default_locale IS DISTINCT FROM OLD.public_default_locale)
     AND NEW.multilingual_enabled IS NOT TRUE
     AND NEW.public_default_locale <> 'tr' THEN
    RAISE EXCEPTION 'Çoklu dil kapalıyken ana dil yalnız TR olabilir; önce ana dili TR yapın.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settings_multilingual_root_guard ON public.settings;
CREATE TRIGGER settings_multilingual_root_guard
  BEFORE UPDATE OF multilingual_enabled, public_default_locale ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_settings_multilingual_root_guard();

COMMIT;
