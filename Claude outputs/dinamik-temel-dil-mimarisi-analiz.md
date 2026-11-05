# Dinamik Temel Dil Mimarisi — Kapsamlı Salt Okunur Analiz

**Tarih:** 2026-11-04 · **Kapsam:** `main` @ `8afb11a` · **Tür:** yalnız okuma. Kaynak kod, migration ve veritabanı değiştirilmedi; veritabanına bağlanılmadı.

**Etiketler:** **[B]** = kodda veya migration'da doğrulanmış bulgu · **[V]** = varsayım (doğrulanmadı) · **[Ö]** = öneri

---

## Kısa cevap

> Mevcut Türkçe temel içerik mimarisini, seçilen ana dilin temel içerik dili olduğu dinamik bir mimariye nasıl güvenli şekilde dönüştürebiliriz?

**[Ö]** Ana dil her değiştiğinde içerik verisini ana tablo ile çeviri tablosu arasında **fiziksel olarak taşımak** (swap) önerilmez. Bu yöntem URL, slug geçmişi, arama, e-posta ve cache katmanlarının hepsinde "ana kolon = Türkçe" varsayımını bozar. Her geçiş ve her geri alma büyük bir veri dönüşümüne dönüşür (§4, §7-B).

Güvenli ve uzun vadede doğru yol iki katmanlıdır:

1. **Dil bağımsız içerik servisi (kısa vade, migration yok):** Admin ve public kod içeriği "dil → değer" olarak okuyup yazar. Servis, "TR = ana kolonlar, diğer diller = çeviri satırı" depolamasını gizler.
   - Admin'de **ana form = ana dil**, **çeviri sekmeleri = diğer aktif diller** olur.
   - Public tarafta yedek dil zinciri **istenen dil → ana dil → TR** olur.
   - Ana dil değişince hiçbir satır taşınmaz; davranış anında ve geri alınabilir şekilde değişir.
   - Kullanıcının istediği bütün **gözlemlenen davranışlar** (§2) bu katmanla sağlanır.
