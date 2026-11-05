# Faz 0–6 Final Teknik Denetim — Simetrik TR/EN/DE İçerik Mimarisi

**Tarih:** 5 Kasım 2026
**Tür:** Yalnız inceleme ve planlama. Kod, migration, DB, sunucu ve yapılandırma değişikliği yapılmadı.

**Kaynaklar:**

- 20 faz raporu: Faz 0, 0.1, 1, 2, 3, 3.1, 4, 5 (dört rapor), Faz 6 Dalga 0–6 ve `m108clean` şablon raporu.
- Migration dosyaları: `101`–`107` ve `_drafts/108`.
- Kaynak kod ve `git HEAD` (`8afb11a`, şu an canlıda olduğu varsayılan sürüm).
- Temiz build ortamında tsc ve build.
- `m106` ve `m108clean` şablonlarının **tek kullanımlık kopyalarında** salt okunur doğrulama sorguları. Kopyalar silindi; şablonların parmak izi değişmedi.

---

## 0. Yönetici özeti

| Konu | Sonuç |
|---|---|
| Mimari | Faz 0'da hedeflenen simetrik model kodda tamam. 14 içerik türü merkezi okuma ve yazmada; public sayfalar Faz 6'da merkezi okumaya geçti; TR legacy kolonları kalıcı ayna. |
| Canlı durum | **Hiçbir şey canlıda değil.** 105–108 hiçbir gerçek ortamda çalışmadı. Faz 1–6 değişiklikleri commit edilmemiş: 177 değiştirilmiş, 70 yeni, 30 silinmiş dosya. |
| Migration sırası | 105 → 106 → 107 (aynı bakım penceresi) → **yeni kod deploy** → 108. |
| Migration 109 | **Canlıya geçiş için gerekli değil.** `base` modu + 108 hedef davranışı sağlıyor. Mod değişimi ileride ayrı ve isteğe bağlı bir karar (§3). |
| Kritik bilinmeyen | 101–104'ün canlıda uygulanıp uygulanmadığı belgelenmemiş. Migration takip tablosu yok. **Ön koşul P0.** |
| Kod geri dönüşü | `HEAD` kodu 105–107 uygulanmış şemayla uyumlu. Yeni kodda sorun çıkarsa yalnız kodu geri almak güvenli; DB geri alınmaz (§6). |
| En riskli geri dönüş | 108 ve 107'yi geri almak. Yönlendirme üretmeden TR URL'lerini değiştirebilir. Önerilen yol ileriye dönük düzeltme. |
| tsc'deki 61 hata | Hepsi repodaki **eski `.next/types/validator.ts`** dosyasından geliyor (tarih 2026-10-10, silinmiş route'lara işaret ediyor). Temiz ortamda **0 hata**; taze build sonrasında da 0. Kaynak kodda gerçek tip hatası yok. |
| Ödeme / voucher / e-posta | Türkçe kalma kararı uygulanmış ve doğrulandı. İlgili dosyalarda hiçbir değişiklik yok (§8). |

---

## 1. Genel mimari durumu

### 1.1 Katmanlar

| Katman | Durum | Kanıt |
|---|---|---|
| **Veri modeli** (Faz 1, migration 105) | Çeviri tabloları TR dahil üç dili eşit taşıyor. Settings ve popup için `tr` CHECK'i eklendi. `homepage_collection_translations` ve `discount_collection_translations` yeni. 14 tablo `UNIQUE(fk, locale)`. | Kopyada 15 UNIQUE kısıtı doğrulandı (14 içerik + `villa_location_translations`). |
| **Ayna** (Faz 2, 106/107) | `content_mirror_mode()='base'`: ana tablo → `tr` satırı. 56 trigger (4 tür × 14). 107, her ana kayda `tr` satırı garanti ediyor. | İki şablon kopyasında da 56 trigger; eksik `tr` satırı 0, içerik farkı 0, slug farkı 0. |
| **Dil slug ayrımı** (108 taslak) | TR dil slug'ı teknik anahtardan ayrı; yetenek işareti `content_language_slugs_separated()`. | Kod 108 öncesi ve sonrası şemayla uyumlu; her dalgada iki şablonda test edildi. |
| **Merkezi okuma** (Faz 3/3.1) | Zincir: istenen dil → ana dil → diğer aktif diller. Alan bazında seçim; slug yedeğe düşmez. | 5486 birim testi ve 280 PG testi geçti (Dalga 6). |
| **Merkezi yazma** (Faz 4/5) | `CONTENT_WRITE_MIGRATED` 14/14. Advisory kilit, deterministik `FOR UPDATE`, `40P01` için yeniden deneme. Eski ve yeni yazma yolu aynı anda açık değil. | Faz 4/5 raporları; sınır testleri. |
| **Public okuma** (Faz 6) | Villa, kategori, bölge, blog, CMS, ana sayfa, koleksiyonlar, header/footer, popup, SEO ve sitemap merkezi okumada. | D1–D5. |
| **Cache** (Faz 6 D6) | 14 tür etiketli kalıcı cache'te. Yazma, silme ve dil değişimi invalidation'ı tamam. | D6. |

### 1.2 Hâlâ eski okuyucuyu kullanan public yüzeyler

Bunlar bilinçli kapsam dışı ama **simetrik değiller**. Ana dil EN veya DE olursa TR ana kolona düşebilirler.

- arama;
- kısa süreli fırsatlar listesi;
- paylaşılan liste, favoriler ve `/v/[token]`;
- `api/public/taxonomies`;
- rezervasyon ve teklif formları;
- hero "Villa Özellikleri" (`loadHeroFeatures`);
- ödeme yöntemi etiketi;
- `CmsPageBody` içindeki kurumsal sayfa ve eyebrow kararı (TR başlığından).

Ana dil **TR kaldığı sürece** canlıya geçişi engellemezler. Ana dil değiştirilmeden önce ele alınmalılar (§9, B1).

### 1.3 Raporlardaki tutarsızlıkların durumu

