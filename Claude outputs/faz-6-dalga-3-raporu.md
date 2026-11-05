# Faz 6 — Dalga 3 Raporu: Blog ve CMS Public Sayfaları

**Tarih:** 2026-11-04
**Durum:** Dalga 3 tamamlandı. Bütün testler geçti. **Dalga 4'e geçilmedi, onay bekleniyor.**
**Commit / push / deploy:** yapılmadı. Bütün değişiklikler çalışma ağacında, commit edilmemiş hâlde.

Çalışma sırası:

1. **Blog** (liste ve detay) geçirildi. Tam paket: 270 dosya, 0 başarısız.
2. **CMS sayfaları** geçirildi. Tam paket: 271 dosya, 0 başarısız.
3. İzole PG testleri ve son doğrulamalar yapıldı.

---

## 0. Dalga 2 kararının kaydı (villa noindex)

Onayınız doğrultusunda villa sayfalarında mevcut kural **korundu**. Kural bütün dillerde simetrik:

- Kısmen çevrilmiş villa, yedek içerikle gösterildiğinde **noindex olmaz**.
- Yalnız Faz 3.1 koşulunda noindex uygulanır: kayıt var ama **hiçbir aktif dilde içerik yok** → `noindex,follow`.
- `villa.noindex` → her dilde `noindex,nofollow`.

Bu kural Dalga 2'de zaten böyle uygulanmıştı; kod değişikliği gerekmedi.

---

## 1. Özet

| Alan | Ne değişti | Ne korundu |
|---|---|---|
| **Blog listesi** | Başlık ve özet merkezi servisten, **tek batch** okumayla. İçeriği hiçbir aktif dilde olmayan yazı listede gösterilmiyor (detayı zaten 404). Tek route modülü. | Yayın filtresi ve sırası (`is_active`, `published_at DESC`), yayın tarihi gösterimi, kapak ve versiyonu, kategori, URL'ler, liste metadata'sı. |
| **Blog detayı** | Başlık, özet, gövde ve SEO alanları merkezi servisten. "Bu dilde çeviri var" kararı ile hreflang listesi merkezi servisten. İçerik hiçbir aktif dilde yoksa 404. Article JSON-LD URL'si dile göre. Tek route modülü. | `force-dynamic`, yayın filtresi, yayın ve güncelleme tarihleri, yazar, kapak ve OG görseli, gövde sanitize, `post.noindex`, robots kuralları, canonical. |
| **CMS sayfası** | Başlık, özet, gövde, **bölümler** ve SEO alanları merkezi servisten. `pages.content` ek yedeği ve bilinçli boş gövde merkezi depoda. Çeviri kararı ve hreflang merkezi servisten. Tek route modülü. | Aktif sayfa filtresi, `CmsPageBody` render'ı (kurumsal sayfa ve eyebrow kararı TR başlığından, değişmedi), bölüm parse ve render kuralı, görsel `?v=` versiyonları, açık `index,follow` robots, `page.noindex`, canonical. |
| **URL / yönlendirme** | — | URL'ler aynı. Dil slug'ı → teknik anahtar, başka dilin slug'ında 308, slug geçmişi ve pasif dilde 404 Dalga 1'deki gibi. Build route tablosu öncekiyle **birebir aynı**. |
| Rezervasyon, ödeme, e-posta | Dokunulmadı. | — |

---

## 2. Geçiş öncesi harita

| Route | Eski modüller | Eski okuma |
|---|---|---|
| `blog` | 3 kopya, ortak `BlogIndexPageBody` | `resolveBlogListContent`: TR'de sorgu yok, alan bazında yedek TR ana kolonu. |
| `blogPost` | 3 kopya, ortak `BlogDetailPageBody` ve `blog-metadata` | `resolveBlogContent` (yedek TR ana kolonu). Çeviri kararı `getContentLocales`: **TR daima mevcut**. |
| `page` | TR `app/p/[slug]` (sayfa yoksa 200 dönen satır içi Türkçe 404 bloğu), EN/DE `notFound()`; ortak `CmsPageBody` | `resolvePageContent` (TR kısayolu, `body ?? content`, bölümlerde geçerlilik kapısı). Çeviri kararı `getContentLocales` (TR daima mevcut). |

---

## 3. Uygulanan kurallar

