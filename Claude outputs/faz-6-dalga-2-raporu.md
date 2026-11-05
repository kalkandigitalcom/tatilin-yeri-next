# Faz 6 — Dalga 2 Raporu: Villa, Kategori ve Bölge Public Sayfaları

**Tarih:** 2026-11-04
**Durum:** Dalga 2 tamamlandı. Bütün testler geçti. **Dalga 3'e geçilmedi, onay bekleniyor.**
**Commit / push / deploy:** yapılmadı. Bütün değişiklikler çalışma ağacında, commit edilmemiş hâlde.

Çalışma sırası talimattaki gibiydi:

1. Villa listeleme ve detay sayfaları geçirildi; tam paket 268 dosya ile yeşil.
2. Kategori sayfaları geçirildi; tam paket 269 dosya ile yeşil.
3. Bölge sayfaları geçirildi; son doğrulamalar yapıldı.

Her aşamanın sonunda tam birim paketi çalıştırıldı. Bir aşama yeşil olmadan sonrakine geçilmedi.

---

## 1. Özet

| Alan | Ne değişti | Ne değişmedi |
|---|---|---|
| **Villa detay** | Açıklama, SEO başlığı ve SEO açıklaması `getContent("villa")` ile okunuyor. Özellik, kural ve fiyata dahil adları `getContentMany` ile okunuyor. Robots kuralı bütün dillerde aynı. JSON-LD URL'leri sayfanın diline göre. Tek route modülü. | Fiyat, indirim, takvim ve müsaitlik, harici rezervasyon (iCal), galeri ve sırası, kapasite, mesafeler (değer ve ikon), ilişki sorguları, yorumlar, villa adı (özel isim), bölge adı (özel isim), gövde bileşeni. |
| **Villa listeleme** | Kart rozeti ve sidebar kategori adları merkezi servisten okunuyor. ItemList JSON-LD URL'leri dile göre. Tek route modülü. | Villa sorgusu, filtreleme, sıralama (kura göre fiyat dahil), sayfalama, kartlar, filtre değerleri. |
| **Benzer villalar** (detayın içinde) | Rozet merkezi servisten okunuyor. | Benzer villa sorgusu, sıralama, fiyat. |
| **Kategori** | Kategori adı `getContentMany("villa_type")` ile okunuyor. Ad hiçbir aktif dilde yoksa sözlükteki genel etiket gösteriliyor ve sayfa `noindex,follow` alıyor. Tek route modülü. | Kategori ve villa ilişki sorguları, sayfa yapısı, canonical ve sayfalama kuralı. |
| **Bölge** | Yalnız tek route modülüne geçildi. | Bölge adları ve slug'ları dil bağımsız özel isim (Phase 10I). Bölge sorguları, grup kuralı ve ilişkiler aynen kaldı. Merkezi içerik servisine girmiyor. |
| **URL ve yönlendirme** | — | URL'ler, 308 ve 307 kuralları, slug geçmişi ve başka dilin slug'ı kuralı (K3) Dalga 1'deki gibi. Build route tablosu öncekiyle birebir aynı. |

---

## 2. Mevcut route ve okuyucu haritası (geçiş öncesi)