| Tutarsızlık | Değerlendirme |
|---|---|
| Migration numaraları kaymış. Faz 0'da 106 aktarım, 107 ayna, 108 mod değişimi, 109 "103'ün anlamı"; gerçekte 106 ayna, 107 aktarım, 108 slug ayrımı. "109" üç farklı şey için kullanılmış. | Bu denetimdeki numaralar **dosyalara** göre. 109'un anlamları §3'te ayrıldı. |
| Raporlarda "Supabase / session pooler" ve "Vercel" izleri var. | Proje native PostgreSQL + Coolify. `faz5-production-readonly-smoke-test.md` bu projeyle ilgisiz (rezervasyon indirimi, migration 079/080) ve sonuç içermiyor. |
| Dalga 6'da şablon veri md5'i (`6f41…`), önceki değerden (`b530…`) farklı. | Hesaplama yöntemi farklı (sıralı `pg_dump --inserts`). Şema md5'leri önceki kayıtlarla **aynı** (`497e…`, `577c…`). Aynı yöntemle önce/sonra karşılaştırması bu denetimde de birebir. |
| Route tablosu satır sayısı 195 / 200. | Sayma yöntemi farkı. `build14`, `build19` ve bu denetimin temiz build'i aynı 191 ağaç satırına sahip; route listesi **birebir aynı**. |
| "Hiçbir modül merkezi okumaya bağlı değil" (Faz 3) ↔ "14 tür okuma ve yazmada ✅" (Faz 5 kapanış). | Zaman farkı. Public bağlantı Faz 6'da yapıldı; ikisi de kendi anında doğru. |
| Faz 5 dalga 2 §11.2'deki "TR `""` iken zincir devam eder" riski. | Faz 5 son kontrollerde geçersiz oldu: `""` zinciri durdurur. |

---

## 2. Migration uygulama sırası

### 2.1 Migration'lar tek tek

| # | İçerik | Bağımlılık | Kilit / süre | Hata davranışı | Veri değişikliği |
|---|---|---|---|---|---|
| **105** | `tr` CHECK; `content_mirror_mode()` (`STABLE`, `'base'`, yalnız yoksa); `trg_content_tr_guard` 14 çeviri tablosunda; `trg_content_base_guard` tanımlı ama bağlı değil; iki koleksiyon çeviri tablosu | 082 (`trg_touch_updated_at`), 083/086/088/089/096/012/062 tabloları | 14 çeviri tablosunda kısa ACCESS EXCLUSIVE (`DROP TRIGGER`); iki küçük tabloda CHECK taraması | Bağımlılık yoksa `RAISE EXCEPTION` | Yok |
| **106** | `base_to_tr` / `tr_to_base` ayna fonksiyonları; yeni `tr_guard` (yaşayan kaydın `tr` satırı silinemez); slug geçmişi düzeltmesi; 28 tabloya trigger | 105, 103 (`url_redirects`), 102 (slug kolonları); mod `'base'` olmalı | **En riskli adım:** 28 tabloda (`villa` dahil) ACCESS EXCLUSIVE, tek transaction. Veri yazmıyor, saniyeler sürer; açık uzun bir transaction varsa kilit kuyruğu. **Dosyada `lock_timeout` yok.** | Şema uyumsuzluğunda hata. Sessiz noktalar: slug çakışmasında NULL, slug geçmişi hatası yalnız `WARNING` | Yok |
| **107** | Her ana kayıt için `tr` satırı (`INSERT … ON CONFLICT DO NOTHING`); preflight 2a/2b/2c; son doğrulama | 106; mod `'base'` | DDL yok. Satır başına trigger maliyeti; süre veri hacmine bağlı | Farkta tümüyle durur; tek transaction, kısmi yazım yok | Yalnız yeni `tr` satırları; mevcut satıra dokunmaz |
| **108** (taslak) | Ayna yalnız içeriği yazar, slug'ı INSERT'te tohumlar; `base` modunda `tr` satırında yalnız `slug` güncellemesine izin; yetenek işareti | 106, 107 | Tablo kilidi yok; yalnız fonksiyon değişir | Ön kontrol hata verir | Yok |

### 2.2 Önerilen sıra

```
P0 kontroller ve yedek
  → 105 → 106 → 107    (aynı bakım penceresi, art arda)
  → doğrulama
  → yeni kod deploy
  → 1–3 gün izleme
  → 108                (_drafts'tan migrations'a alınıp son incelemeden sonra)
  → doğrulama
```

**Gerekçeler:**

1. **105 önce gelmeli.** Olmazsa 106'nın aynası settings ve popup `tr` satırını yazamaz (eski CHECK).
2. **106, 107'den önce gelmeli.** Aktarım ile canlı admin yazmaları arasında aynasız bir pencere kalmaz (Faz 2 §1).
3. **Yeni kod 105–107'den önce deploy edilmemeli.** Yeni kod `content_mirror_mode()` fonksiyonuna ve `tr` satırı garantisine dayanıyor (Faz 5 §8 risk 3, Faz 6 D0 K1).
4. **`HEAD` kodu 105–107 ile güvenle çalışır.** Bu denetimde doğrulandı:
   - `HEAD` routing, `tr` satırlarını açıkça atlıyor: `lib/i18n/routing/sql.ts:87` → `r.locale === "tr"` ise `continue`.
   - `HEAD` sitemap yalnız EN/DE satırlarını işliyor (`sitemap-data.server.ts`).
   - `HEAD` hiçbir yerde çeviri tablosundan doğrudan `tr` satırı silmiyor. `settings_translations.deleteOne` yalnız EN/DE için tipli.
   - Ana tabloya yazınca ayna `tr` satırını güncel tutuyor.
5. **108, yeni koddan sonra gelmeli:**
   - `HEAD` villa adı değişince teknik anahtarı (`generateUniqueSlug`) değiştiriyor. 108 varsa `tr.slug` bunu izlemez. `HEAD` bunu görmez (TR satırını yok sayar), ama yeni kod gelince TR URL'si eski slug'a döner.
   - Yeni kod ise 108'i her yazmada kontrol ediyor. 108 yokken yalnız TR slug alanı kilitli kalıyor (guard hatası, açık mesaj). Bu kabul edilebilir bir ara durum.
   - 108'i yeni koddan hemen sonra uygulamak, bu kilitli dönemi kısa tutar.
6. **Faz 5 dalga 2 §358/369'daki "önce 108, sonra etkinleştirme" ifadesi** bu sıralamayla çelişiyor. Yukarıdaki gerekçe nedeniyle sıra **kod → 108** olarak düzeltilmeli.

### 2.3 Çalıştırma kuralları

- `psql -v ON_ERROR_STOP=1 -f <dosya>` kullanılmalı.
- `--single-transaction` / `-1` **kullanılmamalı.** Dosyalar kendi `BEGIN`/`COMMIT`'ini içeriyor.
- Kilit beklemesini sınırlamak için `PGOPTIONS='-c lock_timeout=5s -c statement_timeout=0'` önerilir. Kilit alınamazsa migration temizce geri alınır ve tekrar denenir.
- 107'nin `NOTICE` çıktısı (varlık başına ana / eklenen / önceden var olan) kaydedilmeli.
- **Bir migration dosyası, sonraki migration uygulandıktan sonra asla yeniden çalıştırılmamalı.** Dosyalar "idempotent" ama sürüm düşürüyor:
  - 106 yeniden çalışırsa 108'in iki fonksiyonu sessizce 106 sürümüne döner. Yetenek işareti ise kalır; uygulama 108 var sanır ve ayna TR slug'larını yönlendirme üretmeden ezer.
  - 105 yeniden çalışırsa `tr_guard` 105 sürümüne döner.
  - 103 yeniden çalışırsa 106'nın slug geçmişi düzeltmesi kaybolur.
  - Migration runner veya ledger olmadığı için bu kuralı tek koruyan şey prosedür.

