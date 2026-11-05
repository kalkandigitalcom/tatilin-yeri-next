# Faz 0 — Simetrik Çoklu Dil Mimarisi (Seçenek D): Teknik Tasarım ve Geçiş Planı

**Tarih:** 2026-11-04 · **Kaynak:** `main` @ `8afb11a` + `db/migrations/*` · **Tür:** yalnız analiz.

Kod, migration ve veritabanında değişiklik yapılmadı; veritabanına bağlanılmadı.

**Etiketler:** **[B]** kod veya migration'da doğrulanmış bulgu · **[V]** doğrulanamamış varsayım · **[Ö]** öneri / tasarım kararı

---

## Özet

**[Ö] Hedef model:** Mevcut `*_translations` tabloları, **bütün diller için** (TR dahil) tek içerik kaynağı olur. Ana tablolar yalnız dil bağımsız verileri tutar:
- kimlik, fiyat, kapasite, durum, ilişkiler;
- dil bağımsız **teknik anahtar** (`slug` → "handle");
- çevrilmeyen özel isimler (`villa.title`, `villa_locations.name`).

**Neden yeni tablo gerekmiyor [B]:**
- Bu tablolar zaten `(parent_id, locale)` UNIQUE, `ON DELETE CASCADE` FK, `slug` kolonu (102) ve slug geçmişi trigger'ı (103) taşıyor.
- 10 tablonun 10'u `tr` kaydını DB düzeyinde zaten kabul ediyor.
- Yalnız `settings_translations` ve `site_popup_translations` CHECK'i `tr`'yi reddediyor.

**Geçiş üç katmanda ve paralel yürür:**
1. **Ek şema ve veri (geri alınabilir):** migration 105–107. TR değerleri ana kolonlardan `locale='tr'` satırlarına kopyalanır; ana kolonlar silinmez.
2. **Tek yönlü ayna:** Geçiş sırasında yazmanın kaynağı ana kolondan çeviri satırına **bir kez** döner. Ayna her an tek yönlüdür, döngü olmaz.
3. **Merkezi içerik servisi:** Okuma ve yazma tek sözleşmeden geçer. Kaynak seçimi bir anahtarla (`CONTENT_SOURCE`) yapılır; rollback = anahtarı geri çevirmek.

Bütün süreç boyunca rezervasyon, fiyat, ödeme ve kur tablolarına dokunulmaz. E-postalar açıkça `locale='tr'` okur; ana dilden etkilenmez.

---

## 1. Önceki raporların yeniden değerlendirmesi