| Route | Eski modüller | Eski çevirilebilir içerik okuması |
|---|---|---|
| `villa` (`/kiralik-villa/:slug`, `/en/villa/:slug`, `/de/villa/:slug`) | 3 ayrı `locale-page.tsx` (404 satır). EN ve DE neredeyse aynı, TR farklı. | TR: ana tablo, çeviri katmanı hiç çalışmıyor. EN/DE: `get-villa-translation.server` ve `getTranslationsForParents`. Yedek her zaman TR ana kolonu. |
| `villas` (`/kiralik-villalar`) | 3 ince modül, ortak `KiralikVillalarPageBody`. | Rozet: `getVillaBadgesByLocale` (TR'de sorgu yok, yedek `villa.badge`). Kategori adı: `getVillaTypeNamesByLocale` ve `resolveTaxonomyName` (TR kısayolu). |
| `villaType` (`/villa-turleri/:slug`) | 3 ince modül, ortak `TaxonomyLandingPageBody`. | Ad: TR'de ana tablo, EN/DE'de eski çeviri okuyucusu ve TR yedeği. |
| `region` (`/bolgeler/:slug`) | 3 ince modül, ortak `TaxonomyLandingPageBody`. | Yok (özel isim). |
| `VillaDetailBody` → `SimilarVillasSection` | Ortak bileşen. | Rozet: `getTranslationsForParents` (TR'de sorgu yok, yedek `v.badge`). |

---

## 3. Merkezi okuma kuralları (uygulanan)

- **Okuma yolu:** Dispatcher dil slug'ını teknik anahtara çeviriyor. Modül villayı teknik anahtarla buluyor (`getVillaBySlug`), ardından **kimlikle** merkezi servisi çağırıyor.
  - Teknik anahtar hiçbir yerde değiştirilmiyor. PG testi bunu içerik yazımı sonrasında da doğruluyor.
- **Yedek sırası (Faz 3):** istenen dil → ana dil → diğer aktif diller.
  - Pasif diller zincire girmiyor.
  - TR'ye özel kısayol ve "TR ana kolonuna düş" yedeği kaldırıldı.
- **Boş değer:** Boş veya yalnız boşluk olan değer "yok" sayılıyor (eski `resolveTranslatedField` ile aynı ilke).
- **Liste öğeleri** (özellik, kural, fiyata dahil, rozet): Hiçbir aktif dilde yoksa gizleniyor (Faz 3.1 "list" kuralı). Koleksiyon başına **tek** okuma yapılıyor, N+1 yok.
- **SEO açıklaması:** Faz 3.1 `resolveVillaSeoDescription` kuralı kullanılıyor.
  - Önce istenen dilin `seo_description`'ı gelir. Yoksa istenen dildeki (o da yoksa yedekteki) açıklamanın 160 karakterlik özeti kullanılır.
  - Başka dilin `seo_description`'ı istenen dile geçmez.
- **Kategori adı yoksa:** Sözlükteki genel etiket (`categoryHeroEyebrow`) gösteriliyor; slug veya teknik anahtar asla gösterilmiyor.
  - Sidebar'da seçenek **korunuyor**, böylece filtre değerleri ve mantığı değişmiyor.
- **Slug:** Başka dilden yedek alınmıyor. Yanlış veya çakışan slug başka bir kayda yönlendirilmiyor (Dalga 1 çözümleyicisi aynen).

---

## 4. SEO

| Konu | Uygulama |
|---|---|
| Metadata | İstenen dilde başlık ve açıklama. Villa adı çevrilmez. EN/DE villa detay metadata'sı artık TR ile aynı biçimde: `openGraph.description`, `openGraph.images` ve `twitter` eklendi. Eski EN/DE'de bunlar yoktu; bu bir eklemedir, kayıp yok. |
| Canonical | Sayfanın kendi dil URL'si (dil slug'ı ve segmenti). Kategori sayfalamasında mevcut `?page=N` kuralı aynen. |
| hreflang | Yalnız aktif diller ve x-default (ana dil). `pickSeoAlternates` değişmedi. |
| JSON-LD | `VacationRental`, `ItemList` (liste) ve breadcrumb URL'leri artık sayfanın dilindeki kanonik yol. Önceden EN/DE sayfaları TR URL'sini veriyordu. `inLanguage` liste sayfasında da bütün dillerde (TR istisnası kaldırıldı). |
| villa.noindex | Artık **her dilde** `noindex,nofollow`. Önceden EN/DE sayfaları bu bayrağı yok sayıyordu; bu bir simetri düzeltmesidir. |
| Eksik çeviri | Faz 3.1 modül kararları korundu. **Villa:** hiçbir aktif dilde içerik yoksa `noindex,follow`; yedek dilden gösterim noindex sebebi değil. **Kategori:** ad hiçbir aktif dilde yoksa `noindex,follow`. |
| Pasif dil | Önek 404 veriyor. Hreflang'de yok. İçeriği yedek olarak kullanılmıyor. Sitemap Dalga 5 kapsamında. |

**Bilinçli küçük farklar:**

- **TR villa detayında `robots`:**
  - Eskiden TR sayfası `villa.noindex` değilken açıkça `{index:true, follow:true}` veriyordu. Bu, site genelindeki `settings.robots_index` ayarını eziyordu.
  - Artık EN/DE ile aynı kural geçerli: sayfa `robots` vermiyor, kök layout politikası geçerli.
  - Üretimde `robots_index` açık olduğu sürece görünen çıktı aynı. Site genelinde noindex açıkken (ör. staging) TR villa sayfaları da artık noindex olur.
- **EN/DE JSON-LD breadcrumb:** Ana sayfa bağlantısı artık dilin kök yolu (`/en`, `/de`). TR'de `/` aynı kaldı.

---

## 5. Değişen, eklenen ve kaldırılan dosyalar

### 5.1 Uygulama

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/content/public-villa-content.ts` (**yeni**, saf) | Okuyucu dışarıdan verilir. İçerik: `contentText`, `villaRobots`, `loadVillaDetailContent`, `loadContentLabels` (tek batch + "list" kuralı), `labelItems`, `resolveCategoryName`. |
| `lib/i18n/content/public-villa-content.server.ts` (**yeni**) | `publicContentReader`: merkezi `getContent` ve `getContentMany`. Cache anahtarı dili içerir. |
| `app/(public)/_routes/villa.tsx` (**yeni**) | Tek villa detay modülü. Teknik veri servisleri eski modüllerle aynı ve aynı argümanlarla çağrılıyor. |
| `app/(public)/_routes/villas.tsx` (**yeni**) | Tek villa listeleme modülü. |
| `app/(public)/_routes/villa-type.tsx` (**yeni**) | Tek kategori modülü. |
| `app/(public)/_routes/region.tsx` (**yeni**) | Tek bölge modülü. |
| `app/(public)/[lang]/(site)/{kiralik-villa/[slug],kiralik-villalar,villa-turleri/[slug],bolgeler/[slug]}/page.tsx` | `localeRouteFor(key, modül)` kullanıyor. Eski hâllerinin yedekleri: `$HOME/*-page.bak`. |
| `app/components/search/KiralikVillalarPageBody.tsx` | Rozet ve kategori adları merkezi servisten. ItemList URL'leri ve breadcrumb `inLanguage` dile göre. |
| `app/components/search/TaxonomyLandingPageBody.tsx` | Kategori adı merkezi servisten. `hasContent` yoksa `noindex,follow`. Bölge dalı değişmedi. |
| `app/components/villa/SimilarVillasSection.tsx` | Rozet merkezi servisten. Benzer villa sorgusu ve fiyat aynı. |
| `app/components/seo/StructuredData.tsx` | `buildVacationRental` ve `buildItemList` için **isteğe bağlı** `path` alanı eklendi. Vermeyen diğer çağıranlar için çıktı aynen. |

### 5.2 Kaldırılan eski modüller

Eşdeğerlik testleri geçtikten **sonra** kaldırıldılar. Yedekler `$HOME/faz6-d2-kaldirilan/` altında, md5 listesi `md5.txt` içinde. Hepsi git'te de izleniyor.

| Dosya | md5 (ilk 12) |
|---|---|
| `app/(public)/kiralik-villa/[slug]/locale-page.tsx` | `8aa90b760c6a` |
| `app/(public)/en/kiralik-villa/[slug]/locale-page.tsx` | `362302f56f4f` |
| `app/(public)/de/kiralik-villa/[slug]/locale-page.tsx` | `7ab6b2767503` |
| `app/(public)/kiralik-villalar/locale-page.tsx` | `91b04bc031f0` |
| `app/(public)/en/kiralik-villalar/locale-page.tsx` | `8f61984e49be` |
| `app/(public)/de/kiralik-villalar/locale-page.tsx` | `4f06af6873c7` |
| `app/(public)/villa-turleri/[slug]/locale-page.tsx` | `02c6b2a734d7` |
| `app/(public)/en/villa-turleri/[slug]/locale-page.tsx` | `a6e99f8d339f` |
| `app/(public)/de/villa-turleri/[slug]/locale-page.tsx` | `80eb7e3ec03f` |
| `app/(public)/bolgeler/[slug]/locale-page.tsx` | `9927760f514e` |
| `app/(public)/en/bolgeler/[slug]/locale-page.tsx` | `5ef66a4069f4` |
| `app/(public)/de/bolgeler/[slug]/locale-page.tsx` | `59d11d40cd67` |

- **Geçici eşdeğerlik testleri:** Üç geçici test (`faz6-dalga2-villa-equivalence`, `faz6-dalga2-taxonomy-equivalence`, `faz6-dalga2-region-equivalence`) git'te izlenmiyordu. Yedekleri aynı klasörde. Eski modüllerle birlikte kaldırıldılar.
- **Boş klasörler:** Kalan boş klasörler silindi. TR `kiralik-villa/` klasöründeki kullanıcıya ait `.DS_Store` dosyasına dokunulmadı.

### 5.3 Testler

**Yeni testler:**

- `tests/unit/faz6-dalga2-villa.test.tsx` (46)
- `tests/unit/faz6-dalga2-taxonomy.test.tsx` (39)
- `tests/integration/content-faz6-dalga2-pg.test.ts` (34)
- Test yardımcıları: `tests/fixtures/faz6/content-fixture.ts` (gerçek okuma çekirdeği + bellek içi depo) ve `tests/fixtures/faz6/content-table-mock.ts`.

**Güncellenen testler:**

- Eski modüllere bağlı testler tek modüle taşındı:
  - `villa-detail-seo-tr`, `villa-detail-seo-en-de`, `locale-routes`, `kiralik-villalar-locale-routes`, `private-villa-detail-parity`, `taxonomy-landing`, `similar-villas-section`.
  - Kaynak yolunu kilitleyen iki test: `navigation-locale-persistence`, `BookingSidebar.hide-reservation-cta`.
- Merkezi okuma kuralına göre güncellenenler:
  - `public-tr-leak-forensic`: merkezi yüzeyler için ayrı kural. Tek batch zorunlu; TR ana kolonuna yedek **yasak**.
  - `content-read-server`: Faz 3 sınır testi **sıkılaştırıldı**. `public-villa-content` tüketicileri açık listeyle kilitlendi; yeni bir tüketici eklenirse test kırılır.
- **Beklentiler gevşetilmedi.** Değişen her beklenti onaylı yeni kurala karşılık geliyor; bunlar §4'teki bilinçli farklar ve §3'teki TR kısayolunun kalkması.
  - Örnek: eski "TR'de sorgu atılmaz" testi yerine "TR dahil bütün dillerde tek merkezi okuma" testi geldi.
  - Örnek: eski "çeviri yoksa TR ana kolonu" testi yerine "ana dil zinciri" ve "hiçbir aktif dilde yoksa gizli" testleri geldi.
  - Birçok yerde ek doğrulama da eklendi: pasif dil, çakışma, N+1 ve eski okuyucunun artık çağrılmadığı.

---

## 6. Test sonuçları

### 6.1 Eşdeğerlik (eski ↔ yeni, ana dil TR)

- **Villa detay:** 12/12. TR/EN/DE için gövde bileşeni ve bütün prop'lar birebir aynı (JSON-LD hariç):
  - fiyat, indirim, harici takvim, galeri, mesafe, özellik, kural ve fiyata dahil, yorumlar, tarih aralığı;
  - teknik servis çağrıları **aynı argümanlarla ve aynı sayıda**.
  - TR JSON-LD ve TR metadata birebir; tek fark `robots` (§4).
  - EN/DE'de yalnız bilinçli farklar var: JSON-LD URL'leri, OG ve twitter eklemesi.
- **Villa listeleme:** 3/3. Gövde, dil, searchParams ve metadata birebir.
- **Kategori:** 3/3. **Bölge:** 3/3. Gövde çağrısı (kind, teknik anahtar, dil, searchParams) ve metadata çağrısı birebir.

### 6.2 Davranış testleri (her biri ana dil TR, EN ve DE için ayrı)

- **Villa detay** (`faz6-dalga2-villa`, 46 test):
  - istenen dilde içerik; teknik anahtar servise aynen gidiyor;
  - alan bazında ana dil zinciri (TR'ye özel değil);
  - yalnız pasif dilde olan içerik kullanılmıyor (boş durum ve `noindex,follow`);
  - öğe yalnız bir aktif dildeyse o dilden geliyor, pasifse gizleniyor;
  - `villa.noindex` her dilde;
  - başka dilin slug'ında doğrulanmış eşleşmeyle 308 (sorgu korunuyor);
  - bilinmeyen slug için başka kayda yönlendirme yok, "Villa bulunamadı" ve noindex;
  - canonical ve hreflang (yalnız aktif diller, x-default ana dil); fiyat ve takvim prop'ları aynen.
- **Kategori ve bölge** (`faz6-dalga2-taxonomy`, 39 test):
  - dil slug'ı teknik anahtara çevriliyor; başka dilin slug'ı 308; geçmiş slug 308; teknik anahtardan kendi slug'a 308;
  - bilinmeyen slug başka kayda gitmiyor; pasif dilde 404;
  - bölge slug'ı her dilde aynı, segment dile göre.
  - `taxonomy-landing` (41 test): kategori adı zinciri × 3 ana dil, yalnız pasif dilde ad varsa genel etiket ve noindex, bölge için merkezi okuma yok.

### 6.3 Tam paket ve diğer kontroller (kullanıcının cihazında)

| Kontrol | Sonuç |
|---|---|
| Birim test paketi (8 parça) | **269 dosya; 5253 test geçti, 11 atlandı, 0 başarısız.** Rezervasyon, fiyat, takvim, ödeme ve villa testleri dahil. |
| TypeScript | 61 hata. Hepsi eski `.next/types` dosyalarından; kaynak kodda hata yok. Taban değeri de 61. |
| ESLint | 0 hata, **194 uyarı** (taban 194). Yeni testlerdeki uyarılar tip tanımıyla giderildi, uyarı kapatma kullanılmadı. |
| `next build --webpack` (`.env*` hariç kopya) | Başarılı. Route tablosu önceki build ile **birebir aynı**. Build çıktısı silindi. |

### 6.4 İzole PostgreSQL (bulut test alanı)

| Test dosyası | Tek kullanımlık kopyalar | Sonuç |
|---|---|---|
| `content-faz6-dalga2-pg` (yeni) | `f6d2_a` ← `m108clean`, `f6d2_b` ← `m106` | **34/34** |
| Fark kaynağı analizi (yalnız bulutta geçici kopya) | `f6d2_c` ← `m108clean` | Bilgi amaçlı |
| `content-faz6-dalga1-pg` | `c_f6a` ← `m108clean`, `c_f6b` ← `m106` | 22/22 |
| `content-faz5-pg` | `c_f5` ← `m108clean`, `c_f5n` ← `m106` | 9/9 |
| `content-faz5-dalga2-pg` | `c_d2` ← `m108clean` | 25/25 |
| `content-faz5-son-kontroller-pg` | `c_sk1` ← `m108clean`, `c_sk2` ← `m106` | 36/36 |
| `content-read-pg` | `c_rd` ← `m106` | 14/14 |
| `content-write-pg` | `c_wr`, `c_wt` ← `m106` | 18/18 |
| **Toplam** | | **158/158** |

Yeni PG testinin kapsamı, 108 öncesi ve sonrası ile her ana dil için:

- villa detay zinciri ve SEO açıklaması;
- pasif dil;
- özellik, kural ve fiyata dahil (sıra ve gizleme);
- rozet;
- kategori adı ve genel etiket;
- teknik anahtar ve teknik villa verisinin okuma ve yazmadan sonra değişmemesi.

**Eski okuyucu ↔ merkezi servis karşılaştırması** (ana dil TR, şablon verisi dahil bütün kayıtlar, beş varlık türü):

- **Ayna kayması (mirror-drift) 0, açıklanamayan fark 0.**
- Görülen farkların tamamı açıklanabilir:
  - 8 "fills-gap": testin oluşturduğu tek dilli kayıtlar. TR'si boş olduğu için eski sistem boş gösteriyordu; merkezi zincir diğer aktif dilden dolduruyor.
  - 2 "fills-gap": şablonda TR açıklaması boş, EN'i dolu olan bir villa.
  - 3 "empty-normalization": şablonda rozet `""` ile `null` farkı. Görsel sonuç aynı.

**Fiyat ve müsaitlik:** Şablon veritabanları yalnız içerik şemasını içeriyor; `villa_prices`, takvim ve görsel tabloları yok. Bu yüzden bu alanların eşleşmesi PG'de değil, birim eşdeğerlik testinde doğrulandı (§6.1): aynı servisler, aynı argümanlar, gövdeye aynı nesneler. Fiyat, kur ve takvim koduna dokunulmadı.

**Şablon bütünlüğü:**

- Bütün geçici kopyalar silindi.
- Kalan veritabanları: `f6b m101 m103 m105 m106 m108clean postgres template0 template1`.

| Şablon | Şema md5 | Veri md5 | Kayıtlı değerle |
|---|---|---|---|
| `m106` | `497e4d7fa0d9bae8` | `b530b0521a4568ca` | aynı ✅ |
| `f6b` | `577c9109478f6b90` | `5193f62b49a38826` | aynı ✅ |
| `m108clean` | `577c9109478f6b90` | `b530b0521a4568ca` | aynı ✅ |

- `pg_stat_database` insert/update/delete sayaçları üç şablonda da `0/0/0`.
- Şablonların kendisinde test çalıştırılmadı.

**Buluta aktarılan dosyalar:**

- `lib/i18n/content/public-villa-content.ts`
- `lib/i18n/content/content-derived.ts`
- `lib/html-sanitize.ts`
- `tests/integration/content-faz6-dalga2-pg.test.ts`
- `package.json` (yalnız `sanitize-html` sürümünü okumak için)

md5 değerleri cihazdakiyle birebir. Diğer dosyalar Dalga 1'den beri değişmedi (md5 kontrol edildi). İzole test alanına cihazdaki sürümle aynı `sanitize-html@2.17.5` kuruldu. `.env` veya gizli bilgi aktarılmadı.

---

## 7. Kapsam dışı bırakılanlar (sonraki dalgalar)

- **Sidebar "Villa Özellikleri" seçenekleri:** Ortak hero bileşeninden geliyor (`loadHeroFeatures`). Ana sayfa ve arama da kullanıyor, bu yüzden Dalga 4 (ortak bileşenler) kapsamına bırakıldı.
- **Hâlâ eski okuyucuları kullanan yerler:** Header/Footer kategori adları, arama sayfası, kısa süreli tarihler, paylaşılan liste ve favoriler, ana sayfa koleksiyonları, `/v/[token]` özel villa sayfasının kendi okumaları, `api/public/taxonomies`. Bunlar Dalga 2 kapsamı dışında.
- **Özel villa sayfası:** Özel villa sayfası (`/v/[token]`) normal detayla aynı gövdeyi kullanıyor. Gövdedeki "Benzer villalar" rozeti artık merkezi. Sayfanın kendi açıklama ve etiket okumaları değişmedi. DOM paritesi testi geçiyor (22/22).

## 8. Karar gerektiren konu

- **Kısmi çeviride villa sayfası indexlensin mi?**
  - Faz 3.1 kararı ve mevcut sitemap davranışı: villa sayfası her aktif dilde "mevcut" sayılır. Yedek dilden gösterilen açıklama noindex sebebi değil; yalnız hiçbir aktif dilde içerik yoksa noindex. Bu dalgada bu kural **korundu**.
  - Talimattaki "eksik çeviri noindex" maddesi bu modül kararına göre uygulandı.
  - Kısmi çevirili villalar da noindex olsun istenirse:
    - bu, çevirisi eksik birçok villanın EN/DE sayfasını aynı anda indexten çıkarır;
    - sitemap (Dalga 5) ile birlikte değiştirilmesi gerekir.
  - Onayınıza bırakıyorum.

---

## 9. Güvenlik beyanı

- Migration çalıştırılmadı. 109 oluşturulmadı. `content_mirror_mode()` değiştirilmedi.
  - Not: Faz 4 yazma testi bu fonksiyonu yalnız tek kullanımlık kopya `c_wt` içinde, mevcut test tasarımı gereği geçici olarak değiştiriyor. Kopya silindi.
- Canlı DB'ye, staging DB'ye, sunucuya ya da Coolify'a bağlanılmadı. Production dosyalarına dokunulmadı.
- Commit, push ve deploy yapılmadı.
- Faz 3 ve Faz 5 altyapısı değiştirilmedi. Yalnız yeni dosyalar eklendi; `StructuredData`'ya geriye uyumlu, isteğe bağlı bir alan eklendi.
- Kullanıcının mevcut değişiklikleri korundu. Yalnız §5.2'deki dosyalar, yedekleri alınarak silindi. Değiştirilen dosyaların önceki hâlleri `$HOME/*.bak` olarak saklandı.
- Dalga 3'e geçilmedi.
