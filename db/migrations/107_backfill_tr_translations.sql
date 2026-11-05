/* ===============================================================
   🌐 MIGRATION 107 — Simetrik içerik: TR içeriklerinin çeviri
                      tablolarına aktarımı (Seçenek D, Faz 2 / 2. adım)
   ===============================================================
   AMAÇ:
     Her ana içerik kaydı için `locale='tr'` çeviri satırını, ana
     tablodaki TR kolonların BİREBİR KOPYASI olarak oluşturur.
     Ana tablolar, EN/DE satırları ve url_redirects DEĞİŞMEZ.
     İçerik kimliği (ana tablo id) ve bütün ilişkiler aynen kalır.

   ALGORİTMA (tek transaction; herhangi bir adım güvenli değilse
   RAISE EXCEPTION → hiçbir satır yazılmaz):
     1) Ön koşul: 106 uygulanmış ve mod 'base'.
     2) PREFLIGHT (varlık başına):
        a) Mevcut `locale='tr'` satırı ana kayıttan FARKLIYSA (herhangi bir
           alan veya slug) → DUR. Aynıysa korunur (üzerine YAZILMAZ).
        b) Slug'lı varlıklarda: 102 formatına uyan taban slug'lar içinde
           TEKRAR varsa → DUR (aynı dilde benzersizlik kuralı).
        c) Slug'lı varlıklarda: taban slug'ı başka bir kaydın mevcut
           tr slug'ıyla çakışıyorsa → DUR.
     3) AKTARIM: `app.content_mirror` bayrağı ile (TR guard'ı ayna
        yazımını tanır; 106'daki slug geçmişi düzeltmesi sayesinde
        url_redirects'e dokunulmaz)
          INSERT INTO <çeviri> (<fk>, locale, <alanlar>[, slug])
          SELECT id, 'tr', <ana kolonlar>[, 102'ye uygunsa slug yoksa NULL]
            FROM <ana tablo>
          ON CONFLICT (<fk>, locale) DO NOTHING;
        Boş (NULL / '') değerler OLDUĞU GİBİ kopyalanır.
     4) DOĞRULAMA: her ana kayıt için tam bir tr satırı var ve bütün
        alanlar (slug dahil) ana kayıtla eşit → değilse DUR.
     5) NOTICE: varlık başına ana / eklenen / önceden var olan sayıları.

   TEKRAR ÇALIŞTIRMA: güvenli. İkinci çalıştırmada eklenecek satır yoktur
     (ON CONFLICT DO NOTHING) ve doğrulama yine geçer.

   GERİ ALMA: rapor §8 — yalnız bu migration'ın eklediği (ana kayıtla
     birebir aynı) tr satırları silinir; ana tablolar etkilenmez.

   BAĞIMLILIK: 106.
   =============================================================== */

BEGIN;

/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
   lock_timeout aşılırsa migration 107 hiçbir değişiklik bırakmadan geri alınır
   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