- **Yedek sırası (Faz 3):** istenen dil → ana dil → diğer aktif diller.
  - Pasif diller zincire girmiyor.
  - TR kısayolu ve TR ana kolonuna yedek kaldırıldı.
  - Yedek **alan bazında**; bölümler de dahil.
- **Bilinçli boş gövde (Faz 5):** Bir dilde gövde `""` ise zincir orada duruyor, başka dilin gövdesi gösterilmiyor. NULL gövde ise "değer yok" demek; zincir devam ediyor.
- **`pages.content` ek yedeği (Faz 3.1):**
  - Yalnız **TR satırının** gövdesi NULL iken kullanılıyor (ana dilden bağımsız; `pages.content` TR'nin eski gövdesidir).
  - Ana dil EN/DE iken TR satırı yoksa bile bu yedek TR'yi "çevrili" saydırıyor. Bu bilinçli bir kural ve testle kilitli.
- **Bölümler:** Geçerli bölüm yoksa (geçersiz tip veya boş dizi) yedek dile düşülüyor (eski `resolveTranslatedSections` kuralı).
  - Hiçbir aktif dilde geçerli bölüm yoksa `CmsPageBody`'ye `null` gidiyor. Bileşen ana tabloya yalnız `undefined`'da döndüğü için TR ana kolonuna sızıntı **olmuyor**. Render, eskisi gibi gövdeye düşüyor.
- **"Bu dilde çeviri var":** İstenen dilde başlık, gövde veya özetten biri dolu olmalı (Faz 3.1 `CONTENT_AVAILABILITY_FIELDS`; eski kuralın alanlarıyla aynı).
  - Simetri düzeltmesi: TR artık "daima mevcut" sayılmıyor (Dalga 0 bulgusu S3).
  - Tek dilli sitede ek okuma yapılmıyor (eski davranış).
- **404:** Kayıt yoksa, yayında değilse, ya da **içerik hiçbir aktif dilde yoksa** sayfa 404 veriyor (Faz 3.1 blog ve page kararı). Teknik anahtar veya pasif dil içeriği gösterilmiyor.

---

## 4. SEO (mevcut davranış korundu)

| Konu | Blog | CMS |
|---|---|---|
| Kayıt noindex | `noindex,nofollow` | `noindex,nofollow` |
| Bu dilde gerçek çeviri yok (yedek içerik) | `noindex,follow` + hreflang dışı | `noindex,follow` + hreflang dışı |
| Çevrili | robots verilmez (kök layout) | açık `index,follow` |
| Canonical | Sayfanın kendi dil URL'si (dil slug'ı) | aynı |
| hreflang | Yalnız aktif **ve** çevrili diller + x-default (ana dil, yoksa ilk dil) | aynı |
| Bulunamadı | "bulunamadı" başlığı + `noindex,nofollow` | aynı |

**Bilinçli farklar:**

1. **CMS TR 404:**
   - Kayıt yoksa TR'de de `notFound()` kullanılıyor (gerçek 404).
   - Eski TR modülü 200 durum koduyla satır içi Türkçe bir blok gösteriyordu; EN/DE zaten `notFound()` kullanıyordu.
   - Proxy canlı slug kümesiyle yayında olmayan sayfayı zaten 404'lediği için bu duruma pratikte düşülmüyor.
2. **Blog Article JSON-LD URL'si:** Artık sayfanın dil URL'si (`/en/blog/...`). Önceden her dilde TR yolu yazılıyordu. TR çıktısı aynı.
3. **TR çeviri kararı simetrik:**
   - Ana dil TR iken davranış aynı; şablon verisinde fark 0 (§6.4).
   - Yalnız TR satırında başlık, gövde ve özetin hiçbiri olmayan kayıtlarda TR sayfası noindex olur. Bunlar ana dil EN/DE iken oluşturulmuş, TR'si boş kayıtlar.

---

## 5. Değişen, eklenen ve kaldırılan dosyalar

