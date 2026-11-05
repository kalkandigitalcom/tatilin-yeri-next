# Faz 6 — Dalga 0: Public Routing ve SEO Mimari Analizi

**Tarih:** 4 Kasım 2026
**Kapsam:** Yalnız analiz. **Kod değiştirilmedi**, test veya DB işlemi yapılmadı.
**Kaynaklar:** Faz 0–5 raporları (proje belgeleri ve `Claude outputs/`), mevcut kod (commit edilmemiş Faz 1–5 değişiklikleri dahil).

---

## 1. Özet

Public sitenin **URL katmanı büyük ölçüde hazır**. Çok Dilli Mimari Faz 1–4'te kurulan parçalar:

- `proxy.ts`, merkezi route kaydı ve dil dispatcher'ı;
- dil bazlı yol segmentleri ve dil slug haritası;
- `url_redirects` (slug geçmişi);
- hreflang, x-default, sitemap ve robots;
- dinamik ana dil.

İçerik Faz 5'te ise ilk kez **TR dışında bir ana dille yazılabilir** hâle geldi. Asıl açık, **içerik okuma katmanı**:

1. **Merkezi okuma servisi hiç kullanılmıyor.** `getContent` / `getContentMany` hiçbir public sayfada import edilmiyor.
2. **Eski okuyucular hep TR'ye yedekliyor.** 14 içerik türünün public okumaları `lib/i18n/get-*.server.ts` okuyucularından geçiyor. Kural "istenen dil → **TR ana kolonu**". Ana dil zinciri (istenen → ana dil → diğer aktif diller) yok.
3. **Örnek sonuç:** Ana dil EN iken çevirisi olmayan bir DE sayfası **EN yerine TR'ye** düşer. Faz 5 kararıyla ana dil TR değilken oluşturulan kayıtların TR'si `''` (boş) olduğu için bu sayfa **boş içerik** gösterebilir.
4. **TR sayfaları ana tabloyu doğrudan okuyor.** Ana dil TR olduğu sürece doğru çalışıyor, ama TR'nin bir "çeviri dili" olduğu senaryoda (ana dil EN/DE) TR'nin kendi satırı ve yedeği uygulanmıyor.
5. **SEO "çeviri var" kararları TR'yi daima mevcut sayıyor:** `content-availability.server.ts`, `sitemap-data.server.ts`. Ana dil EN/DE'de, TR'si boş bir kayıt TR'de **indexlenebilir** görünür; doğrusu noindex.
6. **Görünmeyen çeviriler:** Ana sayfa ve indirim koleksiyonlarının `custom_title` çevirileri public tarafta **hiç okunmuyor**. Admin Faz 5'te yazıyor, site göstermiyor.
7. **Üç kopya sayfa dosyası:** Her route'un TR/EN/DE için ayrı `locale-page.tsx` dosyası var (56 dosya). EN ve DE neredeyse aynı; TR farklı. Okuma katmanını değiştirmek bu kopyaları birleştirmeyi doğal hâle getiriyor (§7, karar K2).

**Dil bağımsız sistemlere** dokunmaya gerek yok: fiyat, rezervasyon, müsaitlik, galeri, ilişkiler, mesafe ve teknik alanlar (§5).

---

## 2. Mevcut public routing

### 2.1 App Router ağacı

```
app/
  (public)/[lang]/layout.tsx          ← public root layout: <html lang>, LocaleConfigProvider
  (public)/[lang]/(site)/layout.tsx   ← PublicShell (header/footer/script/404)
  (public)/[lang]/(site)/**/page.tsx  ← 19 dispatcher (localeRoute)
  (public)/<tr-yolu>/locale-page.tsx  ← TR modülü (19)
  (public)/en/<tr-yolu>/locale-page.tsx, (public)/de/...  ← EN/DE modülleri (18+18)
  p/[slug]/locale-page.tsx            ← TR CMS modülü (tarihsel konum)
  sitemap.ts, robots.ts, global-not-found.tsx
  (admin)/…                           ← ayrı root layout
```

- **Dispatcher:** `lib/i18n/routing/locale-route.tsx`.
  - Dili doğrular; kapalı veya desteklenmeyen dilde 404 döner.
  - Routing bağlamını kurar (`primeRoutingContext`).
  - Dil slug'ını teknik anahtara çevirir (`toBaseSlug`).
  - URL kanonik değilse 308 yönlendirir.
  - Modül her zaman **teknik anahtarla** çalışır: `getVillaBySlug(technicalKey)` vb.