2. **Simetrik çeviri modeli (uzun vade, ek migration'lar):** TR içerik de çeviri tablolarına (`locale='tr'`) taşınır, ana tablodaki metin kolonları geçiş süresince **ayna** olarak kalır. Sonuçta hiçbir dil "özel kolonda" yaşamaz; ana dil yalnız bir sunum ayarıdır.

Talep edilen "ana dil içeriği fiziksel olarak ana kolonlarda dursun" hedefi, ancak 2. aşamadan **sonra** ve gerekiyorsa ana kolonları "ana dilin önbelleği" olarak yeniden tanımlayarak, güvenli biçimde karşılanabilir (§7, Seçenek E).

---

## 1. Mevcut mimari: içerik nerede duruyor? [B]

### 1.1 Çevrilebilir içerik envanteri

| Modül | Ana tablo (temel = TR) | Çeviri tablosu (migration) | Çevrilen alanlar | Dil CHECK | Slug |
|---|---|---|---|---|---|
| Villa | `villa` | `villa_translations` (082, 102) | `description`, `badge`, `seo_title`, `seo_description`, `slug` | `tr,en,de` | `villa.slug` (taban) + çeviri `slug` |
| Villa tipi / kategori | `villa_types` | `villa_type_translations` | `name`, `slug` | `tr,en,de` | evet |
| Özellik | `villa_features` [V: tablo adı] | `villa_feature_translations` | `name` | `tr,en,de` | – |
| Kural | `rule_items` [V] | `rule_item_translations` | `title` | `tr,en,de` | – |
| Fiyata dahil | `price_include_items` [V] | `price_include_item_translations` | `title` | `tr,en,de` | – |
| Blog | `blog_posts` | `blog_post_translations` (089, 102) | `title`, `body`, `excerpt`, `seo_title`, `seo_description`, `slug` | `tr,en,de` | evet |
| CMS sayfası | `pages` | `page_translations` (082, 091, 102) | `title`, `body`, `excerpt`, `seo_*`, `sections` (jsonb), `slug` | `tr,en,de` | evet |
| SSS | `faqs` | `faq_translations` | `question`, `answer` | `tr,en,de` | – |
| Menü | `menus` [V] | `menu_translations` (086) | `name` | `tr,en,de` | – |
| Ödeme yöntemi | `payment_methods` | `payment_method_translations` (088) | `name` | `tr,en,de` | – |
| Genel ayarlar | `settings` | `settings_translations` (083, 085, 087) | `footer_copyright`, `maintenance_message`, `default_meta_title`, `default_meta_description`, hero ve çalışma saati alanları | **`en,de`** | – |
| Popup | `site_popup` [V] | `site_popup_translations` (096) | `title`, `description`, `highlight_text`, `stats` (jsonb), `button_text`, `button_url` | **`en,de`** | – |
| **Çevrilmeyen (proje kararı)** | `villa.title`, `villa_locations.name`, `villa_distances.title` | `villa_location_translations` duruyor ama kullanılmıyor (`lib/i18n/translations.types.ts` s.39-45); `villa_distance_translations` 090 ile kaldırıldı | – | – | – |

**Ortak şema [B]:**
- Migration 082 başlığı: `<parent>_id uuid NOT NULL REFERENCES … ON DELETE CASCADE`, `UNIQUE (<parent>_id, locale)`.
- Merkezi kayıt: `TRANSLATION_ENTITY_CONFIG` (`lib/i18n/translations.types.ts`).
- Slug için partial unique `(locale, slug) WHERE slug IS NOT NULL` (102).
- Statik arayüz metinleri `lib/i18n/dictionaries/*` içinde (DB dışı); bu dönüşümden etkilenmez.

### 1.2 "TR = temel" varsayımının kodda geçtiği yerler [B]

| Katman | Kod | Varsayım |
|---|---|---|
| Okuma | `lib/i18n/get-translation.server.ts` → `getTranslation()`: `if (resolvedLocale === DEFAULT_LOCALE) return null;` | TR için çeviri sorgusu yapılmaz |
| Yedek | aynı dosya → `resolveTranslatedField(translated, parentValue)` | boş çeviri → ana kolon (TR) |
| Toplu okuma | `get-villa-type-translations`, `get-villa-feature-translations`, `get-menu-translations`, `get-payment-method-translations`, `get-page-titles-by-locale`, `get-villa-badge-translations`, `get-faq-translations`, `get-blog-translation`, `get-page-translation` (`lib/i18n/`) | `TRANSLATABLE_LOCALES = en,de` |
| Yazma | `app/services/*-translation.service.ts` → `isWritableLocale = en \| de` | TR çeviri satırı yazılmaz |
| URL | `lib/i18n/routing/context.ts` → `toLocalizedSlug()`: `if (locale === "tr") return baseSlug;`; `sql.ts` → `rowsToSlugMap` TR satırlarını atlar | taban slug = TR slug |
| Slug geçmişi | `103_url_redirects.sql`: ana tablo trigger'ı `locale='tr'` yazar; `REDIRECTS_SQL` `tr` = taban geçmişi | TR = ana kolon |
| İçerik varlığı ve sitemap | `lib/i18n/content-availability.server.ts`, `lib/i18n/sitemap-data.server.ts` (`en`/`de`) | TR her zaman var |
| Arama | `villa.search_title` (TR-fold, `villa.title`'dan generated), `lib/db/villa.repository.server.ts` s.117 | başlık çevrilmiyor; etkilenmez |
| E-posta | `app/lib/mail/templates/*` dil parametresi almıyor (TR); `app/api/mail/reservation-request/route.ts` s.136 `payment_method.name` (ana kolon) | e-posta = TR + ana kolon |
| Ayar ve popup | DB CHECK `('en','de')` | TR satırı imkânsız |
| Admin | 13 çeviri bileşeni `en`/`de` sabit (bkz. `dinamik-ceviri-mimarisi-audit.md` §2) | – |

---

## 2. Hedef davranış ile mevcut durumun farkı

| Hedef (ana dil EN) | Bugün | Gerekenler |
|---|---|---|
| Admin ana form = EN | Ana form = TR | ana formun hangi dili düzenlediği soyutlanmalı |
| Çeviri sekmeleri = TR, DE | EN, DE (sabit) | sekmeler = aktif diller − ana dil; **TR sekmesi** yazılabilir olmalı |
| Public EN sayfa EN içerik | ✅ (EN çeviri satırı, boşsa TR) | yedek: EN boşsa **ne gösterilecek?** (§3.4) |
| Public TR sayfa TR içerik | ✅ (ana kolon) | değişmez |
| Public DE sayfa, DE boşsa | TR'ye düşer | hedefte **ana dile (EN)** düşmesi doğal (karar) |
| SEO slug'ları korunur | ✅ | taban slug TR kalırsa korunur; taşınırsa §4.5 |

---

## 3. Ana dil değişimi senaryosu (TR → EN) — iki yaklaşım

### 3.1 Yaklaşım 1: Fiziksel taşıma (swap)

Ana dil değiştiği anda her içerik satırı için:
1. Ana kolonlardaki TR değer, `*_translations (locale='tr')` satırına upsert edilir.
2. `locale='en'` çeviri satırındaki değerler ana kolonlara yazılır.
3. `locale='en'` satırı silinir ya da boşaltılır (aynı içeriğin iki yerde tutulmaması için).
4. DE satırı aynı kalır.

### 3.2 Yaklaşım 2: Mantıksal eşleme (önerilen)

Veri yerinde kalır. Admin ana formu, `contentLocaleService.read(entity, id, rootLocale)` ile **EN çeviri satırını** gösterir ve kaydeder. TR sekmesi ana kolonları gösterir ve kaydeder. Public EN sayfası zaten EN satırını okuyor.

### 3.3 Senaryo adımları (Yaklaşım 2 ile)

| Adım | Ne olur | Veri değişikliği |
|---|---|---|
| Admin ana dili EN yapar (Faz 4 sihirbazı) | `settings.public_default_locale='en'`; URL kökü EN | Yok (yalnız ayar) |
| Villa düzenleme açılır | ana form ← `villa_translations(en)`; sekmeler: TR ← `villa` ana kolonları, DE ← `villa_translations(de)` | Yok |
| Admin ana formu kaydeder | `villa_translations(en)` upsert | yalnız o satır |
| Public `/villa/<en-slug>` | EN satırı; boş alan → yedek zincir | Yok |
| EN → DE | ana form ← DE satırı; sekmeler TR (ana kolon), EN (satır) | Yok |
| DE → TR | bugünkü davranış | Yok |
| Geri alma | ayarı geri çevirmek yeterli | Yok |

Bütün geçişler (TR↔EN↔DE) **simetrik ve veri taşımadan** çalışır. Yalnız ayar değişir.

### 3.4 Boş ve eksik içerik [Ö]

- **Yedek zinciri:** `istenen → ana dil → TR (depolama tabanı)`.
  - Örnek, ana dil EN iken DE sayfası: DE boşsa EN, EN de boşsa TR.
  - Bugünkü `resolveTranslatedField(translated, parent)` iki seviyeli; üç seviyeye çıkarılır.
- **Admin ana formu boş gelirse** (EN satırı yok): Ana dili değiştirmeden önce sihirbaz **çeviri doluluğu raporu** göstermeli. Örnek: "312 villanın 280'inde EN açıklama yok."
  - İsteğe bağlı: "TR'den kopyala" ön doldurma.
  - Ön doldurma **otomatik yapılmamalı**; aksi halde TR metin EN olarak işaretlenir.
- **noindex:** Faz 3'teki "çevirisi olmayan sayfa `noindex,follow`" kuralı, ana dil için de geçerli hale gelir. EN kökte EN içeriği olmayan villa TR fallback gösterir. Kök dilde noindex SEO açısından ciddi olduğu için **karar** gerekir.

---

## 4. Fiziksel taşıma (Yaklaşım 1) risk analizi [B + Ö]

| # | Risk | Neden (kod referansı) |
|---|---|---|
| 1 | **Yanlış dil etiketi** | EN çevirisi boş olan alanlar için ana kolon ya boş kalır (public EN sayfası boş metin) ya da TR değerle doldurulur (TR metin artık "EN" sayılır; sonraki geçişte TR satırına EN diye geri yazılmaz). Alan bazında "hangi dilde olduğu" bilgisi tutulmuyor |
| 2 | **Slug ve URL kırılması** | `villa.slug` (NOT NULL, unique [V]) taban slug'dır. Taşınırsa `toLocalizedSlug('tr')`, `rowsToSlugMap` (TR atlanır), `REDIRECTS_SQL` (`tr` = taban), proxy canlı kümesi (`LIVE_SLUGS_SQL` ana kolon slug'ı) ve `LocalizedSlugField` önizlemesi yanlış dil üretir |
| 3 | **Slug geçmişi kirlenmesi** | 103 trigger'ı ana tabloda slug değişimini `locale='tr'` geçmişi olarak kaydeder. Swap her içerik için sahte TR geçmişi üretir; ters geçişte döngü riski doğar (Faz 4 testleri bu senaryoyu kapsamıyor) |
| 4 | **Unique çakışma** | `(locale, slug)` partial unique: TR slug'ı `tr` satırına taşınırken başka bir TR satırının slug'ıyla çakışabilir; işlem yarıda kalır |
| 5 | **E-posta ve rezervasyon dili** | E-postalar TR şablon ve ana kolonla çalışıyor (`payment_method.name`, s.136). Swap sonrası TR e-postalarda EN ödeme yöntemi adları çıkar |
| 6 | **Admin listeleri ve raporlar** | ana kolonları okuyan bütün listeler (SSS, menü, kurallar, ödeme) dil değiştirir |
| 7 | **CHECK kısıtları** | `settings_translations` ve `site_popup_translations` için `('en','de')`: TR satırı için migration gerekir |
| 8 | **Uzunluk ve biçim kısıtları** | 102 slug CHECK `char_length 1..160` ve regex; çeviri kolonlarının nullable olması karşısında ana kolonların NOT NULL olması [V] swap'ı engelleyebilir |
| 9 | **Eş zamanlı düzenleme** | swap sırasında admin kaydı ya kaybolur ya üzerine yazar; bütün içerik tablolarının kilitlenmesi gerekir |
| 10 | **Süre ve atomiklik** | 13 tablo × N satır tek transaction'da; hata olursa geri alma; Supabase pooler zaman aşımı [V] |
| 11 | **Cache** | `getCachedVillas`, taxonomy, settings, slug haritası, ISR ve proxy: hepsi tam temizlik ister (Faz 4 `invalidatePublicRoutingCaches` yalnız routing'i kapsıyor) |
| 12 | **Geri dönüş** | her geri alma ters swap'tır; 1. riskteki etiket kaybı geri alınamaz |
| 13 | **ID ve ilişkiler** | **Korunur.** Swap satır değil kolon taşır; FK'ler (`villa_id`, rezervasyonlar, fiyatlar) etkilenmez |

**Değerlendirme:** Fiziksel taşıma ancak alan bazında dil etiketi, ayrı snapshot tablosu, tam kilit ve bütün slug altyapısının yeniden yazılmasıyla güvenli olur. Bu, Yaklaşım 2'den çok daha büyük bir iş ve çok daha yüksek risk demek.

---

## 5. Public site ve diğer sistemlere etki

| Alan | Yaklaşım 2 (mantıksal) | Yaklaşım 1 (fiziksel) |
|---|---|---|
| Public içerik okuma | `getTranslation` + yedek zinciri (istenen → ana dil → TR) | bütün okuyucular yeniden yazılır |
| URL ve root prefix | **değişmez** (Faz 2–4) | taban slug yeniden tanımlanır |
| Canonical / hreflang | değişmez; "çevirisi var mı" kontrolü ana dil satırına da bakar | yeniden |
| Sitemap / robots | `loadTranslatedContentLocales` TR'yi daima var sayıyor; ana dil için de doluluk kontrolü eklenir | yeniden |
| Slug yönlendirmeleri | değişmez | §4.2–4.4 |
| Arama / filtre | değişmez (`search_title` başlıktan; başlık çevrilmiyor) | değişmez |
| Villa detay | yedek zinciri | – |
| **Rezervasyon akışı ve fiyat** | **etkilenmez**: fiyat, müsaitlik ve kapora kolonları dil bağımsız; bu tablolar değişmez | etkilenmez (kolon taşımaz), ama `payment_methods.name` gibi etiketler değişir |
| **Rezervasyon e-postaları** | değişmez (TR, ana kolon) | **etkilenir** (§4.5) |
| **Ödeme** | dil bağımsız; ödeme yöntemi **etiketi** yalnız görünüm | etiket dili değişir |
| Harici rezervasyon / iCal | `villa.title` kullanır [V]; başlık çevrilmiyor | – |
| Admin işlemleri | ana form ve sekme eşlemesi | bütün formlar |
| Cache | ana dil değişiminde ek temizlik **gerekmez** (veri değişmiyor) | tam temizlik |
| API ve server action | çeviri action'ları dil whitelist'i `Exclude<Locale, root>` + TR yazımı | hepsi |

**Rezervasyon, fiyat ve ödeme için önlemler [Ö]:**
- (a) `reservations`, `manual_reservations`, `villa_prices`, `villa_discounts`, depozito ve kur tablolarına **hiçbir migration dokunmasın**.
- (b) E-posta ve voucher "TR + ana kolon" okumaya devam etsin. Yaklaşım 2'de ana kolon TR kalır, garanti budur.
- (c) Rezervasyon regresyon paketi (102 dosya, 1.599 test) her aşamada koşulsun.
- (d) Ödeme yöntemi adı e-postada ana kolondan okunmaya devam etsin.

---

## 6. Ortak veri katmanı: kurulabilir mi? [B + Ö]

Evet. Ortak altyapı zaten var: `TRANSLATION_ENTITY_CONFIG` (tablo ve parent FK), `lib/db/translation.repository.server.ts`, `getTranslation`/`getTranslationsForParents`.

Önerilen katman, **`lib/i18n/content-locale.server.ts`**:
- `CONTENT_STORAGE_BASE = "tr"`: depolama tabanı. Bugünkü `DEFAULT_LOCALE`'in içerik anlamı; açıkça adlandırılır.
- `FIELD_MAP[entity]`: çeviri alanı ↔ ana kolon. Örnek, villa: `description↔description`, `seo_title↔seo_title`, `slug↔slug`.
- `readContent(entity, id, locale)`: `locale === base` ise ana kolon, değilse çeviri satırı.
- `writeContent(entity, id, locale, patch)`: aynı ayrım. Ana kolon yazımı mevcut admin güncelleme yolundan (ör. villa wizard) geçer; servis yalnız yönlendirir.
- `resolvePublic(entity, row, translations, { requested, root })`: üç seviyeli yedek.
- `coverageReport(locale)`: her modülde hedef dil doluluk sayısı (sihirbaz preflight).

Ayar ve popup (CHECK en/de) bu katmanda özel durum. Ana dil TR değilken bu iki modülde TR ana kolonlarda kalır; ana dil satırı `en`/`de`. Mantıksal eşleme ile migration gerekmez.

---

## 7. Mimari seçenekleri

| Seçenek | Açıklama | Artı | Eksi | Geçiş riski |
|---|---|---|---|---|
| **A. Mantıksal eşleme (içerik servisi)** | Depolama aynı; admin ve public "dil → değer" servisinden | migration yok; anında geri alınabilir; rezervasyon ve e-posta dokunulmaz; bütün geçişler simetrik | depolama asimetrik kalır (TR özel); servis disiplini gerekir | **Düşük** |
| B. Ana dil değişiminde fiziksel swap | §3.1 | "ana kolon = ana dil" literal olarak sağlanır | §4'teki 12 risk; geri alma da swap | **Çok yüksek** |
| C. Merkezi EAV tablosu (`content_translations(entity, id, locale, field, value)`) | bütün diller tek tabloda | tam dinamik, yeni dil kolaysız | tip güvenliği kaybı, sorgu ve performans, bütün okuyucular yeniden; jsonb `sections` ve `stats` uyumsuz | **Yüksek** |
| **D. Simetrik çeviri modeli** | mevcut çeviri tablolarına `locale='tr'` satırları; ana metin kolonları **ayna** | şema tanıdık (082 CHECK zaten `tr` içeriyor); ana dil değişimi veri taşımaz; uzun vadede temiz | backfill migration; ayna senkronu (trigger) zorunlu; settings ve popup CHECK değişikliği | **Orta** (aşamalı, geri alınabilir) |
| E. D + "ana kolon = ana dil önbelleği" | D'den sonra ana kolonlar seçili ana dilin aynası olur | isteğin literal hali, ama kaynak çeviri tablosu | ayna yeniden hesaplanırken arama, e-posta ve slug katmanı kolonların anlamını takip etmeli | **Orta–yüksek** |

**[Ö] Sonuç:**
- **Kısa vade:** A, migration'sız; istenen admin ve public davranışın tamamı.
- **Uzun vade:** D. TR de sıradan bir çeviri satırı olur; "temel dil" kavramı veriden kalkar ve yalnız ayar olur.
- E yalnız ana kolonların literal olarak ana dili içermesi iş gereği zorunluysa, D'den sonra değerlendirilir.
- B önerilmez.

---

## 8. Aşamalı uygulama planı

| Aşama | Değişecek dosyalar | Tablolar | Migration | Veri taşıma | Test | Geri dönüş | Risk |
|---|---|---|---|---|---|---|---|
| **0. Kararlar** | – | – | – | – | – | – | – |
| **1. İçerik servisi (salt okuma tarafı)** | yeni `lib/i18n/content-locale.server.ts`; `get-translation.server.ts` (üç seviyeli `resolveTranslatedField` — eski imza korunur); `get-*-translations.server.ts` (TRANSLATABLE_LOCALES → `SUPPORTED_LOCALES − base`) | yok | yok | yok | yedek zinciri birim testleri; ana dil TR iken **birebir aynı çıktı** (snapshot) | kod geri al | Düşük |
| **2. Admin ana form ↔ ana dil eşlemesi** | ortak `TranslationLocaleTabs` + hook; 13 çeviri bileşeni; ana formlar (`villas/[id]/page.tsx`, `types/`, `blog/`, `pages/[id]/`, `features/`, `rules/`, `price-includes/`, `payment-methods/`, `faqs/`, `menu/`); `*-translations.action.ts` | yok | yok | yok | ana dil TR/EN/DE × modül: ana form doğru kaynağı okuyor ve yazıyor; TR sekmesi ana kolona yazıyor; EN sekmesi gizli (EN kökte) | özellik bayrağı (`settings` veya env) ile eski arayüz | Orta |
| **3. Yazma whitelist'i** | `app/services/*-translation.service.ts`: `isWritableLocale` = desteklenen diller − depolama tabanı (bugün de en/de; değişmez); TR yazımı ana kolon yoluna yönlendirilir | yok | yok | yok | TR yazma girişimi ana kolona gidiyor; yetki aynı | kod geri al | Düşük |
| **4. Sihirbaz preflight** | `lib/i18n/root-locale-change.ts` + `RootLocaleChangeField.tsx`: doluluk raporu | yok | yok | yok | eksik çeviri sayıları | – | Düşük |
| **5. Public yedek zinciri + SEO** | `content-availability.server.ts`, `sitemap-data.server.ts`, `*-metadata.ts` (ana dil satırı da doluluk kontrolüne girer) | yok | yok | yok | Faz 3–4 SEO testleri; EN kökte EN'siz villa davranışı (karar) | kod geri al | Orta |
| *(Burada istenen davranış tamamlanmış olur; depolama değişmemiştir)* | | | | | | | |
| **6. Simetrik model — şema** | migration **105**: `settings_translations`, `site_popup_translations` CHECK'e `tr` ekle (diğerlerinde zaten var) | 2 tablo | 105 | yok | CHECK testi izole PG | DROP/ADD CONSTRAINT | Düşük |
| **7. Simetrik model — backfill** | migration **106**: her çeviri tablosuna ana kolonlardan `locale='tr'` satırı (`INSERT … ON CONFLICT DO NOTHING`); slug için `tr` satırı slug'ı = taban slug | 12 çeviri tablosu (yalnız INSERT) | 106 | **kopya** (ana kolonlar değişmez) | satır sayısı = ana satır sayısı; içerik eşitliği sorgusu | `DELETE … WHERE locale='tr'` | Orta |
| **8. Ayna senkronu** | migration **107**: ana kolon ↔ `tr` satırı çift yönlü trigger (döngü korumalı) **veya** tek yön (yazma yalnız servisten) | 12 çift | 107 | – | eş zamanlı yazma, döngü, 103 slug-geçmişi trigger'ıyla etkileşim | DROP TRIGGER | **Yüksek** (en kritik adım) |
| **9. Okuyucuları çeviri tablosuna geçir** | `getTranslation` TR için de satır okur; `toLocalizedSlug`/`rowsToSlugMap`/`REDIRECTS_SQL` TR satırını kullanır | – | – | – | bütün paket + Faz 2–4 URL testleri + runtime smoke | özellik bayrağı | Yüksek |
| **10. (İsteğe bağlı) Ana kolonları ayna/önbellek olarak sabitle** (Seçenek E) | e-posta, arama, admin listeleri ana dil kararına göre | – | 108+ | – | – | – | Yüksek |

**Her aşamada sabit kalan testler:**
- rezervasyon, fiyat ve ödeme regresyon paketi;
- Faz 3–4 SEO ve yönlendirme testleri;
- tam paket (bugün 4.824 test), TypeScript, ESLint, production build.

---

## 9. Bulgular, varsayımlar ve açık noktalar

**Doğrulanan [B]:**
- 13 çeviri tablosunun yapısı ve CHECK kısıtları.
- TR temel varsayımının okuma, yazma, URL, slug geçmişi, sitemap ve e-posta katmanlarındaki konumları (§1.2).
- E-posta şablonlarında dil parametresi olmadığı.
- Ödeme yöntemi adının e-postada ana kolondan okunduğu.
- `villa.title`, bölge ve mesafe adlarının çevrilmediği.

**Varsayımlar ve doğrulanmayanlar [V]:**
- Ana tabloların tam adları (`villa_features`, `rule_items`, `price_include_items`, `menus`, `site_popup`) ve metin kolonlarının NOT NULL durumu. İlk tablolar arşiv migration'larında; bu incelemede okunmadı.
- Canlı veri hacmi ve çeviri doluluk oranı (veritabanına bağlanılmadı).
- iCal export'un hangi alanları kullandığı.
- Voucher içeriğinin tam alan listesi.

**Karar bekleyenler:**
1. Seçenek A (kısa vade) + D (uzun vade) onayı.
2. Yedek zinciri: `istenen → ana dil → TR` mi, yoksa bugünkü `istenen → TR` mi?
3. Ana dilde içeriği eksik sayfalar: fallback + `noindex` mi, fallback + index mi?
4. Çevrilmeyen alanlar (villa adı, bölge adı) çevrilmez olarak kalacak mı?
5. Rezervasyon e-postalarının dili: TR sabit mi, ana dil mi (ayrı bir proje)?

---

## 10. Açık öneri

**En güvenli ve uzun vadede en doğru mimari:**
- **Önce Seçenek A:** içerik dil servisi + admin ana form/ana dil eşlemesi + üç seviyeli yedek. Migration yok, veri taşıma yok, rezervasyon, fiyat ve ödeme dokunulmaz, her ana dil geçişi anında ve geri alınabilir.
- **Sonra Seçenek D:** TR'nin de çeviri tablolarına kopyalandığı simetrik model. Ek ve geri alınabilir migration'larla, özellik bayrağı arkasında.
- **Ana dil değişiminde fiziksel içerik taşıma (Seçenek B) yapılmamalı.**

---

## İşlem beyanı

Bu görevde kaynak kod, migration, veritabanı, commit, push ve deploy işlemi yapılmadı; canlı sunucuya veya veritabanına bağlanılmadı. Oluşturulan tek dosya bu rapordur. Çalışma ağacında ayrıca önceki görevden kalan, takip edilmeyen `Claude outputs/dinamik-ceviri-mimarisi-audit.md` dosyası var; bu görevde değiştirilmedi.
