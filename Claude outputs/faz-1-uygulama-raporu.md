# Faz 1 Uygulama Raporu — Simetrik İçerik Veri Modelinin Hazırlanması (Seçenek D)

**Tarih:** 2026-11-04 · **Taban:** `main` @ `8afb11a`

**Durum:**
- Faz 1 tamamlandı. Migration 105 hazırlandı ve **yalnız izole PostgreSQL 16**'da test edildi.
- Canlı veritabanına bağlanılmadı; commit, push ve deploy yapılmadı.
- Veri taşınmadı. Admin, public okuma, routing, SEO, rezervasyon, ödeme, fiyat ve voucher koduna dokunulmadı.
- Faz 2'ye geçilmedi.

---

## 1. Oluşturulan ve değiştirilen dosyalar

| Dosya | Durum | Açıklama |
|---|---|---|
| `db/migrations/105_symmetric_content_foundation.sql` | **yeni** | CHECK genişletme, `content_mirror_mode()`, guard fonksiyonları, 14 tabloya TR guard'ı, 2 yeni çeviri tablosu |
| `lib/i18n/content/content-registry.ts` | **yeni** | Saf içerik kaydı: 14 varlık, alanlar, ayna kolonları, parent FK, slug türü; `contentFallbackChain()` |
| `lib/i18n/content/content-contract.ts` | **yeni** | Yalnız tip: `ContentReadService`, `ContentWriteService`, `LocalizedContent` |
| `tests/unit/symmetric-content-registry.test.ts` | **yeni** | 16 test |
| `Claude outputs/faz-1-uygulama-raporu.md` | **yeni** | bu rapor |

- **Mevcut dosyalarda değişiklik yok.** `git diff` boş; yeni dosyalar takip edilmeyen dosya olarak duruyor.
- Yeni TypeScript dosyalarını hiçbir çalışan modül **import etmiyor**. Uygulama davranışı değişmedi.

---

## 2. Migration 105

### 2.1 İçerik

1. **Bağımlılık kontrolü:** `trg_touch_updated_at` (082) ve 14 tablonun varlığı. Eksikse `RAISE EXCEPTION`; hiçbir şey değişmez.
2. **TR kabulü:** `settings_translations_locale_check` ve `site_popup_translations_locale_check` için `('en','de')` → `('tr','en','de')` (`DROP CONSTRAINT IF EXISTS` + `ADD`).
3. **`public.content_mirror_mode()`:** `LANGUAGE sql STABLE`, `'base'` döner.
   - **Yalnız yoksa** oluşturulur. Migration tekrar çalıştırıldığında, ileride `'translations'`'a çevrilmiş modu geri **çevirmez**.
4. **`public.trg_content_tr_guard()`:** Çeviri tablolarında `locale='tr'` satırına (INSERT, UPDATE dahil `en→tr` dil değişimi, DELETE) şu durumların **dışında** yazmayı reddeder (`check_violation`, mesaj `content_mirror_guard: …`):
   - mod `'translations'` ise,
   - `app.content_mirror = 'on'` (transaction-local) ise,
   - DELETE'te ana kayıt artık yoksa (`ON DELETE CASCADE`).

   EN ve DE satırları hiç etkilenmez.
5. **`public.trg_content_base_guard()`:** `'translations'` modunda ana tablo çevrilebilir kolonlarına ayna dışı yazmayı reddeden fonksiyon.
   - **Hiçbir tabloya bağlanmadı.** Ana tablo şeması depoda yok; kolon listeleri Faz 0.1'in Q1–Q2 sorgularıyla doğrulandıktan sonra ilgili migration'da bağlanacak.
6. **İki yeni tablo:** `homepage_collection_translations` ve `discount_collection_translations`.
7. TR guard'ı **14 çeviri tablosuna** bağlandı (`<tablo>_content_tr_guard`, `BEFORE INSERT OR UPDATE OR DELETE`).

Migration tek transaction (`BEGIN … COMMIT`). **INSERT / UPDATE / DELETE veri ifadesi, DROP TABLE ve DROP COLUMN içermez** (testle doğrulanıyor).

### 2.2 Etkiler

