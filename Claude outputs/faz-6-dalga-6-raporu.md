# Faz 6 — Dalga 6 Raporu: Cache simetrisi ve invalidation

**Tarih:** 5 Kasım 2026
**Kapsam:**

- Cache anahtarlarının TR/EN/DE simetrisi
- Merkezi okuma ve yazma servislerinin invalidation davranışı
- Admin kaydı → public sayfa güncellemesi
- Ana dil ve aktif/pasif dil değişimlerinde cache, sitemap, hreflang ve canonical tutarlılığı
- Regresyon testleri

**Sonuç:**

- Bir **kök neden** bulundu ve düzeltildi: etiketsiz okuma yüzünden statik sayfalar en fazla 1 saat bayat kalabiliyordu.
- **İki eksik invalidation** kapatıldı: sitemap okuyucusu ve blog/CMS silme işlemleri.
- Tüm testler yeşil.
- Önceki fazlarda onaylanan fallback, boş alan, noindex ve slug kuralları değişmedi.
- Fiyat, rezervasyon, takvim, ödeme ve e-posta sistemlerine dokunulmadı.

---

## 1. Cache envanteri ve dil simetrisi

| Cache | Anahtar | Tag'ler | TR/EN/DE simetrisi |
|---|---|---|---|
| Merkezi içerik okuma (`content-read.server` → `unstable_cache`) | `contentCacheKey`: işlem, varlık, **istenen dil**, **yedek zinciri**, **ana dil**, **aktif dil kümesi**, kimlikler (8'den fazlaysa cyrb53 özeti) | `content`, `content:<varlık>`, `settings` + eski tag'ler | ✅ Üç dil aynı formülle anahtarlanır. Ana dil veya aktif dil kümesi farklıysa sonuç asla paylaşılmaz. |
| Sitemap içerik okuyucusu (`public-seo-content.server`) | `["sitemap-content", key]` (aynı `contentCacheKey`) | Aynı içerik tag'leri | ✅ (**Dalga 6'da eklendi**, bkz. §2.2) |
| Popup (`site-popup`) | Bağlam: ana dil + aktif dil CSV'si | `site-popup`, `settings` | ✅ |
| `public-singleton-rows:v1` | (varlık, kimlik); dilden bağımsız ham satırlar | `settings` / `site-popup` + içerik tag'leri | ✅ Ham satır dil seçmez; dil çözümü istek anında yapılır. |
| `public-home.server` `settings:get` | Aynı keyParts | `settings` | ✅ Fonksiyon kaynağı farklı olduğu için Next anahtarı da farklı; çakışma yok. |
| Statik/ISR sayfalar (`/tr` 10 dk; `/en`, `/de`, blog dizini, favoriler, iletişim, teklif-al, kiralık-villalar EN/DE vb. 1 sa) | Route + dil segmenti | Okudukları `unstable_cache` tag'leri route'a **yayılır** (Next 16.3.5 `unstable-cache.js` → `workUnitStore.tags`). | ✅ `/tr`, `/en`, `/de` ayrı girdilerdir. |
| Dinamik sayfalar (villa, blog ve CMS detayı, kategori, bölge, kısa fırsatlar, arama) | İstek başına | — | ✅ Her istekte, cache'lenmiş okuma servisinden geçer. |

**Anahtar simetrisi testleri:**

- Üç dil için anahtarlar birbirinden farklı.
- Ana dil veya aktif dil kümesi değişince anahtar değişir.
- Kimlik sırası anahtarı etkilemez.

Bu kontroller `faz6-dalga6-cache.test.ts` B bölümünde.

---

## 2. Bulunan sorunlar, kök nedenler ve düzeltmeler

### 2.1 KÖK NEDEN: Merkezi yazmaya geçmiş 6 varlık etiketsiz okunuyordu

**Belirti:**

- Admin'de şu varlıklardan biri kaydedilince, bunları okuyan **statik/ISR** sayfalar revalidate süresi dolana kadar eski içeriği gösterebiliyordu:
  - blog yazısı
  - CMS sayfası
  - villa özelliği
  - kural maddesi
  - fiyata dahil maddesi
  - ödeme yöntemi
- Etkilenen sayfalar: `/en`, `/de` ve blog dizini (1 saate kadar), `/tr` (10 dakikaya kadar).
- Örnekler: blog dizinindeki başlık ya da header/footer'daki CMS sayfa adı.