---

## 3. Migration 109 kararı

Raporlarda "109" üç ayrı şey için kullanılmış. Hiçbiri yazılmadı.

| Anlam | Kaynak | Karar önerisi |
|---|---|---|
| **A. Ayna modu değişimi** (`content_mirror_mode()` → `'translations'`) | Faz 5 admin §8–9 (eski plandaki "108") | **Canlıya geçiş için gerekli değil. Ertelenmeli; belki hiç yapılmamalı.** |
| **B. 104 kuralını kaldırmak** ("çok dilli kapalıyken ana dil TR olmalı") | Faz 6 D1 §4.1 | Bir ürün kararı. Ayna ile ilgisi yok. Gerekirse küçük, ayrı bir migration. |
| **C. Teknik anahtar geçmişi** (103'ün ana tablo trigger'ını `locale='*'` anlamına çevirmek) | Faz 0 §11, Faz 0.1 §6, D1 §4.2 | Düşük öncelik. Yeni kod teknik anahtarı yalnız oluştururken yazıyor, sonra değiştirmiyor; trigger pratikte uykuda. |

### 3.1 Neden A gerekli değil?

`base` modu + 108 hedef davranışı zaten sağlıyor:

- TR, EN ve DE çeviri satırlarında eşit duruyor.
- Okuma servisi ana tablo kolonlarını hiç okumuyor (tek istisna `pages.content` ek yedeği).
- TR slug bağımsız.
- Ana kolonlar, voucher ve e-posta gibi eski okuyucular için TR aynası olarak güncel kalıyor.

