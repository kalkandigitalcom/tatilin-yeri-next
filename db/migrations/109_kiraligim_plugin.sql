/* ===============================================================
   🧩 MIGRATION 109 — Kiraligim eklentisi (Eklentiler altyapısı)
   ===============================================================
   AMAÇ
     Merkezi Kiraligim takviminden gelen villa dolulukları, MEVCUT harici
     takvim altyapısı (external_calendar_sources / external_calendar_events)
     üzerinden yönetilir. Bu migration yalnız eklentinin KENDİ tablolarını
     ekler; mevcut tablolarda kolon, kısıt, tetikleyici veya fonksiyon
     DEĞİŞMEZ.

   NASIL ÇALIŞIR (uygulama katmanı, lib/plugins/kiraligim)
     • Eşleşen her villa için external_calendar_sources'a bir satır:
         source_type = 'kiraligim', source_name = 'Kiraligim API',
         ical_url    = 'https://app.kiraligim.com/#kiraligim-api' (yalnız
                       NOT NULL için; iCal senkronu bu kaynağı ÇEKMEZ:
                       cron listesi source_type = 'kiraligim' satırları
                       hariç tutar).
     • Dolu aralıklar bu kaynak altında external_calendar_events'e yazılır
       (external_uid = 'kiraligim:<start>:<end>'). Böylece arama,
       müsaitlik, rezervasyon doğrulaması, 031/097 çakışma tetikleyicileri
       ve kısa boşluklar HİÇBİR değişiklik olmadan Kiraligim dolulukları-
       nı da görür. reservations / manual_reservations tablolarına
       Kiraligim verisi YAZILMAZ.

   TABLOLAR
     kiraligim_settings        tek satır: hesap, şifreli webhook secret,
                               hesap geneli cursor, son senkron durumu
     kiraligim_connections     Kiraligim bağlantısı ↔ yerel villa ↔ kaynak
     kiraligim_webhook_events  işlenmiş webhook olay kimlikleri (tekrar
                               teslimde ikinci kez işlenmez; 7 gün)

   İZİN
     "plugins" sidebar anahtarı (Eklentiler menüsü). Mevcut adminlerden
     YALNIZ "settings" iznine sahip olanlara eklenir (064 deseni,
     idempotent). Diğer izinlere dokunulmaz.

   UYGULAMA (elle, psql):
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f db/migrations/109_kiraligim_plugin.sql
   İDEMPOTENT: IF NOT EXISTS / ON CONFLICT / jsonb containment.

   GERİ ALMA (sıra önemli; Kiraligim dolulukları takvimden kalkar):
     DELETE FROM public.external_calendar_sources WHERE source_type = 'kiraligim';
       -- (events ON DELETE CASCADE ile gider)
     DROP TABLE IF EXISTS public.kiraligim_webhook_events,
                          public.kiraligim_connections,
                          public.kiraligim_settings;
     UPDATE admin_users SET sidebar_permissions = sidebar_permissions - 'plugins'
      WHERE sidebar_permissions ? 'plugins';
=============================================================== */

CREATE TABLE IF NOT EXISTS public.kiraligim_settings (
  id                     smallint PRIMARY KEY DEFAULT 1,
  account_id             uuid,
  account_name           text,
  webhook_url            text,
  webhook_secret_enc     text,
  webhook_registered_at  timestamptz,
  account_cursor         text,
  cursor_updated_at      timestamptz,
  last_sync_at           timestamptz,
  last_sync_ok           boolean,
  last_error_code        text,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiraligim_settings_singleton CHECK (id = 1),
  CONSTRAINT kiraligim_settings_secret_format CHECK (
    webhook_secret_enc IS NULL
    OR webhook_secret_enc ~ '^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
  ),
  CONSTRAINT kiraligim_settings_error_format CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$'
  )
);

INSERT INTO public.kiraligim_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.kiraligim_connections (
  id               uuid PRIMARY KEY,               -- Kiraligim connection id
  property_id      uuid NOT NULL,                  -- Kiraligim villa id
  property_name    text,
  villa_id         uuid NOT NULL REFERENCES public.villa(id) ON DELETE CASCADE,
  source_id        uuid NOT NULL REFERENCES public.external_calendar_sources(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'active',
  window_from      date,
  window_to        date,
  snapshot_at      timestamptz,
  last_change_id   bigint,
  last_error_code  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiraligim_connections_status_check
    CHECK (status IN ('active', 'paused', 'disconnected', 'revoked')),
  CONSTRAINT kiraligim_connections_error_format CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,64}$'
  )
);

-- Bir villa ve bir Kiraligim villası aynı anda yalnız TEK güncel bağlantıda.
CREATE UNIQUE INDEX IF NOT EXISTS kiraligim_connections_current_villa_key
  ON public.kiraligim_connections (villa_id)
  WHERE status IN ('active', 'paused');
CREATE UNIQUE INDEX IF NOT EXISTS kiraligim_connections_current_property_key
  ON public.kiraligim_connections (property_id)
  WHERE status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS kiraligim_connections_source_idx
  ON public.kiraligim_connections (source_id);

CREATE TABLE IF NOT EXISTS public.kiraligim_webhook_events (
  event_id     uuid PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiraligim_webhook_events_received_idx
  ON public.kiraligim_webhook_events (received_at);

COMMENT ON TABLE public.kiraligim_settings IS
  'Kiraligim eklentisi (tek satır). webhook_secret_enc = AES-256-GCM (anahtar: KIRALIGIM_ENCRYPTION_KEY, veritabanında yok). API anahtarı burada TUTULMAZ (KIRALIGIM_API_KEY ortam değişkeni).';
COMMENT ON TABLE public.kiraligim_connections IS
  'Kiraligim takvim bağlantısı ↔ villa ↔ external_calendar_sources (source_type=kiraligim). Dolu aralıklar external_calendar_events altında; yalnız eklenti senkronu yazar.';
COMMENT ON TABLE public.kiraligim_webhook_events IS
  'İşlenmiş Kiraligim webhook olay kimlikleri (tekrar teslim koruması, 7 gün saklama).';

-- "plugins" izni: yalnız "settings" iznine sahip mevcut adminlere (idempotent).
UPDATE admin_users
SET sidebar_permissions = sidebar_permissions || '["plugins"]'::jsonb
WHERE sidebar_permissions @> '["settings"]'::jsonb
  AND NOT (sidebar_permissions @> '["plugins"]'::jsonb);
