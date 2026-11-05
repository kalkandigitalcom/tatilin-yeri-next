# Faz 6 — Dalga 1 Raporu: Dinamik Route ve Locale Simetrisi

**Tarih:** 2026-11-04
**Durum:** Dalga 1 tamamlandı. Bütün testler geçti. **Dalga 2'ye geçilmedi, onay bekleniyor.**
**Commit / push / deploy:** yapılmadı. Bütün değişiklikler çalışma ağacında, commit edilmemiş hâlde.

---

## 1. Özet

| Konu | Sonuç |
|---|---|
| Slug çözümleme | TR/EN/DE için **simetrik**. TR'ye özel dal kalmadı. |
| Başka dilin slug'ı (K3) | Yalnız **tek kayıtla** doğrulanmış eşleşmede 308 ile o dilin slug'ına gider. Çakışmada yönlendirme yok. Pasif dilin slug'ı ve geçmişi kullanılmıyor. |
| TR kapatılabilir (K4) | Uygulama katmanındaki TR kilidi kaldırıldı. Tek kural: **ana dil kapatılamaz**. |
| Tek route modülü (K2) | `localeRouteFor` altyapısı kuruldu. İki pilot route taşındı: `teklif-al` ve `favoriler`. Eski 6 `locale-page.tsx` dosyası, eşdeğerlik testi geçtikten **sonra** kaldırıldı (yedekli). |
| Merkezi okuma köprüsü | `getRouteContent(kind, teknikAnahtar, locale)` eklendi (teknik anahtar → kimlik → `getContent`). Henüz hiçbir sayfada kullanılmıyor. Toplu içerik taşıma Dalga 1 kapsamında değil. |
| URL'ler | Değişmedi. Build çıktısında `/tr\|en\|de/teklif-al` ve `/tr\|en\|de/favoriler` aynı. |
| 308/307 kuralları | Korundu (ayrıntı §3.2). |
| Rezervasyon, ödeme, voucher, e-posta (K5) | Dokunulmadı. Bu alanların testleri değişmeden geçti. |

---

## 2. Uygulanan kararlar

- **K2 (tek route modülü):**
  - Dil, dispatcher'dan route modülüne açık parametre (`locale`) olarak geçiyor.
  - Her dil için `setRequestLocale` çağrılıyor.
  - Metadata ve OpenGraph locale bilgisi korunuyor.
  - Eski dosyalar yalnız eşdeğerlik testi geçtikten sonra silindi.
