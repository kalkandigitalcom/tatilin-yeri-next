/* ===============================================================
   🌐 MIGRATION 102 — dil bazlı SEO slug'ları (Çok Dilli Mimari Faz 2)
   ===============================================================
   AMAÇ:
     Villa, villa tipi (kategori), blog yazısı ve CMS sayfası için her
     dilin KENDİ SEO slug'ı. TR slug'ı ana tablolardaki mevcut `slug`
     kolonudur (DEĞİŞMEZ, taban/canonical TR). EN/DE slug'ları çeviri
     tablolarına NULLABLE kolon olarak eklenir; NULL → o dilde TR slug'ı
     kullanılır (bugünkü davranış).

   EKLENEN (her tabloda aynı desen):
     villa_translations.slug       text NULL
     villa_type_translations.slug  text NULL
     blog_post_translations.slug   text NULL
     page_translations.slug        text NULL
       + CHECK: küçük harf, rakam ve tire; 1–160 karakter
         ('^[a-z0-9]+(?:-[a-z0-9]+)*$')
       + PARTIAL UNIQUE INDEX (locale, slug) WHERE slug IS NOT NULL
         → aynı dilde iki kayıt aynı slug'ı alamaz.
     Başka bir kaydın TR (taban) slug'ı ile çakışma kontrolü uygulama
     katmanında yapılır (lib/i18n/routing/slug-validation.ts).

   BİLİNÇLİ OLARAK KAPSAM DIŞI:
     Bölge (villa_locations) slug'ları — bölge adları özel isimdir ve
     çevrilmez (Phase 10I kararı); bölge URL'lerinde yalnız yol segmenti
     dile göre değişir (/en/regions/kas).

   DOKUNULMAYAN:
     Ana tablolar (villa, villa_types, blog_posts, pages) ve slug'ları,
     mevcut çeviri satırlarının içerikleri, rezervasyon/fiyat/ödeme
     tabloları. Backfill / UPDATE / DELETE YOK.

   GERİYE DÖNÜK UYUMLULUK:
     Kolonlar NULL başlar → tüm diller TR slug'ı ile çalışmaya devam
     eder. Kod migration'dan önce deploy edilirse slug okuması hata
     verirse boş harita kullanılır (eski davranış); admin'de slug
     alanını kaydetmek için migration gerekir.

   IDEMPOTENT: ADD COLUMN IF NOT EXISTS, constraint/index varlık
   kontrolü (IF NOT EXISTS).

   ROLLBACK (gerekirse; yalnız EN/DE slug'ları kaybolur):
     DROP INDEX IF EXISTS villa_translations_locale_slug_key;
     ALTER TABLE public.villa_translations DROP COLUMN IF EXISTS slug;
     (diğer üç tablo için aynı)
   =============================================================== */

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'villa_translations',
    'villa_type_translations',
    'blog_post_translations',
    'page_translations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Migration 102: public.% tablosu yok (082/089 önce uygulanmalı).', t;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS slug text', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_slug_format_check'
        AND conrelid = ('public.' || t)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (slug IS NULL OR (char_length(slug) BETWEEN 1 AND 160 AND slug ~ %L))',
        t, t || '_slug_format_check', '^[a-z0-9]+(-[a-z0-9]+)*$'
      );
    END IF;

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (locale, slug) WHERE slug IS NOT NULL',
      t || '_locale_slug_key', t
    );

    EXECUTE format(
      'COMMENT ON COLUMN public.%I.slug IS %L',
      t,
      'Bu dildeki SEO slug''ı (Faz 2). NULL → TR (taban) slug''ı kullanılır. Aynı dilde benzersiz.'
    );
  END LOOP;
END
$$;

COMMIT;