### 5.1 Uygulama

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/content/public-text-content.ts` (**yeni**, saf) | `resolvedTextFrom`, `loadTextContent`, `loadTextContentMany` (tek batch; içeriksiz kaydı atar), `loadAvailableLocales`, `isTextContentMissing`, `textRobots`. |
| `app/(public)/_routes/blog.tsx` (**yeni**) | `blogIndexRouteModule`, `blogPostRouteModule`. |
| `app/(public)/_routes/cms-page.tsx` (**yeni**) | `cmsPageRouteModule`. |
| `app/(public)/[lang]/(site)/{blog,blog/[slug],p/[slug]}/page.tsx` | `localeRouteFor`. Blog detayında `force-dynamic` aynen. |
| `app/components/blog/{blog-metadata.ts, BlogIndexPageBody.tsx, BlogDetailPageBody.tsx}` | Merkezi okuma. |
| `app/components/cms/cms-page-metadata.ts` | Merkezi okuma. |
| `app/components/seo/StructuredData.tsx` | `buildArticle` için isteğe bağlı `path` alanı. Vermeyen çağıranlar için çıktı aynen. |

Değiştirilen dosyaların önceki hâlleri: `$HOME/faz6-d3-yedek/`.

### 5.2 Kaldırılan eski modüller

Eşdeğerlik testleri geçtikten sonra kaldırıldılar. Yedekler `$HOME/faz6-d3-kaldirilan/`, md5 listesi `md5.txt`. Hepsi git'te de izleniyor.

| Dosya | md5 (ilk 12) |
|---|---|
| `app/(public)/blog/locale-page.tsx` | `78dc6c479f31` |
| `app/(public)/en/blog/locale-page.tsx` | `20b226503318` |
| `app/(public)/de/blog/locale-page.tsx` | `da250fd65547` |
| `app/(public)/blog/[slug]/locale-page.tsx` | `f3ad58de15b9` |
| `app/(public)/en/blog/[slug]/locale-page.tsx` | `e021027a0bef` |
| `app/(public)/de/blog/[slug]/locale-page.tsx` | `e989aa39d84c` |
| `app/p/[slug]/locale-page.tsx` | `3f856d8b7f6a` |
| `app/(public)/en/p/[slug]/locale-page.tsx` | `a86cff07d070` |
| `app/(public)/de/p/[slug]/locale-page.tsx` | `33d0cb4d8573` |

- **Geçici dosyalar:** İki geçici eşdeğerlik testi ve eski gövde/metadata kopyaları (`tests/unit/_legacy_d3/`) git'te izlenmiyordu. Aynı yerde yedeklendiler ve kaldırıldılar.
- **Boş klasörler:** Kalan boş klasörler silindi. `app/p/` içindeki kullanıcıya ait `.DS_Store` dosyasına dokunulmadı.
- **Eski yardımcılar:** `get-blog-translation.server`, `get-page-translation.server` ve `content-availability.server` artık hiçbir public route tarafından kullanılmıyor; yalnız yorumlarda anılıyorlar.
  - Kendi birim testleri değişmeden geçiyor.
  - Sitemap (Dalga 5) ve temizlik için yerlerinde bırakıldı.

### 5.3 Testler

**Yeni testler:**

- `tests/unit/faz6-dalga3-blog.test.tsx` (27)
- `tests/unit/faz6-dalga3-cms.test.tsx` (30)
- `tests/integration/content-faz6-dalga3-pg.test.ts` (34)
- `tests/fixtures/faz6/cms-adapter.ts`: eski CMS route testlerini tek modüle taşıma adaptörü. TR satırı, okunan `pages` kaydının aynası.
- `tests/fixtures/faz6/content-fixture.ts`: `pages.content` ek yedeği eklendi.
- `tests/fixtures/faz6/content-table-mock.ts`: artık **gerçek** alan kurallarını kullanıyor (`isContentFieldFilled`, `isExplicitEmptyContent`, `availabilityFields`). Bölümler ve bilinçli boş gövde gerçek kurallarla çözülüyor.

**Güncellenen testler:**

- `cms-page-locale-routes`, `cms-page-sections-locale`, `cms-page-static-i18n`, `cms-page-translation` (yalnız metadata bölümleri), `public-locale-full-coverage`, `navigation-locale-persistence`, `content-read-server` (Faz 3 sınırı; blog ve CMS tüketicileri açık listede).

**Beklentiler gevşetilmedi.** Değişen beklentilerin her biri onaylı yeni kurala karşılık geliyor:

- Eski "çeviri okuyucu şu argümanla çağrılır" yerine "merkezi servis **tek kez**, doğru varlık/kimlik/dil ile çağrılır; eski okuyucu çağrılmaz".
- Eski "dil kapısı modülde" yerine "pasif dilde dispatcher 404; sayfa okunmaz".
- "TR satır içi 404" yerine `notFound()` (§4).

---

## 6. Test sonuçları

### 6.1 Eşdeğerlik (eski ↔ yeni, ana dil TR)

- **Blog: 19/19.** Eski gövde ve metadata dosyalarının kopyaları ile yeni dosyalar aynı veriyle çalıştırıldı:
  - **Liste DOM'u birebir** (TR/EN/DE): yayın tarihi, kapak, kategori, başlık, özet, link.
  - **Detay DOM'u birebir** (3 yazı × 3 dil; JSON-LD URL'si hariç). Örnekler tam çeviri, yalnız TR ve kısmi EN durumlarını kapsıyor.
  - **Liste ve detay metadata'sı birebir.**
  - Route modülleri: aynı gövde, dil ve slug.
  - Tek fark EN/DE Article JSON-LD URL'si; TR birebir aynı.
  - Not: `PageHero` asenkron bir sunucu bileşeni olduğu için ilk denemede DOM boş render edildi ve karşılaştırma bir şey kanıtlamıyordu. `PageHero` bütün prop'larını yazan senkron bir sahteyle değiştirildi; karşılaştırma bundan sonra gerçek içerikle yapıldı.
- **CMS: 11/11.** `CmsPageBody`'ye giden prop'lar (başlık, özet, gövde, bölümler, görsel versiyonları) ve metadata birebir:
  - 3 sayfa × 3 dil; `pages.content` ek yedeği, bölüm yedeği ve kendi dilinde bölüm durumları kapsandı.
  - Bölüm değeri yalnız `[]` / `null` biçiminde farklılaşabiliyor; parse sonucu ve render aynı.
  - Tek fark: TR'de kayıt yoksa `notFound()`.

### 6.2 Davranış testleri (her biri ana dil TR, EN ve DE için ayrı)

- **Blog** (27 test):
  - istenen dilde içerik; yayın tarihi ve kategori aynen;
  - ana dil zinciri, noindex ve hreflang dışı bırakma;
  - bilinçli boş gövde;
  - yalnız pasif dilde içerik varsa 404 ve listede yok;
  - `post.noindex` her dilde; liste sırası;
  - dispatcher: dil slug'ı → teknik anahtar, başka dilin slug'ı 308, geçmiş slug 308, pasif dil 404.
- **CMS** (30 test):
  - başlık, özet, gövde ve **bölümler** istenen dilde;
  - alan bazında zincir; geçersiz bölüm → yedek;
  - `pages.content` yalnız TR için; bilinçli boş gövde;
  - `page.noindex`; yalnız pasif dilde içerik → 404;
  - dispatcher: 308, geçmiş slug, kayıt yoksa her dilde 404.

### 6.3 Tam paket ve diğer kontroller (kullanıcının cihazında)

| Kontrol | Sonuç |
|---|---|
| Birim test paketi (8 parça) | **271 dosya; 5309 test geçti, 11 atlandı, 0 başarısız.** Rezervasyon, ödeme ve e-posta testleri dahil. |
| TypeScript | 61 hata. Hepsi eski `.next/types` dosyalarından; kaynak kodda hata yok. |
| ESLint | 0 hata, **194 uyarı** (taban 194). |
| `next build --webpack` (`.env*` hariç kopya) | Başarılı. Route tablosu önceki build ile **birebir aynı**. Build çıktısı silindi. |

ESLint ilk koşuda 1 hata verdi: test yardımcısı `useTranslation` adını taşıdığı için React hook kuralına takılıyordu. Ad `setTranslationRow` olarak değiştirildi ve iki test uyarısı giderildi. Uyarı kapatma kullanılmadı.

### 6.4 İzole PostgreSQL (bulut test alanı)

| Test dosyası | Tek kullanımlık kopyalar | Sonuç |
|---|---|---|
| `content-faz6-dalga3-pg` (yeni, `pages.content` kopyaya eklenerek) | `f6d3_c` ← `m108clean`, `f6d3_d` ← `m106` | **34/34** |
| `content-faz6-dalga2-pg` | `c_f62a` ← `m108clean`, `c_f62b` ← `m106` | 34/34 |
| `content-faz6-dalga1-pg` | `c_f6a` ← `m108clean`, `c_f6b` ← `m106` | 22/22 |
| `content-faz5-pg` | `c_f5` ← `m108clean`, `c_f5n` ← `m106` | 9/9 |
| `content-faz5-dalga2-pg` | `c_d2` ← `m108clean` | 25/25 |
| `content-faz5-son-kontroller-pg` | `c_sk1` ← `m108clean`, `c_sk2` ← `m106` | 36/36 |
| `content-read-pg` | `c_rd` ← `m106` | 14/14 |
| `content-write-pg` | `c_wr`, `c_wt` ← `m106` | 18/18 |
| **Toplam** | | **192/192** |

- **İlk deneme:** İlk koşu (`f6d3_a`, `f6d3_b`) 32/34 ile bitti. Neden test hatasıydı: test içinde oluşturulan iki kayıt etiketlenmediği için şablon kaydı sanıldı. Kod hatası değildi. Kayıtlar etiketlendikten sonra yeni kopyalarda 34/34 geçti.
- **`pages.content`:** Bu kolon şablon şemasında yok. Faz 3.1 testlerindeki gibi yalnız tek kullanımlık kopyaya eklendi (migration değil).
- **Eski okuyucu ↔ merkezi servis** (ana dil TR, şablon verisi dahil bütün blog ve CMS kayıtları):
  - ayna kayması 0, açıklanamayan fark 0;
  - 42 "fills-gap": hepsi testin oluşturduğu tek dilli kayıtlar;
  - 6 "empty-normalization": 3'ü şablonda, `""` ile `null` farkı; görsel sonuç aynı.
- **SEO "çeviri var" kararı:** Şablon verisinde eski ve yeni karar **birebir aynı**. Tek fark, test içinde ana dil EN/DE iken oluşturulmuş 4 kayıtta: TR'leri boş olduğu için TR artık "çevrili" sayılmıyor (simetri düzeltmesi, §4).

**Şablon bütünlüğü:**

- Bütün geçici kopyalar silindi.
- Kalan veritabanları: `f6b m101 m103 m105 m106 m108clean postgres template0 template1`.

| Şablon | Şema md5 | Veri md5 | Kayıtlı değerle |
|---|---|---|---|
| `m106` | `497e4d7fa0d9bae8` | `b530b0521a4568ca` | aynı ✅ |
| `f6b` | `577c9109478f6b90` | `5193f62b49a38826` | aynı ✅ |
| `m108clean` | `577c9109478f6b90` | `b530b0521a4568ca` | aynı ✅ |

- `pg_stat_database` insert/update/delete sayaçları `0/0/0`.
- İzole PostgreSQL bir konteyner yeniden başlatmasında durmuştu. Yeniden başlatıldı ve şablonların bozulmadığı doğrulandı.

**Buluta aktarılan dosyalar** (md5 cihazdakiyle birebir):

- `lib/i18n/content/public-text-content.ts`
- `tests/integration/content-faz6-dalga3-pg.test.ts`

Diğer kaynaklar önceki dalgalardan beri değişmedi (md5 kontrol edildi). `.env` veya gizli bilgi aktarılmadı.

---

## 7. Kapsam dışı (sonraki dalgalar)

- **Dalga 4:** Header/Footer menü başlıkları ve sayfa adları (`get-page-titles-by-locale`), ana sayfa blog bölümleri ve diğer ortak bileşenler.
- **Dalga 5:** Sitemap'teki blog ve CMS "çeviri var" kararı. Hâlâ eski `sitemap-data` kuralına dayanıyor; yani sitemap TR'yi daima mevcut sayıyor ve sayfa metadata'sıyla ancak Dalga 5'te birebir hizalanacak.

---

## 8. Güvenlik beyanı

- Migration çalıştırılmadı. 109 oluşturulmadı. `content_mirror_mode()` değiştirilmedi.
  - Not: Faz 4 yazma testi bu fonksiyonu yalnız tek kullanımlık kopya `c_wt` içinde, mevcut test tasarımı gereği geçici olarak değiştiriyor. Kopya silindi.
  - `pages.content` kolonu yalnız tek kullanımlık kopyalara eklendi.
- Canlı DB'ye, staging DB'ye, sunucuya ya da Coolify'a bağlanılmadı.
- Commit, push ve deploy yapılmadı.
- Rezervasyon, ödeme ve e-posta koduna dokunulmadı.
- Kullanıcının mevcut değişiklikleri korundu. Yalnız §5.2'deki dosyalar, yedekleri alınarak silindi.
- Dalga 4'e geçilmedi.
