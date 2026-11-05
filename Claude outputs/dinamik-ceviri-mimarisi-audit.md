# Dinamik Çok Dilli İçerik Yönetimi — Salt Okunur Mimari Analizi

**Tarih:** 2026-11-04 · **Kapsam:** `main` @ `8afb11a` (çalışma ağacı temiz) · **Tür:** yalnız okuma.

Bu rapor dışında hiçbir dosya değiştirilmedi. Commit, push, deploy, migration ve veritabanı işlemi yok.

---

## 0. Önce en önemli bulgu

**Mevcut veri modelinde "ana içerik alanları" ana dile değil, Türkçeye aittir.**

- `villa`, `villa_types`, `blog_posts`, `pages`, `faqs` vb. ana tablolardaki metinler (description, seo_title, taban `slug` …) **Türkçe taban içeriktir**.
- EN ve DE içerikler `*_translations` tablolarındadır.
- Public okuma bu varsayımla çalışır:
  - `lib/i18n/get-translation.server.ts` → `getTranslation()` içinde `if (resolvedLocale === DEFAULT_LOCALE) return null;`. `DEFAULT_LOCALE = "tr"` (`lib/i18n/config.ts:33`).
  - TR sayfası her zaman ana alanlardan, EN/DE sayfası çeviri satırından okunur. Çeviri satırı boşsa TR'ye düşer.
- URL katmanı da aynı kuralla çalışır. `lib/i18n/routing/context.ts` → `toLocalizedSlug()` içinde `if (locale === "tr") return baseSlug;`. Taban slug = Türkçe slug.
- Faz 4 ana dil değişimi yalnız **URL kökünü** değiştirir (`settings.public_default_locale`). **İçeriğin taban dilini değiştirmez.**

**Sonuç:** Ana dil EN iken "English" sekmesi **hata değil**. EN içeriğin yaşadığı tek yer orası; EN kök sayfa (`/villas-for-rent`) içeriğini `villa_translations.locale='en'` satırından okur.

Bu sekmeyi gizlemek, sitenin ana dildeki içeriğini **düzenlenemez** hale getirir. Bu, istenen kural 8 ile çelişir ("ana dilin içeriği mevcut ana içerik alanlarından yönetilmeye devam etmeli"). Ana alanlar Türkçe kaldığı sürece bu kural ancak veri modeli değişirse sağlanabilir (bkz. §6, Seçenek B).

Bu yüzden önce şu kararın verilmesi gerekiyor:

