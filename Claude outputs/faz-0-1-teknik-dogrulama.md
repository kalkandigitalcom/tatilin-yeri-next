# Faz 0.1 — Eksik Teknik Doğrulamalar (Seçenek D)

**Tarih:** 2026-11-04 · **Kaynak:** `main` @ `8afb11a` · **Tür:** yalnız analiz.

Kod, migration, SQL ve veri değiştirilmedi. Veritabanına ve sunucuya bağlanılmadı. Önceki raporlar değiştirilmedi.

**Etiketler:** **[B]** kaynakta doğrulandı · **[V]** doğrulanamadı / varsayım · **[Ö]** öneri

---

## 1. Voucher sistemi

### 1.1 Kapsam bulgusu [B]

- **Ayrı bir voucher veya kupon tablosu yok.** "Voucher", onaylanmış bir rezervasyon için üretilen **rezervasyon belgesi**: HTML/print-PDF ve e-posta.
- `coupon` / `kupon` aramaları kaynakta sonuç vermedi.
- İndirim sistemi (`villa_discounts`, 079; `discount_collections`) kuponla ilgili değil.

### 1.2 Dosyalar ve akış [B]

| Katman | Dosya | Görev |
|---|---|---|
| Veri | `lib/db/voucher.repository.server.ts` → `voucherRepository.findReservationById()` | `reservations` + embed `villa:villa_id ( title )`, `payment_method:payment_method_id ( name )` |
| Hazırlık | `app/lib/voucher/data.ts` | yalnız `status = confirmed`; `getMailConfig()` (`fromName`), `getSettings().site_logo`; `villaTitle = r.villa?.title`; `paymentMethodName = r.payment_method?.name` (s.274); tarih ve para TR (`formatDateTr`, `formatTRY`) |
| Şablon | `app/lib/voucher/template.ts` | `<html lang="tr">`, sabit TR etiketler ("Telefon", "E-posta" …), `footerText(brandName)` |
| Derleme | `app/lib/voucher/build.ts` | data + template |
| HTTP | `app/api/voucher/[id]/route.ts` (`?print=1`), `app/api/mail/voucher/route.ts` | admin görüntüleme ve e-posta |
| Admin | `app/(admin)/maki-admin/reservations/page.tsx` (s.80-170) | "Voucher gönder" ve "PDF aç" |

### 1.3 Seçenek D etkisi

| Alan | Kaynak | Seçenek D'de |
|---|---|---|
| `villa.title` | ana tablo (çevrilmeyen özel isim) | **Değişmez** |
| `payment_methods.name` | ana kolon (bugün TR) | Ayna (§4) sürdükçe aynı TR değer. Ayna kaldırılırsa voucher repository `payment_method_translations` (locale `tr`) okumalı |
| `settings.site_logo`, `getMailConfig().fromName` | ana tablo / env, dil bağımsız | Değişmez |
| Etiketler, tarih, para | şablonda sabit TR | Değişmez (voucher dili TR; ana dilden bağımsız) |
| Rezervasyon PII, fiyat, depozito | `reservations` | **Dokunulmaz** |

**Etkilenebilecek tek nokta:** `payment_method:payment_method_id ( name )` embed'i (`voucher.repository.server.ts` ve `app/lib/voucher/data.ts` s.153, s.274). Aynı desen `app/api/mail/reservation-request/route.ts` s.136'da da var.

---

## 2. iCal ve harici rezervasyonlar

### 2.1 Dosyalar [B]

| Katman | Dosya |
|---|---|
| Tablolar | `external_calendar_sources` (`villa_id` FK, `UNIQUE (villa_id, source_name)`), `external_calendar_events` (`source_id`, `villa_id`, `external_uid`, `summary`, `description`, `UNIQUE (villa_id, external_uid)`): `db/migrations/_archive/legacy/029_external_calendar_sync.sql`; çakışma trigger'ı 031; manuel override 032 |
| Ayrıştırma | `lib/ical.parser.ts` (UID, DTSTART, DTEND, SUMMARY, DESCRIPTION, STATUS; RFC 5545 unescape) |
| Senkron | `app/services/external-calendar.service.ts` (fetch `Accept: text/calendar`), `app/api/cron/external-calendar-sync/route.ts`, `app/api/admin/external-calendars/*` |
| Kullanım | `lib/availability.helper.ts`, `app/services/reservation/_helpers/stay-verify.ts`, `app/api/public/villas/[id]/availability`, `…/blocked-ranges` |
| Admin | `villas/[id]/_components/IcalSyncCard.tsx`, `ical-sync.action.ts`, `app/(admin)/maki-admin/external-reservations/*` |