| Alan | Etki |
|---|---|
| Mevcut veriler | **Değişmez.** İzole testte `villa` ve `villa_translations` için md5 karşılaştırması: önce = sonra |
| Mevcut uygulama yazmaları | Uygulama `locale='tr'` çeviri satırı **yazmıyor** (servis whitelist'leri `en`/`de`). Guard hiçbir mevcut akışı engellemez |
| Kilit | `settings_translations` ve `site_popup_translations` için kısa ALTER kilidi (CHECK doğrulaması tek satırlık tablolarda). 14 tabloya trigger ekleme kısa kilit. Ana tablolara **dokunulmaz** |
| 101 / 103 / 104 | Değişmez. 103 slug geçmişi ve `change_public_root_locale` test edildi, çalışıyor |
| Uygulama sırası | Kod bağımlılığı yok. Migration herhangi bir zamanda uygulanabilir |

### 2.3 Canlıya uygulanma ön koşulları

Faz 2'den önce, ayrı onayla:
- 082, 083, 086, 088, 089, 096, 012 ve 062 canlıda olmalı.
- Session pooler veya doğrudan bağlantı kullanılmalı.
- Öncesinde yedek alınmalı.

---

## 3. Veri modeli

```
<ana tablo>(id, …dil bağımsız…, slug = teknik anahtar, …TR metin kolonları = KALICI AYNA)
<ana>_translations(id uuid PK, <parent>_id FK ON DELETE CASCADE, locale CHECK ('tr','en','de'),
                   …çevrilebilir alanlar…, [slug (102)], created_at, updated_at)
                   UNIQUE(<parent>_id, locale)  [UNIQUE(locale, slug) WHERE slug IS NOT NULL]
```

**İçerik kaydı** (`lib/i18n/content/content-registry.ts`, 14 varlık):

| Anahtar | Çeviri tablosu | Ana tablo / FK | Alanlar | Slug |
|---|---|---|---|---|
| villa | villa_translations | villa / villa_id | description, badge, seo_title, seo_description | villa |
| villa_type | villa_type_translations | villa_types / type_id | name | villaType |
| villa_feature | villa_feature_translations | villa_features / feature_id | name | – |
| rule_item | rule_item_translations | rule_items / rule_id | title | – |
| price_include_item | price_include_item_translations | price_include_items / include_id | title | – |
| blog_post | blog_post_translations | blog_posts / blog_post_id | title, body, excerpt, seo_title, seo_description | blog |
| page | page_translations | pages / page_id | title, body, excerpt, seo_title, seo_description, sections (jsonb) | page |
| faq | faq_translations | faqs / faq_id | question, answer | – |
| menu | menu_translations | menu / menu_id | name | – |
| payment_method | payment_method_translations | payment_methods / payment_method_id | name | – |
| settings | settings_translations | settings / settings_id | footer_copyright, default_meta_title, default_meta_description, hero_title, hero_subtitle, hero_badge_text, hero_primary_cta_text, hero_secondary_cta_text, business_hours | – |
| site_popup | site_popup_translations | site_popup / popup_id (smallint) | title, description, highlight_text, stats (jsonb), button_text, button_url | – |
| **homepage_collection** | **homepage_collection_translations** (105) | homepage_collections / collection_id | custom_title | – |
| **discount_collection** | **discount_collection_translations** (105) | discount_collections / collection_id | custom_title | – |

**Yeni tabloların yapısı:**
- `id uuid PK DEFAULT gen_random_uuid()`
- `collection_id uuid NOT NULL REFERENCES <collections>(id) ON DELETE CASCADE`
- `locale text NOT NULL` + `CHECK (locale IN ('tr','en','de'))`
- `custom_title text`
- `created_at` / `updated_at timestamptz NOT NULL DEFAULT now()`
- `UNIQUE (collection_id, locale)` (FK araması için de index görevi görür)
- `BEFORE UPDATE` `trg_touch_updated_at`
- TR guard'ı

Boş başlarlar; ana `custom_title` kolonu kalıcı ayna olarak kalır.

**Okuma sırası** (onaylı karar 4): `contentFallbackChain(requested, root, enabled)` → istenen → ana dil → diğer aktif diller. Kapalı diller zincire girmez.

**Sözleşme** (`content-contract.ts`): `getContent`, `getContentMany` (tek batch), `getAllLocales` (admin), `getCoverage` (ana dil preflight) ve `saveContent`.
- `saveContent` yazma hedefini `content_mirror_mode()`'dan seçer.
- `LocalizedContent.isFallback`, onaylı karar 5'teki noindex kuralı için.

**Kayıt dışında kalanlar (bilinçli):**
- `villa_translations.title` (atıl; villa adı özel isim).
- `villa_location_translations` (kullanılmıyor).
- `villa.title`, `villa_locations.name`.

---

## 4. Güvenlik mekanizması

| Kural | Uygulama |
|---|---|
| Faz bilgisi DB'de | `content_mirror_mode()`. Yalnız migration ile değişir (`CREATE OR REPLACE`). Başka oturumlarda yeniden bağlanmadan hemen geçerli (test edildi) |
| `base` modunda TR çeviri satırı yalnız aynadan | `trg_content_tr_guard` + `app.content_mirror` (transaction-local `set_config(…, true)`; commit sonrası kendiliğinden kapanır, test edildi) |
| `translations` modunda ana kolon yalnız aynadan | `trg_content_base_guard` (bu fazda bağlı değil; davranışı geçici trigger'la test edildi) |
| Çift yönlü senkron | **Yok.** Bu migration hiçbir ayna trigger'ı oluşturmaz. Faz 2'de yalnız `ana → tr` yönü eklenecek |
| Cascade silme | Ana kayıt silinince TR satırları dahil çeviriler silinir. TR satırının tek başına silinmesi `base` modunda engellenir |
| Geçersiz dil | locale CHECK hâlâ zorunlu (ör. `fr` → CHECK hatası; ayna bayrağı CHECK'i atlatmaz) |

---

## 5. Test sonuçları

### 5.1 İzole PostgreSQL 16

**Kurulum:**
- Minimal ana tablolar oluşturuldu.
- Depodaki **gerçek** migration dosyaları sırayla uygulandı: 082, 083, 084, 085, 086, 087, 088, 089, 090, 091, 012, 095, 096, 101, 102, 103, 104, 062 (arşiv), ardından 105.
- Örnek veri: 1 villa, 1 EN çevirisi, koleksiyonlar, popup, EN ayar çevirisi.

| # | Senaryo | Beklenen | Sonuç |
|---|---|---|---|
| Ön/son | CHECK, fonksiyon, 14 guard, 2 tablo; satır sayıları; `villa` ve `villa_translations` md5 | yapı eklendi, veri aynı | ✅ md5 eşit |
| İdempotent | 105'i ikinci kez çalıştırma | hata yok, aynı yapı | ✅ |
| T01 | `content_mirror_mode()` | `base` | ✅ |
| T02 | EN/DE insert, update, delete | serbest | ✅ |
| T03 | doğrudan TR insert | guard hatası | ✅ |
| T04 | `en → tr` dil değişimi | guard hatası | ✅ |
| T05 | settings/popup TR insert (bayraksız) | CHECK değil, guard hatası | ✅ |
| T06 | bayrakla `fr` insert | CHECK hatası | ✅ |
| T07 | bayrakla 5 tabloya TR insert | serbest | ✅ |
| T08 | commit sonrası bayraksız TR update | guard hatası (bayrak transaction-local) | ✅ |
| T09 | ana kayıt yaşarken TR delete | guard hatası | ✅ |
| T10 | ana villa silme (cascade) | TR dahil bütün çeviriler ve koleksiyonlar silinir | ✅ |
| T12 | yeni tabloda tekrar `(collection_id, locale)` ve `fr` | unique ve CHECK hatası | ✅ |
| T13 | yeni tabloda `updated_at` trigger'ı | güncelleniyor | ✅ |
| T14 | geçici `translations` modu: TR yazımı serbest; ana tablo guard'ı bayraksız yazmayı reddediyor, bayrakla izin veriyor | ✅ |
| T15 | rollback sonrası mod yine `base` | ✅ |
| T16 | 103 EN slug geçmişi | kayıt oluşuyor | ✅ |
| T17 | `change_public_root_locale('tr','tr')` | çalışıyor | ✅ |
| Mod geçişi | başka oturumda mod `translations` yapılınca açık oturumda TR yazımı hemen serbest | ✅ |
| Rollback | TR satırı varken | betik reddediyor | ✅ |
| Rollback | TR satırları temizlendikten sonra | eski CHECK'ler, fonksiyon/trigger/tablo yok | ✅ |
| Yeniden uygulama | rollback sonrası 105 | yapı tekrar kuruldu | ✅ |

**Yeni bulgu (Faz 3'ten kalan, 105'ten bağımsız):**
- Ana kayıt silinirken cascade ile silinen çeviri satırlarının slug'ları, 103'ün çeviri trigger'ı tarafından `url_redirects`'e **geçmiş olarak yazılıyor**. Ana tablo trigger'ının temizliğinden sonra kalan bu kayıtlar artık var olmayan bir içeriği gösteriyor.
- 105'ten önce de EN slug ile tekrarlandı (`c-en` → 1 artık kayıt). TR satırları geldiğinde (Faz 2) sayı artacak.
- Zararsız: `REDIRECTS_SQL` yalnız yayındaki içeriklere join yapar. Ama gereksiz kayıt bırakır.
- Faz 2 migration'ında 103 çeviri trigger'ına "ana kayıt yoksa geçmiş yazma" koşulu eklenmeli.

### 5.2 Uygulama testleri

| Kontrol | Sonuç |
|---|---|
| `tests/unit/symmetric-content-registry.test.ts` | **16/16** |
| Tam paket | **255 dosya, 4.851 test: 4.840 başarılı, 11 atlanan, 0 başarısız** (önce 4.824 + 16 yeni) |
| TypeScript (`tsc --noEmit`, kaynak) | **0 hata** |
| ESLint | **0 hata**, 194 uyarı (değişmedi) |
| Production build | çalıştırılmadı. Yeni TS dosyalarını hiçbir runtime modülü import etmiyor; tip kontrolü `tsc` ile yapıldı |

---

## 6. Doğrulama sorguları (canlıda, salt okunur)

**Uygulama öncesi:**

```sql
BEGIN TRANSACTION READ ONLY;
SELECT to_regclass('public.homepage_collections'), to_regclass('public.discount_collections'),
       to_regclass('public.site_popup_translations'), to_regclass('public.settings_translations');
SELECT count(*) FROM pg_proc WHERE proname IN ('trg_touch_updated_at','content_mirror_mode','trg_content_tr_guard');  -- beklenen: 1 (yalnız touch)
SELECT conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname IN ('settings_translations_locale_check','site_popup_translations_locale_check');
-- Mevcut TR satırları (guard sonrası bunlar uygulamadan güncellenemez; beklenen 0)
SELECT 'villa', count(*) FROM villa_translations WHERE locale='tr' UNION ALL
SELECT 'type', count(*) FROM villa_type_translations WHERE locale='tr' UNION ALL
SELECT 'feature', count(*) FROM villa_feature_translations WHERE locale='tr' UNION ALL
SELECT 'rule', count(*) FROM rule_item_translations WHERE locale='tr' UNION ALL
SELECT 'include', count(*) FROM price_include_item_translations WHERE locale='tr' UNION ALL
SELECT 'blog', count(*) FROM blog_post_translations WHERE locale='tr' UNION ALL
SELECT 'page', count(*) FROM page_translations WHERE locale='tr' UNION ALL
SELECT 'faq', count(*) FROM faq_translations WHERE locale='tr' UNION ALL
SELECT 'menu', count(*) FROM menu_translations WHERE locale='tr' UNION ALL
SELECT 'payment', count(*) FROM payment_method_translations WHERE locale='tr';
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname ~ '_translations$' ORDER BY 1;
ROLLBACK;
```

**Uygulama sonrası:**

```sql
BEGIN TRANSACTION READ ONLY;
SELECT public.content_mirror_mode();                                         -- 'base'
SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%\_content\_tr\_guard' ESCAPE '\';  -- 14
SELECT conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname IN ('settings_translations_locale_check','site_popup_translations_locale_check');  -- tr,en,de
SELECT to_regclass('public.homepage_collection_translations'), to_regclass('public.discount_collection_translations');
SELECT count(*) FROM pg_trigger WHERE tgfoid = 'public.trg_content_base_guard'::regproc;  -- 0 (bağlı değil)
SELECT current_user, has_function_privilege('public.content_mirror_mode()', 'EXECUTE');
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname ~ '_translations$' ORDER BY 1;  -- öncekiyle aynı
ROLLBACK;
```

**Uygulama sonrası duman testi** (yan etkisiz, ROLLBACK ile):

```sql
BEGIN;
SAVEPOINT a;
INSERT INTO villa_translations (villa_id, locale) SELECT id, 'tr' FROM villa LIMIT 1;  -- beklenen: content_mirror_guard hatası
ROLLBACK TO a;
ROLLBACK;
```

---

## 7. Geri dönüş planı

**Kod:** Yeni TS dosyaları silinir. Hiçbir modül import etmediği için etkisi yok.

**Migration 105:** Bu betik izole PG'de test edildi. Veri kaybı yok, **ancak** iki yeni tabloya girilmiş `custom_title` çevirileri silinir. `locale='tr'` satırı varken çalışmayı reddeder.

```sql
BEGIN;
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['settings_translations','site_popup_translations'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE locale = %L', t, 'tr') INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'Rollback 105: % tablosunda % adet tr satırı var; önce kaldırılmalı.', t, n; END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'villa_translations','villa_type_translations','villa_feature_translations','rule_item_translations',
    'price_include_item_translations','blog_post_translations','page_translations','faq_translations',
    'menu_translations','payment_method_translations','settings_translations','site_popup_translations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_content_tr_guard', t);
  END LOOP;
END $$;
DROP TABLE IF EXISTS public.homepage_collection_translations;
DROP TABLE IF EXISTS public.discount_collection_translations;
DROP FUNCTION IF EXISTS public.trg_content_tr_guard();
DROP FUNCTION IF EXISTS public.trg_content_base_guard();
DROP FUNCTION IF EXISTS public.content_mirror_mode();
ALTER TABLE public.settings_translations DROP CONSTRAINT IF EXISTS settings_translations_locale_check;
ALTER TABLE public.settings_translations ADD CONSTRAINT settings_translations_locale_check CHECK (locale IN ('en','de'));
ALTER TABLE public.site_popup_translations DROP CONSTRAINT IF EXISTS site_popup_translations_locale_check;
ALTER TABLE public.site_popup_translations ADD CONSTRAINT site_popup_translations_locale_check CHECK (locale IN ('en','de'));
COMMIT;
```

Rollback'ten sonra 105 yeniden uygulanabilir (test edildi).

---

## 8. Faz 2'ye geçiş koşulları

**Tamamlananlar:**
1. ✅ Migration 105 hazırlandı; izole PG'de idempotentlik, guard, rollback ve yeniden uygulama testleri geçti.
2. ✅ İçerik kaydı ve sözleşme hazır; `TRANSLATION_ENTITY_CONFIG` ve migration kolonlarıyla tutarlılığı testli.
3. ✅ Tam test paketi, TypeScript ve ESLint yeşil.

**Bekleyenler:**
4. ⏳ **Faz 0.1 Q1–Q12 salt okunur sorgularının canlıda çalıştırılması (senin tarafında).** Özellikle:
   - ana tablo kolonları ve NOT NULL durumları (`villa`, `pages`, `faqs`, `menu`, `payment_methods`, `villa_features`, `rule_items`, `price_include_items`, `settings`);
   - `villa.slug` / `pages.slug` unique;
   - `faqs.id` tipi;
   - mevcut `locale='tr'` satırları;
   - taban slug'ların 102 formatına uyumu ve tekrarları.

   Faz 2'nin ayna trigger'ları (`AFTER UPDATE OF <kolonlar>`) ve backfill'i bu bilgiye bağlı.
5. ⏳ Migration 105'in canlıya uygulanması (ayrı onay; §2.3, §6).
6. ⏳ Faz 2 tasarım ekleri:
   - 103 çeviri trigger'ına "ana kayıt yoksa geçmiş yazma" koşulu (§5.1 bulgusu);
   - backfill'de `app.content_mirror` bayrağının kullanımı;
   - TR slug'larının 102 formatına uymadığı satırlarda `tr.slug = NULL`.
7. ⏳ Faz 2 için ayrı onay. Bu raporla birlikte Faz 2'ye **geçilmedi**.

---

## İşlem beyanı

- Değiştirilen mevcut dosya yok.
- Yeni dosyalar: migration 105, `lib/i18n/content/content-registry.ts`, `lib/i18n/content/content-contract.ts`, `tests/unit/symmetric-content-registry.test.ts` ve bu rapor.
- Canlı sunucuya veya veritabanına bağlanılmadı; migration canlıda çalıştırılmadı; commit, push ve deploy yok.
- Testler yalnız yerel ve izole PostgreSQL'de yapıldı.
