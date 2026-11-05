# Faz 5 Final Kapanış Raporu

**Tarih:** 4 Kasım 2026
**Kapsam:** Faz 5 son kontrollerinin kapanışı.

- Boş gövde kararı mimari karar olarak kayda geçirildi.
- Önceki fazlardan kalan geçici test DB'leri temizlendi.
- 108 sonrası başarısız PostgreSQL testinin nedeni analiz edildi ve test temiz bir 108 kopyasında yeniden çalıştırıldı.

**Bu turda yapılmayanlar:**

- Kod değişikliği yapılmadı.
- Hiçbir migration çalıştırılmadı.
- Şablon DB'ler (`m106`, `f6b`) değiştirilmedi.
- Buluta yeni dosya aktarılmadı. İzole test alanındaki dosyaların cihazdakilerle aynı olduğu md5 ile doğrulandı.
- Canlı DB, staging DB, sunucu ve Coolify'a erişilmedi.
- Commit, push ve deploy yapılmadı. Faz 6'ya başlanmadı.

---

## 1. Mimari karar: ana dilde bilinçli boş gövde

**Karar:** Blog veya CMS sayfasının **ana dildeki** gövdesi bilinçli olarak boş (`""`) kaydedildiyse, gövdesi çevrilmemiş (`NULL`) diğer diller de **boş gövde** gösterir. Yedek zinciri ana dildeki bilinçli boşlukta durur; üçüncü bir dilin gövdesine geçilmez.

**Gerekçe:**

- **Ana dilin kaynak olması:** Ana dil, içeriğin kaynağıdır. Orada gövdeyi bilerek boşaltmak (ör. sayfa yalnız bölümlerden oluşuyorsa), o kaydın "gövdesi yok" demektir. Başka bir dilin gövdesini göstermek bu niyeti bozar.
- **Eski sisteme yakınlık:** Eskiden yedek yalnız TR canonical değeriydi. TR gövdesi `""` ise çevirisiz EN/DE sayfaları da boş gövde gösteriyordu. Bu karar o davranışla aynı sonucu verir; izole PG'de eski ↔ yeni farkı sıfır.
- **Sınırlı etki:** Davranış yalnız gövdeye uygulanır. Başlık, özet, SEO ve bölümler eskisi gibi yedek dile düşer. Diğer içerik türleri etkilenmez.
- **SEO:** Bilinçli boş gövde "çeviri var" sayılmaz. Noindex kararı Faz 3.1 kurallarıyla aynı.

**Durum:** Faz 5 son kontrollerinde uygulanan davranış **korundu**; bu turda değişiklik yapılmadı. Uygulama ve testler için bkz. `faz-5-son-kontroller-raporu.md` §1.

---

## 2. Geçici test DB'lerinin temizliği

**Ortam doğrulaması:** Yerel izole PostgreSQL 16.15, `listen_addresses = localhost`, veri dizini `/var/lib/postgresql/16/main`, aynı kapsayıcı içinde. Bu ortamda canlı veya staging bağlantısı yoktur.

**Silinmeden önce her DB için yapılan doğrulama:**

1. Adın önceki raporda açıkça listelenen 12 DB'den biri olduğu kontrol edildi. Koruma listesi ayrıca uygulandı: `m101`, `m103`, `m105`, `m106`, `f6b`, `postgres`, `template0` ve `template1` adları atlanırdı.
2. DB'nin OID'sinin `m106`'dan (46945) büyük olduğu kontrol edildi. Yani hepsi şablondan sonra, bu oturumda oluşturulmuş.
3. Şemasının bir şablonla aynı olduğu, ya da farkın bilinen bir test işleminden geldiği kontrol edildi (aşağıdaki tablo).
4. Verisinin şablondan farklı olduğu, yani test verisi taşıdığı kontrol edildi. Belirleyici `pg_dump` md5'i kullanıldı; PG 16'nın rastgele `\restrict` satırları hariç tutuldu.
5. Aktif bağlantı olmadığı kontrol edildi.