### 2.2 Dil bağımlılığı [B]

- **Import** dış kaynaktan gelir. `summary` ve `description` olduğu gibi saklanır, çevrilmez. Hiçbir içerik çeviri tablosuna dokunmaz.
- Eşleme **`villa_id`** üzerinden; slug veya ad kullanılmaz.
- **Etki yok.**

### 2.3 Export: önceki raporla çelişen yeni bulgu [B]

- `IcalSyncCard.tsx` s.91-93: Admin'e `${origin}/api/ical/villa/${villaSlug}` export URL'si **kopyalanmak üzere gösteriliyor**.
- Ancak depoda **`app/api/ical` route'u yok**. Kaynakta `BEGIN:VCALENDAR` üreten kod da bulunamadı.
- Gösterilen export URL'si büyük ihtimalle **404 veriyor**. Bu, Seçenek D'den bağımsız, önceden var olan bir sorun. OTA'lara bu URL verildiyse canlıda kontrol edilmeli.
- URL `villaSlug`'a (ana tablo `slug` = handle) bağlı. Seçenek D handle'ı değiştirmediği için bir export eklense bile URL sabit kalır.
- `/api/*` proxy matcher dışında (`proxy.ts`), dil yönlendirmesine girmez.

**Sonuç:** Dil dönüşümü iCal uyumluluğunu **etkilemez**.

---

## 3. Ana tabloların şeması

### 3.1 Kaynakta bulunan tanımlar [B]

Ana tabloların çoğunun **CREATE TABLE ifadesi depoda yok**; ilk sağlayıcı şemasından geliyor. Migration'lar yalnız ALTER içeriyor.

