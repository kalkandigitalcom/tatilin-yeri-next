# Faz 3.1: Okuma Servisi Uyumluluk Düzeltmeleri

**Tarih:** 4 Kasım 2026
**Kapsam:** Yalnız merkezi okuma servisinin (`lib/i18n/content/`) eski okuma davranışıyla uyumu.

**Bu fazda yapılmayanlar:**

- Admin ekranları, yazma servisleri ve public sayfalar değişmedi.
- Migration oluşturulmadı, çalıştırılmadı.
- Canlı DB'ye ve sunucuya bağlanılmadı.
- Commit, push ve deploy yapılmadı.
- Faz 4'e geçilmedi.

`git diff --stat` boş: izlenen hiçbir dosya değişmedi. Yeni servisi hâlâ hiçbir çalışan modül import etmiyor (bekçi testi yeni dosyaları da kapsıyor).

---

## 1. Tespit: eski sistemdeki yedek kuralları

Bütün okuma katmanları tarandı: `lib/i18n/get-*.server.ts`, `content-availability.server.ts`, `site-popup.ts`, `page-sections.ts`, `hero.helpers.ts`, `cache.helpers.ts` ve CMS/blog/villa route'ları.

| # | Kural (eski sistem) | Kaynak | Faz 3'teki durum | Faz 3.1 |
|---|---|---|---|---|
| 1 | **CMS gövdesi:** `pages.body ?? pages.content` | `get-page-translation.server.ts` `canonicalBody` | ❌ Yalnız `body` okunuyordu | ✅ Ana tablo ek yedeği |
| 2 | **Sayfa bölümleri:** çeviri `sections`, `parsePageSections` sonucu boşsa canonical'e düşer (geçersiz bölüm dizisi = boş) | `resolveTranslatedSections` | ❌ Boş olmayan her dizi dolu sayılıyordu | ✅ Aynı parser |
| 3 | **Popup:** metin `cleanPopupText` sonrası boşsa, `stats` `normalizePopupStats` sonrası boşsa, URL güvensizse → TR | `popupTranslationText` + `mergePopupText` | ❌ Ham değer dolu sayılıyordu | ✅ Aynı temizleyiciler |
| 4 | **"Çeviri var" kararı (noindex):** blog ve sayfada yalnız `title` / `body` / `excerpt` | `content-availability.server.ts` `translatedLocalesFromRows` | ❌ Herhangi bir alan (ör. yalnız `seo_title`) çeviri sayılıyordu | ✅ Aynı alanlar |
| 5 | **Villa SEO açıklaması:** istenen dilin `seo_description`'ı; yoksa **istenen dildeki açıklamanın** 160 karakterlik özeti | `getVillaTranslatedSeoDescription` | ❌ Zincir, başka dilin `seo_description`'ını öne alırdı | ✅ `resolveVillaSeoDescription` yardımcısı |
| 6 | Blog/sayfa meta açıklaması: `seo_description → excerpt → body özeti`. CMS başlığı: `seo_title → title → sözlük` | metadata dosyaları | ✅ Çağıran tarafta, çözülmüş alanlar üzerinde | Değişiklik gerekmedi |
| 7 | Koleksiyon başlığı: `custom_title.trim() \|\| villa.title` | `cache.helpers.ts` | ✅ Çağıran tarafta | Değişiklik gerekmedi (servis `null` dönerse çağıran villa adını kullanır) |
| 8 | Hero / ayarlar: çeviri → TR → sözlük varsayılanı | `resolveHeroContent` | ✅ Çağıran tarafta | Değişiklik gerekmedi |
| 9 | Blog gövdesi: yalnız `body` (`content` yedeği yok) | `get-blog-translation.server.ts` | ✅ | Değişiklik gerekmedi |

Admin sayfa formunda da `body ?? content` yedeği var (`maki-admin/pages/[id]/page.tsx`). Admin kapsam dışında olduğu için dokunulmadı. Ancak bu yedek, admin bir sayfayı kaydettiğinde `content` metninin `body`'ye taşınmasını sağlıyor.