**Kök neden:**

- `isPersistentlyCacheable()` yalnız eski tag'i olan varlıkları kalıcı cache'e alıyordu.
- Eski tag'i olmayan bu 6 varlığın okumaları `unstable_cache`'ten geçmiyordu. Bu yüzden okuyan sayfanın ISR girdisine **hiçbir tag yayılmıyordu**.
- Merkezi yazma `content:<varlık>` tag'ini revalidate etse de bu tag'i taşıyan bir sayfa yoktu. Invalidation boşa düşüyordu.

Bu kural Faz 3'te, merkezi yazma henüz yokken bilinçli olarak konmuştu. O zaman tag'siz varlığı cache'lemek bayatlık demekti. Faz 5'te bu varlıkların tek yazma yolu merkezi servis olunca kural yanlış hale geldi.

**Düzeltme** (`lib/i18n/content/content-cache-policy.ts`):

```ts
export function isPersistentlyCacheable(entity) {
  return CONTENT_LEGACY_TAGS[entity].length > 0 || isContentWriteMigrated(entity);
}
```

- Artık 14 varlığın tamamı kalıcı cache'lenir ve okuyan sayfa `content:<varlık>` tag'ini taşır.
- Bir modül merkezi yazmadan geri alınırsa (`content-write-modules`) eski kural kendiliğinden geri gelir. Bu durum testle kilitli.

**Tutarlılık kilidi:**

- Yazma tag kümesi saf bir fonksiyona taşındı: `contentWriteInvalidationTags()`.
- `content-write.server.ts` → `onCommitted` bu fonksiyonu kullanıyor. Testler de aynı fonksiyonu kullanıyor.
- Kural: yazma tag'leri okuma tag'lerinin alt kümesidir ve `content:<varlık>` **daima** içinde yer alır.
- `settings` tag'i yalnız settings yazılınca revalidate edilir. Bu, önceki davranışla aynı.

### 2.2 Sitemap okuyucusu tag'siz bellek cache'i kullanıyordu

**Sorun:**

- `public-seo-content.server.ts`, sitemap için içerikleri istek-içi (React `cache`) okuyordu. Kalıcı cache ve tag yoktu.
- `/sitemap.xml` statik olduğu için içerik kaydı sonrası güncellenmesi zaman aşımına kalıyordu.

**Düzeltme:**

- Sitemap okuyucusu artık `unstable_cache(fn, ["sitemap-content", key], { tags, revalidate: CONTENT_CACHE_REVALIDATE_SECONDS })` kullanıyor.
- Okuduğu varlıkların tag'leri sitemap route'una yayılır. İçerik kaydedilince sitemap da hemen düşer.
- Dalga 5 kararı (site geneli indeksleme kapalıyken boş sitemap) değişmedi.

### 2.3 Blog ve CMS silme işlemleri içerik tag'ini düşürmüyordu

**Sorun:**

- `DELETE /api/admin/blog/[id]` ve `DELETE /api/admin/pages` merkezi yazmadan geçmez; doğrudan ana satırı siler, çeviriler FK ile gider.
- Blog silme yalnız `/blog`, `/tr|en|de/blog` path'lerini yeniliyordu. CMS silme hiçbir şeyi yenilemiyordu.
- Sonuç: sitemap, header/footer ve diğer okuyucular silinen kaydı bir süre daha gösterebiliyordu.

**Düzeltme:**

- `invalidateContentEntity(entity)` eklendi (`content-write.server.ts`). Aynı `contentWriteInvalidationTags` kümesini revalidate eder.
- Faz 4 sınırı korunsun diye fonksiyon `content-admin.server.ts` üzerinden re-export edilir.
- Her iki DELETE handler'ı fonksiyonu yalnız **başarılı silmeden sonra** çağırır. Hata dalından önce çağrılmaz; bu kaynak kilidiyle doğrulandı.

### 2.4 İncelenen ve doğru bulunan davranışlar (değişiklik yok)

- **Ana dil değişimi:**
  - `settings/root-locale` → `invalidatePublicRoutingCaches()` şunları revalidate eder:
    - `settings` ve `locale-slugs` tag'leri
    - `revalidatePath("/", "layout")`
    - `/sitemap.xml`, `/robots.txt`
    - proxy routing bağlamı
  - Ayrıca anahtar ana dili içerdiği için eski ana dilin sonucu yeni bağlamda **okunamaz**.