Mod değişiminin kazancı küçük (`tr` satırının yetkili kaynak olması, TR'de NULL yazabilmek). Getirdiği riskler büyük:

- `translations` modunda ana tabloya INSERT, `tr` satırı **oluşturmaz**. Servis dışından eklenen her kayıt (seed, import, elle SQL) TR'siz kalır.
- Base guard `UPDATE OF <kolonlar>` ile kurulu. SET listesinde içerik kolonu olan **her** UPDATE reddedilir, değer değişmese bile. Eski veya servis dışı yazarlar kırılır.
- Mod değeri DB'de doğrulanmıyor. Örneğin `'translation'` yazım hatası iki aynayı da kapatır, ana tablo yazımını serbest bırakır ve **sessiz sapmaya** yol açar. Uygulama bilinmeyen modu reddediyor ama doğrudan SQL reddetmiyor.
- Mod küreseldir; 14 tür birlikte geçer.
- Mod değiştikten sonra 106, 107 ve 108 yeniden çalıştırılamaz (hepsi `'base'` istiyor).

### 3.2 A yapılacaksa koşullar

1. 105–108 ve yeni kod canlıda **en az 2–4 hafta** sorunsuz çalışmış olmalı.
2. Kayıt oluşturan **bütün** yollar `createContent` kullanmalı: villa kopyalama, seed ve import betikleri, elle SQL prosedürleri.
3. Canlıda §5.6 fark sorgusu: `eksik = 0`, `icerik_fark = 0`.
4. 109'un içeriği:
   - mod hâlâ `'base'` mi kontrolü;
   - **aynı transaction'da** fark sıfır ve eksik `tr` satırı sıfır kontrolü;
   - `CREATE OR REPLACE … SELECT 'translations'`;
   - isteğe bağlı: ana tabloya INSERT guard'ı ve mod değeri için beyaz liste.
5. Geri dönüş betiği **önceden yazılmış ve test edilmiş** olmalı: önce fark kontrolü, sonra `'base'`e dönüş. Fark varken `'base'`e dönülürse, bir sonraki ana tablo yazımı `tr` içeriğini ana kolondaki değerle ezer.
6. Önce izole kopyada, sonra staging'de prova.

---

## 4. `content_mirror_mode()` — davranış doğrulaması

**Tanım** (`105:125–132`): `LANGUAGE sql STABLE`, `SELECT 'base'`. Değer yalnız `CREATE OR REPLACE` ile değişir. 105 yeniden çalışırsa mevcut fonksiyona dokunmaz.

| Bileşen | `base` (bugün) | `translations` (ileride, isteğe bağlı) |
|---|---|---|
| `trg_content_mirror_base_to_tr` (106:108, 108:87) | Ana tablo → `tr` upsert. 108 sonrası slug yalnız INSERT'te tohumlanır. | Hiçbir şey yapmaz |
| `trg_content_mirror_tr_to_base` (106:185) | Hiçbir şey yapmaz | `tr` → ana tablo. Slug hariç; NOT NULL kolonda `COALESCE` ile eski değer korunur. |
| `trg_content_tr_guard` (106:255, 108:179) | Ayna dışı `tr` yazımı reddedilir. 108 sonrası yalnız `slug` / `updated_at` güncellemesi serbest. | Serbest |
| Yaşayan kaydın `tr` satırını silmek | **Her iki modda yasak** (106:242–253). Cascade silmeye izin var. | Aynı |
| `trg_content_base_guard` (105:206) | Etkisiz | Ana tablo içerik kolonlarına ayna dışı UPDATE reddedilir |
| Uygulama (`content-write-core.ts:335–337, 507–508`) | Hedef ana tablo (TR) | Hedef `tr` satırı. Bilinmeyen mod → `guard` hatası |

**Kontroller:**

- **Döngü yok.** Her modda tek yön aktif ve transaction'a özel bayrak var. Faz 2 K1–K5 ve C1d testleriyle doğrulandı.
- **Yarıda kalan transaction.** Mod değişimi sırasında açık bir yazma transaction'ı iki farklı mod görebilir. Bu durumda guard **yüksek sesle** reddeder; veri bozulmaz.
- **Bu denetimde iki şablon kopyasında doğrulandı:**
  - mod `base`;
  - 56 trigger (`base_guard`, `mirror_to_base`, `mirror_to_tr`, `tr_guard` → 14'er);
  - 8 slug geçmişi trigger'ı;
  - 108 işareti: `m106`'da yok, `m108clean`'de var.

---

## 5. Veri koruma, TR aynası ve çeviri tutarlılığı

### 5.1 Neler korunuyor?

- **Mevcut veri:**
  - 105, 106 ve 108 veri değiştirmiyor.
  - 107 yalnız eksik `tr` satırlarını ekliyor (`DO NOTHING`).
  - Preflight: mevcut bir `tr` satırı ana kayıttan farklıysa, ya da slug çakışması varsa **durur**.
  - NULL ile `''` ayrımı korunur (`IS DISTINCT FROM`).
- **TR legacy kolonları:**
  - Kalıcı ayna (onaylı karar).
  - Voucher, e-posta ve eski public yüzeyler bu kolonları okumaya devam ediyor.
  - `base` modunda tek yazma hedefi bunlar; `tr` satırı ayna.
- **EN/DE satırları:** Hiçbir migration dokunmuyor. Önce ve sonra md5 karşılaştırması önerilir (§7, P0-4).

### 5.2 Riskler

| # | Risk | Etki | Önlem |
|---|---|---|---|
| V1 | Ana slug'ı 102 biçimine uymayan kayıtlar (ör. şablondaki `Villa_Kotu`, 1 kategori). `tr.slug` NULL olur, URL teknik anahtardan üretilir. | Yalnız bu kayıtlarda TR URL'si "kendi slug'ı" yerine teknik anahtar | §7 sorgu S-3 ile listelenip düzeltilmeli |
| V2 | `pages.content` (eski gövde) aynalanmıyor; okuma, yalnız TR gövdesi NULL iken ek yedek olarak kullanıyor. | Canlıda bu kolon varsa ve doluysa davranış testlerle kilitli. Ana dil EN/DE iken TR'yi "çevrili" saydırıyor (bilinçli). | S-7 ile canlıda kontrol; `content` → `body` taşıma ayrı karar |
| V3 | Çeviri satırında bilinçli boş gövde (`""`) | Zinciri durdurur; canlıda beklenmedik `""` varsa sayfa boş gövde gösterir | S-8 = 0 olmalı; değilse ayrı karar |
| V4 | Boş ödeme yöntemi adı | Voucher ve e-postada "Ödeme Yöntemi" satırı görünmez | S-9 = 0 olmalı |
| V5 | 106'daki sessiz durumlar: slug çakışmasında NULL; slug geçmişi hatalarının `WARNING` ile yutulması | Sessiz URL kayması | Yayından sonra DB loglarında `WARNING` izlenmeli |
| V6 | Teknik anahtar benzersizliği yalnız ana tabloya karşı kontrol ediliyor (`content-write-core.ts:509–516`). 108 sonrası yeni anahtar, başka kaydın TR dil slug'ıyla aynı olabilir. | Ayna `tr.slug`'ı sessizce NULL yapar; yeni kaydın TR URL'si **diğer kayda** çözülür | Düşük olasılık; teknik borç T5 |

---

## 6. Veri kaybı ve geri dönüş riskleri

| Seviye | Ne geri alınır | Veri kaybı | Not |
|---|---|---|---|
| **R1: Yalnız kod** (yeni kod → `HEAD`) | Coolify'da önceki imaj | Yok | **Birincil geri dönüş yolu.** `HEAD`, 105–107 şemasıyla uyumlu (§2.2/4). 108 de uygulanmışsa `HEAD` TR satırını yok saydığı için tutarlı. Yeni kodun yazdığı TR dil slug'ları `HEAD` döneminde görünmez, kod geri gelince yeniden görünür. |
| **R2: 108 geri alma** | 106 fonksiyonları + `DROP FUNCTION content_language_slugs_separated()` | İçerik kaybı yok, **SEO riski var** | Bir sonraki içerik yazımında ayna, farklılaşmış TR slug'larını teknik anahtarla ezer. **Yönlendirme oluşmaz.** Ön koşul: farklılaşmış slug'lar (S-6 `slug_fark`) listelenmeli ve `url_redirects` elle eklenmeli. Tercih edilen yol: geri almak yerine ileriye dönük düzeltme. |
| **R3: 107 geri alma** | Faz 2 §6 betiği | **Var** | Betik `tr` satırını yalnız içerik alanlarına bakarak siliyor, slug'a bakmıyor. 108 sonrası özelleşmiş TR slug'ları da silinir ve eski TR URL'leri 404 olur. Yeni kod `tr` satırına dayandığı için önce R1 gerekir. **Önerilmez.** |
| **R4: 106 / 105 geri alma** | Trigger ve fonksiyonları düşür, 103 ve 105'i yeniden çalıştır | 105 geri alınırsa iki koleksiyon tablosundaki EN/DE başlıkları silinir | Önce R1 ve R3 gerekir. Yalnız izole PG'de test edildi. |
| **R5: Tam geri dönüş** | Migration öncesi `pg_dump` veya PITR | Geri dönüş anına kadar canlıda yazılan **her şey** kaybolur: rezervasyonlar, ödemeler, içerik | Yalnız felaket durumunda. Rezervasyon ve ödeme tabloları geri yüklenmeden önce ayrıca dışa alınmalı. |

---

## 7. Canlıya geçiş ön koşulları

### 7.1 Engelleyici (P0)

1. **101–104'ün canlıdaki durumu doğrulanmalı.** Migration takip tablosu yok (`_archive/README.md`); durum yalnız şema sorgusuyla anlaşılır (S-0).
2. **Faz 0.1 Q1–Q12 salt okunur sorguları canlıda çalıştırılmalı.** Hiçbir raporda sonuç yok; her fazda "bekliyor".
3. **Yedek:** tam `pg_dump` (ve varsa PITR); geri yükleme provası.
4. **Önce/sonra parmak izi:** EN/DE satırları ve `url_redirects` (S-10).
5. **Staging provası:** Canlı DB'nin taze kopyasına 105 → 108 uygulanmalı.
   - Bütün entegrasyon testleri o kopyada çalıştırılmalı. 11 dosya; `CONTENT_*_PG_URL` değişkenleri kopyaya işaret etmeli; testler veri yazdığı için kopya tek kullanımlık olmalı.
   - Faz 3'teki eski ↔ yeni karşılaştırma tekrarlanmalı: `mirror-drift` / `other` / `fallback-order` = 0.
6. **Runtime smoke testi:** Dalga 0'da Faz 6 çıkış kriteri olarak planlanmıştı (`next start` + üç ana dil; `/`, önekler, detay sayfaları, 308/307, hreflang, sitemap) ve **yapılmadı.** Staging'de yapılmalı.
7. **Commit stratejisi:** 277 commit edilmemiş değişiklik ayrı bir branch'te, mantıksal commit'lerle toplanmalı (Faz 1–6). CI'da birim testleri, ESLint ve build. `.env*` dosyaları commit'e girmemeli.
8. **108'in taslaktan çıkarılması:** `_drafts/108_language_slug_separation.DRAFT.sql` son bir incelemeden sonra `db/migrations/108_language_slug_separation.sql` olarak alınmalı. Başlığındaki "taslak" ifadeleri ve geri dönüş notu güncellenmeli (R2 uyarısı eklenmeli).

### 7.2 Önemli (P1)

9. Veri kontrolleri (S-3 … S-9): biçim dışı slug, `pages.content`, `""` gövde, boş ödeme adı, slug çakışmaları.
10. **Ana dil TR kalmalı.** Eski okuyucudaki yüzeyler (§1.2) simetrik değil; ana dil değişimi ayrı bir iş.
11. Bakım penceresi düşük trafikli bir saatte olmalı. Admin içerik yazımı 105–107 sırasında dondurulmalı. Rezervasyon akışı durdurulmaz; 106 yalnız kısa kilit alır ve `lock_timeout` ile sınırlıdır.
12. Coolify'da instance sayısı kontrol edilmeli. Next cache ve proxy'nin 30 saniyelik bellek TTL'i instance başına; birden fazla instance varsa `revalidateTag` her instance'a ulaşmaz (Faz 4 audit R8, açık). Tek instance ise sorun yok.

---

## 8. Ödeme yöntemi, voucher ve e-posta — Türkçe kalma kararı

**Karar:** Faz 0 §4 ve Faz 0.1 §9 karar 6; uygulamada "karar 7". Rezervasyon, fiyat, ödeme, voucher ve e-posta **kodu** geçişin dışında; voucher ve e-postalar Türkçe.

**Bu denetimde doğrulananlar:**

- Aşağıdaki yollarda **hiçbir commit edilmemiş değişiklik yok** (`git status` boş):
  - `app/lib/voucher`, `app/lib/mail`, `app/api/mail`, `app/api/voucher`;
  - `lib/db/voucher.repository.server.ts`;
  - `app/services/reservation`, `app/api/public/reservations`.
- Voucher şablonu `<html lang="tr">` (`template.ts:165, 506`).
- Voucher repository ödeme adını ana tablo aynasından okuyor: `payment_method:payment_method_id(name)`.
- Mail şablonları dil veya içerik servisi kullanmıyor.

**Ödeme yöntemi hem çevrilebilir içerik hem kapsam dışı: ikisi nasıl birlikte doğru?**

- Yöntemin **adı** çevrilebilir içerik; admin'de merkezi yazmada.
- Voucher ve e-posta ise ana tablodaki TR aynası `payment_methods.name` kolonunu okuyor. Kalıcı ayna kararı bu okumayı güvence altına alıyor.
- Ana dil TR değilken TR adı **zorunlu** (`payment-method-tr.ts`); genel mimaride TR zorunlu değil.

**Sınırlar:**

- Kontrol yalnız yeni kayıtlarda çalışıyor. Mevcut veri S-9 ile kontrol edilmeli.
- Ana dil değişim sihirbazında bu konuya dair uyarı yok (teknik borç T8).
- K4 kararıyla TR kapatılabiliyor, ama voucher ve e-postalar Türkçe kalıyor. Bu bilinçli bir karar; müşteri iletişimi açısından ürün tarafında not edilmeli.

---

## 9. Kontrol edilmesi gereken SQL ve doğrulama sorguları

Hepsi salt okunur ve `BEGIN TRANSACTION READ ONLY; … ROLLBACK;` içinde çalıştırılmalı. S-0, S-1 ve S-6'nın tamamı bu denetimde iki şablon kopyasında **çalıştırılıp şemayla uyumlu bulundu**. Kopyalarda sonuçlar: eksik 0, içerik farkı 0, slug farkı 0, 15 UNIQUE kısıtı, `""` gövde 0, boş ödeme adı 0, biçim dışı kategori slug'ı 1.

### S-0. Canlı şema durumu (101–108)

```sql
SELECT to_regclass('public.site_locales')                         AS m101,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND column_name='slug'
           AND table_name IN ('villa_translations','villa_type_translations',
                              'blog_post_translations','page_translations'))      AS m102_cols,   -- 4
       to_regclass('public.url_redirects')                        AS m103,
       to_regprocedure('public.change_public_root_locale(text,text)') AS m104,
       to_regprocedure('public.content_mirror_mode()')            AS m105,        -- 105 öncesi NULL
       to_regprocedure('public.trg_content_mirror_base_to_tr()')  AS m106,
       to_regprocedure('public.content_language_slugs_separated()') AS m108,
       (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
         AND tgname LIKE '%\_slug\_history' ESCAPE '\')           AS slug_hist;  -- 8
SELECT multilingual_enabled, public_default_locale, (SELECT count(*) FROM settings) AS n FROM settings; -- n=1
```

### S-1. Kilit riski ve veri hacmi (her migration'dan hemen önce)

```sql
SELECT pid, usename, state, now()-xact_start AS tx_age, left(query,80)
  FROM pg_stat_activity
 WHERE datname=current_database() AND xact_start IS NOT NULL
 ORDER BY xact_start;
SELECT relname, n_live_tup FROM pg_stat_user_tables
 WHERE relname ~ '(_translations$|^villa$|^villa_types$|^blog_posts$|^pages$|^url_redirects$)'
 ORDER BY 1;
```

### S-2. 105 öncesi ve sonrası

```sql
-- Önce: ('en','de'); sonra: ('tr','en','de')
SELECT conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname IN ('settings_translations_locale_check','site_popup_translations_locale_check');
-- Önce: 0 beklenir (10 tablo için aynı desen)
SELECT 'villa', count(*) FROM villa_translations WHERE locale='tr'
UNION ALL SELECT 'blog', count(*) FROM blog_post_translations WHERE locale='tr'
UNION ALL SELECT 'page', count(*) FROM page_translations WHERE locale='tr';
-- Sonra:
SELECT public.content_mirror_mode();                                    -- 'base'
SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
   AND tgname LIKE '%\_content\_tr\_guard' ESCAPE '\';                  -- 14
SELECT has_function_privilege('<uygulama_rolü>','public.content_mirror_mode()','EXECUTE');
```

### S-3. 106 öncesi: aynanın gerektirdiği yapı

```sql
-- ON CONFLICT (fk, locale) için UNIQUE kısıtı: 15 satır
SELECT conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE contype='u' AND conrelid::regclass::text ~ '_translations$'
   AND pg_get_constraintdef(oid) ~ ', locale\)$' ORDER BY 1;
-- Çeviri tablosunda NOT NULL içerik kolonu (ayna INSERT'ini kırabilir)
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name ~ '_translations$' AND is_nullable='NO'
   AND column_name NOT IN ('id','locale','created_at','updated_at') AND column_name !~ '_id$';
-- Biçim dışı veya NULL teknik anahtar (villa, villa_types, blog_posts, pages için)
SELECT 'villa', count(*) FILTER (WHERE slug IS NULL),
       count(*) FILTER (WHERE slug IS NOT NULL AND NOT (char_length(slug) BETWEEN 1 AND 160
                        AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')) FROM villa;
```

### S-4. 106 sonrası

```sql
SELECT split_part(tgname,'_content_',2) AS kind, count(*) FROM pg_trigger
 WHERE NOT tgisinternal AND tgname LIKE '%\_content\_%' ESCAPE '\' GROUP BY 1;
-- base_guard 14, mirror_to_base 14, mirror_to_tr 14, tr_guard 14
SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
   AND tgname LIKE '%\_content\_%' ESCAPE '\' AND tgenabled <> 'O';     -- 0 satır
```

### S-5. 107 preflight: tekrar ve çakışma

```sql
SELECT slug, count(*) FROM villa WHERE slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 GROUP BY slug HAVING count(*) > 1;                                      -- 0
SELECT b.id, b.slug, t.locale FROM villa b
  JOIN villa_translations t ON t.slug = b.slug AND t.villa_id <> b.id;   -- 0
-- (villa_types/type_id, blog_posts/blog_post_id, pages/page_id için aynı desen)
```

### S-6. TR aynası ↔ `tr` satırı: ana doğrulama sorgusu

Beklenen değerler:

- **107 sonrası:** `eksik = 0`, `icerik_fark = 0`, `slug_fark = 0`.
- **108 sonrası:** `slug_fark > 0`, admin'in TR slug'ı düzenlediği anlamına gelir. Normaldir.

```sql
WITH s AS (SELECT '^[a-z0-9]+(-[a-z0-9]+)*$'::text re)
SELECT 'villa' e, count(*) n, count(*) FILTER (WHERE t.id IS NULL) eksik,
 count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.description,t.badge,t.seo_title,t.seo_description)
   IS DISTINCT FROM row(b.description,b.badge,b.seo_title,b.seo_description)) icerik_fark,
 count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM
   CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ (SELECT re FROM s) THEN b.slug END) slug_fark
FROM villa b LEFT JOIN villa_translations t ON t.villa_id=b.id AND t.locale='tr'
UNION ALL
SELECT 'blog_posts', count(*), count(*) FILTER (WHERE t.id IS NULL),
 count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.title,t.body,t.excerpt,t.seo_title,t.seo_description)
   IS DISTINCT FROM row(b.title,b.body,b.excerpt,b.seo_title,b.seo_description)),
 count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM
   CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ (SELECT re FROM s) THEN b.slug END)
FROM blog_posts b LEFT JOIN blog_post_translations t ON t.blog_post_id=b.id AND t.locale='tr'
UNION ALL
SELECT 'pages', count(*), count(*) FILTER (WHERE t.id IS NULL),
 count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.title,t.body,t.excerpt,t.seo_title,t.seo_description,t.sections)
   IS DISTINCT FROM row(b.title,b.body,b.excerpt,b.seo_title,b.seo_description,b.sections)),
 count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM
   CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ (SELECT re FROM s) THEN b.slug END)
FROM pages b LEFT JOIN page_translations t ON t.page_id=b.id AND t.locale='tr'
UNION ALL
SELECT 'villa_types', count(*), count(*) FILTER (WHERE t.id IS NULL),
 count(*) FILTER (WHERE t.id IS NOT NULL AND t.name IS DISTINCT FROM b.name),
 count(*) FILTER (WHERE t.id IS NOT NULL AND t.slug IS DISTINCT FROM
   CASE WHEN char_length(b.slug) BETWEEN 1 AND 160 AND b.slug ~ (SELECT re FROM s) THEN b.slug END)
FROM villa_types b LEFT JOIN villa_type_translations t ON t.type_id=b.id AND t.locale='tr'
UNION ALL
SELECT 'settings', count(*), count(*) FILTER (WHERE t.id IS NULL),
 count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.footer_copyright,t.default_meta_title,
   t.default_meta_description,t.hero_title,t.hero_subtitle,t.hero_badge_text,t.hero_primary_cta_text,
   t.hero_secondary_cta_text,t.business_hours) IS DISTINCT FROM row(b.footer_copyright,b.default_meta_title,
   b.default_meta_description,b.hero_title,b.hero_subtitle,b.hero_badge_text,b.hero_primary_cta_text,
   b.hero_secondary_cta_text,b.business_hours)), NULL
FROM settings b LEFT JOIN settings_translations t ON t.settings_id=b.id AND t.locale='tr'
UNION ALL
SELECT 'site_popup', count(*), count(*) FILTER (WHERE t.id IS NULL),
 count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.title,t.description,t.highlight_text,t.stats,
   t.button_text,t.button_url) IS DISTINCT FROM row(b.title,b.description,b.highlight_text,b.stats,
   b.button_text,b.button_url)), NULL
FROM site_popup b LEFT JOIN site_popup_translations t ON t.popup_id=b.id AND t.locale='tr'
UNION ALL
SELECT 'payment_methods', count(*), count(*) FILTER (WHERE t.id IS NULL),
 count(*) FILTER (WHERE t.id IS NOT NULL AND t.name IS DISTINCT FROM b.name), NULL
FROM payment_methods b LEFT JOIN payment_method_translations t ON t.payment_method_id=b.id AND t.locale='tr'
UNION ALL
SELECT 'faqs', count(*), count(*) FILTER (WHERE t.id IS NULL),
 count(*) FILTER (WHERE t.id IS NOT NULL AND row(t.question,t.answer) IS DISTINCT FROM row(b.question,b.answer)), NULL
FROM faqs b LEFT JOIN faq_translations t ON t.faq_id=b.id AND t.locale='tr';
-- Tek alanlı diğer türler için aynı desen:
--   villa_features/feature_id/name, rule_items/rule_id/title, price_include_items/include_id/title,
--   menu/menu_id/name, homepage_collections ve discount_collections/collection_id/custom_title
```

### S-7. `pages.content`

```sql
SELECT 1 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='pages' AND column_name='content';
-- Kolon varsa:
SELECT count(*) FROM pages WHERE body IS NULL AND content IS NOT NULL;
```

### S-8. Bilinçli boş gövde ve boşluk

```sql
SELECT 'blog', count(*) FROM blog_post_translations WHERE body = ''
UNION ALL SELECT 'page', count(*) FROM page_translations WHERE body = '';   -- 0 beklenir
```

### S-9. Ödeme adı ve kategori teknik anahtarı

```sql
SELECT id, created_at FROM payment_methods WHERE btrim(coalesce(name,'')) = '';  -- 0
SELECT id, slug FROM villa_types
 WHERE slug IS NULL OR slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$';
```

### S-10. Değişmemesi gerekenlerin parmak izi (her migration'dan önce ve sonra)

```sql
SELECT 'villa_tr_disi', count(*), md5(string_agg(t::text,'|' ORDER BY t.id))
  FROM villa_translations t WHERE locale <> 'tr'
UNION ALL SELECT 'blog_tr_disi', count(*), md5(string_agg(t::text,'|' ORDER BY t.id))
  FROM blog_post_translations t WHERE locale <> 'tr'
UNION ALL SELECT 'page_tr_disi', count(*), md5(string_agg(t::text,'|' ORDER BY t.id))
  FROM page_translations t WHERE locale <> 'tr'
UNION ALL SELECT 'url_redirects', count(*), md5(string_agg(r::text,'|' ORDER BY r.id))
  FROM url_redirects r;
-- (diğer 11 çeviri tablosu için aynı desen)
```

### S-11. 108 sonrası

```sql
SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL;  -- true
SELECT public.content_mirror_mode();                                              -- 'base'
SELECT p.proname, position('108' IN p.prosrc) > 0 FROM pg_proc p
 WHERE p.oid IN ('public.trg_content_mirror_base_to_tr()'::regprocedure,
                 'public.trg_content_tr_guard()'::regprocedure);                  -- ikisi true
-- Trigger sayısı hâlâ 56 (S-4)
```

### S-12. Yetim `url_redirects` (bilgi amaçlı)

```sql
SELECT entity_kind, count(*) FROM url_redirects r WHERE NOT (
  (entity_kind='villa'     AND EXISTS (SELECT 1 FROM villa       WHERE id=r.entity_id)) OR
  (entity_kind='villaType' AND EXISTS (SELECT 1 FROM villa_types WHERE id=r.entity_id)) OR
  (entity_kind='blog'      AND EXISTS (SELECT 1 FROM blog_posts  WHERE id=r.entity_id)) OR
  (entity_kind='page'      AND EXISTS (SELECT 1 FROM pages       WHERE id=r.entity_id)))
GROUP BY 1;
```

---

## 10. Önerilen rollout adımları

Her adım ayrı onayla yapılır. Bu denetim hiçbirini başlatmaz.

| Adım | İş | Çıkış kriteri |
|---|---|---|
| 0 | Commit stratejisi: Faz 1–6 değişiklikleri ayrı bir branch'te mantıksal commit'ler halinde; CI | Birim testleri, ESLint (0 hata) ve build yeşil |
| 1 | Canlıda salt okunur: S-0, Q1–Q12, S-3/5/7/8/9, S-10 (taban) | 101–104 mevcut; engelleyici veri sorunu yok ya da her biri için karar alınmış |
| 2 | **Staging provası** (canlının taze kopyası): 105 → 106 → 107; yeni kod; 108; S-2 … S-11; 11 entegrasyon testi dosyası; eski ↔ yeni karşılaştırma; runtime smoke (ana dil TR / EN / DE) | Bütün sorgular beklenen değerde; smoke temiz; süreler ölçülmüş |
| 3 | Canlı: yedek (`pg_dump` + PITR noktası); admin içerik yazımı dondurulur | Yedek doğrulanmış |
| 4 | Canlı: 105 → 106 → 107 (`ON_ERROR_STOP`, `lock_timeout`). Her birinin arasında S-1; sonrasında S-2, S-4, S-6, S-10 | `eksik = 0`, `icerik_fark = 0`, `slug_fark = 0`; EN/DE parmak izi aynı |
| 5 | Canlı: yeni kodun deploy'u (Coolify). Ana dil **TR** kalır | Smoke: `/`, `/en`, `/de`, villa, kategori, blog, CMS, sitemap, robots, 308/307; admin'de bir test kaydı |
| 6 | 1–3 gün izleme: hata logları, DB `WARNING`'leri (slug geçmişi), admin kayıtları | Hata yok |
| 7 | Canlı: 108 (taslaktan çıkarılmış hâli). Sonrasında S-11 ve S-6 | TR slug düzenleme admin'de açık; bir test slug değişikliği → eski URL 308 |
| 8 | En az 2–4 hafta gözlem. 109 (mod değişimi) yalnız gerekirse ve ayrı onayla (§3.2) | — |

---

## 11. Geri dönüş planı

| Belirti | Aksiyon | Sıra |
|---|---|---|
| 105, 106 veya 107 migration sırasında hata verdi | Bir şey yapma. Transaction kendiliğinden geri alınır. Nedeni incele, gerekirse veri düzelt, tekrar dene. | — |
| 107 sonrası S-6 fark ≠ 0 (beklenmez; 107 kendi içinde doğruluyor) | Kodu deploy etme; nedeni incele. Gerekirse R3 (yalnız 108 öncesi güvenli). | Kod deploy edilmez |
| Yeni kod sonrası public veya admin hatası | **R1:** önceki imaja dön. DB olduğu gibi kalır (`HEAD` 105–107 ile uyumlu). | 1 |
| 108 sonrası TR URL sorunu | İleriye dönük düzelt: hatalı TR slug'ları admin'den düzelt; yönlendirmeler trigger'la oluşur. R2 yalnız son çare; önce `slug_fark > 0` olan kayıtlar için `url_redirects` elle hazırlanmalı. | 1 → (2) |
| Veri bozulması şüphesi | Yazımları durdur; S-6 ve S-10 ile kapsamı ölç. Yalnız gerekirse R5 (yedek). Rezervasyon ve ödeme verisini önce dışa al. | Son çare |

**Geri dönüş için hazır tutulmalı:**

- Önceki Coolify imajının etiketi;
- migration öncesi dump'ın yolu ve geri yükleme komutu;
- R2 için yönlendirme hazırlama sorgusu (S-6'daki `slug_fark` satırlarından üretilir);
- R3 ve R4 betikleri (Faz 2 §6, Faz 1 §7). Bunlar yalnız izole PG'de test edildi; staging provasında da denenmeli.

---

## 12. Açık riskler ve teknik borçlar

### 12.1 Canlıya geçişten önce kapatılmalı (A)

| # | Konu | Kaynak |
|---|---|---|
| A1 | 101–104 canlı durumu bilinmiyor; Q1–Q12 hiç çalıştırılmadı | `_archive/README`, Faz 0.1 §7 |
| A2 | Runtime smoke testi yapılmadı | D0 §8–9 |
| A3 | 277 commit edilmemiş değişiklik; commit ve CI planı | `git status` |
| A4 | 108 taslakta. Taslaktan çıkarma ve geri dönüş notunun düzeltilmesi (R2 SEO uyarısı) | `_drafts/108` başlığı |
| A5 | Migration dosyalarında `lock_timeout` yok; çalıştırma prosedürü yazılı değil | 106 |
| A6 | Faz 5 dalga 2'deki "önce 108" ifadesi ile bu denetimdeki "kod → 108" sırası çelişiyor; prosedürde netleştirilmeli | §2.2 |

### 12.2 Ana dil TR dışına alınmadan önce (B)

| # | Konu | Kaynak |
|---|---|---|
| B1 | Eski okuyucudaki public yüzeyler (§1.2) | D2 §7, D4 §5.1/§7 |
| B2 | `CmsPageBody` kurumsal/eyebrow kararı TR başlığından | D3 §1 |
| B3 | Ana dil sihirbazında ödeme yöntemi TR adı uyarısı | Faz 5 D2 §11.5 |
| B4 | Ana sayfa tekil kayıt kuralı ile kök layout karar B'nin "diğer aktif dil" adımı farklı; hizalama isteğe bağlı | D5 §9.1 |
| B5 | Ayar okunamazsa ana sayfa meta yedeği Türkçe | D4 §8.1 |

### 12.3 Teknik borç (T)

| # | Konu | Öncelik |
|---|---|---|
| T1 | Migration yeniden çalıştırma sürüm düşürüyor (106 → 108'i geri alır). Fonksiyonlara sürüm işareti ve "daha yeniyse ezme" koruması; migration ledger tablosu | Orta |
| T2 | `content_mirror_mode()` değeri DB'de beyaz listeye alınmamış (109 yapılırsa zorunlu) | Orta |
| T3 | 106'da slug çakışmasında sessiz NULL; slug geçmişi hatalarının `WARNING` ile yutulması | Orta |
| T4 | 107 geri dönüş betiği slug'a bakmıyor; 108 geri dönüşü yönlendirme üretmiyor | Orta |
| T5 | Teknik anahtar benzersizliği çeviri tablolarındaki slug'lara karşı kontrol edilmiyor (V6) | Düşük–orta |
| T6 | Global `content` tag'i ve villa `locale-slugs` tag'i yüzünden fazla invalidation (yalnız performans) | Düşük |
| T7 | Ana sayfadaki kısa süreli fırsatlar bölümü yalnız zamana bağlı ISR ile yenileniyor (10 dk / 1 sa) | Düşük |
| T8 | İyimser eşzamanlılık yok ("başkası değiştirdi" uyarısı) | Düşük |
| T9 | "Ana dil" notu ve eksik çeviri rozeti yalnız 3 admin sayfasında | Düşük |
| T10 | Ölü kod: `get-blog-translation`, `get-page-translation`, `content-availability.server`, `getCachedFaqs` EN/DE girdileri, `applyFaqTranslations`, eski `getCachedSitePopup`, `site-locales.validation.ts` içindeki "Türkçe kapatılamaz" mesajı | Düşük |
| T11 | `noindex` bayrağı olan sayfada hreflang basılıyor (bilinçli; değerlendirilebilir) | Düşük |
| T12 | Kategori villa sayısı sitemap'te ve sayfada farklı kaynaktan | Düşük |
| T13 | `getCoverage` soft-delete'i ayırt etmiyor (yaklaşık) | Düşük |
| T14 | SSS kaydı tam atomik değil; villa ilişkileri ve fiyatlar ayrı transaction'da | Düşük |
| T15 | 103 ana tablo slug geçmişi "teknik anahtar geçmişi" anlamına çevrilmedi ("109-C") | Düşük |
| T16 | Repodaki eski `.next` klasörü tsc'de 61 sahte hata üretiyor (§13). Yerelde `.next`'in silinmesi kullanıcının kararı | Düşük |
| T17 | 106 ve 105 guard'larındaki `id::text = $1` index kullanamaz | Düşük |
| T18 | `f6b` test şablonu emekliye ayrılabilir | Düşük |

### 12.4 Bilinçli olarak kapsam dışı (K)

- Rezervasyon, fiyat, takvim, ödeme, voucher ve e-posta kodu (Türkçe kalır).
- `villa_distances` sözlük çözümü, `villa.title`, `villa_locations.name`, `villa_location_translations`.
- iCal export route'u yok (muhtemelen 404); ayrı iş.
- Faz 8: ayna trigger'larının ve legacy kolonların kaldırılması (kalıcı ayna kararıyla ertelendi).
- `content` → `body` veri taşıması (`pages.content`).
- Canlıdaki eski yetim `url_redirects` kayıtlarının temizliği (isteğe bağlı).

---

## 13. TypeScript doğrulaması (madde 12)

| Ortam | Sonuç |
|---|---|
| Repo (yerel, `.next` 2026-10-10 tarihli) | 61 hata, **hepsi** `TS2307`, **hepsi** `.next/types/validator.ts` içinde. Örnek: `Cannot find module '../../app/(public)/arama/page.js'`. Faz 6'da silinen `locale-page` route'larına işaret ediyorlar. |
| Temiz kopya, `.next` ve `tsconfig.tsbuildinfo` olmadan: `tsc --noEmit` | **0 hata** |
| Aynı kopyada `next build --webpack`, ardından taze `.next/types` ile `tsc --noEmit` | Build başarılı (TypeScript adımı dahil, 49 statik sayfa); tsc **0 hata** |
| Route tablosu | `build14.log` ile birebir aynı |

**Sonuç:** Kaynak kodda gerçek bir tip hatası yok. Kod değiştirilmedi. Build kopyasındaki `.next` sonradan silindi. Repodaki eski `.next` klasörüne dokunulmadı; silinmesi veya yeniden üretilmesi kullanıcının kararı.

---

## 14. Güvenlik beyanı

- Canlı veya staging DB, sunucu ya da Coolify erişimi **yok**.
- Hiçbir migration çalıştırılmadı. 109 oluşturulmadı.
- `content_mirror_mode()` değişmedi.
- Kod, yapılandırma, commit, push veya deploy **yok**.
- Kullanıcı değişikliklerine dokunulmadı. tsc ve build ayrı bir kopyada (`buildcopy`) yapıldı.
- `m106` ve `m108clean` değiştirilmedi:
  - sorgular tek kullanımlık kopyalarda, `READ ONLY` transaction içinde çalıştı;
  - kopyalar silindi;
  - şema, veri ve `pg_stat` yazma sayaçları önce/sonra birebir aynı.
- Bu rapor dışında yazılan dosya yok.

**Denetim tamamlandı.** Canlıya erişim, migration uygulama, commit, push veya deploy için ayrı onayınızı bekliyorum.