### 1.1 CMS body/content düzeltmesinin ayrıntısı

**Kural ve kapsam:**

- Ana tablo kolonları kalıcı TR aynasıdır (onaylı karar 1). Bu yüzden `pages.content` yalnız **TR satırının** ek yedeği olarak uygulanır: TR `body` boşsa (NULL veya yalnız boşluk) `content` kullanılır.
- Alan bazında zincir değişmedi. EN veya DE gövdesi boşsa sıradaki dile geçilir; zincir TR'ye geldiğinde TR değeri artık `body`, o boşsa `content` olur. Bu, eskiden `resolveTranslatedField(row.body, body ?? content)` ile yapılan işin aynısıdır.
- TR pasifse `content` de **kullanılmaz**. Pasif dil yedek olamaz kuralı burada da geçerli.
- Sayfanın TR satırı yoksa ve `content` doluysa, yalnız `body` alanını taşıyan sanal bir TR satırı oluşturulur (eski katman da canonical içeriği gösterirdi). Bu sanal satırın slug'ı `null`'dır; base modunda 107 her sayfa için TR satırı garanti ettiğinden pratikte oluşmaz.

**Şema ve sorgu davranışı:**

- `pages.content` kolonu repo migration'larında yok; canlı şemada olup olmadığı da bilinmiyor (Faz 0.1 Q-listesi). Bu yüzden kolonun varlığı çalışma anında `information_schema` ile **süreç başına bir kez** kontrol edilir. Kolon yoksa ek sorgu atılmaz ve hata oluşmaz.
- Sorgu maliyeti: sayfa okumasında ⌈N/500⌉ çeviri sorgusuna paralel olarak +⌈N/500⌉ ana tablo sorgusu eklenir. Diğer 13 türde ek sorgu yoktur.

**Bilinçli küçük fark:** Eski kod `??` kullanıyordu. Bu yüzden `body = ""` (boş string) ve `content` doluyken eski sayfa **boş gövde** gösterirdi. Yeni servis bu durumda `content`'i gösterir. Bunun nedeni, başka dilin gövdesinin TR sayfasına düşmesini önlemek. `body` NULL iken iki davranış birebir aynıdır.

---

## 2. Hiçbir aktif dilde içerik yokken modül bazında karar

Servis kaydın hiçbir aktif dilde satırı olmadığında `null` döner. Satır olup bütün alanları boş olduğunda ise `missing` alanı dolu gelir. Bu iki durumun modül bazında nasıl ele alınacağı `content-presence.ts` içindeki `decideContentPresence()` fonksiyonunda tanımlandı.

