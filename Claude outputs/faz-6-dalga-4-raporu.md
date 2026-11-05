# Faz 6 — Dalga 4 Raporu: Ana Sayfa, Koleksiyonlar ve Ortak Bileşenler

**Tarih:** 2026-11-05
**Durum:** Dalga 4 tamamlandı ve onaylandı. Son düzeltme (ana sayfa meta yedeği sözlüğe taşındı, §8) yapıldı; bütün testler geçti. **Dalga 5'e geçilmedi, onayınız bekleniyor.**
**Commit / push / deploy:** yapılmadı. Bütün değişiklikler çalışma ağacında ve commit edilmemiş durumda.

Çalışma sırası (her aşamadan sonra tam birim test paketi çalıştırıldı):

1. **Ana sayfa:** route, hero metinleri ve metadata. Tam paket: 272 dosya, 0 başarısız.
2. **Ana sayfa ve indirim koleksiyonları:** özel başlık ve rozet. Ardından **villa tipi şeridi ve SSS**. Tam paket: 274 dosya, 0 başarısız.
3. **Ortak bileşenler:** header, footer, popup ve iletişim çalışma saatleri. Tam paket: 275 dosya, 0 başarısız.
4. İzole PG testleri, TypeScript, ESLint ve build kontrolleri.

---

## 1. Özet

