/* ===============================================================
   🌐 MIGRATION 103 — url_redirects (slug değişiklik geçmişi, Faz 3)
   ===============================================================
   AMAÇ:
     Bir içeriğin (villa, villa tipi, blog yazısı, CMS sayfası) slug'ı
     değiştiğinde eski URL'ye gelen istek, içeriğin GÜNCEL kanonik
     URL'sine TEK ADIMDA 308 ile yönlenir.

   TASARIM — "eski slug → İÇERİK" (eski URL → yeni URL DEĞİL):
     Kayıt hedef URL tutmaz; (tür, dil, eski slug) → içerik kimliği
     tutar. Hedef, istek anında içeriğin GÜNCEL slug'ından merkezi
     route sistemiyle üretilir. Sonuçlar:
       • Zincir OLUŞAMAZ: A→B→C değişse de A ve B doğrudan C'ye gider.
       • Döngü OLUŞAMAZ: bir slug yeniden canlı kullanılırsa o slug'ın
         yönlendirme kaydı trigger tarafından silinir.
       • Silinmiş / pasif içerik → yönlendirme ÜRETİLMEZ (uygulama
         yalnız yayındaki içerikleri çözer; hard delete'te kayıt silinir).
       • Hedef her zaman merkezi route kaydından üretilen, kanonik ve
         site içi bir adrestir (open-redirect / keyfi URL YOK).
       • Ana dil veya yol segmentleri değişse de kayıtlar geçerli kalır.

   EKLENEN:
     public.url_redirects
       entity_kind  text  ('villa' | 'villaType' | 'blog' | 'page')
       entity_id    uuid
       locale       text  ('tr' = taban slug; 'en'/'de' = dil slug'ı)
       old_slug     text
       status_code  smallint (308 varsayılan; 301 izinli)
       UNIQUE (entity_kind, locale, old_slug) → aynı eski URL için
       çakışan kayıt OLUŞAMAZ (son değişiklik kazanır).
     Trigger'lar (slug değişince OTOMATİK kayıt):
       villa / villa_types / blog_posts / pages        → locale 'tr'
       villa_/villa_type_/blog_post_/page_translations → satırın dili
     Trigger'lar ana kaydı ASLA engellemez: hata olursa yalnız WARNING
     yazılır, admin kaydı aynen tamamlanır.

   DOKUNULMAYAN:
     Ana tabloların ve çeviri tablolarının kolonları/verileri,
     rezervasyon/fiyat/ödeme tabloları. Backfill YOK (geçmiş slug
     değişiklikleri bilinmiyor).

   BAĞIMLILIK: 102 (çeviri tablolarında `slug`), 082 (trg_touch_updated_at).
   IDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

   ROLLBACK (yalnız yönlendirme geçmişi kaybolur):
     DROP TRIGGER IF EXISTS villa_slug_history ON public.villa;
     DROP TRIGGER IF EXISTS villa_types_slug_history ON public.villa_types;
     DROP TRIGGER IF EXISTS blog_posts_slug_history ON public.blog_posts;
     DROP TRIGGER IF EXISTS pages_slug_history ON public.pages;
     DROP TRIGGER IF EXISTS villa_translations_slug_history ON public.villa_translations;
     DROP TRIGGER IF EXISTS villa_type_translations_slug_history ON public.villa_type_translations;
     DROP TRIGGER IF EXISTS blog_post_translations_slug_history ON public.blog_post_translations;
     DROP TRIGGER IF EXISTS page_translations_slug_history ON public.page_translations;
     DROP FUNCTION IF EXISTS public.trg_record_slug_history();
     DROP TABLE IF EXISTS public.url_redirects;
   =============================================================== */

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'villa_translations' AND column_name = 'slug'
  ) THEN
    RAISE EXCEPTION 'Migration 103, 102_translation_slugs.sql''e bağlıdır. Önce 102''yi uygulayın.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.url_redirects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind  text NOT NULL,
  entity_id    uuid NOT NULL,
  locale       text NOT NULL,
  old_slug     text NOT NULL,
  status_code  smallint NOT NULL DEFAULT 308,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT url_redirects_kind_check
    CHECK (entity_kind IN ('villa', 'villaType', 'blog', 'page')),
  CONSTRAINT url_redirects_locale_check
    CHECK (locale ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$'),
  CONSTRAINT url_redirects_old_slug_check
    CHECK (char_length(old_slug) BETWEEN 1 AND 300 AND position('/' IN old_slug) = 0),
  CONSTRAINT url_redirects_status_check
    CHECK (status_code IN (301, 308)),
  CONSTRAINT url_redirects_kind_locale_slug_key
    UNIQUE (entity_kind, locale, old_slug)
);