- **Statik/dinamik:** Arama, blog detayı, kısa süreli tarihler, liste, favori paylaşımı `force-dynamic`. Diğerleri statik/ISR. Audit'e göre `/` için `s-maxage=600`, sitemap `revalidate=3600`.

### 2.2 Proxy ve URL çözümleme

- **Dosyalar:** `proxy.ts` (Next 16), `lib/i18n/routing/url.ts` → `resolveIncomingPath`, `proxy-config.ts`.
  - Dil yapılandırması bellekte 30 sn TTL ile tutuluyor.
  - Nesil sayacı var; invalidation'da sıfırlanır.
- **Kural:** Ana dil kökte, diğer diller önekli. İstenen URL yapısı zaten bu (TR/EN/DE kök). Yol segmentleri de dile göre değişiyor; örnek `kiralik-villalar` / `villas-for-rent` / `ferienvillen`.
- **Yönlendirmeler:**
  - aynı dilde eski desen veya slug → 308;
  - ana dile bağlı yönlendirmeler (öneksiz yolda başka dilin URL'si, ana dil öneki) → 307;
  - zincir ve döngü yok (Faz 2–4 testleri).
- **Route kaydı:** `route-registry.ts` içinde 19 anahtar. Slug'lı türler: `villa`, `villaType`, `blog`, `page` (ve `reservation` → villa). Bölge slug'ları **çevrilmez** (özel isim, Phase 10I).

### 2.3 Slug haritası ve geçmiş

| Parça | Dosya | Durum |
|---|---|---|
| Dil slug haritası | `routing/sql.ts` `LOCALIZED_SLUGS_SQL` + `rowsToSlugMap` | Faz 5: TR dahil 4 türün **çeviri satırı** slug'ları. Teknik anahtar = `p.slug` |
| Slug → teknik anahtar | `routing/context.ts` `toBaseSlug` | Sıra: kendi dili → teknik anahtar → **başka dilin slug'ı** → geçmiş (`history[locale]` sonra **`history.tr`**) |
| Teknik anahtar → URL | `toLocalizedSlug` | Kendi dil slug'ı, yoksa teknik anahtar. Başka dile yedek **yok** ✅ |
| Slug geçmişi | `url_redirects` (103) + `REDIRECTS_SQL` | Eski slug → içerik → güncel slug. Zincir yok |
| Canlı slug seti (404 kararı) | `LIVE_SLUGS_SQL` | Yalnız teknik anahtarlar (villa, blog, sayfa) |

### 2.4 SEO

- **Metadata:** Her `locale-page.tsx` kendi `generateMetadata`'sını üretir. Dispatcher `withOpenGraphLocale` ekler.
- **Alternatifler:**
  - `buildLocaleAlternates`: canonical ve tüm dillerin URL'si; x-default = ana dil.
  - `pickSeoAlternates`: yalnız aktif ve mevcut diller; kendi dili mevcut değilse hreflang basılmaz.
- **Çeviri var kararı:**
  - `content-availability.server.ts` `getContentLocales`: blog ve sayfa için `title | body | excerpt` dolu satır.
  - `translatedLocalesFromRows` **TR'yi daima ekler**.
- **Sitemap:** `app/sitemap.ts` + `sitemap-data.server.ts`. Dil başına `<url>` üretiliyor. noindex kayıtlar hariç. Çeviri listesi varsayılanı `["tr"]`.
- **Robots:** `app/robots.ts`. "Default allow + açık disallow". Disallow yolları `localizeHref` ile her dile çevriliyor.
- **Merkezi karar fonksiyonu hazır ama bağlı değil:** `lib/i18n/content/content-presence.ts` → `decideContentPresence`: 404, noindex ve boş durum, modül bazında (Faz 3.1). Henüz hiçbir route'a bağlı değil.

### 2.5 Cache ve revalidation

**Cache'ler:**

- `lib/cache.helpers.ts`: `getCachedSettings`, `Menu`, `Villas`, `VillaTypes`, `VillaLocations`, `HomepageCollectionVillas`, `DiscountCollectionVillas`, reviews… **Anahtarlar dil içermiyor**; çünkü TR ana kolonlarını cache'liyorlar, çeviri istek anında uygulanıyor.
- Routing: `locale-slugs` ve `url-redirects:v1` tag'leri.
- Merkezi okuma (`content-read.server.ts`): anahtar = varlık + istenen dil + zincir + ana dil + aktif diller + kimlikler. Tag'ler `content-cache-policy.ts`'te. **Dil izolasyonu bu katmanda zaten var.**

**Invalidation:**

- `invalidatePublicRoutingCaches()` (ana dil, dil aç/kapa, çoklu dil):
  - `settings` ve `locale-slugs` tag'leri;
  - `revalidatePath('/', 'layout')`;
  - sitemap ve robots;
  - proxy nesil sayacı.
- Admin içerik yazımı (Faz 5): `onCommitted` → içerik tag'leri + slug değişince `revalidateLocaleSlugs()`.
- Blog ve sayfa route'ları `/blog` + `/tr|en|de/blog` yollarını revalidate ediyor.

---

## 3. Public içerik okuma envanteri

| İçerik (registry) | Eski okuyucu (yedek: TR ana kolon) | Public tüketiciler | Hedef |
|---|---|---|---|
| `villa` (description, badge, seo_*) | `get-villa-translation.server.ts`, `get-villa-badge-translations.server.ts`, `get-translation.server.ts` | villa detay (EN/DE modülü; TR ana tablo), `VillaList`, `KiralikVillalarPageBody`, `AramaPageBody`, `ShortGapsPageBody`, `SharedListPageBody`, `SharedFavoritesPageBody`, `DiscountCollection`, `SimilarVillasSection`, `PrivateVillaPageBody`, `villa.action.ts` | `getContent` / `getContentMany("villa")` + `resolveVillaSeoDescription` |
| `villa_type` (name + slug) | `get-villa-type-translations.server.ts`, `taxonomy-name.helper.ts` | Header/Footer wrapper, `TaxonomyLandingPageBody`, arama ve liste gövdeleri, `VillaTypeCarousel`, hero filtreleri, `api/public/taxonomies` | `getContentMany("villa_type")` |
| `villa_feature` | `get-villa-feature-translations.server.ts` | villa detay, hero özellikleri, `api/public/taxonomies` | `getContentMany("villa_feature")` |
| `rule_item`, `price_include_item` | `get-translation.server.ts` (`getTranslationsForParents`) | villa detay (kurallar, fiyata dahil) | `getContentMany` |
| `blog_post` | `get-blog-translation.server.ts` | `BlogIndexPageBody`, `BlogDetailPageBody`, `blog-metadata.ts` | `getContent(Many)("blog_post")` + `decideContentPresence("blog")` |
| `page` (body/content, sections) | `get-page-translation.server.ts`, `get-page-titles-by-locale.server.ts` | CMS modülleri (`p/[slug]`), `cms-page-metadata.ts`, Header/Footer menü başlıkları | `getContent("page")` (Faz 3.1 `pages.content` yedeği + bilinçli boş gövde) + `decideContentPresence("page")` |
| `faq` | `get-faq-translations.server.ts` (`cache.helpers`) | SSS bölümleri | `getContentMany("faq")` |
| `menu` | `get-menu-translations.server.ts` | `HeaderWrapper` | `getContentMany("menu")` |
| `payment_method` | `get-payment-method-translations.server.ts` | `api/public/payment-methods`, `rezervasyon-kontrol/share.resolve.ts` | Yalnız **etiket** okuması (rezervasyon akışına dokunmadan; §6 R6) |
| `settings` (9 alan) | `settings-translation.helper.ts` `resolveSettingsText` | `home-metadata.ts`, `hero.helpers.ts`, `Footer`, `ContactPageBody` | `getContent("settings")` |
| `site_popup` | `lib/site-popup.ts` `toPublicSitePopup` (+ çeviri satırları), `site-popup.cache.ts` | popup | `getContent("site_popup")` (temizleyiciler Faz 3.1'de alan kuralı) |
| `homepage_collection`, `discount_collection` (`custom_title`) | **Yok:** public yalnız ana tablo `custom_title`'ı okuyor (`cache.helpers.ts`) | `HomePageBody`, `DiscountCollection` | `getContentMany` (`null` → villa adı; Faz 3.1 kuralı) |
| Bölge (`villa_locations`) | Çevrilmez (Phase 10I) | bölge sayfaları, filtreler | **Değişiklik yok.** Content registry'de değil; dilden bağımsız |

---

## 4. Simetri bulguları (TR'ye özel kalan kodlar)

| # | Yer | Bulgu | Etki |
|---|---|---|---|
| S1 | `get-translation.server.ts`, `get-villa-translation.server.ts`, `get-blog-translation.server.ts`, `get-page-translation.server.ts`, `get-faq-translations.server.ts`, `get-villa-badge-translations.server.ts`, `settings-translation.helper.ts`, `taxonomy-name.helper.ts` | `locale === "tr"` kısayolu + yedek = TR ana kolon | Ana dil EN/DE'de yanlış yedek (TR `''`). Zincir yok |
| S2 | TR `locale-page.tsx` modülleri | İçerik ana tablodan doğrudan okunuyor | TR "çeviri dili" olduğunda yedek uygulanmıyor |
| S3 | `content-availability.server.ts` `translatedLocalesFromRows` | TR **daima** mevcut | TR'si boş kayıt TR'de indexlenebilir |
| S4 | `sitemap-data.server.ts` | Varsayılan `["tr"]`; yalnız EN/DE satırları sayılıyor | Sitemap TR'yi koşulsuz içeriyor |
| S5 | `routing/context.ts` `toBaseSlug` | Geçmişte `history.tr` yedeği; başka dilin slug'ını kabul edip kanonik dile çeviriyor | Yönlendirme amaçlı; içerik başka dilin slug'ıyla **sunulmuyor**. Kural yorumu karar gerektiriyor (K3) |
| S6 | `routing/context.ts` `slugSource` | `locale === "tr" ? "own" : "unknown"` | Bilinmeyen slug TR'de "kendi" sayılıyor. 404 kararını etkiler; ana dil EN'de TR öneki için simetrik değil |
| S7 | `routing/url.ts` `localizeHref` | Öneksiz href **TR deseni** sayılıyor | İç yol sözleşmesi (iç klasör adları TR deseni). Kullanıcıya görünmüyor; kabul edilebilir (belgelenmeli) |
| S8 | `site-locales.validation.ts` `ALWAYS_ENABLED_LOCALES = ["tr"]` | TR kapatılamıyor | Ana dil kuralı zaten var. TR'nin ayrıca zorunlu olması simetriyi bozuyor (K4) |
| S9 | `REDIRECTS_SQL` | Eski slug'ın canlı olup olmadığı yalnız **teknik anahtarlarda** kontrol ediliyor | Eski slug başka bir kaydın **dil slug'ı** olmuşsa yönlendirme yanlış kayda gidebilir. Düşük olasılık, düzeltilmeli |
| S10 | `cache.helpers.ts` koleksiyonlar | `custom_title` çevirisi public tarafta yok | Admin'de girilen çeviri görünmüyor |

---

## 5. Dil bağımsız veriler (davranış korunacak)

Bu alanlar içerik okuma geçişinde **aynı servis ve aynı sorgularla** kalır:

- **Fiyat ve ödeme:** `getVillaPrices`, `getVillaDiscounts`, fiyat motoru, depozito/temizlik, kur.
- **Rezervasyon ve müsaitlik:** rezervasyon formu, `blocked-ranges`, iCal, rezervasyon sorgulama/paylaşım, kısa süreli tarih hesapları.
- **Galeri:** `getVillaImages` + R2 yolları (teknik anahtar klasörü).
- **İlişkiler:** tip/özellik/kural/dahil ilişkileri ve mesafeler. İçerik **etiketleri** merkezi okumaya geçer, ilişki **sorguları** aynı kalır.
- **Teknik alanlar:** villa adı (özel isim), kapasite, harita, havuz, yorumlar.
- **Proxy, route kaydı ve slug geçmişi tablosu:** Yapı korunur. Yalnız §4'teki simetri düzeltmeleri yapılır.

---

## 6. Riskler

| # | Risk | Önlem |
|---|---|---|
| R1 | Okuma değişikliği bugünkü TR çıktısını bozabilir | Faz 3.1 karşılaştırma aracı (`content-legacy-compare`) her içerik türü için ana dil TR'de **sıfır fark** kontrolüyle kullanılır. Kasıtlı farklar raporlanır |
| R2 | Statik/ISR sayfalarda dil karışması | Merkezi cache anahtarı zaten dili içeriyor. `cache.helpers` TR ana kolonları cache'lemeye devam eder; içerik katmanı ayrı. Testte dil izolasyonu (aynı kayıt × 3 dil × 3 ana dil) |
| R3 | Sorgu sayısı artışı (liste sayfaları) | `getContentMany` tek sorgu (⌈N/500⌉). Liste başına 1–3 ek sorgu; Faz 3'te ölçüldü |
| R4 | noindex kararlarının değişmesi (S3, S4) | Ana dil TR'de mevcut SEO çıktısıyla birebir karşılaştırma (Faz 3.1 SEO eşliği testi). Ana dil EN/DE'de yeni (doğru) davranış ayrıca test edilir |
| R5 | 56 kopya dosyanın birleştirilmesi büyük bir değişiklik | Her dalgada yalnız o dalganın route'ları. Dispatcher arayüzü korunur. Önce bir route'ta (villa detay) prototip |
| R6 | Rezervasyon ve ödeme kodu | Ödeme yöntemi etiketi ve villa adı dışında rezervasyon akışına **dokunulmaz**. Etiket okumasını değiştirmek de rezervasyon kapsamına girebilir (K5) |
| R7 | Canlı şema bilinmezleri (105–108 canlıda yok) | Merkezi okuma 105–107'ye bağlı. Okuma **mod=base** ve TR satırı garantisiyle (107) çalışıyor. Canlıya geçiş sırası korunmalı: 105–108 önce |
| R8 | Çoklu instance / CDN cache | Faz 4 audit maddeleri geçerli; bu fazda değişmez |

---

## 7. Karar gerektiren konular

- **K1 — Uygulama koşulu:** Merkezi okuma, canlıda 105–107 (ve slug için 108) uygulanmadan çalışmaz. Faz 6 kodu bu migration'lar canlıya gelmeden deploy edilmemeli. Bu fazda yalnız izole ortamda doğrulanacak.
- **K2 — Kopya sayfa dosyaları:** İki seçenek var:
  - **(a)** Her route için tek, dile duyarlı modül. EN/DE kopyaları kaldırılır, dispatcher aynı modüle `lang` geçirir. *Önerilen:* içerik okuması tek yerde, diller birbirinden ayrışamaz.
  - **(b)** Üç kopya korunur, her birinde okuyucular değiştirilir.
- **K3 — Başka dilin slug'ı ile gelen istek** (ör. `/de/villa/<EN slug>`):
  - Bugün: DE kanonik URL'sine **yönlendiriliyor**, içerik o slug'la sunulmuyor.
  - Öneri: yönlendirme korunsun. Kural "başka dilin slug'ına fallback yapılmaz" **URL üretimi ve içerik sunumu** için geçerli sayılsın.
  - Alternatif: 404. SEO açısından gelen linkleri kaybettirir.
- **K4 — TR'nin her zaman açık zorunluluğu** (`ALWAYS_ENABLED_LOCALES`): Simetri için "ana dil kapatılamaz" kuralı yeterli. TR'nin kapatılabilmesine izin verilsin mi? Voucher ve e-posta TR olduğu için bu yalnız public siteyi etkiler.
- **K5 — Ödeme yöntemi ve rezervasyon ekranlarındaki etiketler** merkezi okumaya geçsin mi, yoksa bu fazda kapsam dışı mı kalsın? Önerilen: kapsam dışı; rezervasyon kodu kuralı.
- **K6 — Koleksiyon başlıkları** (S10): Public'te çeviri gösterimi Dalga 4'te açılsın mı? Önerilen: evet. Admin Faz 5'te yazıyor; davranış Faz 3.1 kuralı (`null` → villa adı).

---

## 8. Dalga planı (önerilen)

| Dalga | Kapsam | Ana dosyalar | Çıkış kriteri |
|---|---|---|---|
| **1 — Locale routing ve URL çözümleme** | S5, S6, S8 (karara göre), S9. Dispatcher'ın teknik anahtar sözleşmesi; slug geçmişinin dil bazlı simetrisi; 404 kararının dil slug'ıyla verilmesi | `routing/context.ts`, `sql.ts`, `url.ts`, `locale-route.tsx`, `proxy-config.ts`, `site-locales.validation.ts` | Ana dil TR/EN/DE × prefix × dil slug × geçmiş × başka dil slug'ı testleri; döngü/zincir yok; PG (m106 / m108clean) |
| **2 — Villa, kategori, bölge** | Villa detay + liste + arama + kısa süreli + paylaşılan liste etiketleri; `villa_type`, `villa_feature`, `rule_item`, `price_include_item` etiketleri; bölge değişmez | villa `locale-page`'leri (K2), `*PageBody` gövdeleri, `api/public/taxonomies`, hero action'ları | Ana dil TR'de eski = yeni (karşılaştırma); EN/DE ana dilde doğru zincir; fiyat/rezervasyon regresyonu |
| **3 — Blog ve CMS** | `blog_post`, `page` okuma; `decideContentPresence` ile 404/noindex; bilinçli boş gövde; `pages.content` | blog/cms gövdeleri ve metadata, `content-availability` (S3) | SEO eşliği (ana dil TR) + ana dil EN/DE'de doğru noindex |
| **4 — Ana sayfa, koleksiyonlar, ortak bileşenler** | `settings` (hero, footer, SEO varsayılanları, çalışma saatleri), `site_popup`, `menu`, `faq`, koleksiyon başlıkları (K6), header/footer | `hero.helpers`, `Footer`, `HeaderWrapper`, `cache.helpers` (faq, koleksiyonlar), `site-popup.cache` | Bileşen testleri × 3 ana dil |
| **5 — Metadata, canonical, hreflang, sitemap, robots** | Tüm metadata'nın merkezi sonuçtan üretilmesi (`isFallback`, `available` dilleri); S4; x-default; OG locale; robots | `seo-alternates`, `sitemap.ts`, `sitemap-data.server`, `*-metadata.ts`, `robots.ts` | Sitemap/hreflang tablosu × 3 ana dil; noindex sayfalar sitemap dışında |
| **6 — Cache, revalidation, regresyon** | Cache anahtarlarında dil; ana dil değişiminde public cache temizliği; slug değişiminde eski + yeni URL temizliği; admin kayıt sonrası revalidation | `content-cache-policy`, `invalidate.server`, `content-write.server` `onCommitted` | Dil izolasyonu testleri, tam paket, build, izole runtime smoke (3 ana dil) |

**Her dalgada:**

- birim testleri;
- izole PG entegrasyonu (108 öncesi `m106`, 108 sonrası `m108clean` **tek kullanımlık kopyaları**; şablonlarda test çalıştırılmaz);
- tam paket, TypeScript, ESLint, build.

Başarısızlıkta sonraki dalgaya geçilmez.

---

## 9. Test stratejisi

1. **Saf birim:**
   - Routing: ana dil × istek × slug kaynağı matrisi.
   - Zincir ve noindex: `decideContentPresence` × modül.
   - Hreflang ve sitemap üreticileri: sahte bağlam.
2. **Bileşen ve sayfa:** Mevcut Faz 2–4 sayfa testleri (18 dosya `locale-page` import ediyor, 21 dosya okuyucu ve SEO yardımcılarını test ediyor) **beklentiler gevşetilmeden** güncellenir. Yalnız okuma kaynağı değişir.
3. **İzole PG:**
   - Her dalgada yeni `content-faz6-*-pg` testleri.
   - Eski ↔ yeni toplu karşılaştırma `m106` ve `m108clean` kopyalarında.
   - Ana dil TR'de hedef: `mirror-drift` = 0, `other` = 0, SEO eşliği tam.
4. **Runtime smoke** (Dalga 6):
   - `.env*` hariç izole build.
   - DB olarak `m108clean` kopyasına bağlı yerel `next start` mümkünse kullanılır. Bu, cihaz VM'sinden buluttaki izole PG'ye erişim gerektirir; mümkün değilse birim ve PG seviyesinde kalınır ve raporlanır.
   - Kontrol: 3 ana dilde `/`, prefix, detay, 308/307, hreflang, sitemap.

---

## 10. Güvenlik sınırları (bu dalgada uygulandı)

- Kod değiştirilmedi.
- Test veya DB işlemi yapılmadı.
- Canlı DB, staging, sunucu ve Coolify'a erişilmedi.
- Migration çalıştırılmadı, 109 oluşturulmadı. `content_mirror_mode()` değiştirilmedi.
- Commit, push ve deploy yapılmadı.
- Kullanıcı değişiklikleri (commit edilmemiş 148 dosya) korunuyor.

**Sonraki adım:** §7'deki kararlar (özellikle K2, K3, K4) netleşince Dalga 1'e başlanır.