- **Aktif/pasif dil değişimi:**
  - `settings/locales` ve `settings` (çok dillilik değişince) aynı fonksiyonu çağırır.
  - Anahtar aktif dil kümesini içerir.
  - Pasif dilin değeri hiçbir dile sızmaz. Dil yeniden açılınca güncel değer döner (PG ile doğrulandı).
  - hreflang, canonical ve sitemap aynı çekirdekten hesaplanır (Dalga 5); layout revalidate'i ile birlikte düşer.
- **Teknik yazımlar** (sayfa `is_active` vb.) merkezi `onCommitted` üzerinden gider ve tag'lidir.
- **Hatalar cache'lenmez:** okuma adaptörü throw ettiğinde sonuç saklanmaz.

---

## 3. Gözlemler (bilinçli, değişiklik yapılmadı)

1. **Fazla invalidation (güvenli yön):**
   - Global `content` tag'i her içerik yazımında tüm içerik girdilerini düşürür.
   - Villa'nın eski `locale-slugs` tag'i de slug'lı tüm sayfaları düşürür.
   - Bayatlık riski yok; maliyet yalnız ek DB okuması. İstenirse ileride yazma tarafında `content` tag'i dışarıda bırakılabilir. Bu Faz 3 altyapısını değiştireceği için şimdi yapılmadı. C2 testi davranışı belgeler.
2. **Kısa fırsatlar ana sayfa bölümü:**
   - Rezervasyon ve takvim verisine bağlıdır; zamana bağlı ISR (`/tr` 10 dk, `/en` ve `/de` 1 sa) ile yenilenir.
   - Bu mevcut davranış. Rezervasyon ve takvim sistemlerine dokunmama kuralı gereği değiştirilmedi.
   - Kısa fırsat **sayfaları** dinamiktir ve her istekte günceldir.
3. **`getCachedFaqs` EN/DE girdileri** artık kullanılmıyor (zararsız ölü cache girdisi). Temizlik ayrı bir işte yapılabilir.

---

## 4. Değiştirilen dosyalar