CREATE INDEX IF NOT EXISTS url_redirects_entity_idx
  ON public.url_redirects (entity_kind, entity_id);

COMMENT ON TABLE public.url_redirects IS
  'Slug değişiklik geçmişi (Faz 3): (tür, dil, eski slug) → içerik. Hedef URL '
  'istek anında içeriğin güncel slug''ından üretilir (zincir/döngü yok). '
  'Trigger''larla otomatik dolar.';

DROP TRIGGER IF EXISTS url_redirects_touch_updated_at ON public.url_redirects;
CREATE TRIGGER url_redirects_touch_updated_at
  BEFORE UPDATE ON public.url_redirects
  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();

/* TG_ARGV[0] = entity_kind
   TG_ARGV[1] = id kolonu ('id' ana tabloda, '<parent>_id' çeviri tablosunda)
   TG_ARGV[2] = 'base' (locale 'tr') | 'translation' (satırın locale'i) */
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
BEGIN
  BEGIN
    v_locale := CASE WHEN v_mode = 'base' THEN 'tr'
                     ELSE COALESCE(v_new->>'locale', v_old->>'locale') END;
    v_entity := NULLIF(COALESCE(v_new->>v_id_col, v_old->>v_id_col), '')::uuid;

    IF TG_OP = 'DELETE' AND v_mode = 'base' THEN
      -- İçerik kalıcı silindi → ona ait yönlendirmeler de silinir.
      DELETE FROM public.url_redirects
       WHERE entity_kind = v_kind AND entity_id = v_entity;
      RETURN OLD;
    END IF;

    -- Yeni slug canlıya alındıysa (yeniden kullanım) o slug'ın kaydı silinir.
    -- Taban (TR) slug'ı, kendi dil slug'ı olmayan dillerde de kullanıldığı
    -- için ana tabloda TÜM dillerdeki aynı eski slug kayıtları silinir.
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

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('villa',                    'villa',     'id',           'base',        'UPDATE OF slug OR DELETE'),
    ('villa_types',              'villaType', 'id',           'base',        'UPDATE OF slug OR DELETE'),
    ('blog_posts',               'blog',      'id',           'base',        'UPDATE OF slug OR DELETE'),
    ('pages',                    'page',      'id',           'base',        'UPDATE OF slug OR DELETE'),
    ('villa_translations',       'villa',     'villa_id',     'translation', 'INSERT OR UPDATE OF slug OR DELETE'),
    ('villa_type_translations',  'villaType', 'type_id',      'translation', 'INSERT OR UPDATE OF slug OR DELETE'),
    ('blog_post_translations',   'blog',      'blog_post_id', 'translation', 'INSERT OR UPDATE OF slug OR DELETE'),
    ('page_translations',        'page',      'page_id',      'translation', 'INSERT OR UPDATE OF slug OR DELETE')
  ) AS t(tbl, kind, idcol, mode, events)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      RAISE NOTICE 'Migration 103: public.% yok, trigger atlandı', r.tbl;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tbl || '_slug_history', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER %s ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_record_slug_history(%L, %L, %L)',
      r.tbl || '_slug_history', r.events, r.tbl, r.kind, r.idcol, r.mode
    );
  END LOOP;
END
$$;

COMMIT;