Bulunan tanımlar (aktif ve `_archive/` migration'ları taranarak):

| Tablo | CREATE kaynakta? | Bilinen kolonlar ve kısıtlar (migration) | Bilinmeyenler |
|---|---|---|---|
| `villa` | ❌ | `is_active bool NOT NULL DEFAULT true`, `deleted_at timestamptz` (003; idx `idx_villa_visibility`, `idx_villa_deleted_at`); `sort_order int NOT NULL DEFAULT 0` (006, idx); `tourism_document_number` (017); `private_access_token` + partial unique (019); `youtube_videos jsonb` (033); `bedroom_layout`, `bathroom_layout jsonb` (047); `search_title` **GENERATED ALWAYS AS (…title…) STORED** + GIN trgm (065); `real_title` (072); `pool_sheltered bool NOT NULL DEFAULT false` (073). Slug geçmişi trigger'ı `villa_slug_history` (103) | `id` tipi (uuid varsayımı: 082 FK), `title/slug/description/badge/seo_title/seo_description/noindex` NULL durumu, `slug` unique mi |
| `villa_types` | ❌ | `slug` + `villa_types_slug_unique` partial (008); `cover_image` (010); `show_on_homepage` (061); `sort_order` + idx (066); trigger 103 | `name` NOT NULL? |
| `villa_features`, `rule_items`, `price_include_items` | ❌ | – | **tamamı** |
| `blog_posts` | ✅ `_archive/legacy/058_blog_posts.sql` | `id uuid PK`, **`title text NOT NULL`**, **`slug text NOT NULL`**, `excerpt`, `body`, `cover_image`, `is_active bool NOT NULL DEFAULT false`, `published_at`, `seo_title`, `seo_description`, `og_image`, `noindex bool NOT NULL DEFAULT false`, `category`, `author`, `created_at NOT NULL DEFAULT now()`, `updated_at`; **`blog_posts_slug_unique UNIQUE (slug)`**; idx `(is_active, published_at DESC)`, `(category)`; trigger 103 | canlı DB'de 058 sonrası değişiklik |
| `pages` | ❌ | `menu_parent_id uuid` (004); `excerpt`, `cover_image`, **`sections jsonb NOT NULL DEFAULT '[]'`** (014); `show_in_menu` (045); trigger 103 | `title`, `slug` NULL / unique, `noindex`, `seo_*` |
| `faqs` | ❌ | – (082 notu: `id` tipi doğrulanamadı) | **tamamı** |
| `menu` | ❌ | `source_type text`, `source_id uuid` (005) | `name`, `parent_id`, slug |
| `payment_methods` | ❌ | `type` + `payment_methods_type_check` (`_archive/pre-numbering/2026_05_payment_methods_add_type.sql`) | `name` NOT NULL? |
| `settings` | ❌ | hero alanları (007), `orphan_gap_rule_enabled` (071), `multilingual_enabled`, `public_default_locale` + CHECK (081), `footer_logo` (048), `updated_at` + `settings_touch_updated_at` (051), `page_hero_background_image` (067); trigger'lar 101, 104 | metin kolonlarının NULL durumu |
| `site_popup` | ✅ 095 | `id smallint PK DEFAULT 1` (singleton CHECK), metin alanları + uzunluk CHECK'leri, `stats jsonb NOT NULL DEFAULT '[]'` (≤4) | – |
| `homepage_collections` | ✅ 012 | `villa_id` FK CASCADE, **UNIQUE (villa_id)**, `custom_title text`, `custom_cover_image`, idx `(is_active, sort_order)`; 024 | – |
| `discount_collections` | ✅ `_archive/legacy/062` | aynı yapı, UNIQUE (villa_id), `custom_title`; `selected_discount_ranges jsonb` (092) | – |
| `villa_locations` | ❌ | `slug` + partial unique (009), `cover_image` (011), `show_in_filter`, `filter_group_name` + idx (050) | `name` |

Çeviri tabloları ise **tamamen tanımlı** (082, 083, 086, 088, 089, 091, 096, 102, 103). Faz 0 §2.2'deki tablo doğru.

Drizzle veya başka bir ORM şeması **yok**. Kolon bilgisi yalnız repository `select` dizgelerinden çıkarılabiliyor (örn. `lib/db/faq.repository.ts`: `id, question, answer`; `lib/db/menu.repository.ts`: `id, name, slug` …).

### 3.2 Faz 1 öncesi çalıştırılacak salt okunur sorgular

Hepsi `SELECT`, katalog ve `information_schema` okur; veri değiştirmez. İsteğe bağlı olarak `BEGIN READ ONLY; … ROLLBACK;` içinde çalıştırılabilir.

```sql
BEGIN TRANSACTION READ ONLY;

-- Q1 Kolonlar: tip, NULL, default, generated
SELECT c.table_name, c.ordinal_position, c.column_name, c.data_type, c.udt_name,
       c.is_nullable, c.column_default, c.is_generated, c.generation_expression,
       c.character_maximum_length
  FROM information_schema.columns c
 WHERE c.table_schema = 'public'
   AND c.table_name IN ('villa','villa_types','villa_features','rule_items','price_include_items',
                        'blog_posts','pages','faqs','menu','payment_methods','settings','site_popup',
                        'homepage_collections','discount_collections','villa_locations',
                        'villa_translations','villa_type_translations','villa_feature_translations',
                        'rule_item_translations','price_include_item_translations','blog_post_translations',
                        'page_translations','faq_translations','menu_translations','payment_method_translations',
                        'settings_translations','site_popup_translations','villa_location_translations','url_redirects')
 ORDER BY c.table_name, c.ordinal_position;

-- Q2 Kısıtlar: PK / FK / UNIQUE / CHECK
SELECT conrelid::regclass AS tablo, conname, contype, pg_get_constraintdef(oid) AS tanim,
       confrelid::regclass AS hedef, confdeltype AS on_delete
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace
   AND conrelid::regclass::text ~ '^(villa|villa_types|villa_features|rule_items|price_include_items|blog_posts|pages|faqs|menu|payment_methods|settings|site_popup|homepage_collections|discount_collections|villa_locations|url_redirects)$|_translations$'
 ORDER BY 1, contype, conname;

-- Q3 Index'ler
SELECT tablename, indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND (tablename ~ '_translations$' OR tablename IN ('villa','villa_types','villa_features','rule_items','price_include_items','blog_posts','pages','faqs','menu','payment_methods','settings','site_popup','homepage_collections','discount_collections','villa_locations','url_redirects'))
 ORDER BY tablename, indexname;

-- Q4 Trigger'lar ve fonksiyonları
SELECT t.tgrelid::regclass AS tablo, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS tanim, p.proname
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE NOT t.tgisinternal
   AND (t.tgrelid::regclass::text ~ '_translations$'
        OR t.tgrelid::regclass::text IN ('villa','villa_types','blog_posts','pages','faqs','menu','payment_methods','settings','site_popup','url_redirects'))
 ORDER BY 1, 2;

-- Q5 Ana tablolara FK ile bağlanan tablolar (silme davranışı)
SELECT conrelid::regclass AS cocuk, confrelid::regclass AS ebeveyn, conname, confdeltype
  FROM pg_constraint
 WHERE contype = 'f' AND confrelid::regclass::text IN ('villa','villa_types','villa_features','rule_items','price_include_items','blog_posts','pages','faqs','menu','payment_methods','settings','site_popup')
 ORDER BY 2, 1;

-- Q6 Satır sayıları (yaklaşık + kesin)
SELECT relname, n_live_tup FROM pg_stat_user_tables
 WHERE relname ~ '_translations$' OR relname IN ('villa','villa_types','villa_features','rule_items','price_include_items','blog_posts','pages','faqs','menu','payment_methods','settings','site_popup')
 ORDER BY relname;

-- Q7 Mevcut TR çeviri satırları (beklenen 0) ve dil dağılımı
SELECT 'villa' t, locale, count(*) FROM villa_translations GROUP BY locale UNION ALL
SELECT 'villa_type', locale, count(*) FROM villa_type_translations GROUP BY locale UNION ALL
SELECT 'villa_feature', locale, count(*) FROM villa_feature_translations GROUP BY locale UNION ALL
SELECT 'rule_item', locale, count(*) FROM rule_item_translations GROUP BY locale UNION ALL
SELECT 'price_include', locale, count(*) FROM price_include_item_translations GROUP BY locale UNION ALL
SELECT 'blog_post', locale, count(*) FROM blog_post_translations GROUP BY locale UNION ALL
SELECT 'page', locale, count(*) FROM page_translations GROUP BY locale UNION ALL
SELECT 'faq', locale, count(*) FROM faq_translations GROUP BY locale UNION ALL
SELECT 'menu', locale, count(*) FROM menu_translations GROUP BY locale UNION ALL
SELECT 'payment_method', locale, count(*) FROM payment_method_translations GROUP BY locale UNION ALL
SELECT 'settings', locale, count(*) FROM settings_translations GROUP BY locale UNION ALL
SELECT 'popup', locale, count(*) FROM site_popup_translations GROUP BY locale
ORDER BY 1, 2;

-- Q8 Taban slug'ların 102 formatına uygunluğu (uyumsuzlar tr.slug = NULL alır)
SELECT 'villa' t, count(*) FILTER (WHERE slug IS NULL) AS bos,
       count(*) FILTER (WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(slug) > 160) AS uyumsuz
  FROM villa
UNION ALL SELECT 'villa_types', count(*) FILTER (WHERE slug IS NULL), count(*) FILTER (WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(slug) > 160) FROM villa_types
UNION ALL SELECT 'blog_posts',  count(*) FILTER (WHERE slug IS NULL), count(*) FILTER (WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(slug) > 160) FROM blog_posts
UNION ALL SELECT 'pages',       count(*) FILTER (WHERE slug IS NULL), count(*) FILTER (WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(slug) > 160) FROM pages;

-- Q9 Taban slug tekrarları (unique kısıtı olmayan tablolarda)
SELECT 'villa' t, slug, count(*) FROM villa WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1
UNION ALL SELECT 'pages', slug, count(*) FROM pages WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1;

-- Q10 (locale='tr', slug) çakışma adayı: mevcut tr çeviri slug'ı başka satırın taban slug'ı mı
SELECT 'villa' t, v.id, v.slug FROM villa v
  JOIN villa_translations x ON x.locale = 'tr' AND x.slug = v.slug AND x.villa_id <> v.id;

-- Q11 Slug geçmişi: TR kayıtları ve canlı taban slug'la çakışanlar
SELECT entity_kind, locale, count(*) FROM url_redirects GROUP BY 1, 2 ORDER BY 1, 2;

-- Q12 Ana metin kolonlarında NULL / boş oranı (aktarımda boşlar da kopyalanır)
SELECT count(*) total,
       count(*) FILTER (WHERE coalesce(description,'') = '') AS bos_description,
       count(*) FILTER (WHERE coalesce(seo_title,'') = '') AS bos_seo_title
  FROM villa;

ROLLBACK;
```

---

## 4. Kalıcı ayna mimarisinin doğrulanması

### 4.1 Faz 0 ile ilişki

Faz 0 §8 ve §13.2, kalıcı aynayı **karar seçeneği** olarak bıraktı: "Faz 8'de düşür veya kalıcı ayna". Ayrıca §5.4'teki tek yönlü ayna tasarımında iki eksik var. Bu rapor ikisini de **düzeltiyor**:
- Hangi yolun yazmaya yetkili olduğu yalnız uygulama koduna bırakılmıştı; **DB düzeyinde zorlama yoktu**.
- Kod ile DB arasındaki **faz uyumsuzluğu** ele alınmamıştı.

### 4.2 Düzeltilmiş tasarım [Ö]

**Fazı DB'nin kendisi bilir:**
- Yeni tablo veya kolon yerine, migration'la tanımlanan bir fonksiyon:
  `public.content_mirror_mode() RETURNS text IMMUTABLE` → `'base'` (Faz 2–4) veya `'translations'` (Faz 5+).
- Yön değişimi = bu fonksiyonun `CREATE OR REPLACE`'i + trigger değişimi, **aynı migration ve transaction içinde**.
- Uygulama kodu yazma hedefini bu fonksiyondan okur. Böylece kod deploy'u ile migration'ın sırası önemsizleşir.

**Tek yetkili yazma yolu, DB'de zorlanır:**

| Faz | Yetkili yazma | Ayna trigger'ı | Koruma trigger'ı (guard) |
|---|---|---|---|
| `base` | ana kolonlar | ana tablo `AFTER INSERT OR UPDATE OF <çevrilebilir kolonlar>, slug` → `tr` satırına upsert | çeviri tablosu `BEFORE INSERT/UPDATE/DELETE WHERE locale='tr'`: aynadan gelmiyorsa **reddet** |
| `translations` | `tr` çeviri satırı | çeviri tablosu `AFTER INSERT OR UPDATE (locale='tr')` → ana kolonlara yaz (**slug hariç**) | ana tablo `BEFORE UPDATE OF <çevrilebilir kolonlar>`: aynadan gelmiyorsa **reddet** |

"Aynadan geliyor" bilgisi: Ayna trigger'ı yazmadan önce `set_config('app.content_mirror', 'on', true)` çağırır (transaction-local). Guard `current_setting('app.content_mirror', true) = 'on'` değerini kontrol eder.

### 4.3 Senaryolar

| Senaryo | `base` fazında | `translations` fazında |
|---|---|---|
| **Eski admin servisi TR ana kolona yazar** | ✅ Normal yol; trigger `tr` satırını aynı transaction'da günceller | ❌ Guard reddeder ("içerik artık çeviri tablosundan yönetiliyor"). Sessiz veri kaybı olmaz; hata görünür olur |
| **Yeni servis TR çeviri satırına yazar** | Yeni servis `content_mirror_mode()='base'` okuyup **ana kolona** yazar. Doğrudan `tr` yazımı guard'a takılır | ✅ Normal yol; trigger ana kolonları günceller |
| **İki servis aynı anda yazar** | Satır kilidi: ana satır `UPDATE` ile kilitlenir, trigger `tr` satırını kilitler; kilit sırası her zaman ana → tr. İkinci yazar bekler; son yazan kazanır, iki konum tutarlı | Kilit sırası tr → ana. Eski yol reddedildiği için gerçek yarış yalnız yeni servis kopyaları arasında olur; satır kilidi yeterli |
| **Trigger döngüsü** | Aynı anda tek yön tanımlı. Ayrıca guard ve `app.content_mirror` bayrağı yeniden girişi engeller. **Döngü yok** | Aynı |
| **Slug** | Ana slug (handle) değişirse `tr.slug` da güncellenir. 103'ün iki trigger'ı aynı `(kind,'tr',old_slug)` kaydını yazar; ON CONFLICT ile zararsız | **Slug aynalanmaz.** Handle sabit kalır; TR slug değişikliği yalnız `tr` satırında olur, geçmişi 103 çeviri trigger'ı yazar |
| **Kayıt silme** | Ana satır silinir → FK `ON DELETE CASCADE` `tr` dahil bütün çevirileri siler. Yalnız `tr` satırının silinmesi guard'la engellenir | Aynı; `tr` satırının tek başına silinmesi engellenir (ana satır kalırken TR içeriği kaybolmasın) |
| **Silmede slug geçmişi** | Cascade önce çocukları siler (RI trigger adı `RI_…`, `villa_slug_history`'den önce sıralanır), sonra ana trigger o içeriğin bütün `url_redirects` kayıtlarını siler | **[V] izole PG'de test edilmeli** |
| **Eski okuyucular** (e-posta, voucher, admin listeleri) | Ana kolon = doğru kaynak, güncel | Ayna aynı transaction'da yazdığı için güncel |
| **Migration yarıda kalır** | 105–108'in her biri tek transaction (BEGIN/COMMIT). Ya tamamen uygulanır ya hiç; ara durum yok | Aynı |
| **Deploy yarıda kalır** (eski ve yeni kod birlikte çalışır) | Yazma hedefi `content_mirror_mode()`'dan okunuyor ve DB guard'ları zorluyor. Hiçbir kod sürümü yanlış konuma **yazamaz**; en kötü durum görünür hata | Aynı |

### 4.4 Çift yönlü yazma

Aynı fazda iki yönde de ayna (hem ana → tr hem tr → ana) **önerilmez**. Riskleri:
- yeniden giriş ve döngü,
- iki farklı kilit sırası nedeniyle **deadlock**,
- "son yazan kazanır" belirsizliği (iki konum farklı değerle eş zamanlı güncellenebilir),
- slug geçmişinin çift yazılması.

Yukarıdaki tasarım her fazda **tek yön ve tek yetkili yazar** kullanır.

### 4.5 Kalıcı ayna (Faz 8 seçeneği)

`translations` fazının sonsuza kadar sürmesi demek.
- **Güvenli:** tek yön, guard, aynı transaction. Ana kolonlar TR'nin salt okunur kopyası olur.
- **Maliyet:** TR yazımında küçük ek yazma.
- **Fayda:** E-posta, voucher (`payment_methods.name`), admin listeleri ve raporlar hiç değişmeden çalışır.
- **Önerilen:** Faz 8'de kolonları düşürmek yerine **kalıcı ayna**; düşürme ayrı bir karar olarak ertelenir.

---

## 5. `custom_title` alanları

| Alan | Tablo | İlişki | Okuyan | Yazan |
|---|---|---|---|---|
| `homepage_collections.custom_title` | 012; `UNIQUE (villa_id)`, FK villa CASCADE | villa başına bir satır | `lib/cache.helpers.ts` s.461 `display_title = custom_title ?? villa.title`; `lib/db/homepage.repository.ts`; `app/services/homepage-collection.service.ts` | `app/(admin)/maki-admin/homepage-collection/page.tsx`, `homepage-collection.action.ts` |
| `discount_collections.custom_title` | 062; `UNIQUE (villa_id)` | aynı | `lib/cache.helpers.ts` s.819; `lib/db/discount.repository.ts`, `villa-discount.repository.server.ts`; `app/services/discount-collection.service.ts` | `discount-collection/page.tsx`, `discount-collection.action.ts` |

**Değerlendirme [Ö]:**
- İki alan da kartta **villa adının yerine** geçiyor. Villa adı projede çevrilmeyen özel isim; tutarlılık açısından bu alanlar da **dil bağımsız** kalabilir.
- Çevrilmeleri istenirse, en az değişiklikle:
  - **(a) Önerilen:** `homepage_collection_translations(collection_id, locale, custom_title)` ve `discount_collection_translations` — 082 deseni, iki **yeni tablo** (migration 110). `TRANSLATION_ENTITY_CONFIG`'e eklenir; okuma `getContentMany`; yedek zinciri `istenen → ana dil → villa.title`.
  - **(b) Alternatif:** `custom_title_i18n jsonb` kolonu. Tek kolon ama projenin çeviri deseninden sapıyor; önerilmez.
- **Cache:** ilgili tag'ler (`homepage`, `discount`) zaten var.
- **Karar gerekiyor:** dil bağımsız mı (yeni tablo yok), çevrilebilir mi (+2 tablo)?

---

## 6. Nihai mimari risk kontrolü

1. **Yeni tablo gerekli mi?** Çekirdek için **hayır**. Yalnız `custom_title` çevrilecekse iki küçük çeviri tablosu.
2. **Migration 105–109'un amaçları:**
   - **105:** `settings_translations` ve `site_popup_translations` CHECK'ine `tr` ekler.
   - **106:** preflight + `tr` satırlarının kopyalanması (INSERT…SELECT, 12 tablo).
   - **107:** `content_mirror_mode()='base'` + ana → tr ayna trigger'ları + tr guard'ları.
   - **108:** `content_mirror_mode()='translations'` + tr → ana ayna (slug hariç) + ana kolon guard'ları (modül modül olabilir).
   - **109:** 103'ün ana tablo trigger'ının anlamını "handle geçmişi"ne çevirir; `REDIRECTS_SQL` ile uyumlu hale getirir.
   - *(110: isteğe bağlı custom_title çevirileri; 111+: Faz 8.)*
3. **TR verisi kayıpsız aktarılır mı?** **Evet**; ana kolonlar silinmez, yalnız kopyalanır. Koşullar: Q7'de mevcut `tr` satırı 0 (ya da farksız), Q9/Q10'da çakışma yok. Q8'de formata uymayan slug'lar `tr.slug=NULL` alır; URL handle üzerinden aynen kalır.
4. **Eski kolonlar kalıcı ayna olabilir mi?** **Evet**, §4.2 tasarımıyla (tek yön, guard, transaction-local bayrak).
5. **Eski ve yeni servisler birlikte güvenle çalışır mı?** **Evet**, yazma hedefi DB fazından okunursa ve guard'lar varsa. Yanlış yoldan yazma sessiz kayıp yerine görünür hata üretir.
6. **SEO URL'leri değişmeden korunur mu?** **Evet.** Handle (`slug`) ana tabloda sabit kalıyor; `tr.slug = handle` kopyalanıyor; EN/DE slug'ları ve 307/308 kuralları aynı. Doğrulama: Faz 6 öncesi/sonrası URL snapshot'ı.
7. **Rezervasyon, fiyat, ödeme, voucher ve iCal korunur mu?** **Evet.**
   - Bu tablolara hiçbir migration dokunmaz.
   - Voucher ve e-postanın tek içerik bağımlılığı `payment_methods.name`; ayna tarafından korunuyor.
   - iCal'in dil bağımlılığı yok.
8. **Faz 1 başlamadan çözülmesi gerekenler:** §7'deki "Salt okunur DB sorgusu gerekiyor" ve "Mimari karar gerekiyor" maddeleri.
9. **Uygulama sırasında çözülebilecekler:** ortak admin bileşeni, modül sırası, gölge karşılaştırma araçları, iCal export route'u (ayrı iş), boş çeviri satırlarının temizliği.
10. **En büyük beş teknik risk:**
    1. **Ana tablo şemasının depoda olmaması:** NOT NULL veya unique sürprizi aktarım ve guard'ları bozabilir (Q1–Q2 ile kapanır).
    2. **103 slug-geçmişi trigger'ları ile ayna ve cascade etkileşimi:** sahte veya eksik yönlendirme kaydı riski (izole PG testi).
    3. **Faz 6'da URL katmanının TR özel durumlarının kaldırılması** (`toLocalizedSlug`, `rowsToSlugMap`, `REDIRECTS_SQL`): yanlış yapılırsa canlı URL'ler kırılır (URL snapshot testi).
    4. **Faz 5'te 13 admin bileşeninin ve ana formların dönüşümü:** eski formdan bir alanın taşınmaması, `translations` fazında guard hatasına (yazılamayan alan) yol açar.
    5. **Ana dilde içerik eksikliği (doluluk):** ana dil değişiminden sonra kök dil sayfalarının fallback ve noindex davranışı SEO'yu etkiler.

---

## 7. Faz 1 öncesi kontrol listesi

| # | Madde | Durum |
|---|---|---|
| 1 | Çeviri tablolarının yapısı, CHECK, UNIQUE, FK CASCADE (082/083/086/088/089/091/096/102) | **Doğrulandı** |
| 2 | 10 çeviri tablosunun `tr` kabul ettiği; settings ve popup'ın reddettiği | **Doğrulandı** |
| 3 | 103 slug geçmişi trigger'larının olayları (ana: UPDATE OF slug/DELETE; çeviri: INSERT/UPDATE OF slug/DELETE) | **Doğrulandı** |
| 4 | Ana tablolar `villa`, `villa_types`, `villa_features`, `rule_items`, `price_include_items`, `pages`, `faqs`, `menu`, `payment_methods`, `settings`: kolon tipleri, NULL, default, PK, unique | **Kaynak koddan doğrulanamadı** → **Salt okunur DB sorgusu gerekiyor** (Q1, Q2) |
| 5 | `blog_posts` şeması (`title`, `slug` NOT NULL, `slug` UNIQUE) | **Doğrulandı** (058); canlı sapma için Q1 |
| 6 | `faqs.id` tipi | **Salt okunur DB sorgusu gerekiyor** (Q1) |
| 7 | Mevcut `locale='tr'` çeviri satırları | **Salt okunur DB sorgusu gerekiyor** (Q7) |
| 8 | Taban slug format uyumu ve tekrarlar | **Salt okunur DB sorgusu gerekiyor** (Q8, Q9, Q10) |
| 9 | Ana tablolara bağlı FK'ler ve silme davranışı | **Salt okunur DB sorgusu gerekiyor** (Q5) |
| 10 | Canlıdaki trigger listesi (depodakiyle eşleşiyor mu) | **Salt okunur DB sorgusu gerekiyor** (Q4) |
| 11 | Veri hacmi (migration süresi) | **Salt okunur DB sorgusu gerekiyor** (Q6) |
| 12 | Voucher bağımlılıkları (yalnız `payment_methods.name`, `villa.title`) | **Doğrulandı** |
| 13 | iCal import'un dil bağımlılığı yok | **Doğrulandı** |
| 14 | iCal export route'u (`/api/ical/villa/<slug>`) eksik | **Doğrulandı (yeni bulgu)** → ayrı iş; Seçenek D'yi bloklamaz |
| 15 | Kalıcı ayna mı, Faz 8'de kolon düşürme mi | **Mimari karar gerekiyor** (öneri: kalıcı ayna) |
| 16 | `content_mirror_mode()` + guard tasarımı (§4.2) | **Mimari karar gerekiyor** (onay) |
| 17 | Yedek zinciri `istenen → ana dil → site_locales sırası` | **Mimari karar gerekiyor** |
| 18 | Ana dilde eksik içerik: fallback + noindex mi, index mi | **Mimari karar gerekiyor** |
| 19 | `custom_title` dil bağımsız mı, çevrilebilir mi | **Mimari karar gerekiyor** |
| 20 | E-posta ve voucher dili TR sabit kalacak mı | **Mimari karar gerekiyor** (öneri: evet) |
| 21 | Handle slug admin'de görünür mü | **Mimari karar gerekiyor** |
| 22 | 103 + ayna + cascade etkileşim testi | **Uygulama sırasında çözülebilir** (Faz 2, izole PG) |
| 23 | Ortak `ContentLocaleEditor` bileşeni ve modül sırası | **Uygulama sırasında çözülebilir** |
| 24 | URL snapshot aracı (Faz 6 öncesi/sonrası) | **Uygulama sırasında çözülebilir** |
| 25 | Supabase bağlantı türü (migration için session pooler) | **Doğrulandı** (canlıya geçiş audit'i) |

---

## 8. Faz 0 raporuyla çelişen veya onu düzelten bulgular

1. **Ayna tasarımı** (Faz 0 §5.4): Yazma yetkisi DB'de zorlanmıyordu ve kod/DB faz uyumsuzluğu ele alınmamıştı. Bu raporda `content_mirror_mode()` + guard trigger'ları ile **düzeltildi** (§4.2).
2. **Migration numaraları:** Faz 0'da 107 "ayna", 108 "yön değişimi", 109 "103 anlamı" idi. Korunuyor; 107'ye guard ve faz fonksiyonu eklendi.
3. **Slug aynası:** Faz 0 bunu belirtmiyordu. `translations` fazında slug **aynalanmaz**; handle sabit kalır.
4. **"Kalıcı ayna önerilmişti":** Faz 0'da karar seçeneğiydi. Bu rapor kalıcı aynayı açıkça **öneriyor**.
5. **iCal:** Faz 0 "villa adı kullanır [V]" diyordu. Doğrulandı: import dil bağımsız. Ayrıca export route'u **yok** (yeni bulgu).
6. **Voucher:** Faz 0'da taranmamıştı. Tek içerik bağımlılığı `payment_methods.name`.
7. **`blog_posts` şeması:** Faz 0'da "bilinmiyor" sayılmıştı. Arşiv migration 058'de tanımlı bulundu.

---

## 9. Faz 1'e geçmek için gereken kesin kararlar ve eksik kontroller

**Kararlar** (hepsi gerekli):
1. Kalıcı ayna (öneri) mi, Faz 8'de kolon düşürme mi?
2. `content_mirror_mode()` + guard tasarımının onayı.
3. Yedek zinciri sırası.
4. Ana dilde eksik içerik için SEO politikası.
5. `custom_title`: dil bağımsız mı, çevrilebilir mi?
6. E-posta ve voucher dili (öneri: TR sabit).
7. Handle slug'ın admin'de gösterimi.

**Eksik kontroller** (§3.2 sorgularını senin çalıştırman gerekiyor):
- Q1–Q2: ana tabloların kolon, NULL, default ve kısıt bilgisi (özellikle `villa.slug` unique ve NOT NULL; `pages.slug`; `faqs.id` tipi; `name`/`title` NOT NULL durumları).
- Q4: canlı trigger listesi.
- Q5: FK ve silme davranışı.
- Q6: veri hacmi.
- Q7: mevcut `tr` satırları.
- Q8–Q10: slug format, tekrar ve çakışma.
- Q11: `url_redirects` dağılımı.
- Q12: boş içerik oranı.

Bu sorguların sonuçları ve yukarıdaki yedi karar netleşmeden migration 105'e başlanmamalı.

---

## İşlem beyanı

Bu görevde hiçbir kaynak dosyası, migration veya önceki rapor değiştirilmedi. SQL çalıştırılmadı; veritabanına ve sunucuya bağlanılmadı; commit, push ve deploy yapılmadı. Oluşturulan tek dosya bu rapordur.
