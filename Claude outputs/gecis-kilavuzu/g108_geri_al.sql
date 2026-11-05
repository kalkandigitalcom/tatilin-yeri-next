-- G108 — Migration 108 GERİ ALMA (yalnız son çare; önce ileriye dönük düzeltme düşünülür).
-- Ne yapar (tek transaction, hata olursa hiçbir şey değişmez):
--   1) TR dil slug'ı teknik anahtardan farklılaşmış kayıtlar için mevcut TR slug'ını url_redirects'e
--      'geçmiş' olarak yazar (eski URL'ler 404 olmasın; 106 aynası bu yazımı yapmaz).
--   2) Bu TR slug'larını teknik anahtara (biçim dışıysa NULL) geri çeker (ayna bayrağı ile).
--   3) trg_content_mirror_base_to_tr ve trg_content_tr_guard fonksiyonlarını 106 sürümüne döndürür.
--   4) content_language_slugs_separated() yetenek işaretini kaldırır → uygulama TR slug alanını kilitler.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $g$
DECLARE r record; n bigint;
BEGIN
  IF to_regprocedure('public.content_language_slugs_separated()') IS NULL THEN
    RAISE EXCEPTION 'G108: 108 uygulanmamış görünüyor (yetenek fonksiyonu yok); geri alma gerekmiyor.';
  END IF;
  IF public.content_mirror_mode() <> 'base' THEN
    RAISE EXCEPTION 'G108: yalnız base modunda (mevcut: %).', public.content_mirror_mode();
  END IF;
  PERFORM set_config('app.content_mirror', 'on', true);
  FOR r IN SELECT * FROM (VALUES
    ('villa',     'villa',       'villa_translations',      'villa_id'),
    ('villaType', 'villa_types', 'villa_type_translations', 'type_id'),
    ('blog',      'blog_posts',  'blog_post_translations',  'blog_post_id'),
    ('page',      'pages',       'page_translations',       'page_id')
  ) AS t(kind, base_table, tr_table, fk) LOOP
    EXECUTE format($q$
      INSERT INTO public.url_redirects (entity_kind, entity_id, locale, old_slug)
      SELECT %L, t.%I, 'tr', t.slug
        FROM public.%I t JOIN public.%I b ON b.id = t.%I
       WHERE t.locale = 'tr' AND t.slug IS NOT NULL
         AND t.slug IS DISTINCT FROM CASE WHEN char_length(b.slug) BETWEEN 1 AND 160
                                          AND b.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN b.slug END
      ON CONFLICT (entity_kind, locale, old_slug) DO NOTHING$q$,
      r.kind, r.fk, r.tr_table, r.base_table, r.fk);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'G108: % → % eski TR slug url_redirects''e yazıldı', r.tr_table, n;
    EXECUTE format($q$
      UPDATE public.%I t
         SET slug = CASE WHEN char_length(b.slug) BETWEEN 1 AND 160
                          AND b.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN b.slug END
        FROM public.%I b
       WHERE b.id = t.%I AND t.locale = 'tr'
         AND t.slug IS DISTINCT FROM CASE WHEN char_length(b.slug) BETWEEN 1 AND 160
                                          AND b.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN b.slug END$q$,
      r.tr_table, r.base_table, r.fk);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'G108: % → % TR slug teknik anahtara döndü', r.tr_table, n;
  END LOOP;
END
$g$;

-- 106 sürümleri (106_content_mirror.sql'den birebir):
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

DROP FUNCTION public.content_language_slugs_separated();

COMMIT;