| Kavram | Bugünkü kaynak | Ana dil değişimiyle değişiyor mu? |
|---|---|---|
| **URL kök dili** (prefix'siz dil) | `settings.public_default_locale` | Evet (Faz 4) |
| **İçerik taban dili** (ana alanlardaki metinlerin dili, taban slug) | Kodda sabit `DEFAULT_LOCALE = "tr"` | **Hayır** |
| **Çeviri sekmeleri** | Her bileşende sabit `en`, `de` | Hayır (sabit) |

Önerilen çözüm (§6 Seçenek A): Çeviri sekmeleri = **aktif diller − içerik taban dili (TR)**. Ana dil (URL kökü) sekmeleri etkilemez. Arayüzde "ana içerik = Türkçe (temel içerik)" açıkça etiketlenir.

---

## 1. Mevcut mimarinin özeti

**Dil yapılandırması:**
- `lib/i18n/config.ts`: `Locale = "tr" | "en" | "de"`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE = "tr"`, `getRootLocale()`, `getEnabledPublicLocales()`, `isMultilingualEnabled()`.
- `lib/i18n/locale-registry.ts` → `LOCALE_META`: `adminLabel` (İngilizce/Almanca), `nativeLabel` (English/Deutsch), `hreflang`, `ogLocale`. **Merkezi etiket kaynağı zaten var**, ama çeviri bileşenleri kullanmıyor.

**Aktif diller:**
- `site_locales` tablosu (migration 101).
- Public tarafta `app/services/settings.service.ts` → `getPublicSettings()` içinde `getPublicLocaleStates()` ile `public_locales` alanına eklenir. `getCachedSettings()` (tag `settings`) üzerinden okunur.
- Admin tarafında yalnız `/api/admin/settings/locales` (`settings` izni gerekir) ve `app/services/site-locales.client.ts` → `getSiteLocalesClient()`. Bunu yalnız Ayarlar > Genel sayfası kullanıyor.

**Ana dil:**
- `settings.public_default_locale`. Okuyanlar: `getRootLocale()`, `lib/i18n/routing/context.server.ts`, `lib/i18n/routing/proxy-config.ts`.
- Değiştiren tek yol `/api/admin/settings/root-locale` (Faz 4).

**Çeviri tabloları:**
- Migration 082, 086, 088, 089, 091: villa, villa_type, villa_feature, rule_item, price_include_item, page, faq, menu, payment_method, blog_post. CHECK `locale IN ('tr','en','de')`, yani **TR satırına DB izin veriyor**, uygulama yazmıyor.
- `settings_translations` (083, 087) ve `site_popup_translations` (096) için CHECK `locale IN ('en','de')`: **TR satırı DB'de de yasak.**
- Dil slug'ı: migration 102 (villa, villa_type, blog_post, page çevirilerinde `slug`), partial unique `(locale, slug)`.

**Yazma katmanı:**
- Her modülün servisinde `WritableTranslationLocale = "en" | "de"` ve `isWritableLocale()` var. TR reddedilir.
- Örnek: `app/services/villa-translation.service.ts:21-23`.

---

## 2. Sabit kodlanmış dil alanları ve dosya konumları

### 2.1 Admin çeviri arayüzleri (sekme ve etiket sabitleri)

| Modül | Dosya | Sabit | Desen | Slug alanı |
|---|---|---|---|---|
| Villa | `app/(admin)/maki-admin/villas/[id]/_components/VillaTranslationsCard.tsx` | `type WritableLocale = "en" \| "de"` (s.~31), `LOCALE_LABELS { en: "English", de: "Deutsch" }` (s.47-50), `useState({ en, de })`, `useState("en")`, `if (row.locale !== "en" && row.locale !== "de")` | sekme (`activeLocale`) + tek "Kaydet" (aktif dil) | ✅ `LocalizedSlugField kind="villa"` |
| Villa tipi / kategori | `app/(admin)/maki-admin/types/TypeTranslationsPanel.tsx` | aynı (s.35-36) | sekme | ✅ `kind="villaType"` |
| Blog | `app/(admin)/maki-admin/blog/BlogTranslationsCard.tsx` | aynı (s.58-59) | sekme | ✅ `kind="blog"` |
| CMS sayfası | `app/(admin)/maki-admin/pages/[id]/PageTranslationsCard.tsx` | aynı (s.172-173) | sekme (+ bölüm çevirileri) | ✅ `kind="page"` |
| Villa özellikleri | `app/(admin)/maki-admin/features/FeatureTranslationsPanel.tsx` | aynı (s.33-34) | sekme | – |
| Kurallar | `app/(admin)/maki-admin/rules/RuleTranslationsPanel.tsx` | aynı (s.24-25) | sekme | – |
| Fiyata dahiller | `app/(admin)/maki-admin/price-includes/PriceIncludeTranslationsPanel.tsx` | aynı (s.24-25) | sekme | – |
| Ödeme yöntemleri | `app/(admin)/maki-admin/payment-methods/PaymentMethodTranslationsPanel.tsx` | aynı (s.34-35) | sekme | – |
| SSS | `app/(admin)/maki-admin/faqs/page.tsx` | `LOCALE_LABELS` (s.48-49), `for (const locale of ["en","de"] as WritableLocale[])` | yan yana alanlar | – |
| Menü | `app/(admin)/maki-admin/menu/MenuTranslationsPanel.tsx` | aynı (s.37-38) + `["en","de"]` döngüsü | yan yana sütunlar (Menü Adı / English / Deutsch) | – |
| Menü (yeni) | `app/(admin)/maki-admin/menu/new/page.tsx` | bekleyen çeviriler en/de | – | – |
| Ayar çevirileri | `app/(admin)/maki-admin/settings/_components/SettingsTranslationFields.tsx` (s.47-48), `settings/ceviriler/SettingsTranslationsPage.tsx` (s.248, 256-257 metinler) | `TranslationLocale = "tr"\|"en"\|"de"`, `isTr` dalları | sekme | – |
| Açılış popup'ı | `app/(admin)/maki-admin/settings/popup/page.tsx` (s.70-71), `lib/site-popup.ts` → `POPUP_TRANSLATION_LOCALES = ["en","de"]` | sekme | – |
| Ortak slug alanı | `app/components/admin/shared/LocalizedSlugField.tsx` | `locale: "en" \| "de"` prop tipi; **önizlemede `root: "tr"` sabit** (s.42-46) | – | – |

### 2.2 Sunucu ve servis whitelist'leri (`"en" | "de"`)

- **Servisler:**
  - `app/services/villa-translation.service.ts`
  - `villa-type-translation.service.ts`
  - `blog-translation.service.ts`
  - `page-translation.service.ts`
  - `villa-feature-translation.service.ts`
  - `rule-item-translation.service.ts`
  - `price-include-item-translation.service.ts`
  - `payment-method-translation.service.ts`
  - `faq-translation.service.ts`
  - `menu-translation.service.ts`
  - `settings-translation.service.ts`
- **Tip ve repository:** `lib/i18n/settings-translations.types.ts` (`SettingsTranslationLocale`), `lib/db/settings-translation.repository.server.ts`.

### 2.3 Public okuma tarafındaki en/de sabitleri

- **`TRANSLATABLE_LOCALES` sabitleri:**
  - `lib/i18n/get-menu-translations.server.ts`
  - `get-page-titles-by-locale.server.ts`
  - `get-payment-method-translations.server.ts`
  - `get-villa-feature-translations.server.ts`
  - `get-villa-type-translations.server.ts`
- `lib/i18n/content-availability.server.ts`: `(["en","de"] as const)`
- `lib/i18n/sitemap-data.server.ts`: `r.locale !== "en" && r.locale !== "de"`
- `lib/i18n/taxonomy-name.helper.ts`: `TranslatableLocale = Exclude<Locale, "tr">`

Bunlar "TR taban dil" kuralının doğrudan uygulamasıdır. Sekme sorunu için değiştirilmeleri **gerekmez**.

---

## 3. Mevcut dinamik dil altyapısı

| Altyapı | Konum | Admin çeviri ekranlarında kullanılabilir mi? |
|---|---|---|
| `LOCALE_META` (etiketler) | `lib/i18n/locale-registry.ts` | ✅ Saf modül, client'ta import edilebilir. Doğrudan tekrar kullanılabilir |
| `SUPPORTED_LOCALES`, `getEnabledPublicLocales()`, `getRootLocale()` | `lib/i18n/config.ts` | ✅ Saf; settings nesnesi verilirse çalışır |
| `getCachedSettings()` → `public_locales` + `public_default_locale` | `lib/cache.helpers.ts`, `app/services/settings.service.ts` | ✅ Public-safe veri. Bir server action içinden **ek izin gerekmeden** okunabilir |
| `/api/admin/settings/locales` + `getSiteLocalesClient()` | Faz 1 | ⚠️ `settings` izni ister. Villa/blog editörü bu izne sahip olmayabilir → çeviri kartı için **uygun değil** |
| `isLocaleToggleLocked`, `validateEnabledLocalesInput` | `lib/i18n/site-locales.validation.ts` | Dil yönetimi içindir, sekme için gerekmez |
| `PublicRoutingProvider` / `usePublicRouting()` | `app/components/i18n/PublicRoutingProvider.tsx` | ❌ Yalnız public kabukta; admin ağacında yok |

**Bulunamadı:** Admin tarafında aktif dil listesini veren ortak bir **hook veya provider yok** (`useAdminLocales` benzeri). Her çeviri bileşeni kendi sabit listesiyle çalışıyor.

---

## 4. İçerik modüllerine göre analiz

| Modül | Okuma/yazma | Yetki | Slug | Notlar |
|---|---|---|---|---|
| Villa | `villa-translations.action.ts` → `loadVillaTranslationsAction` / `saveVillaTranslationAction` → `villa-translation.service.ts` | `authorizeAdminSession()` (+ dosyadaki izin kontrolü) | ✅, kayıtta `revalidateLocaleSlugs()` | Yalnız **düzenleme** ekranında (`villas/[id]/page.tsx`, adım 8, `id` varken). **Oluşturma (`villas/ekle`) ekranında çeviri yok** |
| Villa tipi | `types/type-translations.action.ts` | `requirePermission("villa_types")` | ✅ | panel |
| Blog | `blog/blog-translations.action.ts` | `requirePermission("blog")` | ✅ | kart |
| CMS sayfası | `pages/[id]/page-translations.action.ts` | – (dosyada) | ✅ | bölüm çevirileri (091) de var |
| Özellik / kural / fiyata dahil / ödeme | ilgili `*-translations.action.ts` | modül izni | – | aynı panel kopyası |
| SSS | `faqs/faq-translations.action.ts` | – | – | sekme değil, yan yana alanlar |
| Menü | `menu/menu-translations.action.ts` | – | – | sütun düzeni |
| Ayarlar / popup | `settings-translations.action.ts`, `popup.action.ts` | `settings` | – | DB CHECK en/de |
| **Bölgeler** | – | – | – | `villa_location_translations` tablosu var (082), ama **koddan okunmuyor ve yazılmıyor** (`lib/i18n/translations.types.ts` s.39-45: bölge adları özel isim). Admin çeviri arayüzü yok |

**Değerlendirme (Soru 5):** Desen ortak (Phase 10A'daki `VillaTranslationsCard` kopyalanmış). Ama **ortak bir bileşen yok**. 13 dosyada aynı `LOCALE_LABELS` / `WritableLocale` kopyası var, üç farklı düzende (sekme, yan yana alan, sütun).

---

## 5. Tespit edilen sorunlar

1. **Sekmeler sabit.** 13 bileşende `en`/`de` elle yazılmış. Pasif bir dil (ör. DE kapalı) sekmelerde yine görünüyor. Bu, istenen kural 2 ve 5'e aykırı.
2. **Etiketler tekrarlanıyor.** `LOCALE_META.nativeLabel` var ama kullanılmıyor (kural 4).
3. **`LocalizedSlugField` önizlemesi yanlış (gerçek hata).** `root: "tr"` sabit. Ana dil EN iken EN slug önizlemesi `/en/villa/x` gösteriyor; gerçek URL `/villa/x`. Kayıt doğru, yalnız gösterim yanlış.
4. **"Ana dil" ile "içerik taban dili" karışıyor.** §0. Ana dil EN olunca English sekmesinin görünmesi veri modeline göre **doğru**. Gizlenirse EN içerik düzenlenemez. Gereksinim bu iki kavramı ayırmalı.
5. **Ana içerik alanlarının etiketi belirsiz.** Villa ana formu ve diğerleri "Türkçe" ya da "temel içerik" diye etiketlenmiyor. Ana dil EN olduğunda admin bu alanların EN olduğunu sanabilir. Bunun veri kalitesi riski var: EN metin TR alanına yazılırsa TR sayfası EN gösterir. *(Ana formun etiketleri ayrıntılı taranmadı; doğrulanmalı.)*
6. **Admin için aktif dil kaynağı yok.** Tek admin uç noktası `settings` izni istiyor.
7. **Cache veya state sorunu bulunmadı (Soru 4).** Sekmelerin güncellenmemesinin nedeni cache değil, sabit liste. Ana dil değişince Faz 4 `invalidatePublicRoutingCaches()` `settings` tag'ini temizliyor. Yeni bir server action `getCachedSettings()` okursa güncel değeri alır. Açık bir admin sekmesi sayfa yenilenene kadar eski listeyi tutar; bu kabul edilebilir.
8. **Yeni dil eklemek hâlâ kod ve migration ister (kural 9).** Eklenmesi gerekenler:
   - `Locale` birleşim tipi, `SUPPORTED_LOCALES`, `LOCALE_META`, sözlük dosyası;
   - route-registry desenleri (`patterns: Record<Locale, string>`);
   - DB CHECK kısıtları (`locale IN ('tr','en','de')`, settings ve popup için `('en','de')`).

   Dinamik sekmeler bunu yalnızca **çeviri ekranları için** sıfır değişikliğe indirir. Uçtan uca sıfır kod değişikliği mümkün değil.

---

## 6. Önerilen merkezi mimari

### Seçenek A — Önerilen (migration yok, veri modeli aynı)

- **Kural:** `çeviri dilleri = aktif diller (site_locales) − CONTENT_BASE_LOCALE ("tr")`
- `CONTENT_BASE_LOCALE` mevcut `DEFAULT_LOCALE`'in anlamını açıkça adlandırır. Yeni bir sabit, yeni bir değer değil.
- Ana dil (URL kökü) sekmeleri **etkilemez**. EN kökte EN sekmesi görünmeye devam eder, çünkü EN içerik oradadır.
- Ana dil EN iken arayüz açıklama gösterir: "Sitenin ana dili İngilizce. İngilizce içerik bu sekmeden yönetilir; ana alanlar Türkçe temel içeriktir."

**Bileşenler:**
1. `lib/i18n/admin-locales.ts` (saf). Fonksiyon: `getTranslationLocales({ enabled, root }) → { code, label: LOCALE_META[code].nativeLabel, adminLabel, isRoot, isEnabled }[]`.
2. Server action `getAdminLocaleContextAction()`.
   - Herhangi bir admin oturumu yeterli; veri public-safe.
   - `getCachedSettings()` ile `{ root, enabled, base: "tr" }` döner. `settings` izni gerekmez.
3. Client hook `useAdminTranslationLocales()`: action'ı bir kez çağırır, sekme listesi ve durumunu verir.
4. Ortak bileşen `TranslationLocaleTabs`. Görevi yalnız sekme şeridi, etiket, "ana dil" ve "pasif" rozetleri, boş durum. **Form alanlarını sarmaz**, her modülün formu kendisinde kalır. Soru 6: evet mantıklı, ama tam bir form çatısı olarak değil, ince bir sekme bileşeni olarak; 13 farklı form şemasını tek bileşene zorlamak riskli.
5. `LocalizedSlugField`:
   - `locale` tipi `Exclude<Locale,"tr">` olur.
   - Önizleme `root` ve `enabled` değerlerini hook'tan alır (hata #3 düzelir).
6. Servis whitelist'leri (`isWritableLocale`) **aynı kalır**. Bu sunucu tarafı güvenlik kapısıdır. İleride `Exclude<Locale,"tr">` tipine bağlanabilir.

**Pasif diller (kural 5) — dikkat:** Pasif dili tamamen gizlemek, dili **yayına almadan önce çeviri hazırlamayı** engeller (olağan iş akışı). Öneri: varsayılan gizli, "Pasif dilleri de göster" anahtarıyla görünür ve "yayında değil" rozetli. Veri asla silinmez. Bu bir **karar maddesi**.

### Seçenek B — İçerik taban dilini ana dille birlikte taşımak (önerilmez)

Ana alanlar = ana dil içeriği olacak şekilde, her ana dil değişiminde içeriğin ana alanlar ile çeviri satırları arasında **yer değiştirmesi**. Etkileri:
- Taban `slug` değişir: bütün URL'ler, `url_redirects`, `LOCALIZED_SLUGS_SQL`, proxy canlı kümesi.
- `villa.search_title` (arama), rezervasyon ve voucher e-postaları, admin listeleri, sitemap, JSON-LD bunu bekler.
- TR çeviri satırları gerekir: settings ve popup CHECK değişir.
- `getTranslation()` ve bütün `resolveTranslatedField` fallback'leri, `toLocalizedSlug("tr")` kuralı değişir.

Rezervasyon, arama ve SEO'ya dokunur. Faz 4'ün "iş mantığına dokunma" sınırını aşar. Ayrı ve büyük bir proje.

---

## 7. Değişmesi gereken dosyalar (Seçenek A)

| Dosya | Gerekçe |
|---|---|
| **Yeni** `lib/i18n/admin-locales.ts` | çeviri dili listesini üreten saf fonksiyon (aktif − taban), `LOCALE_META` etiketleri |
| **Yeni** `app/(admin)/maki-admin/_actions/admin-locale-context.action.ts` (veya benzeri) | `getCachedSettings()`'ten root + enabled; admin oturumu kontrolü |
| **Yeni** `app/components/admin/shared/useAdminTranslationLocales.ts` | client hook |
| **Yeni** `app/components/admin/shared/TranslationLocaleTabs.tsx` | ortak sekme şeridi + rozetler |
| `app/components/admin/shared/LocalizedSlugField.tsx` | önizlemede gerçek root/enabled; `locale` tipi |
| `villas/[id]/_components/VillaTranslationsCard.tsx` | sabit `LOCALE_LABELS` / `WritableLocale` / başlangıç state'i → hook + ortak sekme |
| `types/TypeTranslationsPanel.tsx`, `blog/BlogTranslationsCard.tsx`, `pages/[id]/PageTranslationsCard.tsx` | aynı (slug'lı modüller) |
| `features/FeatureTranslationsPanel.tsx`, `rules/RuleTranslationsPanel.tsx`, `price-includes/PriceIncludeTranslationsPanel.tsx`, `payment-methods/PaymentMethodTranslationsPanel.tsx` | aynı (slug'sız) |
| `faqs/page.tsx`, `menu/MenuTranslationsPanel.tsx`, `menu/new/page.tsx` | yan yana düzen: dil döngüsü hook'tan |
| `settings/_components/SettingsTranslationFields.tsx`, `settings/ceviriler/SettingsTranslationsPage.tsx`, `settings/popup/page.tsx` | aktif dil filtresi; metinlerdeki "English ve Deutsch" ifadeleri dinamik |
| Ana içerik formları (ör. `villas/[id]/page.tsx` adım başlıkları) | "Türkçe — temel içerik" etiketi (§5.5) |
| **Değişmez:** `app/services/*-translation.service.ts`, `lib/i18n/get-*.server.ts`, routing, sitemap, proxy | sunucu whitelist'i ve public okuma doğru; dokunulmamalı |

---

## 8. Veritabanı ve migration ihtiyacı

- **Seçenek A için migration gerekmez (Soru 7–8: hayır).**
  - Aktif diller (`site_locales`) ve ana dil (`settings.public_default_locale`) zaten var.
  - Çeviri tabloları EN/DE satırlarını zaten tutuyor.
- Seçenek B migration ve veri dönüşümü gerektirir. Settings ve popup CHECK'leri değişir; içerik taşıma da gerekir.
- Yeni dil eklemek (ör. `ru`) her seçenekte migration gerektirir: CHECK kısıtları ve `site_locales` seed'i.

---

## 9. Geriye dönük uyumluluk ve risk analizi (Soru 9–10)

| Risk | Seçenek A'da | Önlem |
|---|---|---|
| Mevcut çeviri verisi kaybı | **Yok.** Sekme gizlemek veri silmez; servisler aynı | silme veya temizleme kodu yazılmamalı |
| Pasif dilin çevirisinin düzenlenememesi | Var (gizlenirse) | "pasif dilleri göster" anahtarı |
| Ana dil EN iken EN sekmesinin gizlenmesi | **Yüksek.** EN içerik düzenlenemez olur | Seçenek A kuralı: taban dil (TR) çıkarılır, ana dil çıkarılmaz |
| SEO slug'ları | Değişmez. Slug alanı aynı tablo ve kolona yazar | `LocalizedSlugField` önizleme düzeltmesi yalnız gösterim |
| Hook verisi gelmeden ilk render | Kısa süre boş sekme | yüklenirken iskelet; hata durumunda `SUPPORTED_LOCALES − tr` yedeği |
| Yetkisiz okuma | Dil listesi public bilgi; risk düşük | yine de admin oturumu kontrolü |
| Rezervasyon, fiyat, ödeme | **Etkilenmez.** Bu modüllerin kodu ve verisi değişmez | regresyon testi |
| Public routing / SEO | **Etkilenmez.** Yalnız admin arayüzü | – |
| Menü ve SSS yan yana düzen | DE pasifken DE sütunu gizlenir; kaydetme döngüsü pasif dili atlamalı mı? | **Karar:** pasif dilin mevcut değeri olduğu gibi korunmalı, yazma gönderilmemeli |

---

## 10. Test planı

- **Birim — `admin-locales.ts`:** Ana dil TR/EN/DE × aktif {hepsi, tr+en, tr+de, yalnız tr} ⇒ beklenen sekmeler. TR hiç görünmez; ana dil EN iken EN görünür ve "ana dil" rozeti taşır; pasif dil filtresi; etiketler `LOCALE_META`'dan.
- **Birim — `LocalizedSlugField`:** EN kökte önizleme `/villa/<slug>`, DE kökte `/de/villa/<slug>`.
- **Bileşen — her çeviri kartı (13 dosya):**
  - sekmeler hook'tan geliyor;
  - pasif dil sekmesi yok;
  - mevcut EN/DE verisi yükleniyor ve kaydediliyor;
  - kaydetme yalnız aktif sekmenin dilini gönderiyor.
  - Mevcut testlerin (`PageTranslationsCard.test.tsx`, `TypesPage.test.tsx` vb.) beklentileri gevşetilmeden güncellenir.
- **Server action:** oturum yok → hata; `getCachedSettings` başarısız → yedek liste.
- **Servis whitelist regresyonu:** TR yazma girişimi hâlâ reddediliyor.
- **Uçtan uca (izole DB):** DE'yi kapat, villa düzenle → yalnız English; ana dili EN yap → English sekmesi + rozet, kayıt public `/villas-for-rent`'e yansıyor; DE'yi aç → mevcut DE verisi geri görünüyor.
- **Tam paket:** 4.824 test, TypeScript, ESLint, production build.

---

## 11. Aşamalı uygulama planı

1. **Karar:** Seçenek A ve pasif dil davranışı (gizle mi, anahtarla göster mi).
2. **Altyapı:** `admin-locales.ts`, server action, hook, `TranslationLocaleTabs` ve testleri. Bileşenlere henüz bağlanmaz.
3. **Pilot:** `VillaTranslationsCard` + `LocalizedSlugField` önizleme düzeltmesi.
4. **Slug'lı modüller:** villa tipi, blog, CMS sayfası.
5. **Slug'sız paneller:** özellik, kural, fiyata dahil, ödeme yöntemi.
6. **Yan yana düzenler:** SSS, menü (pasif dil verisini koruyarak).
7. **Ayar çevirileri ve popup** (metinler dahil).
8. **Ana form etiketleri:** "Türkçe — temel içerik".
9. Tam test, build, izole DB uçtan uca, ardından deploy (ayrı onay).

---

## 12. Değişiklik yapılmadan uygulanabilecek en güvenli çözüm

- **Bugünkü davranış veri açısından güvenli ve doğru.** Ana dil EN iken English sekmesi, EN kök sayfanın içeriğini yönettiğiniz yerdir; kullanılmaya devam edilmeli.
- **Operasyonel kurallar (kod değişikliği olmadan):**
  1. Ana içerik alanlarına **her zaman Türkçe** yazın. Ana dil EN/DE olsa bile; bu alanlar TR sayfasını ve taban slug'ı besler.
  2. Ana dilin (ör. EN) içeriğini **English sekmesinden** girin. EN SEO slug'ı da oradadır.
  3. Pasif bir dilin sekmesi görünse de doldurmak zararsızdır: veri saklanır, dil açıldığında yayına çıkar.
  4. EN slug önizlemesinin `/en/...` göstermesi ana dil EN iken yanlıştır; gerçek URL prefix'sizdir. Kayıt doğrudur.
- Gerçek bir düzeltme (sekmelerin aktif dillere bağlanması ve önizleme hatası) Seçenek A ile, migration'sız ve iş mantığına dokunmadan yapılabilir.

---

## Bulunamayan veya doğrulanmayan noktalar

- Villa ana formunda ve diğer ana formlarda "Türkçe" etiketi olup olmadığı **ayrıntılı taranmadı**.
- `page-translations.action.ts`, `faq-translations.action.ts`, `menu-translations.action.ts` için izin kontrolünün tam biçimi bu incelemede okunmadı. Yukarıdaki tabloda "–" ile gösterildi.
- `villa_location_translations` tablosunda canlı veri olup olmadığı (canlı DB'ye bağlanılmadı).
- Canlıda hangi dillerin aktif ve ana dilin ne olduğu (canlı DB'ye bağlanılmadı).

## İşlem beyanı

İnceleme boyunca kaynak kodda, migration'larda ve veritabanında hiçbir değişiklik yapılmadı. Oluşturulan tek dosya bu rapordur (`Claude outputs/dinamik-ceviri-mimarisi-audit.md`). Commit, push, deploy, migration ve canlı sunucu veya veritabanı bağlantısı yapılmadı.