Yedekler: `$HOME/faz6-d6-yedek/`.

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/content/content-cache-policy.ts` | Kök neden düzeltmesi (`isPersistentlyCacheable`) + `contentWriteInvalidationTags()` |
| `lib/i18n/content/content-write.server.ts` | `onCommitted` saf tag kümesini kullanır; `invalidateContentEntity()` eklendi |
| `lib/i18n/content/content-admin.server.ts` | `invalidateContentEntity` re-export (Faz 4 sınırı) |
| `lib/i18n/content/public-seo-content.server.ts` | Sitemap okuyucusu tag'li `unstable_cache` |
| `app/api/admin/pages/route.ts` | DELETE başarısında `invalidateContentEntity("page")` |
| `app/api/admin/blog/[id]/route.ts` | DELETE başarısında `invalidateContentEntity("blog_post")` |
| `tests/unit/content-read-core.test.ts` | "page kalıcı cache'e alınmaz" testi, yeni doğru davranışla değiştirildi: page kalıcı cache'lenir ve `content`, `content:page`, `settings` tag'lerini taşır. Eski beklenti kök nedenin kendisiydi; gevşetme değil, düzeltme. |
| `tests/unit/faz6-dalga6-cache.test.ts` | **Yeni**, 26 test (aşağıda) |
| `tests/integration/content-faz6-dalga6-pg.test.ts` | **Yeni**, 30 test (iki şema × 15) |

**`faz6-dalga6-cache.test.ts` bölümleri:**

- **A — politika:** 14 varlık kalıcı cache'lenir; geri alma senaryosu test edilir.
- **B — anahtar simetrisi.**
- **C — uçtan uca, 14 varlık için:**
  - cache isabeti
  - yazımdan önce bayat, tag düşünce taze
  - ana dil değişimi TR→EN
  - pasif EN
- **C2 — fazla invalidation belgesi.**
- **D — kaynak kilitleri:**
  - Next tag yayılımı
  - okuma ve yazma server bağlantıları
  - sitemap cache'i
  - `invalidatePublicRoutingCaches` içeriği ve çağıranları
  - popup anahtar bağlamı
  - singleton tag'leri
  - DELETE route'ları
  - blog EN/DE path revalidate'i

---

## 5. Test sonuçları

### 5.1 Birim testleri (cihazda, 8 parça, 279 dosya)

| Parça | Sonuç |
|---|---|
| aa | 747 ✓ |
| ab | 997 ✓ |
| ac | 881 ✓ / 1 atlandı |
| ad + ae | 1009 ✓ |
| af | 498 ✓ |
| ag | 742 ✓ / 10 atlandı |
| ah | 612 ✓ |
| **Toplam** | **5486 geçti, 0 başarısız, 11 atlandı** (atlananlar önceden de atlanıyordu) |

Kapsanan regresyon alanları:

- blog, CMS, villa, kategori
- ana sayfa ve ortak bileşenler (header/footer/popup/settings)
- kısa fırsatlar
- Faz 3/4/5 sınır testleri
- Dalga 1–5 testleri

### 5.2 PostgreSQL entegrasyon testleri (bulut, tek kullanımlık kopyalar)

- 20 kopya kullanıldı (`f6d6_a` … `f6d6_u`):
  - `m108clean` kopyaları: a, c, e, g, i, k, m, r, t
  - `m106` kopyaları: diğerleri
- **11 dosya, 280 test geçti.** Bunların 30'u yeni Dalga 6 testi.

**Yeni PG testinin kapsamı** (blog, CMS, villa, kategori ve settings; her iki şemada):

- TR/EN/DE okuma cache'ten gelir. İkinci okuma DB'ye gitmez.
- **Kontrol:**
  - `onCommitted` olmadan yazılırsa değer **bayat kalır**. Bu, testin cache'i gerçekten ölçtüğünü gösterir.
  - Gerçek yolda her dil kaydı sonrası **taze** değer döner.
  - Yazma tag'leri `content:<varlık>` içerir; settings dışında `settings` içermez.
- **Ana dil TR→EN→TR→DE:**
  - Yedek, onaylı Faz 3 zincirini izler (istenen → ana dil → diğer aktif diller).
  - Eski ana dilin sonucu yeni bağlamda gösterilmez.
- **Pasif EN:**
  - EN değeri TR veya DE'ye sızmaz.
  - Pasifken kaydedilen EN, dil açılınca güncel olarak döner.
- **Silme:**
  - Gerçek repository davranışıyla yalnız ana satır silinir.
  - Tag düşmeden bayat kalır; `invalidateContentEntity` tag kümesiyle düşünce kayıt okunmaz.

**Şablon güvenliği:**

- Testlerden sonra kopyaların hepsi silindi.
- `m106` ve `m108clean` için şema, veri ve `pg_stat` yazma sayaçları test öncesiyle **birebir aynı**:

| Şablon | Şema | Veri | Yazma |
|---|---|---|---|
| m106 | `497e4d7fa0d9bae8` | `6f41a144b97e58dc` | 0 |
| m108clean | `577c9109478f6b90` | `6f41a144b97e58dc` | 0 |

### 5.3 Statik kontroller ve build

- **tsc:** yalnız eski `.next` türlerinden gelen 61 hata. Bu, mevcut taban çizgisi; kaynak kodda hata yok.
- **ESLint:** 194 uyarı, 0 hata (taban çizgisi aynı).
- **Build:**
  - Ayrı kopyada `next build --webpack` ile çalıştırıldı; Google Fonts erişimi sandbox'ta kapalı olduğu için font mock'u kullanıldı.
  - Build başarılı. **Route tablosu `build14.log` ile birebir aynı** (195 satır; statik/ISR/dinamik sınıfları ve revalidate süreleri değişmedi).
  - `.next` silindi.

---

## 6. Güvenlik beyanı

- Canlı veya staging DB, sunucu ya da Coolify erişimi **yok**.
- Migration çalıştırılmadı. 109 oluşturulmadı.
- `content_mirror_mode()` değişmedi.
- Commit, push ve deploy **yapılmadı**.
- `m106` ve `m108clean` şablonları değiştirilmedi. Testler yalnız tek kullanımlık kopyalarda çalıştı ve kopyalar silindi.
- Mevcut kullanıcı değişiklikleri korundu. Değiştirilen her dosyanın yedeği alındı.
- Fiyat, rezervasyon, takvim, ödeme ve e-posta kodlarına dokunulmadı.
- Önceki fazlarda onaylanan fallback, boş alan, noindex ve slug kuralları değiştirilmedi.

**Dalga 6 tamamlandı. Onayınızı bekliyorum.**