DECLARE
  r          record;
  f          text;
  v_fields   text[];
  v_cmp      text;
  v_slugexpr text := 'CASE WHEN b.slug IS NOT NULL AND char_length(b.slug) BETWEEN 1 AND 160 '
                     'AND b.slug ~ ''^[a-z0-9]+(-[a-z0-9]+)*$'' THEN b.slug END';
  v_n        bigint;
  v_base     bigint;
  v_before   bigint;
  v_after    bigint;
  v_prev     text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_content_mirror_base_to_tr') THEN
    RAISE EXCEPTION 'Migration 107, 106_content_mirror.sql''e bağlıdır.';
  END IF;
  IF public.content_mirror_mode() <> 'base' THEN
    RAISE EXCEPTION 'Migration 107 yalnız base modunda uygulanır (mevcut: %).', public.content_mirror_mode();
  END IF;

  v_prev := current_setting('app.content_mirror', true);
  PERFORM set_config('app.content_mirror', 'on', true);

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
    v_fields := string_to_array(r.fields, ',');

    -- Ana kayıt ↔ tr satırı farklılık koşulu (alanlar + slug).
    SELECT string_agg(format('t.%1$I IS DISTINCT FROM b.%1$I', x), ' OR ') INTO v_cmp FROM unnest(v_fields) x;
    IF r.has_slug THEN
      v_cmp := v_cmp || format(' OR t.slug IS DISTINCT FROM (%s)', v_slugexpr);
    END IF;

    /* 2a) Mevcut tr satırı farklıysa DUR */
    EXECUTE format(
      'SELECT count(*) FROM public.%I t JOIN public.%I b ON b.id = t.%I WHERE t.locale = ''tr'' AND (%s)',
      r.tr_table, r.base_table, r.fk, v_cmp
    ) INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'Migration 107 DURDU: %: % adet mevcut locale=tr satırı ana kayıttan farklı. Üzerine yazılmaz; önce incelenmeli.',
        r.tr_table, v_n;
    END IF;

    IF r.has_slug THEN
      /* 2b) Taban slug tekrarı */
      EXECUTE format(
        'SELECT count(*) FROM (SELECT s FROM (SELECT %s AS s FROM public.%I b) q WHERE s IS NOT NULL GROUP BY s HAVING count(*) > 1) d',
        v_slugexpr, r.base_table
      ) INTO v_n;
      IF v_n > 0 THEN
        RAISE EXCEPTION 'Migration 107 DURDU: %: % adet tekrarlanan taban slug (aynı dilde benzersiz olmalı).',
          r.base_table, v_n;
      END IF;
      /* 2c) Başka kaydın mevcut tr slug'ıyla çakışma */
      EXECUTE format(
        'SELECT count(*) FROM public.%I b JOIN public.%I t ON t.locale = ''tr'' AND t.slug = (%s) AND t.%I <> b.id',
        r.base_table, r.tr_table, v_slugexpr, r.fk
      ) INTO v_n;
      IF v_n > 0 THEN
        RAISE EXCEPTION 'Migration 107 DURDU: %: % adet taban slug başka bir kaydın tr slug''ıyla çakışıyor.',
          r.base_table, v_n;
      END IF;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', r.base_table) INTO v_base;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE locale = ''tr''', r.tr_table) INTO v_before;

    /* 3) Aktarım */
    EXECUTE format(
      'INSERT INTO public.%1$I (%2$I, locale, %3$s%4$s) '
      'SELECT b.id, ''tr'', %5$s%6$s FROM public.%7$I b '
      'ON CONFLICT (%2$I, locale) DO NOTHING',
      r.tr_table, r.fk,
      (SELECT string_agg(quote_ident(x), ', ') FROM unnest(v_fields) x),
      CASE WHEN r.has_slug THEN ', slug' ELSE '' END,
      (SELECT string_agg('b.' || quote_ident(x), ', ') FROM unnest(v_fields) x),
      CASE WHEN r.has_slug THEN ', ' || v_slugexpr ELSE '' END,
      r.base_table
    );

    /* 4) Doğrulama */
    EXECUTE format(
      'SELECT count(*) FROM public.%I b LEFT JOIN public.%I t ON t.%I = b.id AND t.locale = ''tr'' WHERE t.%I IS NULL OR (%s)',
      r.base_table, r.tr_table, r.fk, r.fk, v_cmp
    ) INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'Migration 107 DURDU: % doğrulaması başarısız (% kayıt eksik veya farklı).', r.tr_table, v_n;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE locale = ''tr''', r.tr_table) INTO v_after;

    RAISE NOTICE 'Migration 107: % → % ana kayıt, % tr satırı eklendi, % zaten vardı (aynı).',
      r.tr_table, v_base, v_after - v_before, v_before;
  END LOOP;

  PERFORM set_config('app.content_mirror', COALESCE(v_prev, ''), true);
END
$$;

COMMIT;
