# Faz 6 — Dalga 5 Raporu: SEO Tutarlılığı (canonical, hreflang, x-default, sitemap, robots, noindex)

**Tarih:** 2026-11-05
**Durum:** Dalga 5 tamamlandı. Kararlarınız (varsayılan başlık B, site geneli indeksleme kapalı, kısa süreli fırsatlar) uygulandı (§9). Bütün testler geçti. **Dalga 6'ya geçilmedi, onayınız bekleniyor.**
**Commit / push / deploy:** yapılmadı. Bütün değişiklikler çalışma ağacında ve commit edilmemiş durumda.

Çalışma sırası:

1. Analiz: bütün içerik türlerinde sayfa metadata'sı ile sitemap karşılaştırıldı (§2).
2. Merkezi SEO kuralı yazıldı; sitemap ve sayfa metadata'sı bu kurala bağlandı. Tam paket: 277 dosya, 0 başarısız.
3. İzole PG testleri, son tam paket, TypeScript, ESLint ve build kontrolleri.
4. Kayıtlı varsayılan SEO başlığı konusu analiz edildi. **Uygulanmadı**; kararınızı bekliyor (§5).

---

## 1. Özet

| Konu | Önce | Şimdi |
|---|---|---|
| **Blog / CMS sitemap dilleri** | Eski SQL kuralı: TR **daima** listeleniyordu; EN/DE yalnız çeviri tablosundan. Sayfa metadata'sı ise Dalga 3'ten beri merkezi kuralı kullanıyordu → iki kural ayrışıyordu. | Sitemap ve sayfa metadata'sı **aynı saf kuralı** kullanıyor (`public-seo-content.ts`): bir dil, yalnız o dilde sayfa indexlenebilir ve hreflang kümesindeyse sitemap'e giriyor. Eski SQL kaldırıldı. |
| **Villa sitemap** | Noindex bayrağı dışında her villa bütün aktif dillerde listeleniyordu; hiçbir aktif dilde içeriği olmayan (sayfası noindex,follow olan) villa da sitemap'teydi. | Hiçbir aktif dilde içeriği olmayan villa sitemap'te yok. **Başka aktif dilden yedek içerikle gösterilen villa indexlenebilir ve sitemap'te** (onaylı karar, değişmedi). |
| **Kategori sitemap** | Adı hiçbir aktif dilde olmayan (sayfası noindex,follow olan) kategori sitemap'teydi. | Bu kategori sitemap'te yok. Villa sayısı kuralı aynen korunuyor. |
| **Villa / kategori hreflang** | Hiç içeriği olmayan (noindex,follow) sayfada bile bütün diller için hreflang basılıyordu. | Bu durumda yalnız canonical basılıyor (blog/CMS'teki "çevrili olmayan dil hreflang dışı" ilkesiyle aynı). Kayıt `noindex` bayrağında hreflang davranışı **değişmedi**. |
| **Pasif diller** | Sitemap ve hreflang zaten aktif dillerle sınırlıydı. | Aynen. Ayrıca merkezi kural yalnız aktif dilleri kabul ediyor; testlerle kilitli. |
| **x-default** | Ana dil; içerik ana dilde yoksa ilk aktif dil. | Aynen; sitemap ve sayfada aynı fonksiyonla hesaplanıyor. |
| **Canonical, URL geçmişi, dil slug'ı yönlendirmeleri** | — | **Dokunulmadı.** Route tablosu build'de birebir aynı; Dalga 1–4 yönlendirme testleri geçiyor. |
| **robots.txt** | — | **Dokunulmadı.** |
| Rezervasyon, fiyat, takvim, ödeme, e-posta | — | Dokunulmadı. |

---

## 2. Analiz: içerik türlerine göre SEO kararları

| İçerik | Sayfa robots | Hreflang | Sitemap (önce) | Tutarsızlık | Çözüm |
|---|---|---|---|---|---|
| Ana sayfa | kök layout politikası | aktif diller | aktif diller | yok | — |
| Statik sayfalar (villalar, iletişim, teklif, blog dizini) | kök / sabit `index,follow` | aktif diller | aktif diller | yok | — |
| **Blog yazısı** | `noindex` bayrağı → `noindex,nofollow`; bu dilde çeviri yok → `noindex,follow`; içerik hiç yok → 404 | çevrili aktif diller | TR daima + eski SQL'deki EN/DE | **var:** TR'si boş kayıtta TR listeleniyordu; hiç içeriği olmayan (404) kayıt listeleniyordu; `pages.content` / bilinçli boş gövde gibi merkezi kurallar sitemap'te yoktu | aynı merkezi kural |
| **CMS sayfası** | aynı (çevrili → açık `index,follow`) | çevrili aktif diller | aynı eski SQL | **var** (aynı nedenler) | aynı merkezi kural |
| **Villa** | bayrak → `noindex,nofollow`; hiçbir aktif dilde içerik yok → `noindex,follow`; yedekle içerik varsa index | aktif diller | bayrak dışında aktif diller | **var:** içeriksiz villa sitemap'te ve hreflang'deydi | sitemap'ten çıkarıldı, hreflang basılmıyor |
| **Kategori** | villa yok veya ad hiçbir aktif dilde yok → `noindex,follow` | aktif diller | ≥1 villalı kategori, aktif diller | **var:** adsız kategori sitemap'te ve hreflang'deydi | sitemap'ten çıkarıldı, hreflang basılmıyor |
| Bölge | kök politikası; villa yoksa sitemap dışı | aktif diller | ≥1 villalı grup kökü | yok | — |
| Arama, favoriler, rezervasyon, token linkleri | robots.txt `Disallow` / sayfa `noindex` | — | yok | yok | — |

**Kod dışı gözlemler (değiştirilmedi; §6'da kararınıza sunuldu):** site geneli `robots_index`, kısa süreli fırsat sayfaları, robots.txt'teki pasif dil yolları ve kategori villa sayacı.

---

## 3. Uygulanan kurallar

### 3.1 Tek kaynak: `lib/i18n/content/public-seo-content.ts` (yeni, saf)

| Fonksiyon | Kural |
|---|---|
| `textAvailableLocales` | Blog/CMS: başlık, gövde veya özet o dilde **gerçekten** dolu (`isFallback=false`). Tek dilli sitede aktif diller. `loadAvailableLocales` (sayfa metadata'sı) artık bu fonksiyonu kullanıyor. |
| `textIndexableLocales` | Blog/CMS sitemap dilleri. Kayıt `noindex` ise boş. İçerik hiçbir aktif dilde yoksa (sayfa 404) boş. Aksi halde çevrili diller. |
| `villaIndexableLocales` | Villa: bayrak veya hiç içerik yok → boş. Aksi halde bütün aktif diller (**yedek dil noindex sebebi değil**). |
| `categoryIndexableLocales` | Kategori: ad var ve villa sayısı ≥1 → aktif diller. |
| `hasNoContentAnywhere`, `contentHreflangAvailability` | Villa/kategori sayfasında hreflang kararı. |
| `loadContentsByLocale` | Dil başına **tek batch** okuma (N+1 yok). |

Mevcut onaylı kurallar **değişmedi**: blog/CMS'te o dilde çeviri yoksa `noindex,follow`; villada yedek içerikle index; kategori kuralları; kayıt `noindex` bayrakları.

### 3.2 Sitemap (`app/sitemap.ts`)

- **Blog ve CMS:** her yazı/sayfa için aktif dil başına tek batch merkezi okuma, ardından `textIndexableLocales`.
  - `pages.content` ek yedeği ve bilinçli boş gövde artık sitemap'te de geçerli (Faz 3.1 / Faz 5).
- **Villa:** ana dilde tek batch (içerik varlığı dilden bağımsız); `villaIndexableLocales`.
- **Kategori:** `getTaxonomyLandingSitemapPaths` artık kategori kimliğini de döndürüyor (ek alan); ad, ana dilde tek batch okunuyor. Bölge aynen.
- **Kimlik eşlemesi:** Merkezi okuma kimlikle çalışıyor; mevcut repository projeksiyonları kimlik taşımıyor. Bu yüzden `sitemap-data.server.ts`'e iki salt okunur SELECT eklendi (taban slug → kimlik; SQL `lib/i18n/sitemap-sql.ts` içinde). Eski "çeviri var" SQL'i kaldırıldı.
- **Okuma hatasında bozulma modu:** Merkezi servis hata anında boş sonuç döner. Sitemap bunu "içerik yok" sanıp bütün villaları/yazıları atmasın diye okuyucu hatayı görünür kılıyor (`public-seo-content.server.ts`). Hata durumunda:
  - villa / kategori → bütün aktif diller (eski davranış; kayıt var);
  - blog / CMS → yalnız ana dil (eski "yalnız taban dil" bozulmasının simetrik karşılığı);
  - kayıt `noindex` bayrakları bu modda da geçerli.
- Pasif dil hiçbir adımda girdi olarak kullanılmıyor.

### 3.3 Sayfa metadata'sı

- **Villa detay:** hiçbir aktif dilde içerik yoksa (`noindex,follow`) hreflang yok, canonical kendi URL'si. Robots kararı aynen.
- **Kategori:** ad hiçbir aktif dilde yoksa hreflang yok. Robots kararı ve "villa yok" durumu aynen.
- **Blog / CMS:** davranış aynı; karar fonksiyonu sitemap ile ortak.

---

## 4. Değişen ve eklenen dosyalar

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/content/public-seo-content.ts` (**yeni**, saf) | §3.1. |
| `lib/i18n/content/public-seo-content.server.ts` (**yeni**) | Sitemap için hata-görünür merkezi okuyucu (aynı çekirdek ve depo). |
| `lib/i18n/sitemap-sql.ts` (**yeni**) | Kimlik eşleme SQL sabitleri. |
| `lib/i18n/sitemap-data.server.ts` | Eski çeviri SQL'i kaldırıldı; `loadSitemapIds` eklendi. `loadNoindexSlugs` aynen. |
| `app/sitemap.ts` | Merkezi kurala bağlandı. Statik sayfalar, bölgeler, URL üretimi, öncelik ve sıklık değerleri aynen. |
| `lib/taxonomy-landing.server.ts` | `getTaxonomyLandingSitemapPaths` dönüşüne ek `categoryIds` alanı. |
| `lib/i18n/content/public-text-content.ts` | `loadAvailableLocales` ortak kuralı kullanıyor (davranış aynı). |
| `app/(public)/_routes/villa.tsx`, `app/components/search/TaxonomyLandingPageBody.tsx` | İçeriksiz sayfada hreflang yok. |

Önceki hâller: `$HOME/faz6-d5-yedek/`.

**Testler:**

- **Yeni:**
  - `tests/unit/faz6-dalga5-seo.test.ts` (21)
  - `tests/integration/content-faz6-dalga5-pg.test.ts` (16)
  - `tests/fixtures/faz6/sitemap-content.ts`: sitemap okuyucusu sahtesi (gerçek alan kuralları).
- **Güncellenen:**
  - `sitemap-locale-alternates`, `phase3-final-404-robots`: eski SQL sahtesi yerine merkezi veri.
  - `taxonomy-landing`: kaynak kilidi; adsız kategoride hreflang yok, adlıda bütün diller.
  - `faz6-dalga2-villa`: içeriksiz villada hreflang yok; yedekli villada ve bayrakta aynen.
  - `content-read-server`: Faz 3 sınırı; `seo` modülü ve `app/sitemap.ts` açık listede.
- **Beklentiler gevşetilmedi.** Değişen her beklenti onaylı kurala karşılık geliyor; eski "çeviri var" SQL sahteleri merkezi içerik verisiyle değiştirildi.

---

## 5. Kayıtlı varsayılan SEO başlığı: analiz (karar B verildi ve uygulandı, §9.1)

**Mevcut durum:**

- Kök layout (`app/_root/root-document.tsx` > `buildRootMetadata`), kendi başlığını vermeyen sayfalara `title`, `description`, `openGraph` ve `twitter` alanlarını miras bırakıyor.
- Değeri **`settings.default_meta_title` / `default_meta_description` ana tablo kolonundan** okuyor. Bu kolon TR içeriği taşıyor (TR satırı bu kolonun aynası).
- Değer yoksa Dalga 4 son düzeltmesiyle ana dilin sözlük yedeği kullanılıyor.
- Public kök layout (`app/(public)/[lang]/layout.tsx`) sayfanın dilini **biliyor** (`lang` parametresi) ama `buildRootMetadata()`'yı dilsiz çağırıyor.
- Ana sayfa ise aynı alanları Dalga 4'ten beri merkezi servisten, tekil kayıt kuralıyla okuyor.

**Etkisi:**

- Başlığı olmayan sayfalar varsayılan başlığı miras alıyor. Örnek: `/arama` (robots.txt'te kapalı).
- Ayrıca kendi başlığını verip açıklama veya OG alanı vermeyen sayfalar o alanları miras alıyor.
  - Ana dil TR iken EN/DE sayfalarında, çeviri girilmiş olsa bile Türkçe kayıtlı değer görünüyor.
  - Ana dil EN/DE iken bütün dillerde TR kolonundaki değer görünüyor; değer ana dilin değil.
- Admin kök layout'u ve `global-not-found` da aynı fonksiyonu kullanıyor (admin, başlığı `title.absolute` ile eziyor).

**Seçenekler:**

| | Öneri | Etki |
|---|---|---|
| **A** | Değiştirme. | Mevcut SEO aynen kalır; asimetri sürer. |
| **B** (önerim) | `buildRootMetadata(locale)`: public layout sayfa dilini geçirir. Değer `getPublicSettingsTexts(locale)` ile okunur (tekil kayıt kuralı: kendi dili → ana dil satırı aynen → diğer aktif diller; pasif dil yok); yoksa ana dilin sözlük yedeği. Admin ve 404 sayfası ana dille çağırır. | **Ana dil TR iken TR sayfaları birebir aynı.** EN/DE sayfalarında, çevirisi girilmişse miras başlık/açıklama o dile döner; girilmemişse TR değeri kalır. Ana dil EN/DE iken ana dilin değeri kullanılır. Statik/ISR korunur; istek başlığı/çerez okunmaz. |
| **C** | Bütün sayfalarda yalnız ana dilin değeri (`getPublicSettingsTexts(root)`). | Ana dil TR iken hiçbir şey değişmez; ana dil EN/DE iken ana dilin değeri. Sayfa diline göre çeviri yapılmaz. |

**Risk:**

- B ve C mevcut EN/DE çıktısını değiştirir; arama motorları başlık değişikliğini yeniden işler.
- Değişiklik yalnız miras alan alanları etkiler; kendi başlığı olan sayfalar etkilenmez.

---

## 6. Gözlemler (kod değiştirilmedi; kararınıza sunuluyor)

1. **Site geneli `robots_index=false`:** sitemap'in bu ayar kapalıyken de URL listelemesi → **çözüldü (§9.2)**.
2. **Kısa süreli fırsat sayfaları:** indexlenebilir ama sitemap'te yoktular → **çözüldü (§9.3)**.
3. **robots.txt:** `Disallow` listesi pasif dillerin yollarını da içeriyor. Bu sitemap/hreflang değil, zararsız (pasif dil URL'leri zaten 404). Pasif dilde içerik sızıntısı yok.
4. **Kategori villa sayısı:** Sitemap'te kategori kapak sayacı, sayfada `getCachedVillas` süzmesi kullanılıyor. İkisi de "aktif ve silinmemiş" villayı sayıyor. Kural Dalga 5'te değiştirilmedi.
5. **Kayıt `noindex` bayrağı:** Villa, blog ve CMS'te bayraklı sayfa sitemap'te yok, ancak sayfada hreflang basılmaya devam ediyor. Bu, bütün türlerde mevcut ortak davranış ve Dalga 5'te bilerek değiştirilmedi.

---

## 7. Test sonuçları

### 7.1 Eşdeğerlik (sayfa metadata'sı ↔ sitemap)

- **Saf, gerçek merkezi çekirdekle:**
  - Blog ve CMS için ayrı ayrı 125 içerik senaryosu × 3 ana dil × 7 aktif dil kümesi × noindex açık/kapalı = **5250 karar**. Senaryolar: tam, yalnız başlık, boş, bilinçli boş gövde, satır yok.
  - Sayfanın kararı (404 → `loadAvailableLocales` → `textRobots`) ile sitemap kararı **birebir**.
  - Pasif dil hiçbir sonuçta yok.
- **Villa:** 64 içerik kombinasyonu × 3 ana dil × 7 dil kümesi × bayrak. Sayfa robots kararı ile sitemap birebir; yedek dilden içerikli villa indexleniyor.
- **İzole PG** (gerçek SQL, iki şablonun kopyaları): şablon verisi ve test kayıtlarının tamamında, ana dil TR/EN/DE ve 5 aktif dil kümesinde blog/CMS sitemap dilleri sayfa metadata'sıyla **birebir**. Villa ve kategori de aynı.
- **Eski SQL kuralı ↔ yeni kural** (ana dil TR, üç dil):
  - Kayıtların 11'inde sonuç aynı, 4'ünde farklı.
  - 4 farkın hepsi "TR çevrili değil" sınıfında: test içinde oluşturulmuş, yalnız EN veya yalnız DE içerikli kayıtlar. Eski kural bunların TR sürümünü listeliyordu ama sayfa TR'de `noindex,follow`.
  - **Şablon kayıtlarında fark 0.**

### 7.2 Davranış testleri (ana dil TR, EN, DE ayrı ayrı)

- **Villa:** tam ve yalnız-yedek içerikli villa bütün aktif dillerde; içeriksiz ve bayraklı villa yok.
- **Blog / CMS:** yalnız gerçek çevirisi olan diller; içeriği hiç olmayan yok; tek dilli kayıtta hreflang yok.
- **Kategori:** adsız kategori yok; adlı kategori bütün aktif dillerde.
- **x-default:** ana dilin URL'si.
- **Pasif dil:** her ana dil ve pasif dil kombinasyonunda hiçbir URL'de ve hreflang'de yok; yalnız pasif dilde içeriği olan yazı listelenmiyor.
- **Bozulma modu** (okuma veya kimlik hatası) ve çoklu dil kapalı (yalnız ana dil, hreflang yok).

### 7.3 Tam paket ve diğer kontroller (kullanıcının cihazında)

| Kontrol | Sonuç |
|---|---|
| Birim test paketi (8 parça; uygulamadan sonra ve son değişiklikten sonra iki kez) | **277 dosya; 5438 test geçti, 11 atlandı, 0 başarısız.** |
| TypeScript | Kaynakta hata yok (yalnız eski `.next` kaynaklı 61 hata). |
| ESLint | 0 hata, 194 uyarı (taban). |
| `next build --webpack` (`.env*` hariç kopya) | Başarılı. Route tablosu önceki build ile **birebir aynı** (200 satır); uyarılar aynı. Build çıktısı silindi. |

### 7.4 İzole PostgreSQL (bulut test alanı)

| Test dosyası | Sonuç |
|---|---|
| `content-faz6-dalga5-pg` (yeni; `pages.content` yalnız kopyaya eklendi) | **16/16** (ilk denemede) |
| `content-faz6-dalga4-pg` | 40/40 |
| `content-faz6-dalga3-pg` | 34/34 |
| `content-faz6-dalga2-pg` | 34/34 |
| `content-faz6-dalga1-pg` | 22/22 |
| `content-faz5-pg` | 9/9 |
| `content-faz5-dalga2-pg` | 25/25 |
| `content-faz5-son-kontroller-pg` | 36/36 |
| `content-read-pg` | 14/14 |
| `content-write-pg` | 18/18 |
| **Toplam** | **248/248** |

- Her dosya, `m108clean` ve `m106` şablonlarından yeni oluşturulan tek kullanımlık kopyalarda (`f6d5_*`, 18 kopya) çalıştı. Kopyaların hepsi silindi.
- Kalan veritabanları: `f6b m101 m103 m105 m106 m108clean postgres template0 template1`.

**Şablon bütünlüğü** (önce ve sonra ölçüldü):

| Şablon | Şema md5 | Veri md5 | Kayıtlı değerle |
|---|---|---|---|
| `m106` | `497e4d7fa0d9bae8` | `b530b0521a4568ca` | aynı ✅ |
| `f6b` | `577c9109478f6b90` | `5193f62b49a38826` | aynı ✅ |
| `m108clean` | `577c9109478f6b90` | `b530b0521a4568ca` | aynı ✅ |

`pg_stat_database` insert/update/delete sayaçları `0/0/0`.

**Buluta aktarılan dosyalar:** `public-text-content.ts`, `public-seo-content.ts`, `sitemap-sql.ts` ve yeni PG testi. md5 değerleri cihazdakiyle birebir. `.env` veya gizli bilgi aktarılmadı.

---

## 9. Kararlarınızın uygulanması (2026-11-05)

### 9.1 Kayıtlı varsayılan SEO başlığı — karar B

**Kural** (kendi başlığını vermeyen sayfaların miras aldığı `title`, `description`, OG ve Twitter alanları):

1. Sayfanın kendi (aktif) dilindeki kayıtlı değer.
2. Yoksa ana dilin kayıtlı değeri. Ana dilde bilerek boş bırakılmışsa 3. adıma geçilir.
3. O da yoksa merkezi sözlükte ana dilin karşılığı (`home.seo.metaTitleFallback` / `metaDescriptionFallback`).

- Pasif dil hiçbir adımda kullanılmıyor. Pasif dil sayfası istenirse ana dilin değeri döner (sayfa zaten 404).
- Ana dil satırı hiç yoksa (ör. ana dil EN ama EN değeri girilmemiş) **başka dile düşülmüyor; sözlüğe gidiliyor**. Talimatınızdaki sırayla birebir.

**Uygulama:**

- `app/(public)/[lang]/layout.tsx` sayfanın dilini `buildRootMetadata(locale)` ile geçiriyor.
- `buildRootMetadata` değeri merkezi servisten okuyor (`getPublicSettingsTexts(locale, { otherActiveFallback: false })`).
- Admin kökü ve 404 sayfası dil vermiyor; ana dil kullanılıyor.
- `resolveSingletonFields` fonksiyonuna "diğer aktif dillere düşme" adımını kapatan isteğe bağlı bir seçenek eklendi. Varsayılan davranış ve Dalga 4'te onaylanan ana sayfa kuralı değişmedi.

**TR davranışı:** Ana dil TR iken TR sayfaları eskisiyle **birebir** aynı. TR satırı ana kolonun aynası; satır yoksa ana kolon kullanılıyor. PG testinde gerçek yazımla doğrulandı.

**Değişen çıktı:**

- Ana dil TR iken EN/DE sayfaları: kendi dilinde değer girilmişse artık o gösteriliyor; girilmemişse eskisi gibi TR değeri.
- Ana dil EN/DE iken: ana dilin değeri, o da yoksa ana dilin sözlük metni gösteriliyor.

**Not:** Ana sayfa (Dalga 4'te onaylanan tekil kayıt kuralı), ana dil satırı **hiç yokken** diğer aktif dillere bakıyor; kök layout artık bakmıyor. Bu fark yalnız o uç durumda oluşuyor. İsterseniz ana sayfa da aynı sıraya hizalanabilir.

### 9.2 Site genelinde indeksleme kapalı (`settings.robots_index = false`)

**Bulgu:** Kök layout bu durumda `noindex` basıyordu. Ancak kendi `robots` alanını veren sayfalar kök layout'u eziyordu ve bu sayfalar **`index` demeye devam ediyordu**: CMS (`index,follow`) ve teklif sayfası (`index,follow`). Sitemap de URL listeliyordu.

**Uygulama:**

- **Yeni `lib/seo-site-policy.ts`** (saf): ayar açıkken sayfa kararına dokunulmuyor. Kapalıyken her sayfada `index:false` uygulanıyor; sayfanın `follow` kararı korunuyor. `robots` vermeyen sayfaya dokunulmuyor (kök layout zaten noindex basıyor).
- **Dil dispatcher'ı** (`lib/i18n/routing/locale-route.tsx`): hem yeni hem eski modül tipinin metadata'sı bu politikadan geçiyor.
  - Bütün public `[lang]` sayfaları dispatcher üzerinden çalışıyor; bu, kaynak testiyle kilitli.
  - Böylece politika villa, kategori, bölge, blog, CMS, ana sayfa, statik sayfalar ve kısa süreli fırsatları kapsıyor.
  - Ayar okunamazsa sayfa kararı aynen kalıyor.
- **Sitemap:** ayar kapalıyken hiçbir URL döndürmüyor (`[]`).
- **robots.txt — bilerek değiştirilmedi:**
  - robots.txt tarama kuralıdır, `noindex` ise indeksleme kararıdır.
  - `Disallow: /` eklemek tarayıcının sayfadaki `noindex`'i görmesini engeller; dış linkli URL'ler indekste kalabilir. Bu tam olarak sizin uyardığınız karışıklık.
  - Bu yüzden ayar kapalıyken robots.txt kuralları ve sitemap referansı aynı kalıyor. Testle kilitli: kapalı/açık çıktıları birebir aynı, `Disallow: /` yok.
- `robots_follow` ve sitemap: `follow` kapalı ama `index` açıkken sayfalar indexlenebilir, dolayısıyla sitemap'te kalıyorlar (değişmedi).

### 9.3 Kısa süreli fırsatlar sitemap'te

**Kaynak:** ana sayfa bölümüyle aynı (`get_short_gap_counts`).

**Listelenen URL:**

- Villa sayısı > 0 olan ay + gece çiftleri.
- Gece değeri geçerli.
- Ay slug'ı **bugün aynı aya** çözülüyor. Slug yalnız ayı taşıdığı için 12+ ay sonraki bir kova bugün başka bir yılın sayfasını açar; bu yüzden listelenmiyor.
- Villası olmayan (boş durum gösteren) sayfa listelenmiyor.

**Diller:**

- Sayfa metadata'sıyla ortak karar (`shortGapsSeoLocales`): geçerli parametre ve o dilde gerçek çeviri (sözlükte ay adı ve başlık).
- Yalnız aktif diller; pasif dil yok.
- URL'ler dilin segmentiyle üretiliyor: `/kisa-sureli-tarihler`, `/en/short-stays`, `/de/kurzaufenthalte`.
- Hreflang ve x-default, sayfa metadata'sıyla birebir (testle).

**Diğer:**

- Sayfa metadata'sı `robots` vermiyor; kök politika ve §9.2 uygulanıyor.
- Okuma hatasında sitemap'in geri kalanı dönüyor (fail-soft).
- Kısa süreli fırsat tabloları şablon veritabanlarında olmadığı için bu bölüm birim testlerle doğrulandı.

### 9.4 Sitemap ↔ sayfa metadata tutarlılığı (bütün içerik türleri)

| İçerik | Sitemap dili ⇔ sayfa | Site geneli kapalı | Doğrulama |
|---|---|---|---|
| Blog, CMS | indexlenebilir + hreflang kümesi | sitemap boş, sayfa `index:false` | 5250 saf senaryo + PG (gerçek SQL), §7.1 |
| Villa | içerik var (yedekle dahil) → aktif diller | aynı | 64 kombinasyon + PG |
| Kategori | ad var + villa ≥1 | aynı | birim + PG |
| Bölge, ana sayfa, statik sayfalar | aktif diller (sayfa hreflang'i aynı) | aynı | mevcut sitemap testleri |
| Kısa süreli fırsatlar | villalı ay+gece, çevirili aktif diller | aynı | §9.3 testleri |
| Varsayılan başlık (miras) | — | — | birim + PG |

### 9.5 Değişen ve eklenen dosyalar (bu adım)

| Dosya | Değişiklik |
|---|---|
| `lib/seo-site-policy.ts` (**yeni**, saf) | Site geneli indeksleme politikası. |
| `lib/i18n/routing/locale-route.tsx` | Dispatcher metadata'sına site politikası (iki modül tipi). |
| `app/sitemap.ts` | İndeksleme kapalıysa `[]`; kısa süreli fırsat girdileri. |
| `lib/short-gaps.helpers.ts` | `shortGapSitemapPaths` (saf, ek fonksiyon). |
| `app/components/short-gaps/short-gaps-metadata.ts` | `shortGapsSeoLocales` (ortak dil kararı, ek fonksiyon). Sayfa metadata'sı aynı. |
| `app/_root/root-document.tsx` | `buildRootMetadata(locale?)`: karar B. |
| `app/(public)/[lang]/layout.tsx` | Sayfa dilini geçiriyor. |
| `lib/i18n/content/public-shared-content.ts` | `resolveSingletonFields` için isteğe bağlı `otherActiveFallback` seçeneği (varsayılan değişmedi). |
| `lib/i18n/content/public-shared-content.server.ts` | `getPublicSettingsTexts` seçeneği iletiyor. |

**Testler:**

- **Yeni:** `tests/unit/faz6-dalga5-site-seo.test.tsx` (22).
- **Genişletilen:** `tests/integration/content-faz6-dalga5-pg.test.ts` (+2 → 18; gerçek SQL ile karar B).
- **Güncellenen:** `tests/unit/faz6-dalga4-root-metadata.test.ts`. Kayıtlı değer artık dil satırından okunuyor; beklenti, ana dilin satırına konulan değerle aynı. Gevşetme yok.
- **Değiştirilmeyen:** `robots.ts`, canonical, URL geçmişi ve slug yönlendirmeleri.

Önceki hâller: `$HOME/faz6-d5b-yedek/`.

### 9.6 Test sonuçları (bu adım)

| Kontrol | Sonuç |
|---|---|
| İlgili testler (`faz6-dalga5-site-seo`, `faz6-dalga4-root-metadata`, `html-lang-layout`, `faz6-dalga4-home`) | geçti |
| Tam birim test paketi | **278 dosya; 5460 test geçti, 11 atlandı, 0 başarısız.** |
| TypeScript | Kaynakta hata yok. |
| ESLint | 0 hata, 194 uyarı (taban). |
| `next build --webpack` | Başarılı. Route tablosu birebir aynı (200 satır). Tek yeni günlük satırı, build ortamında DB olmadığı için beklenen fail-soft uyarısı (`[sitemap] short gaps fetch error: DATABASE_URL …`). Build çıktısı silindi. |
| İzole PG (10 dosya, 18 yeni tek kullanımlık kopya `f6d5_*`) | **250/250** |

- **İlk deneme:** Yeni PG testi ilk koşuda 2 hata verdi. Neden test beklentisindeki bir hataydı: şablonda TR varsayılan başlığı NULL olduğu için, ana dil EN iken TR sayfasının doğru biçimde ana dile (EN) düştüğü durum beklentide yanlış yazılmıştı. Kod hatası değildi. Test, TR ve EN değerlerini kopyada açıkça yazacak şekilde düzeltildi; bütün kopyalar silinip yeniden oluşturuldu ve 250/250 geçti.
- Kopyaların hepsi silindi.
- **Şablon parmak izleri değişmedi:**
  - `m106`: `497e4d7fa0d9bae8` / `b530b0521a4568ca`
  - `f6b`: `577c9109478f6b90` / `5193f62b49a38826`
  - `m108clean`: `577c9109478f6b90` / `b530b0521a4568ca`
- **`pg_stat_database` sayaçları:** `m106` ve `m108clean` 0/0/0.
  - `f6b` `tup_updated=17` gösteriyor. Ayrıntı: bunun tamamı `pg_catalog.pg_statistic` satırı. Kaynak, PostgreSQL yeniden başlatıldıktan sonra çalışan otomatik ANALYZE işlemi. Bu dalgada `f6b`'den kopya oluşturulmadı ve ona bağlanılmadı. Kullanıcı tablolarında değişiklik yok; veri parmak izi aynı.
- **Buluta aktarılan dosyalar:** `public-shared-content.ts` ve PG testi; md5 değerleri cihazla birebir. `.env` aktarılmadı.

---

## 8. Güvenlik beyanı

- Migration çalıştırılmadı. 109 oluşturulmadı. `content_mirror_mode()` değiştirilmedi.
  - Not: Faz 4 yazma testi bu fonksiyonu yalnız tek kullanımlık kopya içinde, mevcut test tasarımı gereği geçici olarak değiştiriyor. Kopya silindi.
  - `pages.content` test kolonu yalnız tek kullanımlık kopyalara eklendi.
- `m106` ve `m108clean` şablonları değiştirilmedi; PostgreSQL testleri yalnız yeni oluşturulan tek kullanımlık kopyalarda yapıldı.
- Canlı DB'ye, staging DB'ye, sunucuya ya da Coolify'a bağlanılmadı.
- Commit, push ve deploy yapılmadı.
- Rezervasyon, fiyat, takvim, ödeme ve e-posta koduna dokunulmadı. Canonical, URL geçmişi, dil slug'ı yönlendirmeleri ve robots.txt değişmedi.
- Kullanıcının mevcut değişiklikleri korundu; değiştirilen dosyaların önceki hâlleri yedeklendi. Hiçbir dosya silinmedi.
- §5'teki kayıtlı varsayılan başlık değişikliği, kararınız (B) üzerine uygulandı (§9.1).
- Dalga 6'ya geçilmedi.
