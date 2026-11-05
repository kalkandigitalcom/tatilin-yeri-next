# Faz 5 Son Kontrolleri: Boş Gövde ve Teknik Anahtar

**Tarih:** 4 Kasım 2026
**Sonuç:**

- Boş gövde davranışı düzeltildi.
- Teknik anahtar kuralları dört türde (villa, blog, CMS sayfası, kategori) ve migration 108 **öncesi ve sonrası** ayrı ayrı doğrulandı.
- Tam paket, TypeScript, ESLint ve build başarılı.
- İzole PG'de 166 testin 165'i geçti. Tek uyumsuzluk Faz 3 okuma testinin 108 sonrası kopyasında: önceki fazların test verisinden kaynaklanıyor, bu düzeltmeyle ilgisi yok (§4).

---

## 1. Boş gövde (`""`)

### 1.1 Sorun

Okuma servisi blog ve sayfa gövdesinde `""` değerini "boş" sayıp yedek zincirine devam ediyordu (istenen dil → ana dil → diğer aktif diller). Ana formda bilerek boşaltılan bir gövde, başka dilin gövdesiyle dolabiliyordu.

### 1.2 Düzeltme

Yalnız okuma çekirdeği değişti; yazma yolları zaten doğru değeri yazıyordu.

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/content/content-field-rules.ts` | `CONTENT_EXPLICIT_EMPTY_FIELDS = { blog_post: ["body"], page: ["body"] }`, `isExplicitEmptyContent()` |
| `lib/i18n/content/content-resolve.ts` | Zincirde bilinçli boş gövdeye gelince **durur**: değer `""`, kaynak dil o dil |
| `lib/i18n/content/content-contract.ts` | `LocalizedContent.explicitEmpty?: string[]` |

**Gövde sözleşmesi (blog ve CMS sayfası):**

| Yazılan değer | Anlamı | Okuma |
|---|---|---|
| Anahtar yok | Dokunulmaz | Eski değer kalır |
| `NULL` | Değer yok | Zincir devam eder. Sayfada TR için eski `pages.content` yedeği uygulanır (Faz 3.1) |
| `""` (yalnız boşluk dahil) | **Bilinçli boş** | Zincir o dilde **durur**. Başka dilin gövdesi ve eski `content` gösterilmez. Değer `""` döner. Alan `missing` ve `explicitEmpty` listelerinde yer alır |

**Yazma tarafı (değişmedi, zaten uyumlu):**

- Ana formda gövde boşaltılınca `""` yazılır (blog ve sayfa).
- Çeviri kartlarında boş bırakılan alan `NULL` yazılır, yani ana dile düşer.
- İstemciden gönderilmeyen alan, kayda hiç girmez.

**Zincirdeki konum:** Durma, zincirin **ilk** bilinçli boş dilinde gerçekleşir.

- Örnek: ana dil TR'de gövde `""` ve EN gövdesi `NULL` ise, EN sayfası da boş gövde gösterir. DE'nin gövdesine geçilmez.
- Bu davranış eski sisteme daha yakın: eskiden yedek yalnız TR canonical değeriydi, TR `""` ise EN sayfası da boş gösterirdi.

**Diğer alanlar ve türler değişmedi:**

- Başlık, özet, SEO alanları ve bölümler eskisi gibi yedek dile düşer.
- Villa, SSS, popup gibi diğer türlerde `""` eskisi gibi boş sayılır.

**SEO (noindex):**

- Bilinçli boş gövde "bu dilde çeviri var" **sayılmaz**.
- İstenen dilde başlık veya özet varsa `index`.
- Yalnız boş gövde varsa `isFallback=true`, yani `noindex,follow` (Faz 3.1 kuralı korundu).

### 1.3 Eski ↔ yeni okuma karşılaştırması

- **Ana dil TR, TR gövdesi `""`:** TR ve çevirisiz dillerde eski ve yeni sonuç **aynı** (birim testi + izole PG).
- **Kasıtlı tek fark:** Bir **çeviri** satırında gövde `""` ise:
  - eski katman TR'ye düşüyordu;
  - yeni servis bunu bilinçli boş sayıyor (istenen davranış).
- **Gerçek veride bu fark oluşmaz:** Eski EN/DE çeviri servisleri boş alanı **daima `NULL`** yazıyordu. Bu yüzden canlı veride çeviri satırında `""` beklenmiyor.
- **Canlıda doğrulama için salt okunur sorgu** (ayrı onayla):

  ```sql
  SELECT 'page' AS t, count(*) FROM page_translations WHERE locale <> 'tr' AND body IS NOT NULL AND btrim(body) = ''
  UNION ALL
  SELECT 'blog', count(*) FROM blog_post_translations WHERE locale <> 'tr' AND body IS NOT NULL AND btrim(body) = '';
  ```

**Bu nedenle güncellenen eski test verileri** (beklentiler aynı):

- `content-read-compat.test.ts`: EN satırının `""` gövdesi `NULL` yapıldı; çevrilmemiş gövde böyle saklanıyor. Yalnız boşluk içeren TR gövdesi artık `""` döner ve `explicitEmpty` listesinde. Eski `content` yine gösterilmiyor.
- `content-read-pg.test.ts`: Aynı EN tohum verisi `NULL` yapıldı.
- `content-faz5-pg.test.ts`: `""` sonrası beklenen değer `null` yerine `""` oldu. "Eski content görünmez" ve `missing` beklentileri aynen geçerli.

Kasıtlı farkın kendisi yeni testte ayrıca doğrulanıyor.

---

## 2. Teknik anahtar

### 2.1 Kod denetimi

Bu bölümde düzeltme gerekmedi; mevcut kodun doğrulaması yapıldı.

- Ana tablo `slug`'ı yalnız `createContent` (oluşturma) ile yazılır.
- Yazma çekirdeği teknik yamada `slug`'ı reddeder.
- Villa güncellemesi artık `generateUniqueSlug` çağırmıyor.
- Blog ve sayfa ana formundaki slug alanı **ana dilin URL slug'ıdır**, çeviri satırına yazılır.
- Kategori adı güncellemesi slug parametresini yok sayar. Tek istisna: anahtar **boşsa** bir kez atanır; dolu anahtar değişmez.
- TR, EN ve DE slug'ları kendi çeviri satırlarındadır.
  - **TR slug'ı, 108 öncesi:** `guard` ile korunur.
  - **TR slug'ı, 108 sonrası:** bağımsız yazılır.

### 2.2 İzole PG ile doğrulama

Her senaryo 108 **öncesi** ve **sonrası** kopyada ayrı koştu.

| Senaryo | 108 öncesi | 108 sonrası |
|---|---|---|
| Villa, blog, sayfa, kategori: oluşturmada anahtar bir kez yazılır, TR satırına tohumlanır | ✅ | ✅ |
| 3 dilde içerik güncellemesi + teknik yama (villa adı, yayın durumu) anahtarı değiştirmez | ✅ | ✅ |
| EN ve DE slug'ları bağımsız; anahtar ve TR slug'ı etkilenmez | ✅ | ✅ |
| TR slug'ı | `guard` ile reddedilir, hiçbir şey değişmez | Bağımsız yazılır |
| TR içerik yazımı (ayna) TR slug'ını ezmez | ✅ | ✅ |
| Teknik yamayla `slug` yazımı reddedilir (`validation`) | ✅ | ✅ |
| Ayna tetikleyicisi: TR → ana kolon; EN/DE ana kolonu değiştirmez | ✅ | ✅ |
| Guard: TR satırının içeriğine doğrudan SQL yazımı reddedilir | ✅ | ✅ |
| Guard: TR satırına doğrudan slug-only güncelleme | Reddedilir | Serbest |
| Rollback: hatalı teknik kolon → içerik ve dil slug'ı da geri alınır | ✅ | ✅ |
| Eşzamanlı: 18 paralel yazım (3 dil içerik + EN/DE slug + teknik) | ✅ kilitlenme yok, anahtar sabit | ✅ |
| Kategori: boş anahtar bir kez atanır, sonraki ad/dil güncellemeleri değiştirmez | ✅ | ✅ |
| Boş gövde: blog ve sayfa × ana dil TR/EN/DE (`""` durur, `NULL` düşer, anahtar yok → dokunulmaz) | ✅ | ✅ |
| noindex korunur | ✅ | ✅ |
| Eski `pages.content`: `""` iken gelmez, `NULL` iken gelir (test kolonlu kopyada) | ✅ | ✅ |
| Eski ↔ yeni karşılaştırma: TR gövdesi `""` iken fark yok | ✅ | ✅ |

---

## 3. İzole test ortamı ve güvenlik

Onayınızla yalnız buluttaki **mevcut izole PostgreSQL** kullanıldı.

**Ortamın izole olduğu doğrulandı:**

- PostgreSQL 16.15, aynı kapsayıcıda.
- `listen_addresses = localhost`, port 5432.
- Dış ağa açık değil.
- Canlı veya staging bağlantı bilgisi kullanılmadı.

**Şablonlar** (yalnız `TEMPLATE` kaynağı; hiçbir test bunlara bağlanmadı):

| Şablon | İçerik |
|---|---|
| `m106` | 082–107 uygulanmış → "108 öncesi" |
| `f6b` | 082–107 + 108 taslağı (önceki fazda uygulanmış) → "108 sonrası" |

**Kullanılan tek kullanımlık kopyalar** (hepsi `CREATE DATABASE … TEMPLATE …`; test sonunda **silindi**):

- Geliştirme sırası:
  - `sk108`, `sk108c`, `sk5`, `skd2`, `sk5b` (f6b);
  - `sk106`, `sk106c`, `skr`, `skrc`, `skrc2`, `skrc3`, `skw`, `skwt`, `sk5n`, `sk5nb` (m106).
- Son tam tur:
  - `fk_r108c`, `fk_f5`, `fk_d2`, `fk_sk108`, `fk_sk108c` (f6b);
  - `fk_r106`, `fk_r106c`, `fk_w`, `fk_wt`, `fk_f5n`, `fk_sk106`, `fk_sk106c` (m106).
- Toplam 27 kopya oluşturuldu, 27'si silindi.

**Kopyalarda yapılanlar:**

- `CONTENT_SK_PG_FIXTURE_DDL=1` veya `CONTENT_READ_PG_FIXTURE_DDL=1` ile yalnız `…c` kopyalarına `pages.content` test kolonu eklendi.
- Faz 4 yazma testi, kendi `…wt` kopyasında ayna modunu `translations`'a alıyor (mevcut test, yalnız o kopyada).
- **Hiçbir migration çalıştırılmadı.**

**Şablonların değişmediği:**

- Sunucu başlangıcından (15:29 UTC) beri `pg_stat_database` sayaçları her iki şablon için `tup_inserted = tup_updated = tup_deleted = 0`. Yani satır yazımı yok; katalog satırları da sayıldığı için DDL de yok.
- `m106`: 108 yetenek fonksiyonu yok, mod `base`. `f6b`: 108 var, mod `base`. İkisi de değişmedi.
- **Not:** Testlerden önce aldığım `pg_dump` md5 parmak izi kullanılamadı. PG 16'nın `pg_dump` çıktısına her çalıştırmada rastgele bir `\restrict` anahtarı eklediği ortaya çıktı (aynı DB'de arka arkaya iki farklı md5). Bu yüzden "değişmedi" kanıtı yukarıdaki istatistik sayaçlarına dayanıyor. Sonraki karşılaştırmalar için belirleyici parmak izi kaydedildi (`\restrict` satırları hariç):
  - `m106`: şema `497e4d7fa0d9bae8`, veri `b530b0521a4568ca`
  - `f6b`: şema `577c9109478f6b90`, veri `5193f62b49a38826`

**Buluta aktarılan dosyalar** (yalnız izole test alanına; hepsi önce md5 ile cihazdakiyle eşlendi, sonra hazırlık kopyaları silindi):

- **Kaynak:**
  - `lib/i18n/content/content-resolve.ts`
  - `lib/i18n/content/content-field-rules.ts`
  - `lib/i18n/content/content-contract.ts`
- **Test:**
  - `tests/integration/content-faz5-son-kontroller-pg.test.ts` (yeni)
  - `tests/integration/content-faz5-pg.test.ts`
  - `tests/integration/content-read-pg.test.ts`

**Erişilmeyenler:**

- Canlı DB, staging DB, production sunucusu ve Coolify'a bağlanılmadı.
- Production veya staging ortamına dosya aktarılmadı; hiçbir şey yayınlanmadı.
- Production build'i, `.env*` dosyaları **hariç tutulan** yerel kopyada yapıldı; DB bağlantısı denenmedi.
- Commit, push ve deploy yapılmadı. Faz 6'ya başlanmadı.

---

## 4. Test sonuçları

| Kontrol | Sonuç |
|---|---|
| Tam paket (8 parça) | **271 dosya, 5.214 test: 5.101 başarılı, 113 atlanan, 0 başarısız** |
| Yeni birim testi `faz5-son-kontroller.test.ts` | **23/23** |
| İzole PG: son kontroller (108 öncesi + sonrası), `pages.content` kolonsuz | **36/36** |
| İzole PG: son kontroller (108 öncesi + sonrası), `pages.content` kolonlu | **36/36** |
| İzole PG: Faz 3 okuma (108 öncesi; kolonsuz ve kolonlu) | **14/14**, **14/14** |
| İzole PG: Faz 4 yazma | **18/18** |
| İzole PG: Faz 5 1. dalga (108 sonrası + öncesi) | **9/9** |
| İzole PG: Faz 5 2. dalga | **25/25** |
| TypeScript | Kaynak kodda **0 hata** (61 eski `.next/types` hatası değişmedi) |
| ESLint | **0 hata, 194 uyarı** (önceki toplamla aynı) |
| Production build | **Başarılı:** 32,7 sn, 49/49 sayfa |

**İzole PG toplamı (son tam tur):** 166 test çalıştı, 165'i başarılı, 1'i başarısız (aşağıda açıklanan, önceki test verisinden kaynaklanan tek uyumsuzluk). Faz 3 okuma testi 108 sonrası kopyada 13/14.

**Faz 3 okuma testinin 108 sonrası kopyadaki tek uyumsuzluğu:**

- Test "ana dil TR'de sayfa/blog SEO kararı eski ile birebir" kuralını doğruluyor. Eski kurala göre TR her zaman mevcuttur.
- `f6b` kopyasındaki önceki testlerin ana dil EN/DE ile oluşturduğu 6 sayfanın TR satırı **tamamen boş** (başlık, gövde ve özet yok).
- Bu veri biçimi eski sistemde oluşamazdı, eski kural bu kayıtlara uygulanmıyor. 6 uyumsuzluğun 6'sının da TR satırı boş (SQL ile doğrulandı).
- Bu kayıtlarda TR isteği başlığı başka dilden aldığı için bu değişiklikten önce de `noindex` alıyordu. Boş gövde düzeltmesinden kaynaklanmıyor.
- Test temiz `m106` kopyalarında tam geçiyor. Temiz bir 108 şablonu oluşturmak migration çalıştırmayı gerektirdiği için bu fazda yapılmadı.

---

## 5. Kalan riskler

1. **Çeviri satırında `""` gövde:** Kasıtlı fark (§1.3). Canlıda §1.3'teki salt okunur sorgu sıfır dönmeli. Sıfır dönmezse o satırlar `NULL`'a çekilmeli; bu ayrı onaylı bir veri kararı.
2. **Durma noktası:** Ana dil gövdesi bilinçli boşsa, gövdesi çevrilmemiş (`NULL`) diller de boş gövde gösterir. İstenirse kural "yalnız istenen dilde dur" olarak daraltılabilir; tek satırlık değişiklik.
3. **Temiz 108 şablonu yok:** 108 sonrası kopyalar önceki test verisini taşıyor. Testler koşu başına benzersiz anahtar kullandığı için tekrarlanabilir. Ancak eski ↔ yeni toplu karşılaştırma yalnız `m106`'da temiz sonuç veriyor. 108 staging'de uygulandığında karşılaştırma orada tekrarlanmalı.
4. **Önceki fazlardan kalan geçici kopyalar:** Bu turda oluşturulanlar silindi. Önceki fazlardan kalan geçici test DB'leri (`f3`, `f31`, `f4`, `f4t`, `f5`, `f5n`, `f6`, `g31`, `g4`, `g4t`, `g5`, `g5n`) duruyor. İsterseniz silerim; `m101`, `m103`, `m105`, `m106` ve `f6b` şablonlarına dokunmam.