| Modül | Ne değişti | Ne korundu |
|---|---|---|
| **Ana sayfa route** | Üç ayrı kopya yerine tek, dile duyarlı modül (`_routes/home.tsx`). Dispatcher `localeRouteFor("home")`. Pasif dil 404. | URL'ler, `HomePageBody` (bölüm sırası, tasarım, JSON-LD), metadata, canonical ve hreflang. |
| **Hero ve ana sayfa metadata'sı** | Hero rozet, başlık, alt başlık ve CTA metinleri ile `default_meta_*` merkezi servisten okunuyor (§3.1 tekil kayıt kuralı). | Görsel, cache-bust, overlay, CTA href'leri, `hero_enabled=false` → sözlük varsayılanları; boşaltılmış alanın gizlenmesi. |
| **Ana sayfa koleksiyonu** (`VillaList`) | `custom_title` merkezi servisten (`homepage_collection`). Rozet merkezi servisten (`villa.badge`). | Kart kümesi, sıra, fiyat, kapak, yorum sayısı; koleksiyon boşsa otomatik liste. Villa adı çevrilmiyor. |
| **İndirim koleksiyonu** (`DiscountCollection`) | `custom_title` (`discount_collection`) ve rozet merkezi servisten. | İndirim seçimi, karşılaştırma fiyatı, müsaitlik kontrolü, carousel ve grid, görünürlük kuralı. |
| **Villa tipi şeridi** (`VillaTypeCarousel`) | Kategori adı merkezi servisten, tek batch. | Sıra, kapak önceliği, sayaç, "ana sayfada göster" filtresi, link. |
| **SSS** (ana sayfa) | Soru ve cevap merkezi servisten, tek batch. | Liste ve sıra (`faqs` cache'i), FAQPage JSON-LD; boş liste → bölüm yok. |
| **Header** | Kategori, manuel menü ve CMS sayfası etiketleri: her aktif dil (TR dahil) için merkezi zincir, dil başına tek batch. | Ağaç yapısı, href ve slug, bölge adları (özel isim), istemci tarafında dil seçimi (statik/ISR uygunluğu). |
| **Footer** | Villa tipi adı, kurumsal sayfa başlığı ve telif metni merkezi servisten. | Kaynak sorgular (`menuRepository`, `pagesRepository`), sıralama, 7 öğe sınırı, bölgeler, logo ve iletişim bilgileri. |
| **Popup** | Dil içerikleri bütün aktif diller için tekil kayıt kuralıyla üretiliyor. | Zamanlama, kapsam, kapatma süresi, görsel, güvenli URL kontrolü, metin temizliği. |
| **İletişim: çalışma saatleri** | `business_hours` merkezi servisten. | Telefon, e-posta, adres ve sosyal linkler (veri; çevrilmiyor). İletişim route'u bu dalgada taşınmadı. |
| Rezervasyon, fiyat, takvim, ödeme, e-posta | **Dokunulmadı.** | — |
| Sitemap / robots | **Dokunulmadı** (Dalga 5). | — |

---

## 2. Geçiş öncesi harita (mevcut davranış analizi)

| Modül | Eski okuma | Gözlem |
|---|---|---|
| Ana sayfa route | 3 modül. TR modülünde `getPublicHomeResolution()` → `redirect`; EN/DE modülünde `setRequestLocale` + gate. | `redirectsFromRoot` Faz 2'den beri hep `false`; yönlendirme dalı ölü koddu. |
| Hero, metadata, telif, çalışma saatleri | `resolveSettingsText`: TR → ana kolon aynen; EN/DE → dolu çeviri, yoksa TR ana kolonu. | Boş `""` = admin bilerek boşalttı → gizli. `NULL` → sözlük varsayılanı. |
| Koleksiyon başlığı | `custom_title.trim() \|\| villa.title`; yalnız TR kolonu. | Çeviri hiç okunmuyordu. |
| Rozet | `getVillaBadgesByLocale` (TR'de sorgu yok) + `?? villa.badge`. | Yedek her zaman TR. |
| Villa tipi adı | `getVillaTypeNamesByLocale` + `resolveTaxonomyName` (TR kısayolu). | Boş adlı tip zaten gizleniyordu. |
| SSS | `getCachedFaqs(locale)` → `applyFaqTranslations` (alan bazında TR yedeği). | — |
| Header / footer | Çoklu dil açıksa en/de haritaları; TR ve eşleşme yoksa TR adı. | Çoklu dil kapalıyken çeviri okunmuyordu. |
| Popup | TR = `site_popup`; en/de alan bazında TR yedeği; yalnız metni olan diller. | `localizeSitePopup` yalnız en/de kabul ediyordu. |
| Kısa süreli fırsatlar, bölge koleksiyonu, avantaj kartları | DB'den çevrilebilir içerik yok. | Değişmedi. |

---

## 3. Uygulanan kurallar

### 3.1 Tekil kayıt kuralı (settings ve popup)

Genel Faz 3 zinciri bu iki kayıtta eski "admin boşalttı → gizle" davranışını bozuyordu: ana dilde bilerek boşaltılan bir hero başlığı başka dilden doldurulabiliyordu. Bu yüzden eski kuralın simetrik karşılığı alan bazında uygulandı:

1. İstenen dil aktif ve alan doluysa → o değer.
2. Ana dil satırı varsa → ana dilin değeri **olduğu gibi**. Boş veya NULL ise zincir burada durur: alan gizlenir ya da sözlük varsayılanı gösterilir.
3. Ana dil satırı hiç yoksa → diğer **aktif** dillerden ilk dolu değer.

- Pasif dil hiçbir adımda kullanılmıyor.
- **Ana dil TR iken çıktı eski sistemle birebir aynı.** Eşdeğerlik testleri ve PG testleriyle doğrulandı.
- TR satırı çeviri tablosunda yoksa (migration 107 öncesi durum), ana tablo (`settings` / `site_popup`) TR satırı olarak kullanılıyor. TR pasifse bu da kullanılmıyor.
- Popup'ın gösterilip gösterilmeyeceği **ana dilin** içeriğine göre belirleniyor (görsel yoksa ve ana dil içeriği boşsa popup yok). Ana dil TR iken bu, eski "TR boşsa popup yok" kuralının ta kendisi.
- Faz 3 alan kuralları **değiştirilmedi**. Kural yalnız bu iki tekil kayıt için public yardımcıda (`public-shared-content.ts`, `lib/site-popup.ts`) uygulanıyor.

### 3.2 Liste ve etiket kuralları (Faz 3 / 3.1, aynen)

- Yedek sırası: istenen dil → ana dil → diğer aktif diller. Pasif dil zincire girmiyor.
- Boş veya yalnız boşluktan oluşan değer "yok" sayılıyor.
- **Koleksiyon özel başlığı:** zincirle çözülüyor; hiçbir aktif dilde yoksa villa adı kullanılıyor (Faz 3.1 kuralı).
- **Rozet:** hiçbir aktif dilde yoksa gösterilmiyor. Ana tablo rozetine (TR) düşülmüyor; bu Dalga 2 kuralı.
- **Villa tipi şeridi:** adı hiçbir aktif dilde olmayan kart gizleniyor. Eski "boş ad → gizle" filtresiyle aynı sonucu veriyor.
- **SSS:** soru **veya** cevap hiçbir aktif dilde yoksa öğe gizleniyor. Bu, yarım soru ve boş FAQPage cevabı üretmemek için.
- **Header ve footer:** her aktif dil için (TR dahil) zincirle çözülmüş etiket haritası sunucuda hazırlanıyor; dil seçimi yine istemcide yapılıyor. Hiçbir aktif dilde etiketi olmayan düğüm (alt menüsüyle birlikte) gizleniyor.
  - Footer'daki 7 öğelik sınır, gizleme **sonrasında** uygulanıyor. Böylece görünen tip sayısı ve sırası korunuyor.
- **Bölge adları:** özel isim; çevrilmiyor ve merkezi okumaya girmiyor (Faz 3.1).

### 3.3 Performans ve cache

- Koleksiyon başına iki batch okuma (özel başlık ve rozet) yapılıyor; header ve footer için varlık × aktif dil başına bir batch. Öğe başına sorgu yok (N+1 yok).
- Ayar satırları: `unstable_cache` içinde tutuluyor; tag'ler `content`, `content:settings`, `settings`, `site-popup`. Admin kaydı cache'i düşürüyor.
- Popup: yeni cache anahtarı dil bağlamını (ana dil ve aktif diller) içeriyor; tag'ler `site-popup` ve merkezi içerik tag'leri. Dil ayarı değişince eski bağlamın sonucu servis edilmiyor.
- Header, footer ve popup, dil bağlamını **zaten okunan** ayardan türetiyor; ek ayar okuması yapılmıyor (cache-seam testiyle kilitli).
- Koleksiyon cache sonucuna `collection_id` alanı eklendi; ek alan, cache anahtarı değişmedi. Bu alan eklenmeden önce oluşmuş cache girdilerinde `collection_id` yok; o durumda kayıtlı `display_title` kullanılıyor (geçiş güvenliği, testli).

---

## 4. Onayınıza sunulan kararlar ve riskler

1. **Tekil kayıt kuralı (§3.1).** Ana dil TR iken davranış birebir aynı. Ana dil EN/DE iken eksik dil TR yerine **ana dile** düşüyor ve ana dilde boşaltılmış alan her dilde gizli kalıyor.
2. **Header / footer / SSS / villa tipi okuma hatası.** Merkezi servis, okuma hatasında (Faz 3 tasarımı gereği) boş sonuç döndürüyor. Bu durumda etiketi çözülemeyen öğeler **gizleniyor**; eskisi gibi TR ana tablo adına düşülmüyor. Sayfa çökmüyor.
   - Böyle bir "TR'ye düş" emniyeti eklenmedi, çünkü TR pasifken bunun anlamı pasif dil sızıntısı olurdu (kural 4).
   - Canlıda migration 107 her kayıt için TR satırını garanti ettiğinden normal çalışmada öğe kaybı yok.
3. **SSS'de cevapsız öğe gizleniyor (§3.2).** Eski sistemde cevabı boş bir SSS öğesi boş cevapla gösterilirdi.
4. **Ana sayfa metadata yedeği.** İlk teslimde `default_meta_title` hiçbir dilde yoksa sabit Türkçe metin (`TR_FALLBACK_TITLE`) kullanılıyordu. Onayınızla bu metin merkezi dil sözlüğüne taşındı (§8).

**Kararlarınız (2026-11-05):**

- 1, 2 ve 3. maddeler onaylandı.
- 4. madde düzeltildi (§8).
- Faz 6 Dalga 4 tamamlanmış kabul edildi. Dalga 5 için onay bekleniyor.

---

## 5. Değişen, eklenen ve kaldırılan dosyalar

### 5.1 Uygulama

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/content/public-shared-content.ts` (**yeni**, saf) | `resolveSingletonFields`, `resolveSingletonByLocale`, `withBaseTrRow`, `publicLocaleCtxFromSettings`, `loadLabelMapsByLocale`, `collectionDisplayTitle`, `loadCollectionCardTexts`, `localizeFaqs`. |
| `lib/i18n/content/public-shared-content.server.ts` (**yeni**) | Cache'li `getAllLocales` satırları, `getPublicLocaleCtx`, `getPublicSettingsTexts`, `getPublicSettingsTextsByLocale`, `getPublicFaqs`. |
| `app/(public)/_routes/home.tsx` (**yeni**) | `homeRouteModule`. |
| `app/(public)/[lang]/(site)/page.tsx` | `localeRouteFor("home", homeRouteModule)`. |
| `lib/hero.helpers.ts` | `resolveHeroContent` için isteğe bağlı `texts`. Vermeyen çağıran için davranış aynen. |
| `app/components/home/{HomePageBody.tsx, home-metadata.ts, DiscountCollection.tsx}` | Merkezi okuma. |
| `app/components/villa/{VillaList.tsx, VillaTypeCarousel.tsx}` | Merkezi okuma. |
| `lib/cache.helpers.ts` | Koleksiyon sonuçlarına ek `collection_id` alanı (ana sayfa ve indirim). Başka değişiklik yok. |
| `app/components/layout/{HeaderWrapper.tsx, FooterWrapper.tsx, Footer.tsx}` | Merkezi etiket haritaları; footer'a `copyrightByLocale`. `Header.tsx` değişmedi. |
| `lib/i18n/taxonomy-name.helper.ts` | Harita isteğe bağlı `tr` anahtarı taşıyabiliyor. Taşımayan eski haritalarda TR çıktısı aynen. |
| `lib/site-popup.ts`, `lib/site-popup.cache.ts`, `app/services/site-popup.service.ts`, `app/(public)/_shell/PublicShell.tsx` | Popup için merkezi kural ve dil bağlamlı cache. |
| `app/components/contact/ContactPageBody.tsx` | `business_hours` merkezi servisten. |

Değiştirilen dosyaların önceki hâlleri: `$HOME/faz6-d4-yedek/`.

**Kullanılmayan eski yollar** yerlerinde bırakıldı; kendi testleri değişmeden geçiyor:

- `getCachedFaqs` EN/DE cache'leri ve `applyFaqTranslations`.
- Eski `getCachedSitePopup`.
- `getVillaBadgesByLocale`, `getVillaTypeNamesByLocale`, `getMenuNamesByLocale` ve `getPageTitlesByLocale`. Bunlar arama, kısa süreli fırsatlar ve rezervasyon formu gibi kapsam dışı yerlerde hâlâ kullanılıyor.

### 5.2 Kaldırılan eski modüller

Eşdeğerlik testi geçtikten sonra kaldırıldılar. Yedekler `$HOME/faz6-d4-kaldirilan/` klasöründe, md5 listesi `md5.txt` dosyasında. Hepsi git'te de izleniyor.

| Dosya | md5 (ilk 12) |
|---|---|
| `app/(public)/locale-page.tsx` | `8696dc7db317` |
| `app/(public)/en/locale-page.tsx` | `4f15603f8c55` |
| `app/(public)/de/locale-page.tsx` | `9e91c5a76695` |

### 5.3 Testler

**Yeni testler:**

- `tests/unit/faz6-dalga4-home.test.tsx` (25)
- `faz6-dalga4-collections.test.tsx` (15)
- `faz6-dalga4-taxonomy-faq.test.tsx` (12)
- `faz6-dalga4-shell.test.tsx` (25)
- `tests/integration/content-faz6-dalga4-pg.test.ts` (40)
- `tests/fixtures/faz6/legacy-repo-central.ts`: eski çeviri deposu sahtesini merkezi okuma sahtesine bağlayan köprü. TR satırı ana tablo aynası; EN/DE satırları eski sahteden geliyor; dil bağlamı ve alan kuralları gerçek.

**Güncellenen testler:**

- `homepage-locale-routes`, `public-default-locale-home`, `homepage-i18n` (metadata bölümü)
- `menu-name-locale`, `page-menu-title-locale`, `villa-type-name-locale`, `footer-locale`, `layout-wrappers-cache-usage`
- `contact-locale-routes`
- `public-tr-leak-forensic`: EN/DE erişim kapanışı artık `_routes/*` modüllerinden de besleniyor; koleksiyon rozet yüzeyleri merkezi listede.
- `content-read-server`: Faz 3 sınırı; yeni tüketiciler açık listede, desene `shared` eklendi.

**Beklentiler gevşetilmedi.** Değişen beklentilerin her biri onaylı kurala karşılık geliyor:

- Eski "en/de için 2 sorgu" beklentisinin yerini "aktif dil başına tek merkezi batch" aldı (3 dil → 3). Varlık ayrımı ve id kümesi aynı sıkılıkta doğrulanıyor.
- Eski "okuma patlarsa TR adına düşer" beklentisinin yerini "çökmez; etiketsiz öğe gizlenir" aldı (§4.2).

---

## 6. Test sonuçları

### 6.1 Eşdeğerlik (eski ↔ yeni, ana dil TR)

- **Hero:** 5 senaryo × 3 dil.
  - Senaryolar: tam çeviri, çeviri yok, EN'de boş/boşluk, TR'de bilerek boşaltılmış başlık ve CTA, TR'de NULL alanlar.
  - Ek senaryo: migration 107 öncesi (TR satırı yok).
  - Eski `resolveSettingsText` yoluyla **birebir**.
- **Metadata:** başlık ve açıklama 3 dilde aynı; canonical, hreflang ve og:locale dispatcher üzerinden.
- **Koleksiyonlar:** TR'de başlık, rozet, fiyat ve indirim verisi eski çıktıyla birebir.
- **SSS:** 3 dilde eski `applyFaqTranslations` çıktısıyla birebir. **Villa tipi şeridi:** eski adlar, sıra ve gizleme kuralı aynı.
- **Popup:** 4 senaryo × 3 dil, eski projeksiyonla birebir. "TR boş + görsel yok → popup yok" kuralı da aynı.

### 6.2 Davranış testleri (her biri ana dil TR, EN ve DE için ayrı)

- **Eksik dil ana dile düşüyor** (TR'ye sabit değil): hero, meta, koleksiyon başlığı, SSS, villa tipi, header, footer, telif, çalışma saatleri ve popup.
- **Ana dilde bilerek boşaltılmış alan** (hero başlığı, CTA, popup başlığı, çalışma saati) çevirisi olmayan dilde de gizli kalıyor; başka dilden doldurulmuyor.
- **Pasif dil:** satırı hiçbir dile yedek olmuyor; haritalarda ve popup'ta yalnız aktif diller var; pasif dil URL'si 404.
- **Gizleme:** hiçbir aktif dilde etiketi olmayan header düğümü (alt menüsüyle), footer tipi ve sayfası, SSS ve villa tipi gizleniyor. Footer'da 7 sınırı gizlemeden sonra uygulanıyor.
- **Değişmeyenler:** sıra, kart kümesi, fiyat ve indirim verisi, href ve slug, bölge adları.
- **Tek batch:** her koleksiyon ve dil için okuma sayısı ve varlıklar doğrulandı.

### 6.3 Tam paket ve diğer kontroller (kullanıcının cihazında)

| Kontrol | Sonuç |
|---|---|
| Birim test paketi (8 parça) | **275 dosya; 5388 test geçti, 11 atlandı, 0 başarısız.** Rezervasyon, ödeme ve e-posta testleri dahil. |
| TypeScript | 61 hata. Hepsi eski `.next/types` dosyalarından; kaynak kodda hata yok. |
| ESLint | 0 hata, **194 uyarı** (taban 194). Yeni ve değişen dosyalarda uyarı yok. |
| `next build --webpack` (`.env*` hariç kopya) | Başarılı. Route tablosu önceki build ile **birebir aynı** (200 satır). Build günlüğündeki uyarılar öncekiyle aynı: `DATABASE_URL` tanımsız. Build çıktısı silindi. |

Tam paketten sonra yalnız saf bir yardımcı (`withBaseTrRow`) sunucu dosyasından saf modüle taşındı ve PG testi eklendi. Bu değişikliklerden sonra TypeScript, ESLint ve ilgili 8 test dosyası (212 test) yeniden çalıştırıldı; hepsi temiz.

### 6.4 İzole PostgreSQL (bulut test alanı)

Yeni `content-faz6-dalga4-pg` testi gerçek SQL ve çekirdekle çalıştı. Kapsamı:

- ayar metinlerinin eski `resolveSettingsText` ile eşdeğerliği ve tekil kayıt kuralı;
- popup;
- koleksiyon özel başlığı ve rozet;
- SSS;
- header ve footer etiket haritaları;
- ana dil TR, EN ve DE ile pasif dil senaryoları.

Test verisi yalnız kopyalara, merkezi yazma servisiyle yazıldı.

| Test dosyası | Tek kullanımlık kopyalar | Sonuç |
|---|---|---|
| `content-faz6-dalga4-pg` (yeni) | `f6d4_a` ← `m108clean`, `f6d4_b` ← `m106` | **40/40** |
| `content-faz6-dalga3-pg` | `f6d4_c` ← `m108clean`, `f6d4_d` ← `m106` | 34/34 |
| `content-faz6-dalga2-pg` | `f6d4_e`, `f6d4_f` | 34/34 |
| `content-faz6-dalga1-pg` | `f6d4_g`, `f6d4_h` | 22/22 |
| `content-faz5-pg` | `f6d4_i`, `f6d4_j` | 9/9 |
| `content-faz5-dalga2-pg` | `f6d4_k` ← `m108clean` | 25/25 |
| `content-faz5-son-kontroller-pg` | `f6d4_m` ← `m108clean`, `f6d4_l` ← `m106` | 36/36 |
| `content-read-pg` | `f6d4_n` ← `m106` | 14/14 |
| `content-write-pg` | `f6d4_o`, `f6d4_p` ← `m106` | 18/18 |
| **Toplam** | | **232/232** |

- **İlk deneme:** Yeni test ilk koşuda 38/40 ile bitti. Neden test beklentisindeki bir hataydı: ana dil DE iken TR sayfasında rozetin TR'nin **kendi** değeri olması gerekirken beklentide ana dil yazılmıştı. Kod hatası değildi. Beklenti düzeltildikten sonra, silinip yeniden oluşturulan kopyalarda 40/40, ardından bütün paket 232/232 geçti.
- Bütün geçici kopyalar silindi. Kalan veritabanları: `f6b m101 m103 m105 m106 m108clean postgres template0 template1`.

**Şablon bütünlüğü** (önce ve sonra ölçüldü):

| Şablon | Şema md5 | Veri md5 | Kayıtlı değerle |
|---|---|---|---|
| `m106` | `497e4d7fa0d9bae8` | `b530b0521a4568ca` | aynı ✅ |
| `f6b` | `577c9109478f6b90` | `5193f62b49a38826` | aynı ✅ |
| `m108clean` | `577c9109478f6b90` | `b530b0521a4568ca` | aynı ✅ |

`pg_stat_database` insert/update/delete sayaçları `0/0/0`.

**Buluta aktarılan dosyalar:** saf `lib/` kaynakları ve `tests/integration/*` (42 dosya). md5 değerleri cihazdakiyle birebir. `.env` veya gizli bilgi aktarılmadı.

---

## 7. Kapsam dışı (Dalga 5 ve sonrası)

- **Sitemap ve robots** (Dalga 5): ana sayfa ve ortak bileşen değişiklikleri sitemap'e yansıtılmadı.
- **Ana sayfa dışındaki yüzeylerdeki eski okuyucular:** arama, kısa süreli fırsatlar, rezervasyon ve teklif formları hâlâ eski rozet ve tip adı okuyucularını kullanıyor.
- **İletişim route'unun tek modüle taşınması** bu dalgaya dahil değildi; yalnız çalışma saati metni merkezi okumaya geçti.

---

## 8. Son düzeltme: ana sayfa meta yedeği sözlüğe taşındı

**İstenen:** Ana sayfa başlığı için sabit Türkçe yedek metin kalmayacak. Ana dil EN ise İngilizce, DE ise Almanca, TR ise Türkçe karşılık gösterilecek. Pasif dillerden içerik kullanılmayacak.

### 8.1 Uygulama

- **Sözlük:** `home.seo.metaTitleFallback` ve `home.seo.metaDescriptionFallback` anahtarları `types.ts`, `tr.ts`, `en.ts` ve `de.ts` dosyalarına eklendi.

  | Dil | Başlık | Açıklama |
  |---|---|---|
  | TR | Villa Kiralama — Lüks Villa Deneyimi | Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Hayalindeki tatili keşfet. |
  | EN | Villa Rentals — A Luxury Villa Experience | Private pools, sea views and boutique comfort in the Mediterranean's finest villas. Discover your dream holiday. |
  | DE | Villenvermietung — Ein luxuriöses Villenerlebnis | Privatpools, Meerblick und Boutique-Komfort in den schönsten Villen am Mittelmeer. Entdecken Sie Ihren Traumurlaub. |

  TR değerleri kaldırılan sabitlerle birebir aynı. EN ve DE metinleri benim çevirim; isterseniz değiştirebilirsiniz.
- **`app/components/home/home-metadata.ts`:** `TR_FALLBACK_TITLE` ve `TR_FALLBACK_DESCRIPTION` sabitleri kaldırıldı. Açıklama yedeği de aynı sorunu taşıdığı için o da taşındı.
- **Kural:**
  - Değer önce merkezi servisten okunuyor; tekil kayıt kuralı aynen (§3.1).
  - Değer hiçbir aktif dilde yoksa yedek **ana dilin** sözlüğünden geliyor. Bu, sayfanın dilinden bağımsız: ana dil EN ise TR, EN ve DE sayfalarının hepsinde İngilizce yedek gösteriliyor.
  - Bu, onaylanan tekil kayıt kuralıyla tutarlı; o kuralda da eksik değer ana dile düşüyor.
  - Ana dil her zaman aktif; pasif dilin değeri ve sözlüğü hiçbir adımda kullanılmıyor.
  - Ayar okunamazsa varsayılan bağlam (ana dil TR) devreye giriyor; çıktı eskisi gibi Türkçe.
- **Ana dil TR iken çıktı eskisiyle birebir aynı.**
- **Test güncellemesi:** `public-tr-leak-forensic` testindeki bu dosyaya ait "izinli Türkçe metin" istisnası kaldırıldı. Dosyada artık sabit Türkçe metin yok ve test istisnasız geçiyor.
- Önceki dosya hâlleri: `$HOME/faz6-d4-yedek2/`.

### 8.2 Testler

Yeni testler `tests/unit/faz6-dalga4-home.test.tsx` dosyasında (+12; dosya toplamı 37):

- TR sözlük değerleri eski sabitlerle birebir; EN ve DE değerleri dolu ve TR'den farklı.
- Ana dil TR, EN ve DE için ayrı ayrı: değer hiçbir aktif dilde yoksa üç sayfa dilinde de ana dilin yedeği kullanılıyor (title, description, openGraph, twitter).
- Pasif dilin değeri ve sözlük metni kullanılmıyor.
- Değer varken yedek kullanılmıyor; yalnız eksik alan (açıklama) yedeğe düşüyor.
- Ayar okunamazsa Türkçe yedek (eski davranış).

| Kontrol | Sonuç |
|---|---|
| İlgili testler (`faz6-dalga4-home`, `homepage-i18n`, `public-tr-leak-forensic`, `homepage-p0-i18n`) | 124/124 |
| Tam birim test paketi (8 parça) | **275 dosya; 5400 test geçti, 11 atlandı, 0 başarısız.** |
| TypeScript | Kaynakta hata yok (yalnız eski `.next` kaynaklı 61 hata). |
| ESLint | 0 hata, 194 uyarı (taban). |
| `next build --webpack` | Başarılı. Route tablosu önceki build ile birebir aynı (200 satır); uyarılar aynı. Build çıktısı silindi. |

PG testleri yeniden çalıştırılmadı. Bu düzeltme yalnız sözlüğe ve metadata dosyasına dokunuyor; PG testlerinin kullandığı saf modüllerde değişiklik yok. Önceki sonuç: 232/232.

### 8.3 Açık nokta

Kök layout (`app/_root/root-document.tsx` > `buildRootMetadata`) hâlâ aynı Türkçe sabitleri kullanıyor. Bu, kendi başlığını vermeyen sayfalara miras kalan varsayılan başlık.

- Talebiniz ana sayfa başlığıyla sınırlı olduğu için buna dokunmadım.
- Ana dil TR iken fark yok.
- Ana dil EN veya DE olduğunda simetri için aynı sözlük anahtarlarıyla ana dile bağlanabilir. Onaylarsanız uygularım.

---

## 9. Güvenlik beyanı

- Migration çalıştırılmadı. 109 oluşturulmadı. `content_mirror_mode()` değiştirilmedi.
  - Not: Faz 4 yazma testi bu fonksiyonu yalnız tek kullanımlık kopya `f6d4_p` içinde, mevcut test tasarımı gereği geçici olarak değiştiriyor. Kopya silindi.
  - `pages.content` test kolonu yalnız tek kullanımlık kopyalara eklendi.
- `m106` ve `m108clean` şablonları değiştirilmedi. Her PG testi yeni bir tek kullanımlık kopyada çalıştı; kopyalar test sonunda silindi.
- Canlı DB'ye, staging DB'ye, sunucuya ya da Coolify'a bağlanılmadı.
- Commit, push ve deploy yapılmadı.
- Rezervasyon, fiyat, takvim, ödeme ve e-posta koduna dokunulmadı.
- Kullanıcının mevcut değişiklikleri korundu. Yalnız §5.2'deki üç dosya, yedekleri alınarak silindi. Son düzeltmede yalnız sözlük, `home-metadata.ts` ve testler değişti; önceki hâlleri `$HOME/faz6-d4-yedek2/` içinde.
- Dalga 5'e geçilmedi.