- **K3 (başka dilin slug'ı):**
  - Çözüm sırası:
    1. kendi dilin slug'ı;
    2. teknik anahtar;
    3. kendi dilin slug geçmişi;
    4. diğer **aktif** dillerin slug'ı (yalnız tek kayda işaret ediyorsa);
    5. diğer aktif dillerin geçmişi (tekilse);
    6. hiçbiri değilse bilinmiyor (404).
  - Kendi dilin geçmişi, başka dilin güncel slug'ından önce gelir (Dalga 0 bulgusu S9).
- **K4 (TR kapatılabilir):**
  - `ALWAYS_ENABLED_LOCALES = []`.
  - Kök TR, EN veya DE olsun, ana dil kilitli kalıyor; diğer diller kapatılabiliyor.
  - Admin arayüzündeki kilit yalnız ana dilde görünüyor.
- **K5:** Kapsam dışı alanlarda davranış değişmedi.
- **K6:** Dalga 4'e bırakıldı. Bu dalgada koleksiyon başlıklarına dokunulmadı.
- **K1:** Migration çalıştırılmadı. Canlı veya staging DB'ye, sunucuya ya da Coolify'a bağlanılmadı.

---

## 3. Değişiklikler

### 3.1 Değiştirilen dosyalar

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/routing/context.ts` | Yeni `resolveSlug` ile simetrik çözüm. `toBaseSlug`, `slugSource` ve `slugOwnerLocale` bunun üzerine kuruldu; TR'ye özel dallar kaldırıldı. `toLocalizedSlug` değişmedi: kendi slug'ı ya da teknik anahtar döner, başka dilin slug'ına düşmez. |
| `lib/i18n/routing/url.ts` | "Başka dilin URL kalıbı" sahibi arama simetrik: yalnız aktif diller ve yalnız o dilin **kendi** slug'ı. |
| `lib/i18n/site-locales.validation.ts` | TR kilidi kaldırıldı (`ALWAYS_ENABLED_LOCALES = []`). Ana dil kuralı korundu. |
| `lib/i18n/routing/locale-route.tsx` | `localeRouteFor(key, modül)` ve `UnifiedLocalePageModule` tipi eklendi. Eski `localeRoute` diğer route'lar için yerinde duruyor. Çok dilli kapalıyken ana dil `ctx.enabled` üzerinden açılıyor (eski kapı ana dili 404 yapıyordu). |
| `app/(public)/[lang]/(site)/teklif-al/page.tsx` | `localeRouteFor("offer", offerRouteModule)` |
| `app/(public)/[lang]/(site)/favoriler/page.tsx` | `localeRouteFor("favorites", favoritesRouteModule)` |
| `lib/i18n/content/content-sql.ts` | `buildTechnicalKeyLookupQuery` (parametreli, en fazla 2 satır). |
| `lib/i18n/content/content-repository.ts` | `findParentIdsByTechnicalKey` (isteğe bağlı). |
| `lib/i18n/content/content-read-core.ts` | `findIdByTechnicalKey`: tam olarak 1 eşleşme yoksa `null` döner. |
| `lib/i18n/content/content-read.server.ts` | `findContentIdByTechnicalKey` (`cache` ile sarılı). |

### 3.2 Korunan 308/307 kuralları

- Kanonik düzeltme: 308.
- Ana dile bağlı yönlendirmeler: 307.
- Ana dil önekinin kaldırılması: 307.
- Pasif dil öneki: 404.
- Faz 4 kuralı korundu: öneksiz yolda başka dilin slug'ı ve aynı kalıp varsa o dilin sayfasına 307. Örnek: kök DE iken `/villa/orman` → 307 `/en/villa/forest-villa`.

### 3.3 Yeni dosyalar

- `app/(public)/_routes/offer.tsx`: tek, dile duyarlı teklif route modülü.
- `app/(public)/_routes/favorites.tsx`: tek favoriler modülü. Başlık ve açıklama sözlükten geliyor; `noindex` korunuyor.
- `lib/i18n/routing/route-content.ts`: saf `loadRouteContent` ve `SLUG_KIND_ENTITY` eşlemesi.
- `lib/i18n/routing/route-content.server.ts`: `getRouteContent`, merkezi okuma servisine bağlı.
- Testler:
  - `tests/unit/faz6-dalga1-routing.test.tsx` (44 test);
  - `tests/integration/content-faz6-dalga1-pg.test.ts` (22 test).

### 3.4 Kaldırılan dosyalar

Eşdeğerlik testi geçtikten sonra kaldırıldılar. Yedekleri `$HOME/faz6-d1-kaldirilan/` altında; git'te de izleniyorlar.

| Dosya | md5 (ilk 12) |
|---|---|
| `app/(public)/teklif-al/locale-page.tsx` | `8157eeeebbd0` |
| `app/(public)/en/teklif-al/locale-page.tsx` | `1471a9e04f04` |
| `app/(public)/de/teklif-al/locale-page.tsx` | `75b2114a2687` |
| `app/(public)/favoriler/locale-page.tsx` | `c520b9a96071` |
| `app/(public)/en/favoriler/locale-page.tsx` | `084c617aa265` |
| `app/(public)/de/favoriler/locale-page.tsx` | `ae3ceed9e6e8` |
| `tests/unit/faz6-dalga1-legacy-equivalence.test.tsx` (geçici eşdeğerlik testi, izlenmiyordu) | `81e58ec6718b` |

- Eşdeğerlik testinin sonucu: eski ve yeni modül, TR/EN/DE için aynı gövde bileşenini aynı prop'larla render ediyor ve aynı metadata'yı üretiyor.
- Boş kalan `en/teklif-al` ve `de/teklif-al` klasörleri silindi.
- Dispatcher sayfalarının eski hâlleri `$HOME/teklif-page.bak` ve `$HOME/favoriler-page.bak` dosyalarında.

### 3.5 Güncellenen testler (beklentiler gevşetilmedi)

- `tests/unit/site-locales-config.test.ts`: TR kilidi testleri yeni K4 kuralıyla değiştirildi. Artık 3 kök dil için yalnız ana dilin kilitli olduğu doğrulanıyor.
- `tests/unit/public-locale-completion.test.tsx`: `teklif-al` ve `favoriler` eski listeden çıkarıldı. Yeni "UNIFIED" bloğu TR/EN/DE için gövdeyi, `setRequestLocale` çağrısını ve pasif dilde 404'ü test ediyor.
- `tests/unit/content-read-server.test.ts`: Faz 3 sınır testi artık açık bir izin listesi kullanıyor (`route-content.server.ts`). Listede olmayan her yeni kullanım testi hâlâ kırar.

---

## 4. Kalan asimetriler (bilgi için; bu dalgada değiştirilmedi)

1. **Migration 104:**
   - Çok dilli sistem kapalıyken ana dilin TR olması DB düzeyinde zorunlu.
   - Bu kurala uyan kodlar:
     - `app/api/admin/settings/route.ts` (175–188);
     - `settings/genel/page.tsx` (259–263);
     - `config.getRootLocale`.
   - Migration olmadan kaldırılamaz. Faz 6 kısıtları gereği 109 oluşturulmadı. Bu kuralın sonraki bir migration'da kaldırılmasını öneriyorum.
2. **Eski TR temel slug geçmişi:**
   - Bazı eski kayıtların temel slug geçmişi `tr` altında tutuluyor.
   - TR pasif olduğunda bu geçmiş artık yönlendirmede kullanılmıyor. Bu, "pasif dil yedek olarak kullanılmaz" kuralının (K3) doğal sonucu.
   - Gerekirse Dalga 2 veya 3'te teknik anahtar geçmişine taşınabilir.
3. **`site-locales.validation.ts` içinde ölü kod:**
   - "Türkçe bu sürümde kapatılamaz" mesajı artık erişilemez (döngü boş dizi üzerinde).
   - Davranışa etkisi yok. Temizliği bir sonraki dalgaya bırakıldı.
4. **Diğer public route'lar:** Hâlâ eski `localeRoute` ve dil kopyalarıyla çalışıyor. Bunlar sonraki dalgalarda aynı yöntemle taşınacak.

---

## 5. Test sonuçları

### 5.1 Birim test paketinin tamamı (kullanıcının cihazında, 8 parça)

- **267 dosya.**
- **5149 test geçti, 11 atlandı, 0 başarısız.**
- Parçalar: 721 + 858 + 904 (1 atlandı) + 417 + 429 + 530 + 694 (10 atlandı) + 596.
- Rezervasyon, fiyat, takvim, ödeme ve villa testleri bu pakete dahil ve değişmeden geçti.

`faz6-dalga1-routing` (44 test) her biri TR, EN ve DE kök dilleri için ayrı ayrı şunları kapsıyor:

- kök ve önekli locale;
- aktif ve pasif dil;
- ana dilin kapatılamaması;
- dil değişimi;
- başka dilin slug'ı (308);
- çakışmada yanlış yönlendirme olmaması;
- slug geçmişi;
- 307 ile kök önekinin kaldırılması;
- pasif dilde 404;
- mevcut URL tablosu;
- `localeRouteFor` (açık locale, `setRequestLocale`, sorgu korunarak 308, OpenGraph locale);
- pilot eşdeğerlik;
- `loadRouteContent`.

### 5.2 Diğer kontroller

| Kontrol | Sonuç |
|---|---|
| TypeScript (`tsc --noEmit`) | 61 hata. Hepsi eski `.next/types` dosyalarından; kaynak kodda hata yok. Taban değeri de 61. |
| ESLint | 0 hata, 194 uyarı (taban değeri 194). Yeni testlerdeki 2 uyarı giderildi. PG testindeki düzeltme kontrolü gevşetmedi, bir doğrulama ekledi. |
| `next build --webpack` | Başarılı. `.env*` dosyaları hariç tutulmuş kopyada çalıştırıldı; build çıktısı sonra silindi. |

### 5.3 İzole PostgreSQL entegrasyon testleri (bulut test alanı)

| Test dosyası | Kullanılan tek kullanımlık kopyalar | Sonuç |
|---|---|---|
| `content-faz6-dalga1-pg` (yeni) | `f6d1_a` ← `m108clean`, `f6d1_b` ← `m106`; düzeltme sonrası tekrar `f6d1_c` ← `m108clean`, `f6d1_d` ← `m106` | **22/22** (ikinci koşu da 22/22) |
| `content-faz5-pg` | `c_f5` ← `m108clean`, `c_f5n` ← `m106` | 9/9 |
| `content-faz5-dalga2-pg` | `c_d2` ← `m108clean` | 25/25 |
| `content-faz5-son-kontroller-pg` | `c_sk1` ← `m108clean`, `c_sk2` ← `m106` | 36/36 |
| `content-read-pg` | `c_rd` ← `m106` | 14/14 |
| `content-write-pg` | `c_wr` ← `m106`, `c_wt` ← `m106` | 18/18 |
| **Toplam** | | **124/124** |

Yeni PG testinin kapsamı, 108 öncesi ve sonrası için ayrı ayrı:

- **Her kök dil (TR/EN/DE) için:**
  - kanonik URL'ler;
  - teknik anahtarın değişmemesi;
  - başka dilin slug'ında 308 ile doğru kaydın o dildeki URL'si;
  - geçmiş slug'dan güncele yönlendirme;
  - teknik anahtar → kimlik → sayfanın dilinde içerik;
  - eksik çeviride TR'ye özel değil, ana dil zinciriyle yedekleme.
- Pasif dilin önekinde 404; pasif dilin slug'ı ve geçmişi yedek olarak kullanılmıyor.
- İki kaydın farklı dillerde aynı slug'ı taşıdığı çakışmada yanlış kayda yönlendirme yok.

Bir not: Son kontroller testinin ilk denemesinde kopya adlarında büyük harf kullandım (`c_skA`). PostgreSQL adı küçük harfe çevirdiği için bağlantı kurulamadı ve testler hiç çalışmadı. Kod hatası değildi. Küçük harfli yeni kopyalarla (`c_sk1`, `c_sk2`) 36/36 geçti.

### 5.4 Şablon bütünlüğü

- Bütün geçici kopyalar silindi.
- Kalan veritabanları: `f6b m101 m103 m105 m106 m108clean postgres template0 template1`.

| Şablon | Şema md5 | Veri md5 | Kayıtlı değerle |
|---|---|---|---|
| `m106` | `497e4d7fa0d9bae8` | `b530b0521a4568ca` | aynı ✅ |
| `f6b` | `577c9109478f6b90` | `5193f62b49a38826` | aynı ✅ |
| `m108clean` | `577c9109478f6b90` | `b530b0521a4568ca` | aynı ✅ |

- Hesaplama yöntemi: `pg_dump -s` ve `pg_dump -a --inserts`. Yorum satırları ve rastgele `\restrict` satırları çıkarıldı.
  - İlk karşılaştırmayı `--inserts` olmadan yaptım ve farklı değerler çıktı. Bunun nedeni yöntem farkıydı: kayıtlı değerler `--inserts` ile hesaplanmıştı. Aynı yöntemle bütün değerler birebir eşleşti.
- `pg_stat_database` sayaçları (insert/update/delete) üç şablonda da `0/0/0`.
- Şablonların kendisinde hiçbir test çalıştırılmadı.

### 5.5 Buluta aktarılan dosyalar

Hepsinin md5 değeri cihazdakiyle birebir doğrulandı:

- `lib/i18n/routing/context.ts`
- `lib/i18n/routing/url.ts`
- `lib/i18n/routing/route-content.ts`
- `lib/i18n/content/content-sql.ts`
- `lib/i18n/content/content-repository.ts`
- `lib/i18n/content/content-read-core.ts`
- `tests/integration/content-faz6-dalga1-pg.test.ts`

Yalnız kaynak ve test dosyaları aktarıldı. `.env` ya da gizli bilgi aktarılmadı.

---

## 6. Güvenlik beyanı

- Migration 105–108 çalıştırılmadı. Migration 109 oluşturulmadı. `content_mirror_mode()` değiştirilmedi.
  - Not: Faz 4 yazma testi bu fonksiyonu yalnız **tek kullanımlık kopya** `c_wt` içinde, mevcut test tasarımı gereği geçici olarak değiştiriyor. Kopya test sonunda silindi.
- Canlı DB'ye, staging DB'ye, sunucuya ya da Coolify'a bağlanılmadı. Production dosyalarına dokunulmadı.
- Commit, push ve deploy yapılmadı.
- Kullanıcının mevcut commit edilmemiş değişiklikleri korundu. Yalnız §3.4'teki dosyalar, yedekleri alınarak silindi.
- Dalga 2'ye geçilmedi.

---

## 7. Dalga 2 için öneri (onay bekleniyor)

- Kalan public route'ları `localeRouteFor` ile tek modüle taşımak. Sıra: statik sayfalar, sonra blog, CMS ve villa detayı.
- Bunu her route için aynı yöntemle yapmak: eşdeğerlik testi → eski dosyaları kaldırma.
- Detay sayfalarında içeriği `getRouteContent` ve merkezi okuma servisi üzerinden almak.
- §4'teki ölü kodu temizlemek.