Fonksiyon saf; henüz hiçbir route ona bağlı değil (Faz 4'te bağlanacak). Kararlar mevcut public route davranışlarından türetildi.

| Modül | Kayıt yok | Yayında değil | İçerik yedek dilde | İçerik HİÇ yok | Mevcut davranış referansı |
|---|---|---|---|---|---|
| **Villa** | 404 | – | Sayfa açılır, index (villa her aktif dilde "mevcut" sayılır) | Sayfa açılır. Açıklama yerine sözlükteki boş durum metni (`descriptionEmpty`), SEO açıklaması boş, **noindex,follow**. Slug veya pasif dil metni gösterilmez | `getVillaBySlug` null → 404/`index:false`; boş açıklamada `descriptionEmpty` |
| **CMS sayfası** | 404 | – | Sayfa açılır, **noindex,follow** | **404**: yanlış içerik gösterilmez | `getPageBySlug` null → 404; `getContentLocales` noindex kuralı |
| **Blog** | 404 | **404** | Sayfa açılır, **noindex,follow** | **404** | `getBlogPostBySlug` `is_active` filtresi; aynı noindex kuralı |
| **Kategori** (`villa_types`) | 404 | – | Sayfa açılır, index | Sayfa açılır (villa listesi asıl içerik). Ad yerine **sözlükteki genel etiket** kullanılır (slug değil), **noindex,follow** | Kategori her aktif dilde mevcut sayılıyor |
| **Bölge** (`villa_locations`) | 404 | – | – | – | Çeviri tablosu yok (bölge adları özel isim). Merkezi kapsam dışında, **davranış aynen korunur** |
| **Liste öğeleri** (özellik, kural, fiyata dahil, SSS, menü, ödeme yöntemi) | – | – | Gösterilir | Öğe **gizlenir** | – |
| **Koleksiyon başlığı** | – | – | Gösterilir | Gizlenir; çağıran mevcut kuralla villa adını kullanır | `custom_title \|\| villa.title` |
| **settings / popup** | – | – | Gösterilir | Sözlük ve varsayılan değerler | `resolveHeroContent`, popup projeksiyonu |

**Ek kurallar:**

- Kaydın kendi `noindex` bayrağı (`pages.noindex`, `blog_posts.noindex`) her dilde **noindex,nofollow** olarak önceliklidir (mevcut davranış).
- `index` kararı yalnız "içerikten kaynaklı bir engel yok" anlamına gelir. Site geneli robots ayarı aynen uygulanmaya devam eder.

**Bugünkü canlı durumda değişiklik yok.** Canlıda ana dil TR, TR aktif ve mod `base`. Bu durumda 107 her kayıt için bir TR satırı garanti eder ve `null` yalnız TR pasifken oluşabilir. Dolayısıyla bu kararlar bugünkü hiçbir public çıktıyı değiştirmez. İzole PG'de ana dil TR senaryosunda sayfa ve blog SEO kararları eski kuralla **birebir** çıktı (§4).

---

## 3. Değişen ve yeni dosyalar

### Yeni (`lib/i18n/content/`)

| Dosya | Satır | Görev |
|---|---|---|
| `content-field-rules.ts` | 107 | Alan doluluk kuralları (`parsePageSections`, popup temizleyicileri, aynı saf fonksiyonlar import edilir), "çeviri var" alanları, ana tablo ek yedekleri (`page.body ← pages.content`) |
| `content-presence.ts` | 110 | Modül bazında 404 / noindex / gizle / varsayılan kararı |
| `content-derived.ts` | 42 | `resolveVillaSeoDescription` (eski çapraz alan yedeği) |
| `content-resolve-empty.ts` | 12 | `isEmptyContentValue` (döngüsel import olmasın diye ayrıldı; `content-resolve` yeniden export ediyor) |

### Değişen (Faz 3'te oluşturulmuş, izlenmeyen dosyalar)

| Dosya | Değişiklik |
|---|---|
| `content-resolve.ts` | Doluluk kararı `isContentFieldFilled` ile verilir. `isFallback` "çeviri var" alanlarına göre hesaplanır. Yeni `applyBaseSupplements` |
| `content-repository.ts` | `fetchBaseSupplements` (kolon varlık kontrolü süreç başına cache'li, hata cache'lenmez) |
| `content-sql.ts` | `buildColumnExistsQuery`, `buildBaseSupplementQuery` (parametreli, yalnız SELECT) |
| `content-read-core.ts` | Çeviri satırları ve ek yedek paralel okunup birleştirilir |
| `content-legacy-compare.ts` | Eski kural simülasyonuna `body ?? content` ve aynı doluluk kuralları eklendi. Yeni `legacyTextAvailable` (eski SEO kararı). Boşluk sınıflandırması alan kuralına göre yapılır |

### Testler

| Dosya | Değişiklik |
|---|---|
| `tests/unit/content-read-compat.test.ts` | **Yeni**, 50 test |
| `tests/unit/content-read-sql-resolve.test.ts` | +1 test (yeni SQL'ler) |
| `tests/unit/content-read-server.test.ts` | Bekçi testi yeni dosyaları da kapsıyor |
| `tests/unit/content-read-core.test.ts` | İki **fixture verisi** gerçek veri biçimine çekildi (aşağıda) |
| `tests/integration/content-read-pg.test.ts` | +3 test; sayfa SEO eşliği ve body/content senaryoları |

**Fixture değişikliği hakkında.** Beklentiler gevşetilmedi; yalnız iki test verisi düzeltildi:

- `sections: [{type:"richtext"}]` (`content` alanı olmayan, render'da hiçbir şey çıkarmayan geçersiz bölüm) → `[{type:"richtext", content:"<p>TR</p>"}]`.
- Popup `stats: [{value:"10"}]` (obje; eski `normalizePopupStats` yalnız metin kabul eder) → `["10 yıl"]`.

Eski fixture'lar, eski sistemin de boş saydığı değerlerdi.

**Rapor düzeltmesi.** Faz 3 raporundaki "ESLint: 0 uyarı" satırı yanlıştı ve düzeltildi. Doğrusu: **0 hata, 194 uyarı.** Uyarıların hepsi daha önceden var (admin ekranları vb.); yeni dosyalarda 0 uyarı var.

---

## 4. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| Faz 3 ve 3.1 birim testleri (5 dosya) | **101/101 başarılı** |
| İzole PG entegrasyonu, `pages.content` **yok** | **14/14 başarılı** |
| İzole PG entegrasyonu, `pages.content` **var** | **14/14 başarılı** |
| Tam paket (8 parça) | **261 dosya, 4.985 test: 4.960 başarılı, 25 atlanan, 0 başarısız** |
| TypeScript | Kaynak kodda **0 hata** (sayılan 61 hatanın hepsi eski `.next/types`'tan, değişmedi) |
| ESLint (tüm repo) | **0 hata.** 194 uyarının hepsi önceden var; yeni dosyalarda 0 |
| Production build (izole kopya) | **Başarılı:** derleme 33,1 sn, 49/49 statik sayfa |

**Tam paket sayıları:**

- Faz 3 sonunda 4.931 test vardı; **54 yeni test** eklendi (51 birim, 3 entegrasyon).
- 25 atlanan testin 11'i önceden atlanan testler, 14'ü normal pakette DB URL'si olmadığı için atlanan entegrasyon testleri.

**İzole PG ortamı:** PostgreSQL 16, tek kullanımlık `f31` DB'si (Faz 2 `m106` kopyası, migration 082–107). İkinci koşuda `CONTENT_READ_PG_FIXTURE_DDL=1` bayrağıyla yalnız bu test DB'sine `pages.content` kolonu eklendi. Bu bir migration değil; repoya şema değişikliği eklenmedi ve bayrak olmadan hiçbir DDL çalışmaz.

### Kapsanan senaryolar

- **body/content:**
  - TR `body` NULL → `content`;
  - `body` yalnız boşluk → `content`;
  - `body` dolu → `body`;
  - EN boş → TR (`content`);
  - ana dil EN / DE / TR ile zincir;
  - **TR pasifken `content` kullanılmaz**;
  - TR satırı yokken sanal TR satırı (slug null);
  - ikisi de boş → `missing`;
  - kolon yokken ek sorgu atılmaz;
  - sorgu sayısı.
- **Doluluk kuralları:**
  - geçersiz bölüm dizisi → yedek;
  - popup'ta etiketli boş metin, güvensiz URL ve boş `stats` → yedek.
- **"Çeviri var" kararı:** sayfa ve blog × 6 durum (satır yok, yalnız `seo_title`, yalnız `sections`, yalnız `excerpt`, boşluklu `body`, dolu `title`). Hepsi eski `legacyTextAvailable` ile aynı.
- **Villa SEO açıklaması:** kendi dili, başka dilden gelen `seo_description` ile istenen dildeki açıklama özeti, 160 karakter sınırı.
- **Modül kararları:** 22 durum (§2 tablosu).
- **Eski ↔ yeni karşılaştırma (izole PG):** 14 tür × TR/EN/DE × 4 senaryo (ana dil TR / EN / DE, TR pasif). Bütün senaryolarda `mirror-drift` = 0 ve `other` = 0. Ana dil TR'de eskiden dolu gösterilen hiçbir alan değişmiyor. `pages.content` varken sayfa gövdesinde **hiç fark yok**.
- **SEO eşliği:** Ana dil TR'de bütün sayfa ve blog kayıtları × EN/DE: eski ve yeni robots kararı **12/12 aynı** (kolonsuz koşuda 6/6).
- **Slug ve URL:**
  - dil bazlı slug davranışı değişmedi (EN `f3-about`, TR `f3-sayfa`);
  - ek yedek slug'a dokunmuyor;
  - slug yedeğe düşmüyor.

---

## 5. Kalan riskler

1. **`pages.content` canlı şeması:** Kolonun canlıda olup olmadığı ve kaç sayfada `body` NULL iken `content` dolu olduğu salt okunur bir sorguyla doğrulanmalı:
   ```sql
   SELECT count(*) FROM pages WHERE body IS NULL AND content IS NOT NULL;
   ```
   Kolon yoksa servis ek yedeği otomatik olarak atlar.
2. **Ayna `content`'i kopyalamaz:** Migration 106'daki ayna `pages.content`'i TR satırına kopyalamaz. Translations moduna geçilirse (Faz 5) bu ek yedek `pages.content`'ten okunmaya devam eder. Uzun vadede `content` metninin `body`'ye taşınması ayrı bir veri kararıdır (migration gerektirir, bu fazın kapsamı dışında).
3. **Doluluk sayımı:** `getCoverage` sayımı SQL üzerinden **ham doluluğu** ölçer. `sections` ve popup alanlarındaki geçerlilik kuralı (parser ve temizleyici) sayıma yansımaz. Preflight ekranında "yaklaşık" olarak etiketlenmeli.
4. **Kararlar henüz bağlı değil:** `decideContentPresence` route'lara bağlanmadı. Faz 4'te her modül taşınırken bu kararla mevcut route davranışı (404 sayfası, `notFound()`, metadata robots) **aynı testte** karşılaştırılmalı.

---

## 6. Faz 4 giriş kriterleri

1. **Canlı ön kontroller:** Faz 0.1 Q1–Q12 sonuçları ve §5-1'deki `pages.content` sorgusu alınmış olmalı.
2. **Migrations:** 105–107 ayrı onayla önce staging/kopya veritabanında, sonra canlıda uygulanmalı. `content_mirror_mode()='base'` doğrulanmalı.
3. **Canlı kopyada karşılaştırma:** Entegrasyon testi canlı kopyaya karşı çalıştırılmalı (`CONTENT_READ_PG_URL=… npx vitest run tests/integration/content-read-pg.test.ts`, **FIXTURE_DDL bayrağı olmadan**). Ana dil TR senaryosunda koşullar:
   - `mirror-drift` = 0, `other` = 0 ve `fallback-order` = 0;
   - sayfa/blog SEO eşliğinde 0 uyumsuzluk.
4. **Kademeli bağlama:** Modüller tek tek ve bayrakla geçirilmeli. Her geçişte:
   - okumalar `getContent` / `getContentMany` ile yapılmalı;
   - 404/noindex kararı `decideContentPresence` ile verilmeli;
   - villa SEO açıklaması `resolveVillaSeoDescription` ile üretilmeli;
   - içerik yokken sözlükteki boş durum ve genel etiket metinleri kullanılmalı (slug veya teknik anahtar değil).
5. **Cache:** Yazma tarafı (Faz 4) `content:<varlık>` ve mevcut eski tag'leri revalidate etmeli.
6. **Kapsam dışı:** Rezervasyon, fiyat, ödeme ve voucher geçişin dışında kalır (karar 7).

*Faz 3.1 tamamlandı. Faz 4'e geçilmedi; commit, push ve deploy yapılmadı.*