| DB | OID | Şema | Veri | Kökeni (oturum içi) |
|---|---|---|---|---|
| `f3` | 49152 | = m106 | test verisi | Faz 3 okuma testi |
| `f31` | 65541 | m106 + `pages.content` test kolonu | test verisi | Faz 3.1 okuma testi (FIXTURE_DDL) |
| `f4` | 65547 | = m106 | test verisi | Faz 4 yazma testi |
| `f4t` | 65548 | = m106 | test verisi | Faz 4 yazma testi (translations modu) |
| `f5` | 65549 | m106 + `pages.content` (108 uygula/geri al testi sonrası) | test verisi | Faz 5 1. dalga |
| `f5n` | 65550 | = m106 | test verisi | Faz 5 1. dalga (108'siz) |
| `f6` | 73728 | = f6b | test verisi | Faz 5 2. dalga |
| `g31` | 73736 | = m106 | test verisi | Dalga 2 son tur: okuma |
| `g4` | 73732 | = m106 | test verisi | Dalga 2 son tur: yazma |
| `g4t` | 73733 | = m106 | test verisi | Dalga 2 son tur: yazma (translations) |
| `g5` | 73734 | f6b + `pages.content` test kolonu | test verisi | Dalga 2 son tur: Faz 5 |
| `g5n` | 73735 | = m106 | test verisi | Dalga 2 son tur: Faz 5 (108'siz) |

**Silinenler (12):** `f3`, `f31`, `f4`, `f4t`, `f5`, `f5n`, `f6`, `g31`, `g4`, `g4t`, `g5`, `g5n`. Hiçbirinde aktif bağlantı yoktu.

**Bu turda oluşturulup test sonrası silinenler (10):**

- `fin_insp`
- `fin_clean108`
- `fin_r108`, `fin_r108c`, `fin_r108dirty`
- `fin_sk108`, `fin_sk106`
- `fin_f5`, `fin_f5n`
- `fin_d2`

**Kalanlar:** `m101`, `m103`, `m105`, `m106`, `f6b` (şablonlar; dokunulmadı) ve sistem DB'leri (`postgres`, `template0`, `template1`).

---

## 3. 108 sonrası başarısız PostgreSQL testi

### 3.1 Başarısız test ve nedeni

**Test:** `tests/integration/content-read-pg.test.ts` → "Faz 3.1: ana dil TR'de page/blog SEO kararı eski ile birebir".

**Test ne yapıyor:**

- DB'deki **bütün** sayfa ve blog kayıtları için, ana dil TR iken TR/EN/DE isteklerindeki robots kararını eski kuralla karşılaştırıyor.
- Eski kural `legacyTextAvailable` şöyle çalışır: "TR **daima** mevcut; EN/DE yalnız title, body veya excerpt doluysa mevcut".
- Yeni karar `decideContentPresence`, istenen dilde içerik yoksa ve yedek dilde gösteriliyorsa `noindex,follow` verir.

**Neden başarısız oldu:**

- 108 sonrası kopyanın kaynağı olan `f6b`, önceki fazlardaki test koşularının bıraktığı verileri taşıyor.
- Bunların içinde, Faz 5 2. dalga testinin **ana dil EN ve DE senaryolarında** oluşturduğu 6 sayfa var. Bu sayfaların **TR satırı tamamen boş**: başlık, gövde ve özet NULL. Ana dil TR olmadığı için TR placeholder ile başladı (onaylı Faz 5 kararı).
- Böyle bir kayıtta TR isteğinde:
  - eski kural "TR daima mevcut" dediği için `index` verir;
  - yeni servis başlığı EN/DE'den gösterdiği için `noindex,follow` verir.
- **Bu veri biçimi eski sistemde oluşamazdı:** Eskiden ana dil hep TR'ydi ve TR adı ve başlığı zorunluydu. Yani eski kuralın varsayımı bu kayıtlar için geçersiz; testin karşılaştırma kapsamı dışında kalıyorlar.
- **Boş gövde düzeltmesiyle ilgisi yok:** Bu sayfalarda TR isteğinin `isFallback` değeri, düzeltmeden önce de `true`'ydu. Başlık başka dilden geliyor ve TR'de hiçbir "çeviri var" alanı dolu değil.

### 3.2 Uyumsuz 6 sayfanın verisi

Bilgiler `f6b`'nin tek kullanımlık kopyası `fin_insp` üzerinden okundu.

| id | Teknik anahtar (`pages.slug`) | Ana tablo başlık / gövde | Yayın | Çeviri satırları |
|---|---|---|---|---|
| `ee79de21-…-b9ac7d9bc81d` | `d2-sayfa-de-mw272tbj` | NULL / NULL | false | **de:** başlık `Sayfa de`, gövde `''`, slug `…-2` · **tr:** başlık/gövde/özet NULL |
| `584efb6c-…-7e8173e1180e` | `d2-sayfa-de-mw2773ya` | NULL / NULL | false | **de:** `Sayfa de`, `''` · **tr:** NULL |
| `7d78de66-…-f58bfc490ca6` | `d2-sayfa-de-mw2787k9` | NULL / NULL | false | **de:** `Sayfa de`, `''` · **tr:** NULL |
| `2acf02cf-…-679154c5b029` | `d2-sayfa-en-mw272tbj` | NULL / NULL | false | **en:** başlık `Sayfa en`, gövde `''`, slug `…-2` · **tr:** NULL |
| `29670d83-…-bd07071afea5` | `d2-sayfa-en-mw2773ya` | NULL / NULL | false | **en:** `Sayfa en`, `''` · **tr:** NULL |
| `f1102693-…-b9a2` | `d2-sayfa-en-mw2787k9` | NULL / NULL | false | **en:** `Sayfa en`, `''` · **tr:** NULL |

**Kaynağı:**

- Bunlar `content-faz5-dalga2-pg.test.ts` içindeki "sayfa — ana dil EN/DE" testinin üç ayrı koşusundan kalıyor. Koşu ekleri: `mw272tbj`, `mw2773ya`, `mw2787k9`.
- Akış şöyle: test sayfayı ana dilde oluşturuyor, gövdeyi `""` olarak boşaltıyor, yayından kaldırıyor ve slug'ı `…-2` yapıyor.
- Tamamı test verisi; gerçek veriyle ilgisi yok.

### 3.3 Temiz bir 108 sonrası kopyanın oluşturulması (yalnız izole ortamda)

**Değerlendirme:**

- `m106 → 108` uygulaması migration çalıştırmak demek olduğu için **yapılmadı**. Bunun yerine şu iki tespit kullanıldı:
  1. 108 taslağı **yalnız fonksiyon** tanımlıyor; veri değiştiren `UPDATE`/`INSERT`/`DELETE`/`ALTER TABLE` yok. `CREATE OR REPLACE FUNCTION` ×3 ve `COMMENT` ×1.
  2. `f6b` ile `m106` şemaları arasındaki fark **yalnız bu 108 fonksiyonları**: `pg_dump -s` farkı `content_language_slugs_separated()`, `trg_content_mirror_base_to_tr()` ve `trg_content_tr_guard()`'dan ibaret.
- Bu yüzden "temiz 108 sonrası" = `f6b` şeması + `m106` verisi.

**Yapılan işlem:** Yalnız tek kullanımlık kopyada; şablonlar yalnız `TEMPLATE` kaynağı ve `pg_dump` okuma kaynağı olarak kullanıldı.

```sql
CREATE DATABASE fin_clean108 TEMPLATE f6b;                 -- yalnız kopya
TRUNCATE <public tablolarının tamamı> RESTART IDENTITY CASCADE;   -- yalnız kopyada
-- pg_dump -a --disable-triggers m106 | psql fin_clean108   -- veri m106'dan, tetikleyiciler kapalı
```

**Doğrulama:**

| Kontrol | Sonuç |
|---|---|
| `fin_clean108` veri md5 | `b530b0521a4568ca` = `m106` verisi ✅ |
| `fin_clean108` şema md5 | `577c9109478f6b90` = `f6b` şeması ✅ |
| `content_language_slugs_separated()` / `content_mirror_mode()` | `true` / `base` ✅ |

**Bu temiz kopyadan açılan tek kullanımlık kopyalarda sonuçlar:**

| Test | Kopya | Sonuç |
|---|---|---|
| Faz 3 okuma (`content-read-pg`), `pages.content` kolonsuz | `fin_r108` | **14/14** |
| Faz 3 okuma, `pages.content` kolonlu (FIXTURE_DDL) | `fin_r108c` | **14/14**; SEO eşliği testi **geçti** |
| **Kontrol:** aynı test, önceki kirli `f6b` kopyası | `fin_r108dirty` | **13/14**; aynı SEO eşliği testi yine başarısız (sorun tekrarlanabilir ve yalnız veriye bağlı) |
| Son kontroller (108 sonrası temiz + 108 öncesi `m106`) | `fin_sk108` / `fin_sk106` | **36/36** |
| Faz 5 1. dalga (108 sonrası temiz + 108 öncesi) | `fin_f5` / `fin_f5n` | **9/9** |
| Faz 5 2. dalga (108 sonrası temiz) | `fin_d2` | **25/25** |

**Test dosyalarında değişiklik yapılmadı:** Beklentiler gevşetilmedi, test atlanmadı. Çalışan dosyaların md5'i cihazdakilerle aynı:

- `content-read-pg.test.ts`: `9aba69ea…`
- `content-resolve.ts`: `6371af78…`

**Sonuç:**

- Test, temiz bir 108 sonrası kopyada **başarılı**.
- Önceki başarısızlık yalnız `f6b`'deki eski test verisinden kaynaklanıyordu.
- Kirli `f6b` kopyasındaki sonuç **başarısız** olarak kayıtta kalıyor.

---

## 4. Şablonların değişmediği ve erişim sınırları

**Şablonlar değişmedi:**

- Sunucu başlangıcından beri `pg_stat_database` sayaçları her iki şablon için `tup_inserted = tup_updated = tup_deleted = 0`.
- Belirleyici parmak izleri, son kontrol raporunda kaydedilenlerle **birebir aynı**:
  - `m106`: şema `497e4d7fa0d9bae8`, veri `b530b0521a4568ca`
  - `f6b`: şema `577c9109478f6b90`, veri `5193f62b49a38826`
- `m106`'da 108 yetenek fonksiyonu yok; `f6b`'de var. İkisinde de mod `base`.

**Erişilmeyenler:**

- Canlı DB, staging DB, production sunucusu ve Coolify'a erişilmedi.
- Production veya staging ortamına dosya aktarılmadı.
- Bu turda buluta yeni dosya aktarılmadı.

---

## 5. Faz 5 kapanış durumu

| Konu | Durum |
|---|---|
| 14 içerik türü merkezi okuma ve yazmada | ✅ |
| Teknik anahtar / TR-EN-DE slug ayrımı (108 öncesi ve sonrası) | ✅ doğrulandı |
| Bilinçli boş gövde | ✅ uygulandı; ana dil kararı kayıtlı (§1) |
| İzole PG test paketleri (temiz kopyalarda) | ✅ hepsi başarılı |
| Kirli `f6b` kopyasında Faz 3.1 SEO eşliği | ❌ başarısız; nedeni test verisi (§3), temiz kopyada ✅ |
| Commit, push, deploy | Yapılmadı |

**Faz 6 öncesi öneriler:**

1. **Temiz 108 şablonu:** Gelecekteki izole testler için kalıcı bir temiz 108 şablonu istenirse, §3.3'teki işlem onayınızla ayrı bir şablon adıyla (ör. `m108clean`) tekrarlanabilir. Bu turda geçici olarak oluşturulup silindi.
2. **Testlerin DB kirletmesi:** Dalga 2 ve son kontrol testleri DB'ye veri bırakıyor. Testler bundan sonra yalnız taze kopyalarda çalıştırılmalı. Ya da karşılaştırma testi, kendi tohumladığı kayıtlarla sınırlandırılmalı. Bu ikincisi test değişikliği gerektirir ve ayrı bir karar olarak sunulmalı.
3. **Canlıya geçiş:** Faz 5 raporlarındaki sıra geçerli: 105–107 ve 108 önce staging'e, sonra canlıya ayrı onayla uygulanmalı. Salt okunur veri kontrolleri yapılmalı. Ardından modüller etkinleştirilmeli.