| Önceki ifade | Yeniden doğrulama | Durum |
|---|---|---|
| "13 çeviri tablosu" (`dinamik-temel-dil-mimarisi-analiz.md` §4.11) | `TRANSLATION_ENTITY_CONFIG` (`lib/i18n/translations.types.ts`) **10 aktif** varlık içeriyor. Bunlara ek olarak `settings_translations` ve `site_popup_translations` (ayrı repository'ler) var: **12 aktif**. `villa_location_translations` kullanılmıyor, `villa_distance_translations` 090 ile kaldırıldı | **Düzeltildi:** 12 aktif çeviri tablosu. "13" sayısı admin arayüzü bileşenleri için doğru |
| Ana tablo adları [V] (`villa_features`, `rule_items`, `price_include_items`, `menus`, `site_popup`) | `.from("…")` taraması: `villa_features`, `rule_items`, `price_include_items`, **`menu`** (`menus` değil), `faqs`, `payment_methods`, `site_popup` (095) | **Doğrulandı** (`menu` düzeltmesiyle) |
| "Ana tabloların şeması okunmadı" | `villa`, `villa_types`, `villa_features`, `rule_items`, `price_include_items`, `pages`, `faqs`, `menu`, `payment_methods`, `settings` için depoda **CREATE TABLE yok**. Bunlar ilk sağlayıcı şemasından geliyor; migration'lar yalnız ALTER içeriyor | **Hâlâ doğrulanamıyor:** PK tipi, NOT NULL, unique ve index bilgisi canlı DB'den okunmalı (§2.4 sorguları) |
| Çeviri satırında `villa_translations.title` | Kolon 082'de var, Phase 10F'ten beri okunmuyor ve yazılmıyor (villa adı özel isim) | Yeni bulgu: atıl kolon |
| Kapsam dışı serbest metinler | `homepage_collections.custom_title` (012) ve `discount_collections.custom_title` (062): **çeviri yapısı yok** | Yeni bulgu: kapsama kararı gerekiyor (§4) |
| Fiziksel swap önerilmez | Geçerli | Değişmedi |

---

## 2. Envanter

### 2.1 Ana tablolar ve çevrilebilir kolonları [B]

Kolonlar çeviri tablosu ve servis eşlemelerinden çıkarıldı; ana tablo DDL'i depoda yok.

| Ana tablo | PK | Çevrilebilir (bugün TR) | Dil bağımsız ama dil kokan | Slug |
|---|---|---|---|---|
| `villa` | uuid [V: 082 FK uuid] | `description`, `badge`, `seo_title`, `seo_description` | `title` (özel isim; `search_title` generated) | `slug` (taban/handle) |
| `villa_types` | uuid | `name` | `cover_image` | `slug` (landing; `landingSlugOf` normalizasyonu) |
| `villa_features` | uuid | `name` | – | – |
| `rule_items` | uuid | `title` | – | – |
| `price_include_items` | uuid | `title` | – | – |
| `blog_posts` | uuid | `title`, `body`, `excerpt`, `seo_title`, `seo_description` | `published_at`, `noindex`, `is_active` | `slug` |
| `pages` | uuid | `title`, `body`, `excerpt`, `seo_title`, `seo_description`, `sections` (jsonb) | `noindex`, `is_active`, menü ilişkisi (004) | `slug` |
| `faqs` | uuid **[V]** (082 notu: doğrudan doğrulanamadı) | `question`, `answer` | – | – |
| `menu` | uuid | `name` | `slug`/href, `filter_group_name`, `parent_id` (004/005) | – |
| `payment_methods` | uuid | `name` | hesap bilgileri (`payment-account.repository.server.ts`) | – |
| `settings` (tekil) | uuid | `footer_copyright`, `default_meta_title`, `default_meta_description`, `hero_title`, `hero_subtitle`, `hero_badge_text`, `hero_primary_cta_text`, `hero_secondary_cta_text`, `business_hours`, (`maintenance_message` 084 ile çeviriden çıkarıldı) | logolar, renkler, `public_default_locale`, `multilingual_enabled` | – |
| `site_popup` (tekil, `id smallint = 1`) | smallint | `title`, `description`, `highlight_text`, `stats` (jsonb ≤4), `button_text`, `button_url` (uzunluk CHECK'leri) | `image_path`, tarih, kapsam | – |
| `villa_locations` | uuid | – (özel isim; çeviri kaldırıldı) | `name`, `slug` | – |
| `villa_distances` | – | – (TR veri + `distanceLabels` sözlüğü) | `title`, `distance` | – |
| `homepage_collections`, `discount_collections` | uuid | `custom_title` (**çeviri yok**) | – | – |

### 2.2 Çeviri tabloları [B]

Ortak özellikler:
- `id uuid PK`
- `<parent>_id NOT NULL REFERENCES … ON DELETE CASCADE`
- `UNIQUE (<parent>_id, locale)`
- `BEFORE UPDATE` trigger `trg_touch_updated_at` (082)

| Çeviri tablosu | Migration | Kolonlar | locale CHECK | `slug` (102) | Slug geçmişi trigger'ı (103) |
|---|---|---|---|---|---|
| `villa_translations` | 082, 102 | title*(atıl), description, badge, seo_title, seo_description, slug | **tr,en,de** | ✅ + `(locale, slug)` partial unique + format CHECK `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–160 | ✅ INSERT / UPDATE OF slug / DELETE |
| `villa_type_translations` | 082, 102 | name, slug | tr,en,de | ✅ | ✅ |
| `villa_feature_translations` | 082 | name | tr,en,de | – | – |
| `rule_item_translations` | 082 | title | tr,en,de | – | – |
| `price_include_item_translations` | 082 | title | tr,en,de | – | – |
| `blog_post_translations` | 089, 102 | title, body, excerpt, seo_title, seo_description, slug | tr,en,de | ✅ | ✅ |
| `page_translations` | 082, 091, 102 | title, body, excerpt, seo_title, seo_description, sections (jsonb), slug | tr,en,de | ✅ | ✅ |
| `faq_translations` | 082 | question, answer | tr,en,de | – | – |
| `menu_translations` | 086 | name | tr,en,de | – | – |
| `payment_method_translations` | 088 | name | tr,en,de | – | – |
| `settings_translations` | 083, 084, 085, 087 | footer_copyright, default_meta_title, default_meta_description, hero_* (5), business_hours | **en,de** ❌ | – | – |
| `site_popup_translations` | 096 | title, description, highlight_text, stats (jsonb, NOT NULL default `[]`), button_text, button_url + uzunluk CHECK'leri; FK `popup_id smallint` | **en,de** ❌ | – | – |
| `villa_location_translations` | 082 | (kullanılmıyor) | tr,en,de | – | – |

### 2.3 Migration 101–104 ile ilişki [B]

| Migration | Simetrik modelle ilişkisi |
|---|---|
| 101 `site_locales` | Dil listesi kaynağı. Yeni dil = yeni satır + CHECK güncellemesi |
| 102 `slug` | TR satırına da uygulanır; format CHECK, taban slug'ların **bir kısmını reddedebilir** (§5.3) |
| 103 `url_redirects` + `trg_record_slug_history(kind, idcol, 'base' \| 'translation')` | Ana tabloda `mode='base'` → `locale='tr'` geçmişi; çeviri tablosunda satırın dili. Simetrik modelde TR geçmişi çeviri trigger'ından gelir; ana tablo trigger'ı **devre dışı bırakılmalı** (Faz 6). Aksi halde aynı `(kind,'tr',old_slug)` iki kez yazılır (ON CONFLICT ile zararsız ama gereksiz) |
| 104 `change_public_root_locale` | Simetrik modelde ana dil değişimi zaten veri taşımıyor; bu fonksiyonla tam uyumlu. Ek iş yok |

### 2.4 Faz 1 öncesi canlı DB'den okunması gerekenler (salt okuma sorguları)

```sql
-- PK/NOT NULL/unique/index: ana tablolar
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN
 ('villa','villa_types','villa_features','rule_items','price_include_items','blog_posts','pages','faqs','menu','payment_methods','settings','site_popup')
 ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid::regclass::text IN ('villa','villa_types','blog_posts','pages','faqs','menu','payment_methods') AND contype IN ('p','u','c');
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE '%translations';
SELECT tgrelid::regclass, tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text ~ '(translations|^villa$|villa_types|blog_posts|pages)';
-- Mevcut TR çeviri satırı var mı? (beklenen: 0)
SELECT 'villa', count(*) FROM villa_translations WHERE locale='tr' UNION ALL
SELECT 'page',  count(*) FROM page_translations  WHERE locale='tr' /* … diğer tablolar */;
-- Taban slug'ların 102 formatına uygunluğu
SELECT 'villa', count(*) FROM villa WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(slug) > 160 UNION ALL
SELECT 'villa_types', count(*) FROM villa_types WHERE slug IS NOT NULL AND slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' UNION ALL
SELECT 'blog', count(*) FROM blog_posts WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' UNION ALL
SELECT 'page', count(*) FROM pages WHERE slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
-- Taban slug tekrarları (unique yoksa)
SELECT slug, count(*) FROM pages GROUP BY slug HAVING count(*)>1;
-- Çeviri doluluğu (ana dil değişimi preflight'ı için de)
SELECT locale, count(*) FILTER (WHERE coalesce(description,'')<>'') AS dolu, count(*) FROM villa_translations GROUP BY locale;
```

---

## 3. Hedef veri modeli [Ö]

### 3.1 İlke

```
<ana_tablo>(id, …dil bağımsız alanlar…, slug AS handle, [legacy metin kolonları → ayna, sonra kaldırılır])
<ana>_translations(id, <parent>_id, locale, …çevrilebilir alanlar…, slug, created_at, updated_at)
      UNIQUE(<parent>_id, locale)   UNIQUE(locale, slug) WHERE slug IS NOT NULL
```

- **İçerik kimliği:** Ana tablonun `id`'si korunur. Bütün FK'ler (rezervasyonlar, fiyatlar, ilişkiler, `url_redirects.entity_id`) değişmeden çalışır.
- **`slug` handle olur:** Ana tablodaki `slug` dil bağımsız, değişmez teknik anahtar olarak **kalır**. Bugün iç yol (`/<lang>/kiralik-villa/<handle>`), `getVillaBySlug`, proxy canlı kümeleri ve `locale-page.tsx` modülleri bunu anahtar olarak kullanıyor.
  - Bütün dillerin public slug'ı, TR dahil, çeviri satırının `slug` alanından gelir. Boşsa handle kullanılır.
  - Bu sayede `lib/i18n/routing/*` çekirdeği ve 19 dispatcher **değişmeden** kalır. Yalnız `toLocalizedSlug('tr')` özel durumu kalkar.
- **Çevrilmeyen alanlar:** `villa.title` ve `villa_locations.name` ana tabloda kalır (proje kararı). `villa_translations.title` atıl kolonu Faz 8'de kaldırılabilir.
- **Tekil kayıtlar** (`settings`, `site_popup`): aynı model; CHECK genişletilir.
- **Yeni tablo yok.** Ayrı bir merkezi EAV tablosu önerilmez: tip güvenliği kaybı, jsonb alanlar, mevcut repository'ler.

### 3.2 Okuma kuralı ve yedek zinciri

`resolve(field, requestedLocale) = ilk dolu değer: [requested, root, …site_locales sırası]`

Ana dil artık yalnız yedek zincirindeki ikinci halkadır. Hiçbir dil özel kolonda değildir.

### 3.3 Merkezi içerik katmanı (yeni dosyalar)

| Dosya | Sorumluluk |
|---|---|
| `lib/i18n/content/content-registry.ts` (saf) | `TRANSLATION_ENTITY_CONFIG`'i genişletir: varlık başına `fields` (çevrilebilir kolonlar), `legacyBaseColumns` (ayna kolon eşlemesi), `slugKind?`, `required?` alanlar. Tek doğruluk kaynağı |
| `lib/i18n/content/content.repository.server.ts` | `translation.repository.server.ts` üzerine; `findByParents(entity, ids, locales)`, `upsert(entity, parentId, locale, patch)`, transaction desteği |
| `lib/i18n/content/content-read.server.ts` | **Okuma sözleşmesi** (aşağıda) |
| `lib/i18n/content/content-write.server.ts` | **Yazma sözleşmesi** (aşağıda); ayna, slug doğrulama (`slug-validation.server.ts`), revalidate |
| `lib/i18n/content/content-source.ts` | `CONTENT_SOURCE = "legacy" \| "translations"` (env ile; varsayılan legacy) |

**Okuma sözleşmesi:**

```ts
type LocalizedContent<E> = { values: FieldsOf<E>; sourceLocale: Partial<Record<keyof FieldsOf<E>, Locale>>; missing: (keyof FieldsOf<E>)[] };
getContent<E>(entity: E, parentId: string, locale: Locale, opts?: { fallback?: Locale[] }): Promise<LocalizedContent<E>>
getContentMany<E>(entity: E, parentIds: string[], locale: Locale, opts?): Promise<Map<string, LocalizedContent<E>>>   // tek batch, N+1 yok
getAllLocales<E>(entity: E, parentId: string): Promise<Partial<Record<Locale, FieldsOf<E> & { slug?: string|null }>>> // admin
getCoverage(entity, locale): Promise<{ total: number; filled: Record<field, number> }>  // sihirbaz preflight
```

**Yazma sözleşmesi:**

```ts
saveContent<E>(entity: E, parentId: string, locale: Locale, patch: Partial<FieldsOf<E> & { slug?: string|null }>,
               ctx: { actorId: string }): Promise<{ ok: true } | { ok: false; error: string; field?: string }>
// - locale ∈ SUPPORTED_LOCALES (TR dahil); whitelist yalnız burada
// - slug: format + aynı dilde çakışma + ayrılmış kelime (mevcut slug-validation.server.ts)
// - tek transaction: çeviri satırı upsert (+ ayna yönü "translations→legacy" ise ana kolonu da yaz)
// - revalidate: ilgili tag'ler + revalidateLocaleSlugs() (slug değiştiyse)
```

---

## 4. Kapsam kararları

| Konu | Öneri |
|---|---|
| `homepage_collections.custom_title`, `discount_collections.custom_title` | Bugün dil bağımsız. **Kapsam dışı** bırak (villa adı override'ı = özel isim). İstenirse sonradan aynı modelle `_translations` eklenir |
| `villa_distances.title` | Sözlük çözümü korunur (090 kararı) |
| `villa.title`, `villa_locations.name` | Çevrilmez (proje kararı); ana tabloda kalır |
| Statik arayüz metinleri (`lib/i18n/dictionaries/*`) | DB dışı; etkilenmez |
| E-posta şablonları (`app/lib/mail/templates/*`) | Dil parametresi yok, TR. İçerik okumaları **açıkça `locale:'tr'`** ile yapılır (§9) |

---

## 5. Veri migrasyon algoritması (Faz 2) [Ö]

### 5.1 İlke: kopyala, silme

Ana kolonlar **değişmez**. Her ana satır için bir `locale='tr'` çeviri satırı **eklenir**. EN/DE satırlarına dokunulmaz.

### 5.2 Algoritma (tablo başına, tek transaction, idempotent)

```
0. PREFLIGHT (salt okuma; herhangi biri ≠ 0 ise DUR):
   a) mevcut locale='tr' satırları ve bunların ana kolonlarla farkı
   b) taban slug'ların 102 formatına uymayanları
   c) aynı tabloda tekrarlanan taban slug'lar
   d) (locale='tr', slug) çakışması: mevcut tr çeviri slug'ı ile başka satırın taban slug'ı
1. INSERT INTO <t>_translations (<parent>_id, locale, <alanlar…>, slug)
   SELECT id, 'tr', <ana kolonlar…>, <ana slug>    -- slug yalnız 102 tablolarında
     FROM <ana tablo>
   ON CONFLICT (<parent>_id, locale) DO NOTHING;   -- (a)'da fark yoksa güvenli
2. DOĞRULA: count(tr satırı) = count(ana satır); alan alan eşitlik (IS NOT DISTINCT FROM)
3. Kayıt: hangi tablolar, kaç satır → migration NOTICE + admin_activity_logs (uygulama)
```

### 5.3 Özel durumlar

| Durum | Ele alma |
|---|---|
| **Boş değerler** | Ana kolondaki NULL / '' aynen kopyalanır (yorum katılmaz). Okuma zinciri boşu atlar |
| **Mevcut `tr` satırı** (beklenen 0) | Preflight (a). Fark varsa migration durur; insan kararı (ana kolon kazanır önerilir, çünkü public bugün onu okuyor) |
| **Duplicate** | `UNIQUE(parent_id, locale)` engeller; `ON CONFLICT DO NOTHING` idempotent |
| **Slug formatı** | 102 CHECK taban slug'ı reddederse: o satırda `tr.slug = NULL` bırak (handle kullanılır, URL **değişmez**), listeyi raporla. Taban slug'ı düzeltme ayrı bir iş (URL değişikliği demek) |
| **Slug çakışması** | `(locale, slug)` partial unique; preflight (d). Çakışan satırda `tr.slug = NULL` (handle'a düşer; URL aynı kalır) |
| **103 trigger'ı** | INSERT, `old_slug = yeni slug AND locale='tr'` kayıtlarını siler. Bunlar canlı slug olduğu için `REDIRECTS_SQL` onları zaten hariç tutar; zararsız. INSERT tarihçe **yazmaz** (OLD yok) [B] |
| **`settings` / `site_popup`** | Önce migration 105 (CHECK `tr` ekle). Popup uzunluk CHECK'leri ana tabloyla aynı, kopya güvenli; `stats` NOT NULL default `[]` |
| **`pages.sections` / jsonb** | Olduğu gibi kopyalanır; doğrulama yine `parsePageSections` |
| **Veri hacmi** | Bilinmiyor [V]. Villa ~yüzler, blog/sayfa ~onlar varsayımı; tablo başına tek INSERT…SELECT saniyeler sürer |

### 5.4 Ayna (paralel dönem)

| Dönem | Yazmanın kaynağı | Ayna yönü | Mekanizma |
|---|---|---|---|
| Faz 2–4 | **Ana kolon** (mevcut admin formları değişmedi) | ana kolon → `tr` satırı | migration 107: `AFTER INSERT OR UPDATE OF <çevrilebilir kolonlar, slug>` trigger, ana tabloda, yalnız tr satırını upsert eder |
| Faz 5 sonrası | **`tr` satırı** (yeni yazma servisi) | `tr` satırı → ana kolon | migration 108: yukarıdaki trigger düşer; çeviri tablosunda `locale='tr'` için ters trigger (eski okuyucular için) |
| Faz 8 | yalnız çeviri tablosu | yok | ayna kaldırılır |

**Döngü olmaz:** Aynı anda yalnız bir yön tanımlıdır. Yön değişimi tek migration'da yapılır: DROP + CREATE aynı transaction'da.

---

## 6. SEO, URL geçmişi, canonical, hreflang ve sitemap

| Konu | Bugün [B] | Simetrik modelde [Ö] | Dikkat |
|---|---|---|---|
| Public slug | TR = taban (`toLocalizedSlug`: `if (locale === "tr") return baseSlug`), EN/DE = çeviri slug'ı ya da taban | Her dil = `translations.slug` ?? handle. Migrasyon sonrası `tr.slug = handle` → **URL'ler birebir aynı** | `rowsToSlugMap` TR satırlarını atlıyor (`lib/i18n/routing/sql.ts` s.87); bu koşul kalkar. `toBaseSlug` reverse index TR'yi de içerir |
| İç yol ve anahtar | `/<lang>/<tr-pattern>/<handle>` | **Değişmez** | – |
| Slug geçmişi | ana tablo trigger'ı `tr`; çeviri trigger'ı kendi dili | TR geçmişi çeviri trigger'ından gelir. Ana tablo trigger'ı **handle değişirse** hâlâ gerekli (tüm diller handle'a düşüyor olabilir) → `mode='base'` kalır ama `locale='*'` anlamına gelecek şekilde güncellenir (yeni migration) | `REDIRECTS_SQL` `tr` = "taban geçmişi" varsayımı yeniden yazılır: handle geçmişi ile TR dil slug geçmişi ayrılmalı |
| Canonical / hreflang | `pickSeoAlternates`, `content-availability.server.ts` (en,de çevirisine bakıyor; TR'yi daima var sayıyor) | doluluk bütün diller için aynı fonksiyonla; ana dil dahil | Ana dilde içeriği eksik sayfa: karar (fallback + noindex?) |
| Sitemap | `loadTranslatedContentLocales` (`sitemap-data.server.ts`): en,de; TR daima | bütün diller sorgulanır; TR artık "daima var" değil | `noindex` (`loadNoindexSlugs`) dil bağımsız, ana tabloda kalır |
| robots | dil bağımsız | değişmez | – |
| 307/308 | Faz 4 kuralları | değişmez | – |

---

## 7. Modül modül dönüşüm

| Modül | Admin (şimdi → hedef) | Public okuma (şimdi → hedef) | Özel not |
|---|---|---|---|
| Villa | `villas/[id]/page.tsx` adım formları (ana kolon) + `VillaTranslationsCard` (en/de) → **tek "İçerik" kartı**: dil sekmeleri = aktif diller, ana dil ilk ve rozetli | `kiralik-villa/[slug]/locale-page.tsx` (+ en/de) `getVillaBySlug` + `get-villa-translation.server.ts` → `getContent('villa', id, locale)` | `title` dil bağımsız kalır; `badge` kartlarda (`get-villa-badge-translations.server.ts`) |
| Villa tipi | `types/` + `TypeTranslationsPanel` → aynı kart | `get-villa-type-translations.server.ts`, `taxonomy-name.helper.ts` (`Exclude<Locale,"tr">`) | landing slug (`landingSlugOf`) handle olarak kalır |
| Özellik / kural / fiyata dahil / ödeme | panel (en,de) → kart | `get-villa-feature-…`, `get-payment-method-…` vb. (`TRANSLATABLE_LOCALES`) | ödeme adı e-postada (§9) |
| Blog | `blog/` + `BlogTranslationsCard` | `get-blog-translation.server.ts`, `BlogDetailPageBody` | `revalidatePath` çok dilli |
| CMS | `pages/[id]/` + `PageTranslationsCard` (+ bölümler) | `get-page-translation.server.ts`, `resolveTranslatedSections` | `sections` jsonb |
| SSS | `faqs/page.tsx` yan yana alanlar | `get-faq-translations.server.ts` | – |
| Menü | `menu/MenuTranslationsPanel.tsx`, `menu/new` | `get-menu-translations.server.ts`, `lib/menu-resolver.ts` | `menu.name` başka yerde (sidebar?) kullanılıyor mu [V] |
| Ayarlar | `settings/ceviriler/`, `SettingsTranslationFields.tsx` (TR salt okunur gösterim) | `settings-translation.helper.ts`, `getCachedSettings().translations` | CHECK 105 |
| Popup | `settings/popup/page.tsx` | `lib/site-popup.ts` (`POPUP_TRANSLATION_LOCALES`) | CHECK 105, uzunluk CHECK'leri |

**Ortak admin bileşeni:** `app/components/admin/shared/ContentLocaleEditor` (sekme şeridi + modül bazlı alan render prop'u). Kaydetme `saveContent` server action'ından. Mevcut `LocalizedSlugField` TR için de açılır; önizleme gerçek root'u kullanır.

---

## 8. Ana tablolardaki Türkçe kolonların geleceği

| Aşama | Durum |
|---|---|
| Faz 2–4 | Kaynak (yazılır); `tr` satırı ayna |
| Faz 5–7 | Ayna (`tr` → ana kolon); eski okuyucular (e-posta, admin listeleri, arama dışı raporlar) çalışmaya devam eder |
| Faz 8 | **Okuyucu sayısı sıfıra inince** (kod taraması + en az 1–2 sürüm) metin kolonları düşürülür veya ayna olarak kalıcı tutulur (karar). `slug` (handle), `villa.title`, `search_title` **kalır** |

---

## 9. Rezervasyon, ödeme, fiyat ve e-posta bağımlılıkları [B]

| Bağımlılık | Kod | Etki | Önlem |
|---|---|---|---|
| Rezervasyon talebi e-postası: ödeme yöntemi adı | `app/api/mail/reservation-request/route.ts` s.136 `payment_method.name` | ana kolon okuyor | Faz 3'ten sonra `getContent('payment_method', id, 'tr')`; Faz 8'e kadar ayna sayesinde değişmez |
| E-posta villa adı | `bank-transfer-payment/route.ts` s.204 `r.villa?.title` | dil bağımsız | etki yok |
| E-posta şablonları | `app/lib/mail/templates/*` dil parametresi yok | TR | açık `'tr'` okuma; ana dilden bağımsız |
| Voucher | `lib/db/voucher.repository.server.ts`, `app/api/voucher/[id]` | alan listesi taranmadı [V] | Faz 3'te taranmalı |
| Fiyat, müsaitlik, kapora, indirim, kur | `villa_prices`, `villa_discounts`, `reservations`, `manual_reservations`, `exchange_rates` | çevrilebilir alan yok | **hiçbir migration dokunmaz** |
| Arama | `villa.search_title` (title'dan), `buildVillaSearchOrClauseNative` (title + handle slug) | etki yok | handle sabit kalmalı |
| iCal / harici takvim | `external_calendar_*` | villa adı [V] | etki yok varsayımı, doğrulanmalı |
| Public ödeme yöntemleri API | `app/api/public/payment-methods/route.ts` (`name` + `name_by_locale`) | ek alan | `name_by_locale` TR'yi de içerir; `name` ayna |

---

## 10. Paralel çalışma ve uyumluluk stratejisi

1. **Ek şema:** 105–107 yalnız ekler (CHECK genişletme, INSERT, trigger). Eski kod bunları fark etmez.
2. **Okuma anahtarı:** `CONTENT_SOURCE=legacy|translations` (sunucu env).
   - `legacy`: TR ana kolondan.
   - `translations`: TR `tr` satırından.
   - Her iki yolda da EN/DE çeviri satırından okunur.
   - Ayna sayesinde iki yol **aynı sonucu** verir; bu bir test hedefi.
3. **Gölge karşılaştırma (Faz 3):** `translations` yolu arka planda da hesaplanır, farklar loglanır (yalnız staging).
4. **Yazma anahtarı:** Faz 5'te modül modül. Admin kartı yeni servise geçince o modülün ayna yönü değişir (migration 108 modül bazlı trigger'lar içerebilir).
5. **Geri dönüş:** her faz bağımsız; §11 tablosu.

---

## 11. Faz planı

| Faz | İş | Dosyalar | Tablolar / Migration | Bağımlılık | Test | Risk | Rollback |
|---|---|---|---|---|---|---|---|
| **0** | Bu tasarım + §2.4 salt-okuma sorguları | – | – | – | – | – | – |
| **1** Model hazırlığı | `content-registry.ts` (saf), `content-source.ts`; **migration 105**: `settings_translations_locale_check`, `site_popup_translations_locale_check` → `('tr','en','de')` | `lib/i18n/content/*`, `db/migrations/105_symmetric_locale_checks.sql` | 2 CHECK | – | izole PG: CHECK, mevcut testler; registry ↔ `TRANSLATION_ENTITY_CONFIG` tutarlılığı | Düşük | CHECK'i eski haline (`tr` satırı yoksa) |
| **2** Veri aktarımı | **migration 106** (preflight + INSERT…SELECT, 12 tablo); **migration 107** (ana kolon → tr ayna trigger'ı) | `db/migrations/106_backfill_tr_translations.sql`, `107_tr_mirror_from_base.sql` | 12 çeviri tablosu (INSERT), ana tablolarda trigger | 105 | satır sayısı ve içerik eşitliği; admin ana form kaydı → tr satırı güncelleniyor; 103 etkileşimi; idempotent ikinci çalıştırma | Orta | `DROP TRIGGER …mirror…; DELETE FROM <t> WHERE locale='tr'` (103 DELETE trigger'ı geçmiş yazar; önce slug trigger'ı devre dışı veya `url_redirects` temizliği) |
| **3** Okuma servisi | `content-read.server.ts`; `lib/i18n/get-*.server.ts` bu servise delege; `get-translation.server.ts` `resolveTranslatedField` 3 seviyeli (imza korunur); e-posta okumaları `'tr'` | `lib/i18n/*`, `app/api/mail/*` (yalnız okuma) | – | 2 | legacy ↔ translations **aynı çıktı** (snapshot, 3 kök); rezervasyon e-posta testleri | Orta | `CONTENT_SOURCE=legacy` |
| **4** Yazma servisi | `content-write.server.ts`; `app/services/*-translation.service.ts` → delege (TR dahil whitelist `SUPPORTED_LOCALES`); slug doğrulama TR için | `app/services/*`, `lib/i18n/routing/slug-validation.server.ts` | – | 3 | yetki (`requirePermission` aynı); TR yazımı; slug çakışması; revalidate | Orta | servis delegesini geri al |
| **5** Admin | `ContentLocaleEditor` + 13 bileşen; ana formlardan çevrilebilir alanlar karta taşınır (modül modül); **migration 108** (modül başına ayna yönü tr → ana kolon) | `app/(admin)/maki-admin/**`, `app/components/admin/shared/*` | ayna trigger'ları | 4 | ana dil TR/EN/DE × modül; eski formdaki alanların kaybolmaması; aktif/pasif dil gösterimi | **Yüksek** (en çok dosya) | modül bayrağı → eski form; 108'in tersi (ayna yönünü geri çevir) |
| **6** Public + SEO | `CONTENT_SOURCE=translations`; `routing/sql.ts` (`rowsToSlugMap` TR dahil), `context.ts` (`toLocalizedSlug` TR özel durumu kalkar), `REDIRECTS_SQL` handle/TR ayrımı; `content-availability.server.ts`, `sitemap-data.server.ts` (bütün diller); **migration 109**: 103 base trigger'ını `locale='*'` (handle) anlamına güncelle | `lib/i18n/routing/*`, `lib/i18n/*`, `app/sitemap.ts` | `url_redirects` (anlam), trigger | 5 | Faz 2–4 URL testleri (döngü/zincir), sitemap/hreflang 3 kök, slug geçmişi TR + handle | Yüksek | env `legacy` + 109 geri |
| **7** Ana dil + cache | sihirbaz preflight `getCoverage`; yedek zinciri ana dil ile; `invalidatePublicRoutingCaches` + içerik tag'leri | `lib/i18n/root-locale-change.ts`, `RootLocaleChangeField.tsx`, `invalidate.server.ts` | – | 6 | 6 geçiş × içerik doğruluğu; cache tutarlılığı | Orta | sihirbazla geri |
| **8** Eski yapının kaldırılması | ana tablolardaki çevrilebilir metin kolonları (okuyucu = 0 olduktan sonra), ayna trigger'ları, `villa_translations.title` (atıl), `villa_location_translations` (kullanılmıyor) | migration 110+ | yıkıcı | 7 + 1–2 sürüm | tam paket; kod taraması: ana kolon okuyucu yok | **Yüksek** (geri dönüşsüz) | yalnız yedekten; bu yüzden ayrı onay ve PITR |

**Her fazda sabit:**
- rezervasyon, fiyat ve ödeme regresyon paketi (bugün 102 dosya, 1.599 test);
- tam paket (4.824), TypeScript, ESLint, build;
- izole PG'de migration testi; canlıda migration ayrı onayla.

---

## 12. Doğrulama planı (faz geçiş kriterleri)

| Kriter | Nasıl |
|---|---|
| Veri eşitliği | `SELECT count(*) FROM villa v JOIN villa_translations t ON t.villa_id=v.id AND t.locale='tr' WHERE (v.description, v.seo_title, …) IS DISTINCT FROM (t.description, t.seo_title, …)` → 0 (her tablo) |
| URL değişmezliği | Faz 6 öncesi/sonrası tüm sitemap URL'leri ve 3 kök × route örnekleri: durum kodu + `location` snapshot eşit |
| Çıktı eşitliği | `CONTENT_SOURCE` legacy ↔ translations: villa/blog/sayfa/menü/SSS public HTML'inde metin alanları eşit (TR kökte) |
| Ayna | admin TR kaydı → iki konumda aynı değer; eş zamanlı iki kayıt → son yazan kazanır, iki konum tutarlı |
| Rezervasyon | e-posta içerikleri (ödeme adı) snapshot eşit |

---

## 13. Açık noktalar ve kararlar

1. **Canlı şema bilgileri** (§2.4): ana tabloların NOT NULL/unique/index bilgileri depoda yok.
2. **Ayna kalıcı mı?** Faz 8'de ana metin kolonları düşürülsün mü, yoksa kalıcı ayna (sadece okuma) mı kalsın?
3. **Yedek zinciri:** `istenen → ana dil → site_locales sırası` onayı.
4. **Ana dilde eksik içerik:** fallback + noindex mi, fallback + index mi?
5. **`homepage_collections` / `discount_collections.custom_title`:** kapsam dışı mı?
6. **E-posta dili:** TR sabit mi (bu plan), ana dil mi (ayrı proje)?
7. **Handle slug'ı admin'de gösterilsin mi?** Önerilen: "teknik anahtar" olarak salt okunur, yalnız ileri düzey düzenleme.
8. **Voucher ve iCal alan kullanımı** taranmadı.

---

## İşlem beyanı

Bu görevde hiçbir kaynak dosyası, migration veya veritabanı değiştirilmedi; commit, push, deploy ve sunucu bağlantısı yapılmadı. Oluşturulan tek dosya bu rapordur. Çalışma ağacında önceki iki analiz raporu (`dinamik-ceviri-mimarisi-audit.md`, `dinamik-temel-dil-mimarisi-analiz.md`) takip edilmeyen dosya olarak durmaya devam ediyor.
