# Canlıya Geçiş Hazırlık Planı ve SSH Geçiş Kılavuzu — Simetrik TR/EN/DE İçerik

**Sürüm:** 4 (5 Kasım 2026). Kararlar işlendi:

- **R-A:** Coolify Auto Deploy zaten kapalı. Push sonrası deploy'u ekip elle yapar.
- **R-B:** TR slug yönlendirme düzeltmesi **uygulandı ve test edildi.**
- Commit 1–3 hazırlandı; **commit ve push yapılmadı.**

Migration'ları ekip SSH üzerinden elle uygular.

**Yapılmayanlar:**

- Canlı DB'ye ve sunucuya bağlanılmadı; SSH ve Coolify erişimi kullanılmadı.
- Migration canlıda çalıştırılmadı.
- Staging oluşturulmadı.
- Commit, push ve deploy yapılmadı.

**Yapılanlar:**

- `lock_timeout` / `statement_timeout` değişikliği repodaki 4 migration dosyasına **uygulandı** (Sürüm 3).
- **R-B routing düzeltmesi** 3 dosyaya uygulandı: `lib/i18n/routing/context.ts`, `url.ts`, `sql.ts`. 2 yeni test dosyası eklendi. Önce yedek alındı.
- Bütün testler izole PostgreSQL 16 kopyalarında ve repo dışındaki derleme kopyalarında çalıştırıldı.
- Geçiş için 11 SQL dosyası (ön kontrol, son kontrol, parmak izi, geri alma) yazıldı ve test edildi.
- `m106` ve `m108clean` şablonları değişmedi; şema, veri ve yazma sayaçları önce/sonra aynı. Bütün test DB'leri silindi.

---

## 0. Özet: sonuçlar ve açık riskler

| # | Konu | Sonuç |
|---|---|---|
| R-A | Otomatik deploy | **Kapalı** (ekip teyidi). Claude Coolify'a bağlanmadı, ayar değiştirmedi. Kılavuz Adım 0 yalnız "push sonrası deployment başlamadı" doğrulamasını içeriyor. |
| R-B | 108 sonrası TR slug yönlendirmesi | **Düzeltildi** (§7). Eski TR blog, CMS ve villa URL'si → aynı dilin yeni slug'ına **308**. Başka dile yönlendirme yok; geçmiş korunuyor. Eski kod bu senaryoları **9 testte başarısız**, yeni kod **18/18** geçiyor. Gerçek `next start` ile runtime doğrulandı. |
| Testler | Tam paket | **Birim 280 dosya: 5504 geçti, 0 başarısız**, 11 atlandı (öncekiyle aynı). **PG entegrasyon 12 dosya: 289/289.** tsc 0 hata. ESLint 0 hata / 194 uyarı. Build (webpack ve Turbopack) başarılı; route tablosu aynı. |
| Commit | Gruplar | Commit 1: **5** dosya. Commit 2: **305**. Commit 3: **37**. 108 dahil **değil**. Toplam 348 = 347 + 108 taslağı (§4, Ek B). |
| 108 | İlk push dışında mı | **Evet.** Hiçbir yol listesinde yok; `HEAD`'de de yok. Uyarı: taslak dosya ignore edilmiyor, yalnız eklenmiyor. Bu yüzden `git add -A` / `git add .` **kullanılmamalı** (§4). |
| Gizli bilgi | Tarama | **Temiz** (§4). |
| Kullanıcı değişiklikleri | Manuel düzenleme | Dalga 6'dan bu yana değişen her dosya bu turun bilinen değişikliği. Hiçbir dosya geri alınmadı veya üzerine yazılmadı. |

### Açık riskler

| Kod | Önem | Risk | Durum |
|---|---|---|---|
| R-C | Orta | Staging yok; minimal şablonda villa detayı, kategori, arama ve kısa süreli fırsatlar runtime'da test edilemedi. | Canlı smoke (Kılavuz Adım 8) + R1 (kodu geri al) |
| R-D | Orta | 101–104'ün canlıda olduğu varsayılıyor (ledger yok) | K0 doğruluyor |
| R-E | Düşük | `.env.local`'daki DB notu ("eski sağlayıcı") | Kılavuz Adım 1: uygulama container'ının kendi `DATABASE_URL`'i |
| R-F | Düşük | 108 taslağı izlenmeyen ama ignore edilmeyen bir dosya; geniş bir `git add` onu yanlışlıkla ekleyebilir | Yol listeleriyle ekleme (§4) |
| R-G | Bilgi | Kayıt teknik anahtarı yalnız ana tabloya karşı kontrol ediliyor (denetim V6). TR slug'ının başka bir kaydın teknik anahtarına eşitlenmesi ise yazma servisinde **reddediliyor** (PG testi). | Değişiklik gerekmiyor |

---

## 1. Migration 105–108: SQL ve bağımlılık denetimi

| | 105 | 106 | 107 | 108 (taslak) |
|---|---|---|---|---|
| **Gerektirdiği** | 081 (`public_default_locale`), 082 (`trg_touch_updated_at`), 14 içerik tablosu (083/086/088/089/096/012/062) | 105 (`content_mirror_mode`), 103 (`url_redirects`, slug geçmişi), 102 (slug kolonları), 091, 085/087 | 106; mod `base` | 106, 107; mod `base`; yeni kod yayında |
| **Yaptığı** | CHECK genişletme; mod fonksiyonu (`'base'`); `tr_guard`; 2 koleksiyon çeviri tablosu | Ayna fonksiyonları; 56 içerik trigger'ı; slug geçmişi düzeltmesi | Her ana kayıt için `tr` satırı (`ON CONFLICT DO NOTHING`); preflight 2a/2b/2c; son doğrulama | Ayna yalnız içerik yazar; `base` modunda TR slug güncellemesine izin; yetenek işareti |
| **Veri değişikliği** | Yok | Yok | Yalnız yeni `tr` satırları | Yok |
| **Transaction** | Tek (`BEGIN`/`COMMIT`) | Tek | Tek | Tek |
| **Kilit** (ölçülen, PG 16) | `settings_translations` ve `site_popup_translations` üzerinde **AccessExclusive** (okumayı da bekletir); 14 çeviri tablosunda ShareRowExclusive | 28 tabloda ShareRowExclusive (**okuma serbest**, yazmalar bekler) | Satır kilitleri | Tablo kilidi yok |
| **Süre** (5 064 ana kayıtlık hacim seti) | 0,05 sn | 0,08 sn | 0,22 sn | 0,04 sn |
| **Gereken yetki** | 14 tablonun sahibi ya da superuser; `public` şemada CREATE | 28 tablonun sahibi | INSERT | Fonksiyonların sahibi |
| **Hata davranışı** | Yüksek sesle; tam rollback | Yüksek sesle; tam rollback | Yüksek sesle; tam rollback | Yüksek sesle; tam rollback |
| **Yeniden çalıştırma** | Yalnız kendi aşamasında. Sonraki migration'lardan sonra çalıştırılırsa fonksiyonları **eski sürüme döndürür** | Aynı: 108'den sonra çalıştırılırsa 108'i sessizce geri alır | Güvenli (0 satır ekler) | Güvenli |
| **Geri alma** | G105 (test edildi) | G106 + 103 ve 105'in yeniden çalıştırılması (test edildi) | G107 (test edildi; **yalnız 108 öncesi**) | G108 (test edildi; yönlendirme hazırlar) |

**Doğrulanan zincir:**

- `m106` şablonundan test edilmiş geri dönüşlerle 105 öncesine indirilmiş taban + repodaki 105 → 106 → 107 → şema `497e4d7f…` = `m106`.
- + 108 → `577c9109…` = `m108clean`. Çeviri içeriği md5'i de iki şablonla aynı.

**PostgreSQL sürümü:** Gereken en düşük sürüm 11 (`EXECUTE FUNCTION`, `to_regprocedure`, `jsonb`). K0 ≥ 13 bekliyor; test sürümü 16.

---

## 2. `lock_timeout` ve `statement_timeout` — uygulandı ve test edildi

**Değişiklik:** Her dosyada `BEGIN;` satırından sonra 7 satır (açıklama + iki `SET LOCAL`); başka hiçbir satır değişmedi. Tam diff Ek A'da.

**Yedek:** Orijinal dosyalar cihazdaki oturum klasöründe `faz7-yedek-migration-202611051856/` altında.

| Dosya | `lock_timeout` | `statement_timeout` | md5 | sha256 |
|---|---|---|---|---|
| `db/migrations/105_symmetric_content_foundation.sql` | 2s | 30s | `92dafcdc…` | `52068dbe14aee932b3c3589a54fe1a18ab07e4e603fd10cebb7316be646aa12d` |
| `db/migrations/106_content_mirror.sql` | 3s | 30s | `728e14d0…` | `1ba770bb5222f1db0dc9340f719308a62adaba5cb52748fd1c295968ef5a260f` |
| `db/migrations/107_backfill_tr_translations.sql` | 5s | 5min | `ba4394e8…` | `ede63045212985c609bfce97c74c2210408d88ce5474c719ce0c1e9a76c4ff04` |
| `db/migrations/_drafts/108_language_slug_separation.DRAFT.sql` | 3s | 30s | `8c7cc63b…` | `c83310aca64ece76cb3771982d837e636a505313c6cfe48625eaad4685d91954` |

**Test sonuçları:**

| Test | Sonuç |
|---|---|
| Repo dosyalarının md5'i = Sürüm 2'de test edilen kopyalar | **Aynı** (4/4) |
| Repo dosyalarıyla zincir → `m106` / `m108clean` şeması | **Birebir** |
| 11 PG entegrasyon dosyası, repo dosyalarıyla üretilmiş şablonların 20 tek kullanımlık kopyası | **280/280** |
| Migration klasörünü okuyan 15 birim test dosyası (repoda) | **487/487** |
| Kilit zaman aşımı, 6 senaryo (T1–T6, Sürüm 2 §3.4; aynı dosyalar) | Hepsinde `55P03`, **şema ve veri değişmedi**, yeniden deneme başarılı |
| Açık okuma veya DML transaction'ı varken 106 ve 108 (T7–T8) | Beklemeden tamamlandı |
| 105 kilit beklerken yeni bir okuyucunun gecikmesi (T9) | 1,5 sn; sonra normale döndü |
| Oturum ayarları her `COMMIT`'ten sonra | Varsayılana (0) döndü |
| Sahibi olmayan rolle 105 | `must be owner of table settings_translations` hatası; **hiçbir şey uygulanmadı** |

---

## 3. Geri alma betikleri — test sonuçları

| Betik | Senaryo | Sonuç |
|---|---|---|
| G108 | 108 sonrası; blog ve villada TR slug'ı değiştirilmiş | 2 eski TR slug `url_redirects`'e yazıldı; TR slug'lar teknik anahtara döndü; fonksiyonlar 106 sürümünde; yetenek işareti kaldırıldı. Şema = `m106` (`497e4d7f…`). K4 5/5 OK, K3 14/14 OK. İkinci kez çalıştırma açık hatayla reddedildi. |
| G107 → G106 → 103 ve 105'in yeniden çalıştırılması → G105 | 107 sonrası (108 yok) | Şema = 105 öncesi (`3bbc06f4…`). **PZ parmak izi başlangıçla birebir aynı.** K0'da HATA yok. |
| K0, 108 sonrası bir DB'de (olumsuz test) | — | "m105 henüz yok" ve "tr satırı" kontrolleri doğru biçimde **HATA** verdi |
| K3, aynası bozulmuş bir DB'de (olumsuz test) | — | `villa` için **HATA/İNCELE** |

---

## 4. Commit ve push öncesi son envanter incelemesi

**Kaynak:** `git --no-optional-locks status --porcelain -uall`. `HEAD` = `8afb11a` (`main`). Remote `github.com/kalkandigitalcom/tatilin-yeri-next`.

| Commit | İçerik | Dosya | Yol listesi (repoda) |
|---|---|---|---|
| **1** | Migration 105–107 (`lock_timeout` / `statement_timeout` dahil) + migration testleri (`symmetric-content-mirror-migrations.test.ts`, `symmetric-content-registry.test.ts`) | **5** | `Claude outputs/gecis-kilavuzu/commit1-yollar.txt` |
| **2** | Uygulama kodu (183; R-B düzeltmesi dahil) + testler (92 − 2 + 2 yeni R-B testi) + 30 silinen kopya route | **305** | `…/commit2-yollar.txt` |
| **3** | 23 rapor (Faz 0 öncesi iki rapor **dahil**) + 11 kılavuz SQL + 3 yol listesi | **37** | `…/commit3-yollar.txt` |
| — | `db/migrations/_drafts/108_language_slug_separation.DRAFT.sql` | 1 | **Hiçbir listede yok** (commit 4, izlemeden sonra) |

**Kontroller:**

- Dört grubun birleşimi `git status`'taki **348** girişin tamamı; çakışan yol 0.
- 108: yol listelerinde 0 eşleşme; `HEAD`'de `_drafts` altında 0 dosya. İlk push'a **girmiyor.**
- **Kullanıcı değişiklikleri:** Dalga 6 raporundan sonra değişen dosyalar yalnız şunlar:
  - 4 migration dosyası (`lock_timeout`, Sürüm 3);
  - 3 routing dosyası ve 2 yeni test (R-B);
  - `Claude outputs/` altındaki raporlar, kılavuz ve listeler.

  Başka bir dosyada beklenmeyen değişiklik yok. Faz 0 öncesinden yalnız 2 rapor var; ikisi de commit 3'te. Aynı dosyada senin ve asistanın yaptığı değişiklikler dosya düzeyinde ayırt edilemez. Hiçbir dosya geri alınmadı, silinmedi veya üzerine yazılmadı. Commit 2'den önce Ek B'ye göz atman önerilir.
- **Silinen dosyalar:** 30 eski kopya route (`locale-page.tsx`), hepsi commit 2'de. Import kalmadı (tsc 0). Rezervasyon, ödeme ve mail dosyası yok.
- **Gizli bilgi taraması** (commit 1–3'teki bütün mevcut dosyalar):
  - parolalı bağlantı dizesi, özel anahtar, AWS/Stripe/Resend/GitHub/Slack anahtarı, JWT, `password=`/`secret=`/`token=` değeri **yok**;
  - DB host'u, pooler adresi ya da IP **yok**;
  - `.env*`, `.pem`, `.key`, `.dump`, `.bak`, arşiv, `node_modules`, `.next` **yok**;
  - test dosyalarında da `postgres:pg@` veya `password=` **yok**.
- `.gitignore`: `.env*`, `/.next/`, `*.tsbuildinfo` ve `next-env.d.ts` ignore'da.

**Commit komutları** (çalıştırılmadı; Mac'te, repo kökünde; `git add -A` / `git add .` **kullanılmaz**):

```bash
cd ~/tatilin-yeri-next
git status --porcelain | wc -l            # 348 beklenir
L="Claude outputs/gecis-kilavuzu"

git add --pathspec-from-file="$L/commit1-yollar.txt"
git diff --cached --name-only | wc -l     # 5
git commit -m "db: migrations 105–107 — simetrik TR/EN/DE içerik (lock/statement timeout) + migration testleri"

git add --pathspec-from-file="$L/commit2-yollar.txt"
git diff --cached --name-status | awk '{print $1}' | sort | uniq -c     # A/M/D toplam 305, D=30
git commit -m "feat: merkezi içerik okuma/yazma, admin ve public simetrik TR/EN/DE (Faz 3–6) + TR slug 308 düzeltmesi
Bu kod, migration 105–107 canlıda uygulanmadan DEPLOY EDİLMEMELİDİR."

git add --pathspec-from-file="$L/commit3-yollar.txt"
git diff --cached --name-only | wc -l     # 37
git commit -m "docs: Faz 0–6 raporları, final denetim, SSH geçiş kılavuzu ve kontrol SQL'leri"

git status --porcelain                    # YALNIZ: ?? db/migrations/_drafts/108_language_slug_separation.DRAFT.sql
git log --oneline -4
# git push origin main   ← AYRI ONAYLA. Auto Deploy kapalı olduğundan deployment başlamamalı.
```

**Not:** Commit 1'in iki testi `lib/i18n/content/content-registry.ts`'i import ediyor; bu dosya commit 2'de geliyor. Commit 1 tek başına checkout edilirse bu iki test çalışmaz. Üç commit birlikte push edildiği için son ağaç tutarlı.

---

## 5. Production build ve environment değişkenleri

| Kontrol | Sonuç |
|---|---|
| Coolify build komutu | `npm run build` → `next build` (Next 16.3.5 varsayılanı **Turbopack**). `next start`. Dockerfile yok (README: "self-hosted `next start`"). |
| **Turbopack** production build (bulut, R-B dahil yeni kod) | **Başarılı.** 49 statik sayfa, route tablosu 207 satır. Sandbox'ta Google Fonts erişimi olmadığından yalnız `next/font/google` sandbox kopyasında stub'landı; repoya dokunulmadı. |
| webpack build (cihaz, son koşu) | Başarılı (102 sn); route tablosu `build14` ile aynı |
| tsc | 0 hata (temiz `.next` ile) |
| ESLint | 0 hata, 194 uyarı (taban) |
| Birim testleri (son tam koşu, R-B sonrası) | 280 dosya, **5504 geçti**, 0 başarısız, 11 atlandı |
| PG entegrasyon (son koşu) | 12 dosya, **289/289** (yeni R-B testi dahil) |
| **Yeni environment değişkeni** | **Yok.** Faz 1–6 diff'inde yeni `process.env` kullanımı yok; `CONTENT_SOURCE` hiç uygulanmadı, `CONTENT_WRITE_SERVICE_ENABLED` kaldırıldı. |
| Kodun kullandığı değişkenler | `DATABASE_URL`, `PGSSLMODE`, `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECT_TIMEOUT_MS`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES`, `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS`, `AUTH_*` (8), `TOTP_ENCRYPTION_SECRET`, `CRON_SECRET`, `RESEND_*` (3), `MAIL_ADMIN_NOTIFY_TO`, `UPSTASH_REDIS_REST_URL/TOKEN`, `S3_*` (4), `NODE_ENV`. Hepsi canlıda bugün de gerekli; bu geçiş **hiçbirini** değiştirmiyor. |
| `.env.example`'da eksik olanlar (dokümantasyon) | `MAIL_ADMIN_NOTIFY_TO`, `NEXT_PUBLIC_CDN_BASE_*` (2), `S3_*` (4). Geçişle ilgisiz; canlıda zaten tanımlı olmalı. |
| Build sırasında DB erişimi | `next build` statik sayfaları üretirken `DATABASE_URL`'den okur. Coolify'da bu değişken build sırasında da tanımlıysa build **canlı DB'yi okur**. Bu yüzden deploy, 105–107'den **sonra** yapılmalı (R-A). |
| `.next` (yerel) | Git izlemiyor. Temiz build ile yeniden üretildi; eski hâli repo dışında yedekte. |

---

## 6. Yeni kodun 105–107 sonrasında ve 108 öncesinde çalışabilirliği

**Yöntem:**

- Yeni kodun ve `HEAD`'in kaynağı bulut sandbox'ında derlendi (Turbopack, `next build` + `next start`).
- DB: `m106` verisinden üretilmiş, **repo migration'ları uygulanmış** tek kullanımlık kopya.
- Minimal şablonda olmayan `get_public_settings()` fonksiyonu **yalnız bu kopyada** stub'landı.

| İstek | Yeni kod, 105–107 sonrası (108 yok) | `HEAD` (eski kod), 105–107 sonrası | Yeni kod, 105 **öncesi** (R-A kanıtı) |
|---|---|---|---|
| `/`, `/en`, `/de` | 200; `lang` tr/en/de; canonical; hreflang tr/en/de + x-default | 200 (aynı) | 200 |
| `/tr` | 307 → `/` | — | — |
| `/kiralik-villalar`, `/en/villas-for-rent`, `/de/ferienvillen` | 200; dil segmentli canonical ve hreflang | 200 | 200 |
| `/blog/kas-rehberi` (TR) | 200, "Kaş Rehberi", hreflang tr+en | 200 "Kaş Rehberi" | **200, "Kas Guide" (İngilizce!) + noindex** |
| `/en/blog/kas-guide` | 200, "Kas Guide" | 200 | 200 |
| `/de/blog/kas-rehberi` (DE çevirisi yok) | 200, yedek içerik, **noindex,follow**, hreflang yok | — | — |
| `/en/blog/kas-rehberi` | **308** → `/en/blog/kas-guide` | 308 | — |
| `/p/hakkimizda` / `/en/p/hakkimizda` | 200 index / 200 **noindex,follow** | 200 / 200 | **404 / 404** |
| `/en/villa/deniz-villa` | **308** → `/en/villa/sea-villa` | 308 | — |
| İletişim, teklif, favoriler (3 dil) | 200; favoriler noindex | 200 | 200 |
| `/fr`, `/de/blog/yok` | 404 | — | — |
| `sitemap.xml` / `robots.txt` | 200 / 200 (robots değişmedi) | 200 | — |
| 108 öncesi TR slug güncelleme denemesi (DB) | `content_mirror_guard` ile **reddedildi** (beklenen) | — | — |
| `HEAD`'in ana tabloya TR yazımı | — | Ayna `tr` satırını güncelledi | — |

**Sonuçlar:**

- Yeni kod 105–107 sonrasında ve 108 öncesinde **çalışıyor**.
- `HEAD` de aynı şemayla çalışıyor. Migration ile deploy arasındaki pencerede site bozulmuyor.
- Yeni kod 105 **öncesinde** yayına çıkarsa içerik **sessizce bozuluyor** (R-A).
- **Kapsam sınırı (R-C):** Minimal şablonda olmayan tablo ve kolonlar yüzünden villa detayı, kategori, bölge, arama, kısa süreli fırsatlar ile sitemap'teki blog ve sayfa girdileri runtime'da doğrulanamadı. Bunlar birim ve entegrasyon testleriyle kapsanıyor; canlı smoke'ta (Kılavuz Adım 8) mutlaka kontrol edilmeli.

---

## 7. R-B: 108 sonrası TR slug yönlendirmesi — düzeltme uygulandı

**Kök neden:**

- 108 sonrası TR slug'ı değişince eski TR URL'si kaydın **teknik anahtarı** oluyor.
- Proxy, öneksiz yolda teknik anahtarı kanonik kullanan **ilk başka dili** "sahip" sayıyordu. Kendi slug'ı olmayan DE, teknik anahtarı yalnız yedek olarak kullandığı hâlde sahip seçiliyordu → `/blog/<eski>` → 307 `/de/blog/<eski>`.
- `REDIRECTS_SQL`, "eski slug = kaydın kendi teknik anahtarı" olan geçmiş satırını atlıyordu. Bu yüzden TR'nin geçmişi hiç görülmüyordu.

**Düzeltme** (3 dosya; tam diff Ek C'de):

| Dosya | Değişiklik |
|---|---|
| `lib/i18n/routing/sql.ts` | `REDIRECTS_SQL`: eski slug yalnız **başka bir kaydın** canlı teknik anahtarıysa atlanır (`x.id <> p.id`). Kaydın **kendi** teknik anahtarına eşit geçmiş satırı artık haritaya giriyor. Dört tür için aynı. |
| `lib/i18n/routing/context.ts` | Yeni `ownHistoryHasTechnicalKey()`. `slugOwnerLocale` için sahip önceliği: (1) slug'ı **kendi çeviri satırında** taşıyan dil → (2) slug'ı **kendi geçmişinde** taşıyan dil → (3) eski kural, yani teknik anahtarı yedek kullanan dil (ana dil değişimi senaryoları aynen korunur). |
| `lib/i18n/routing/url.ts` | Öneksiz yolda teknik anahtar **istek dilinin kendi geçmişindeyse** aynı dilin yeni slug'ına **308**. Başka dile gidiş (ana dile bağlı) **307** kalır. Teknik anahtardan aynı dilin kanoniğine düzeltme artık **308** (önceden 307). |

**Testler:**

| Test | Sonuç |
|---|---|
| Yeni `tests/unit/faz7-tr-slug-redirect.test.ts` (18 test): blog, CMS, villa; geçmişsiz villa; ikinci değişiklik (tek adım); çakışmalar (eski slug'ı başka kayıt kullanıyor, DE'nin gerçek slug'ı = teknik anahtar, çok kayıtlı slug); ana dil EN/DE; pasif TR; sahip önceliği; 108 öncesi davranış değişmedi; 3 ana dilde döngü yok | **18/18.** Eski kodla **9 başarısız** (testin hatayı yakaladığı kanıtlandı). |
| Yeni `tests/integration/content-faz7-tr-slug-pg.test.ts` (9 test; `m108clean` ve `m106` kopyaları): merkezi yazmayla TR slug değişikliği → `url_redirects` → `REDIRECTS_SQL` → proxy kararı, 3 ana dil; çakışmada yazma servisi `conflict` döner; başka kaydın teknik anahtarı olan eski slug atlanır; 108 öncesi TR slug değişikliği reddedilir | **9/9** |
| Mevcut routing testleri (D1, faz-4 ana dil değişimi + **önbellek döngü testleri**, proxy, locale route'ları; 8 dosya) | **236/236**, beklenti değiştirilmedi |
| Runtime (Turbopack build + `next start`, 108 kopyası, TR slug'ları SQL ile değiştirildi) | Aşağıdaki tablo |

| İstek | Düzeltme öncesi | Düzeltme sonrası |
|---|---|---|
| `/blog/kas-rehberi` | 307 → `/de/blog/kas-rehberi` | **308 → `/blog/kas-rehberi-2026`** |
| `/p/hakkimizda` | 307 → `/en/p/hakkimizda` | **308 → `/p/hakkimizda-2026`** |
| `/kiralik-villa/deniz-villa` | 307 → `/kiralik-villa/deniz-villa-2026` | **308** → aynı hedef |
| `/tr/blog/kas-rehberi` | — | 307 (ana dil öneki) → `/blog/kas-rehberi-2026`, tek adım |
| `/en/blog/kas-guide`, `/de/blog/kas-rehberi`, `/en/blog/kas-rehberi` | 200 / 200 / 308 | Aynı (EN/DE değişmedi) |

**Etki:**

- 108 öncesinde TR slug'ı teknik anahtara eşit olduğu için davranış **değişmiyor** (testli).
- Değişiklik commit 2'de. Pencere 1'deki deploy ile canlıya çıkar. 108 için ek deploy gerekmez.

---

# NİHAİ SSH GEÇİŞ KILAVUZU

Bu bölüm ekip tarafından uygulanır. Her adımın sonunda "Devam koşulu" sağlanmıyorsa **durulur.**

### Dosyalar ve SHA256SUMS

Geçiş klasörüne konacak dosyalar ve beklenen özetler:

```text
52068dbe14aee932b3c3589a54fe1a18ab07e4e603fd10cebb7316be646aa12d  105_symmetric_content_foundation.sql
1ba770bb5222f1db0dc9340f719308a62adaba5cb52748fd1c295968ef5a260f  106_content_mirror.sql
ede63045212985c609bfce97c74c2210408d88ce5474c719ce0c1e9a76c4ff04  107_backfill_tr_translations.sql
70266a8622595933d02919145fec9d865ef655eea426f514ff8ed316f720b065  k0_on_kontrol_105.sql
361330804795d9aeb20a1a421886e1f82a71d9560c2a1d39404b87828456d55d  k1_son_kontrol_105.sql
54468650db9227f9b8029aa5491e131a4e8d98fcfe1557118f659a0165d3ef98  k2_son_kontrol_106.sql
5a6d9479caf2194a5896b52c4a1445876f66eed8018d16cc506281e9b68babbb  k3_son_kontrol_107.sql
4afdb0db866aa79921a034b918ab7e0a4f3d0276daa79e9521617b24f627ef4d  k4_on_kontrol_108.sql
5a17a2ee4db078091ba0b45d25a0512bac7bbb9238397616bbb3b48ac3e7d48c  k5_son_kontrol_108.sql
e0e83c26791b6f70c911a28e1e13e5cc3389ac2a2821aecc9e7aed5087deee02  pz_parmak_izi.sql
999848ee5c6a101c1b942b69efaf2ae704a7308fb899a34c9e6349ea10d3918a  g105_geri_al.sql
faa16006c1cdec1594a2d784c6588c6fcc97210f86890b956937eb12adea573e  g106_geri_al.sql
0c0418bcd9dea24984c6a8f28790ddb48a4225421b6d090c39a4956de7a38b52  g107_geri_al.sql
b8f603e15e88040c7cbc2ff577498766a5f8044a4c039a78678b199c93435984  g108_geri_al.sql
```

108 dosyası Pencere 2'de ayrıca kopyalanır. Taslaktan çıkarılıp başlığı güncellendiğinde sha256 değişir; o anda yeniden hesaplanır.

Kaynak yerleri:

- Migration'lar: `db/migrations/`.
- Kontrol ve geri alma dosyaları: `Claude outputs/gecis-kilavuzu/`.

Her kontrol dosyası salt okunur bir transaction'da çalışır (`BEGIN READ ONLY … ROLLBACK`). Çıktısında her satır `durum = OK` olmalı.

---

## Adım 0 — Push (R-A)

- Coolify Auto Deploy **kapalı** (ekip teyidi). Claude ayar değiştirmedi.
- §4'teki commit komutları; push ayrı onayla.

Kontrol:

- [ ] Push sonrası Coolify'da **yeni deployment başlamadı.**
- [ ] `git status`'ta yalnız `db/migrations/_drafts/108…` kaldı; GitHub'da `_drafts` klasörü **yok.**

## Adım 1 — Sunucu, uygulama container'ı ve gerçek `DATABASE_URL` (salt okunur)

```bash
ssh <kullanıcı>@<sunucu>
export GECIS=/root/tatilinyeri-gecis-$(date +%Y%m%d) && mkdir -p "$GECIS"/{log,yedek} && cd "$GECIS"

# 1) Uygulama container'ı (Coolify adları uuid tabanlıdır; image / label ile bulunur)
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
export APP=<uygulama-container-adı>

# 2) Uygulamanın KULLANDIĞI bağlantı: parolayı göstermeden host / port / db / kullanıcı
docker exec "$APP" node -e 'const u=new URL(process.env.DATABASE_URL);console.log(JSON.stringify({host:u.hostname,port:u.port||"5432",db:u.pathname.slice(1),user:decodeURIComponent(u.username),sslmode_url:u.searchParams.get("sslmode"),PGSSLMODE:process.env.PGSSLMODE||null}))'

# 3) Bağlantıyı ekrana yazmadan değişkene al (shell geçmişine değer yazılmaz)
export DBURL="$(docker exec "$APP" printenv DATABASE_URL)"
export PGSSLMODE="$(docker exec "$APP" printenv PGSSLMODE || true)"

# 4) Uygulamanın Docker ağı (psql istemcisi aynı ağdan bağlanır)
export NET="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$APP" | awk '{print $1}')"
echo "$NET"
```

**psql yardımcı fonksiyonu.** Sunucuya psql kurulmaz; resmi PostgreSQL imajı tek seferlik çalışır. `DBURL` ortam değişkeniyle aktarılır, komut satırında görünmez.

```bash
export PGIMG=postgres:16-alpine     # 1. sorgudan sonra sunucunun ANA sürümüne eşitlenir (pg_dump için şart)
pq(){ docker run --rm -i --network "$NET" -e DBURL -e PGSSLMODE -v "$GECIS":/w -w /w "$PGIMG" \
        sh -c 'psql "$DBURL" -X -v ON_ERROR_STOP=1 -P pager=off "$@"' -- "$@"; }

# 5) Sürüm ve kimlik
pq -Atc "SELECT version(); SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"

# 6) Bu DB'nin gerçekten canlı uygulamanın DB'si olduğu: uygulamanın açık bağlantıları görünmeli
pq -Atc "SELECT usename, client_addr, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1,2 ORDER BY 3 DESC;"
```

**Notlar:**

- DB Coolify'da ayrı bir PostgreSQL servisi ise ağı farklı olabilir. Uygulamanın ağı genelde Coolify'ın ortak `coolify` ağıdır.
- Bağlanamazsa `docker network ls` ile ağ seçilir.
- DB harici bir sağlayıcıdaysa `--network host` denenir.

**Devam koşulu:**

- [ ] Host / db / kullanıcı not edildi.
- [ ] Sürüm ≥ 13; `PGIMG` ana sürüme eşitlendi (ör. `postgres:15-alpine`).
- [ ] `pg_stat_activity`'de uygulamanın bağlantıları görünüyor.
- [ ] `.env.local`'daki "eski sağlayıcı" host'u ile **karşılaştırıldı**. Canlının gerçek DB'si bu.

## Adım 2 — Dosyaları sunucuya kopyala ve doğrula

Mac'te:

```bash
cd ~/tatilin-yeri-next
scp db/migrations/105_symmetric_content_foundation.sql db/migrations/106_content_mirror.sql \
    db/migrations/107_backfill_tr_translations.sql "Claude outputs/gecis-kilavuzu/"*.sql \
    <kullanıcı>@<sunucu>:/root/tatilinyeri-gecis-<tarih>/
```

Sunucuda:

```bash
cd "$GECIS" && cat > SHA256SUMS <<'EOF'
(yukarıdaki SHA256SUMS bloğu, 14 satır)
EOF
sha256sum -c SHA256SUMS        # 14 satırın hepsi "OK"
```

**Devam koşulu:** Bütün satırlar `OK`.

---

## P1 — Bakım Penceresi 1: 105 → 106 → 107 (+ deploy)

**Önceden:** Düşük trafik saati seçilir (Coolify/analitik loglarına göre; tipik olarak 03:00–06:00 TR). Toplam ~90 dk ayrılır. Editörlere 30 dk önce haber verilir.

### Adım 3 — Admin içeriği dondur ve yedek al

```bash
# Admin içerik yazımı (villa / blog / sayfa / menü / ayar / popup / koleksiyon) DURDURULDU — duyuru yapıldı.
# Rezervasyon ve ödeme akışları AÇIK kalır.

docker run --rm --network "$NET" -e DBURL -e PGSSLMODE -v "$GECIS":/w "$PGIMG" \
  sh -c 'pg_dump "$DBURL" -Fc --no-owner --no-privileges -f /w/yedek/canli_once_105.dump'
docker run --rm -v "$GECIS":/w "$PGIMG" pg_restore --list /w/yedek/canli_once_105.dump | tail -3
sha256sum yedek/canli_once_105.dump | tee yedek/canli_once_105.dump.sha256
ls -lh yedek/
```

**Devam koşulu:**

- [ ] Dump oluştu, `pg_restore --list` hatasız ve boyutu makul.
- [ ] Dump bir kopya olarak **sunucu dışına** da alındı (`scp` ile Mac'e ya da yedek depoya).

### Adım 4 — Ön kontrol (K0) ve taban parmak izi (PZ)

```bash
pq -f k0_on_kontrol_105.sql | tee log/k0.txt
pq -f pz_parmak_izi.sql     | tee log/pz_once.txt
grep -c "HATA" log/k0.txt   # 0 olmalı
```

**Devam koşulu:**

- [ ] K0'da **HATA yok.** Bilgi satırları (biçim dışı slug'lar, `pages.content`) not edildi.
- [ ] "sahibi olunmayan tablo" = 0. Bağlanan rol tabloların sahibi ya da superuser.
- [ ] "30 sn'den eski açık transaction" = 0. Değilse 2–3 dk beklenip K0 tekrarlanır.

### Adım 5 — Migration 105

```bash
pq -f 105_symmetric_content_foundation.sql 2>&1 | tee log/105.log; echo "rc=${PIPESTATUS[0]}"
pq -f k1_son_kontrol_105.sql | tee log/k1.txt; grep -c "HATA" log/k1.txt
```

**Devam koşulu:** `rc=0`, log'da `COMMIT`, K1'de HATA 0 (7/7 OK). **Aksi hâlde §G-1.**

### Adım 6 — Migration 106 ve 107

```bash
pq -f 106_content_mirror.sql 2>&1 | tee log/106.log; echo "rc=${PIPESTATUS[0]}"
pq -f k2_son_kontrol_106.sql | tee log/k2.txt; grep -c "HATA" log/k2.txt        # 0 (8/8 OK)

pq -f 107_backfill_tr_translations.sql 2>&1 | tee log/107.log; echo "rc=${PIPESTATUS[0]}"
grep "Migration 107:" log/107.log                                                # 14 NOTICE: ana kayıt = eklenen + zaten vardı
pq -f k3_son_kontrol_107.sql | tee log/k3.txt; grep -c "HATA" log/k3.txt        # 0 (14/14 OK)
pq -f pz_parmak_izi.sql | tee log/pz_sonra_107.txt
diff log/pz_once.txt log/pz_sonra_107.txt && echo "PZ AYNI"
```

**Devam koşulu:**

- [ ] 106 ve 107: `rc=0`, `COMMIT`.
- [ ] K2 8/8 OK, K3 14/14 OK.
- [ ] PZ diff boş. Ana tablolarda (`villa` …) fark varsa yalnız eşzamanlı **meşru** uygulama yazımından olabilir ve incelenir. Çeviri tablolarında (tr hariç) ve `url_redirects`'te fark **olmamalı.**

**Bu noktada:** Site eski kodla (`HEAD`) çalışmaya devam ediyor. Bu kombinasyon test edildi.

### Adım 7 — Yeni kodun deploy'u (elle)

- Coolify → uygulama → **Deploy** (elle). Kod, push edilmiş commit 1–3'tür.
- Build log'unda hata yok; yeni container "healthy".
- Önceki deployment'ın etiketi ya da commit'i not edilir (R1 hedefi).

### Adım 8 — Canlı smoke (deploy'dan hemen sonra; gönderim yok)

Gerçek kayıtlarla, her biri TR / EN / DE:

- [ ] `/`, `/en`, `/de` → 200; `<html lang>`, canonical, hreflang (tr/en/de + x-default); `/tr` → 307 `/`.
- [ ] Villa listesi (`/kiralik-villalar`, `/en/villas-for-rent`, `/de/ferienvillen`) → 200; kart başlıkları ve rozetler dilinde.
- [ ] **Villa detayı** (3 dil) → 200; açıklama ve SEO dilinde; **fiyat, takvim ve rezervasyon kenar çubuğu önceki gibi**; EN'de teknik anahtar URL'si → 308 EN slug'ı.
- [ ] Kategori ve bölge (3 dil) → 200.
- [ ] Blog listesi ve bir yazı (3 dil): çevrili dil index; çevrisiz dil yedek içerik + `noindex,follow`.
- [ ] Bir CMS sayfası (3 dil).
- [ ] Arama, kısa süreli fırsatlar, iletişim, teklif, favoriler → 200 (formlar **gönderilmez**).
- [ ] `sitemap.xml` (villa, kategori, bölge, blog, sayfa ve kısa süreli girdiler var; pasif dil yok) ve `robots.txt` (değişmedi).
- [ ] Admin: bir **test** kaydında EN başlık değiştir → public sayfa **hemen** güncel → eski hâline döndür. TR içerik kaydı da çalışmalı (ayna). **TR slug alanı kilitli** (108 öncesi beklenen).
- [ ] Voucher önizleme ve rezervasyon e-posta şablonu Türkçe; ödeme yöntemi adı görünüyor (gönderim yok).
- [ ] Coolify log'larında yeni hata türü yok.

**Sorun varsa:** §G-3 (R1, kodu geri al).

### Adım 9 — Pencereyi kapat

- [ ] K3 bir kez daha OK.
- [ ] Admin içerik yazımı açıldı; duyuru yapıldı.
- [ ] Auto Deploy ayarı ekip kararına göre (Claude değiştirmez).
- [ ] `log/` klasörü saklandı.

**İzleme (1–3 gün):**

- 5xx ve uygulama hataları;
- PostgreSQL loglarında `url_redirects kaydı yazılamadı` WARNING'i;
- `content_mirror_guard` hataları;
- günde bir K3.

---

## P2 — Bakım Penceresi 2: Migration 108 (1–3 gün sonra, ayrı onay)

**Ön koşullar:**

- [ ] İzleme temiz.
- [ ] R-B düzeltmesi Pencere 1 deploy'u ile canlıda (commit 2). Gerekirse `/blog/<slug>` gibi bir TR URL'sinin hâlâ 200 verdiği kontrol edilir.
- [ ] 108 dosyası taslaktan çıkarıldı. `db/migrations/108_language_slug_separation.sql` olarak, başlığı güncellenmiş (TASLAK ifadesi kalktı, G108 notu eklendi) hâliyle commit 4 olarak push edildi. Yalnız yorum değiştiyse fonksiyon gövdeleri ve testler geçerli kalır.
- [ ] Yeni sha256 hesaplandı; dosya ve `g108_geri_al.sql` sunucuya kopyalandı.

```bash
cd "$GECIS"
pq -f k4_on_kontrol_108.sql | tee log/k4.txt; grep -c "HATA" log/k4.txt          # 0 (6/6 OK)
pq -f k3_son_kontrol_107.sql | tee log/k3_once_108.txt; grep -c "HATA" log/k3_once_108.txt   # 0
docker run --rm --network "$NET" -e DBURL -e PGSSLMODE -v "$GECIS":/w "$PGIMG" \
  sh -c 'pg_dump "$DBURL" -Fc --no-owner --no-privileges -f /w/yedek/canli_once_108.dump'
pq -f 108_language_slug_separation.sql 2>&1 | tee log/108.log; echo "rc=${PIPESTATUS[0]}"
pq -f k5_son_kontrol_108.sql | tee log/k5.txt; grep -c "HATA" log/k5.txt           # 0 (5/5 OK)
```

**Deploy gerekmez.** Kod 108'i her yazmada kontrol ediyor; admin'de TR slug alanı kendiliğinden açılır.

**Smoke:** Bir test kaydının TR slug'ı değiştirilir → eski TR URL **308** → yeni TR URL; EN/DE URL'leri değişmez; slug eski hâline döndürülür.

---

## §G — Güvenli durdurma ve rollback prosedürü

| # | Durum | Ne yapılır |
|---|---|---|
| **G-1** | Bir migration `rc≠0` (Adım 5–6) | Migration tek transaction olduğu için **hiçbir şey uygulanmamıştır.** (1) Log'daki hatayı kaydet. (2) Hata `55P03` (lock timeout) ise: 60–120 sn bekle → K0'daki açık transaction satırına bak → aynı dosyayı **yeniden** çalıştır; en fazla 3 deneme. (3) Başka bir hataysa **dur**: o migration'ın son kontrolünü çalıştırıp uygulanmadığını teyit et (ör. 105 için `SELECT to_regprocedure('public.content_mirror_mode()')` → NULL), admin yazımını aç, pencereyi kapat. Önceki başarılı migration'lar yerinde kalabilir: `HEAD` 105, 106 ve 107'nin her ara durumuyla uyumlu (ayna yalnız ana tablodan `tr`'ye yazar). |
| **G-2** | 105–107 başarılı ama deploy'dan önce vazgeçildi | **Önerilen:** Hiçbir şey yapma; `HEAD` bu şemayla çalışıyor. Zorunluysa sırayla: `pq -f g107_geri_al.sql` → `pq -f g106_geri_al.sql` → `pq -f 103_url_redirects.sql` (repodan) → `pq -f 105_symmetric_content_foundation.sql` → `pq -f g105_geri_al.sql` → K0 (HATA yok) ve PZ = `log/pz_once.txt`. Bu zincir izole testte başlangıç şemasını ve verisini birebir geri getirdi. |
| **G-3** | Deploy sonrası public veya admin sorunu | **R1:** Coolify → *Deployments* → önceki deployment → **Redeploy / Rollback**. DB'ye **dokunulmaz** (`HEAD` 105–107 ile uyumlu). Sorun ayrı onayla düzeltilip yeniden deploy edilir. |
| **G-4** | 108 sonrası TR URL sorunu | Önce ileriye dönük düzeltme (slug'ı admin'den düzelt; R-B düzeltmesi). Son çare: `pq -f g108_geri_al.sql`. Farklılaşmış TR slug'larını `url_redirects`'e yazar, teknik anahtara döndürür, 106 fonksiyonlarını geri getirir, yetenek işaretini kaldırır. Ardından K4 + K3 çalıştırılır. Admin'de TR slug alanı yeniden kilitlenir. |
| **G-5** | Veri bozulması şüphesi | (1) Admin yazımını durdur; K3 ve PZ ile kapsamı ölç. (2) Geri yükleme **son çare.** `canli_once_105.dump`, mevcut DB'nin üzerine değil **yeni bir DB'ye** yüklenir: `createdb … && pg_restore --no-owner -d <yeni_db> canli_once_105.dump`. Sonra gerekli tablolar karşılaştırılır. Tam dönüş gerekirse dump'tan sonraki rezervasyon ve ödeme kayıtları **önce dışa alınır**, sonra uygulamanın `DATABASE_URL`'i yeni DB'ye çevrilir. Bu adım ayrı karar gerektirir. |

**Asla yapılmayacaklar:**

- Bir migration dosyası, sonraki migration uygulandıktan sonra tek başına yeniden çalıştırılmaz. Örnek: 108 sonrası 106 → 108'i sessizce geri alır. **Tek istisna** G-2 zincirinin kendi adımları.
- `psql --single-transaction` (`-1`) kullanılmaz.
- Migration'lar uygulama container'ının **içinden** ya da otomatik deploy'la çalıştırılmaz.

---

## Son kontrol listesi (özet)

**Push öncesi**

- [ ] Ek B listesi gözden geçirildi; commit 1–3 yol listeleriyle oluşturuldu (5 / 305 / 37); `git status`'ta yalnız `_drafts/108` kaldı.
- [ ] Coolify Auto Deploy kapalı (teyitli); push sonrası deployment başlamadı.
- [ ] Push edildi; yeni deployment **başlamadı.**

**Pencere 1**

- [ ] Adım 1: gerçek DB, sürüm, ağ ve rol doğrulandı.
- [ ] Adım 2: SHA256SUMS 14/14 OK.
- [ ] Adım 3: admin dondu; yedek alındı ve sunucu dışına kopyalandı.
- [ ] Adım 4: K0 HATA 0; PZ tabanı alındı.
- [ ] Adım 5: 105 `rc=0`; K1 7/7.
- [ ] Adım 6: 106 `rc=0`, K2 8/8; 107 `rc=0`, K3 14/14; PZ aynı.
- [ ] Adım 7: deploy elle yapıldı; önceki deployment not edildi.
- [ ] Adım 8: smoke tamam (villa detayı ve rezervasyon kenar çubuğu dahil).
- [ ] Adım 9: admin açıldı; loglar saklandı.

**İzleme (1–3 gün)**

- [ ] Hata yok; K3 günlük OK.

**Pencere 2**

- [ ] R-B düzeltmesi canlıda; commit 4 push edildi; sha256 doğrulandı.
- [ ] K4 6/6, K3 OK; yedek alındı.
- [ ] 108 `rc=0`; K5 5/5.
- [ ] Smoke (TR slug).

---

## Onay bekleyen kararlar

1. **Push** (commit 1–3; §4 komutları). Commit'leri ekip mi oluşturacak, yoksa Claude mı (ayrı onayla)?
2. **Pencere 1'in tarihi.**

---

## Ek A — Migration dosyalarındaki değişikliğin tam diff'i (uygulandı)

```diff
--- a/db/migrations/105_symmetric_content_foundation.sql	2026-11-05 21:34:59.502792844 +0300
+++ b/db/migrations/105_symmetric_content_foundation.sql	2026-11-05 21:36:15.275969928 +0300
@@ -71,6 +71,13 @@
 
 BEGIN;
 
+/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
+   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
+   lock_timeout aşılırsa migration 105 hiçbir değişiklik bırakmadan geri alınır
+   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
+SET LOCAL lock_timeout = '2s';
+SET LOCAL statement_timeout = '30s';
+
 /* ---------------------------------------------------------------
    0) Bağımlılık kontrolü
 --------------------------------------------------------------- */
--- a/db/migrations/106_content_mirror.sql	2026-11-05 21:34:59.502838354 +0300
+++ b/db/migrations/106_content_mirror.sql	2026-11-05 21:36:15.276179247 +0300
@@ -63,6 +63,13 @@
 
 BEGIN;
 
+/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
+   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
+   lock_timeout aşılırsa migration 106 hiçbir değişiklik bırakmadan geri alınır
+   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
+SET LOCAL lock_timeout = '3s';
+SET LOCAL statement_timeout = '30s';
+
 /* ---------------------------------------------------------------
    0) Bağımlılık
 --------------------------------------------------------------- */
--- a/db/migrations/107_backfill_tr_translations.sql	2026-11-05 21:34:59.502859925 +0300
+++ b/db/migrations/107_backfill_tr_translations.sql	2026-11-05 21:36:15.277842125 +0300
@@ -41,6 +41,13 @@
 
 BEGIN;
 
+/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
+   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
+   lock_timeout aşılırsa migration 107 hiçbir değişiklik bırakmadan geri alınır
+   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
+SET LOCAL lock_timeout = '5s';
+SET LOCAL statement_timeout = '5min';
+
 DO $$
 DECLARE
   r          record;
--- a/db/migrations/108_language_slug_separation.DRAFT.sql	2026-11-05 21:34:59.504737461 +0300
+++ b/db/migrations/108_language_slug_separation.DRAFT.sql	2026-11-05 21:35:56.450435989 +0300
@@ -53,6 +53,13 @@
 
 BEGIN;
 
+/* Faz 7 hazırlık — kilit ve süre sınırları (yalnız bu transaction'da geçerli;
+   COMMIT/ROLLBACK sonrası oturum ayarları eski hâline döner).
+   lock_timeout aşılırsa migration 108 hiçbir değişiklik bırakmadan geri alınır
+   (SQLSTATE 55P03); kısa bir beklemeden sonra güvenle yeniden çalıştırılabilir. */
+SET LOCAL lock_timeout = '3s';
+SET LOCAL statement_timeout = '30s';
+
 DO $$
 BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_content_mirror_base_to_tr') THEN
```

---

## Ek C — R-B routing düzeltmesinin tam diff'i (uygulandı)

```diff
--- a/lib/i18n/routing/context.ts	2026-11-04 17:45:26.977732036 +0000
+++ b/lib/i18n/routing/context.ts	2026-11-05 19:24:25.597065109 +0000
@@ -201,6 +201,19 @@
   const src = slugSource(ctx, kind, slug, locale);
   const others = otherEnabledLocales(ctx, locale);
   if (src === "base") {
+    /* Faz 7 R-B — sahip önceliği (teknik anahtar = `slug`):
+         1) slug'ı KENDİ çeviri satırında taşıyan aktif dil (gerçek sahip);
+         2) slug'ı KENDİ geçmişinde taşıyan aktif dil (o dil bu URL'yi
+            daha önce kullandı → o dilin güncel sayfası);
+         3) kendi slug'ı olmadığı için teknik anahtarı kanonik kullanan dil
+            (önceki kural; ana dil değişimi senaryoları aynen korunur).
+       Böylece dil slug'ı teknik anahtardan ayrılmış (ör. 108 sonrası TR
+       slug değişikliği) bir kaydın eski URL'si, yalnız yedek olarak teknik
+       anahtarı kullanan BAŞKA bir dile gönderilmez. */
+    const real = others.find((l) => ctx.slugs[kind]?.[slug]?.[l] === slug);
+    if (real) return real;
+    const historic = others.find((l) => ctx.redirects?.[kind]?.[l]?.[slug] === slug);
+    if (historic) return historic;
     return others.find((l) => slugSource(ctx, kind, slug, l) === "own") ?? null;
   }
   if (src !== "other") return null;
@@ -208,6 +221,19 @@
   return others.find((l) => !!rev?.[l]?.get(slug)) ?? null;
 }
 
+/** Faz 7 R-B — teknik anahtar `slug`, `locale` dilinin KENDİ slug
+ *  geçmişinde mi? (O dilin slug'ı eskiden teknik anahtardı; sonra kalıcı
+ *  olarak değiştirildi — ör. 108 sonrası TR slug değişikliği.) Geçmiş
+ *  kaydı aynı kayda işaret etmelidir (eski slug = teknik anahtar). */
+export function ownHistoryHasTechnicalKey(
+  ctx: RoutingContext,
+  kind: SlugKind,
+  slug: string,
+  locale: Locale
+): boolean {
+  return ctx.redirects?.[kind]?.[locale]?.[slug] === slug;
+}
+
 /** Faz 5 — slug bu dilin KENDİ (çeviri satırındaki) slug'ı ise teknik
  *  anahtarı; değilse null. Yedek/geçmiş araması YAPMAZ. */
 export function ownLocaleSlugBase(
--- a/lib/i18n/routing/url.ts	2026-11-04 17:45:54.680995767 +0000
+++ b/lib/i18n/routing/url.ts	2026-11-05 19:24:25.599531908 +0000
@@ -1,6 +1,7 @@
 import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
 import {
   getRoutingContext,
+  ownHistoryHasTechnicalKey,
   slugOwnerLocale,
   slugSource,
   toBaseSlug,
@@ -351,13 +352,21 @@
       if (!prefixed && def.slugKind && own.params.slug) {
         const src = slugSource(ctx, def.slugKind, own.params.slug, locale);
         if (src === "other" || src === "base") {
+          /* Faz 7 R-B — teknik anahtar bu dilin KENDİ geçmişinde: dil slug'ı
+             kalıcı olarak değişti (ör. 108 sonrası TR slug'ı) → aynı dilin
+             yeni slug'ına KALICI 308; başka dile gönderilmez. */
+          if (src === "base" && ownHistoryHasTechnicalKey(ctx, def.slugKind, own.params.slug, locale)) {
+            return { type: "redirect", path: canonical, status: REDIRECT_STATUS.canonical };
+          }
           const owner = slugOwnerLocale(ctx, def.slugKind, own.params.slug, locale);
           const sameShape = owner ? matchRoute(rest, owner)?.key === own.key : false;
-          const path =
-            owner && sameShape && ctx.enabled.includes(owner)
-              ? buildRoutePath(own.key, base, owner, ctx)
-              : canonical;
-          return { type: "redirect", path, status: REDIRECT_STATUS.localeRoot };
+          const toOwner = !!owner && sameShape && ctx.enabled.includes(owner);
+          const path = toOwner ? buildRoutePath(own.key, base, owner!, ctx) : canonical;
+          /* Başka dile gidiş ana dile bağlıdır → geçici 307. Teknik anahtardan
+             AYNI dilin kanonik slug'ına düzeltme ise kalıcıdır → 308. */
+          const status =
+            !toOwner && src === "base" ? REDIRECT_STATUS.canonical : REDIRECT_STATUS.localeRoot;
+          return { type: "redirect", path, status };
         }
       }
       return { type: "redirect", path: canonical, status: REDIRECT_STATUS.canonical };
--- a/lib/i18n/routing/sql.ts	2026-11-04 12:22:38.826155733 +0000
+++ b/lib/i18n/routing/sql.ts	2026-11-05 19:24:25.601047929 +0000
@@ -31,31 +31,35 @@
 
 /** Slug geçmişi (migration 103) → YALNIZ yayındaki içeriklerin GÜNCEL
  *  taban slug'ı. Pasif / silinmiş içerik → satır gelmez → yönlendirme
- *  üretilmez. Eski slug bugün canlı bir taban slug'ı ise atlanır
- *  (canlı içerik her zaman önceliklidir). */
+ *  üretilmez. Eski slug bugün BAŞKA bir kaydın canlı taban slug'ı ise
+ *  atlanır (canlı içerik her zaman önceliklidir).
+ *  Faz 7 R-B: eski slug kaydın KENDİ teknik anahtarına eşit olabilir
+ *  (dil slug'ı teknik anahtardan ayrıldı — ör. 108 sonrası TR slug
+ *  değişikliği). Bu satır artık atlanmaz; proxy onu "bu dil teknik
+ *  anahtarı eskiden kullandı" bilgisi olarak okur (aynı dile 308). */
 export const REDIRECTS_SQL = `
   WITH r AS (
     SELECT r.entity_kind AS kind, r.locale, r.old_slug, r.entity_id FROM public.url_redirects r
   )
   SELECT r.kind, r.locale, r.old_slug, p.slug AS base FROM r
     JOIN public.villa p ON p.id = r.entity_id AND p.is_active = true AND p.deleted_at IS NULL
-   WHERE r.kind = 'villa' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
-     AND NOT EXISTS (SELECT 1 FROM public.villa x WHERE x.slug = r.old_slug)
+   WHERE r.kind = 'villa' AND p.slug IS NOT NULL
+     AND NOT EXISTS (SELECT 1 FROM public.villa x WHERE x.slug = r.old_slug AND x.id <> p.id)
   UNION ALL
   SELECT r.kind, r.locale, r.old_slug, p.slug FROM r
     JOIN public.villa_types p ON p.id = r.entity_id
-   WHERE r.kind = 'villaType' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
-     AND NOT EXISTS (SELECT 1 FROM public.villa_types x WHERE x.slug = r.old_slug)
+   WHERE r.kind = 'villaType' AND p.slug IS NOT NULL
+     AND NOT EXISTS (SELECT 1 FROM public.villa_types x WHERE x.slug = r.old_slug AND x.id <> p.id)
   UNION ALL
   SELECT r.kind, r.locale, r.old_slug, p.slug FROM r
     JOIN public.blog_posts p ON p.id = r.entity_id AND p.is_active = true
-   WHERE r.kind = 'blog' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
-     AND NOT EXISTS (SELECT 1 FROM public.blog_posts x WHERE x.slug = r.old_slug)
+   WHERE r.kind = 'blog' AND p.slug IS NOT NULL
+     AND NOT EXISTS (SELECT 1 FROM public.blog_posts x WHERE x.slug = r.old_slug AND x.id <> p.id)
   UNION ALL
   SELECT r.kind, r.locale, r.old_slug, p.slug FROM r
     JOIN public.pages p ON p.id = r.entity_id AND p.is_active = true
-   WHERE r.kind = 'page' AND p.slug IS NOT NULL AND p.slug <> r.old_slug
-     AND NOT EXISTS (SELECT 1 FROM public.pages x WHERE x.slug = r.old_slug)
+   WHERE r.kind = 'page' AND p.slug IS NOT NULL
+     AND NOT EXISTS (SELECT 1 FROM public.pages x WHERE x.slug = r.old_slug AND x.id <> p.id)
 `;
 
 /** Faz 3 son kontrol — YAYINDAKİ içeriklerin taban slug'ları (proxy
```

---

## Ek B — Dosya envanteri ve commit grupları

Sütunlar: commit · grup · git durumu (`M` değişti, `D` silindi, `??` yeni) · yol · son değişiklik (UTC, ay-gün saat) · işaret.

| Commit | Grup | Durum | Yol | Son değişiklik | İşaret |
|---|---|---|---|---|---|
| 1 | Migration | `??` | `db/migrations/105_symmetric_content_foundation.sql` | 11-05 18:56 | lock_timeout (onaylı) |
| 1 | Migration | `??` | `db/migrations/106_content_mirror.sql` | 11-05 18:56 | lock_timeout (onaylı) |
| 1 | Migration | `??` | `db/migrations/107_backfill_tr_translations.sql` | 11-05 18:56 | lock_timeout (onaylı) |
| 1 | Test | `??` | `tests/unit/symmetric-content-mirror-migrations.test.ts` | 11-04 10:17 |  |
| 1 | Test | `??` | `tests/unit/symmetric-content-registry.test.ts` | 11-04 09:56 |  |
| 2 | Silinen | `D` | `app/(public)/blog/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/blog/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/bolgeler/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/blog/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/blog/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/bolgeler/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/favoriler/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/kiralik-villa/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/kiralik-villalar/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/p/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/teklif-al/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/de/villa-turleri/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/blog/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/blog/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/bolgeler/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/favoriler/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/kiralik-villa/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/kiralik-villalar/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/p/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/teklif-al/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/en/villa-turleri/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/favoriler/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/kiralik-villa/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/kiralik-villalar/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/teklif-al/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/(public)/villa-turleri/[slug]/locale-page.tsx` | - |  |
| 2 | Silinen | `D` | `app/p/[slug]/locale-page.tsx` | - |  |
| 2 | Test | `??` | `tests/fixtures/faz6/cms-adapter.ts` | 11-04 20:23 |  |
| 2 | Test | `??` | `tests/fixtures/faz6/content-fixture.ts` | 11-04 20:03 |  |
| 2 | Test | `??` | `tests/fixtures/faz6/content-table-mock.ts` | 11-04 20:07 |  |
| 2 | Test | `??` | `tests/fixtures/faz6/legacy-repo-central.ts` | 11-04 21:33 |  |
| 2 | Test | `??` | `tests/fixtures/faz6/sitemap-content.ts` | 11-05 12:21 |  |
| 2 | Test | `??` | `tests/integration/content-faz5-dalga2-pg.test.ts` | 11-04 14:15 |  |
| 2 | Test | `??` | `tests/integration/content-faz5-pg.test.ts` | 11-04 15:31 |  |
| 2 | Test | `??` | `tests/integration/content-faz5-son-kontroller-pg.test.ts` | 11-04 15:29 |  |
| 2 | Test | `??` | `tests/integration/content-faz6-dalga1-pg.test.ts` | 11-04 18:18 |  |
| 2 | Test | `??` | `tests/integration/content-faz6-dalga2-pg.test.ts` | 11-04 19:08 |  |
| 2 | Test | `??` | `tests/integration/content-faz6-dalga3-pg.test.ts` | 11-04 20:21 |  |
| 2 | Test | `??` | `tests/integration/content-faz6-dalga4-pg.test.ts` | 11-04 21:50 |  |
| 2 | Test | `??` | `tests/integration/content-faz6-dalga5-pg.test.ts` | 11-05 13:13 |  |
| 2 | Test | `??` | `tests/integration/content-faz6-dalga6-pg.test.ts` | 11-05 14:06 |  |
| 2 | Test | `??` | `tests/integration/content-faz7-tr-slug-pg.test.ts` | 11-05 19:28 | R-B (onaylı) |
| 2 | Test | `??` | `tests/integration/content-read-pg.test.ts` | 11-04 15:32 |  |
| 2 | Test | `??` | `tests/integration/content-write-pg.test.ts` | 11-04 12:51 |  |
| 2 | Test | `??` | `tests/unit/content-read-compat.test.ts` | 11-04 15:27 |  |
| 2 | Test | `??` | `tests/unit/content-read-core.test.ts` | 11-05 13:40 |  |
| 2 | Test | `??` | `tests/unit/content-read-server.test.ts` | 11-05 12:22 |  |
| 2 | Test | `??` | `tests/unit/content-read-sql-resolve.test.ts` | 11-04 11:21 |  |
| 2 | Test | `??` | `tests/unit/content-slug-separation-routing.test.ts` | 11-04 12:23 |  |
| 2 | Test | `??` | `tests/unit/content-write-core.test.ts` | 11-04 12:41 |  |
| 2 | Test | `??` | `tests/unit/faz5-admin-content.test.tsx` | 11-04 14:12 |  |
| 2 | Test | `??` | `tests/unit/faz5-dalga2-villa.test.ts` | 11-04 14:10 |  |
| 2 | Test | `??` | `tests/unit/faz5-dalga2.test.tsx` | 11-04 14:15 |  |
| 2 | Test | `??` | `tests/unit/faz5-son-kontroller.test.ts` | 11-04 15:32 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga1-routing.test.tsx` | 11-04 18:18 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga2-taxonomy.test.tsx` | 11-04 19:19 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga2-villa.test.tsx` | 11-05 12:23 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga3-blog.test.tsx` | 11-04 20:23 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga3-cms.test.tsx` | 11-04 20:23 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga4-collections.test.tsx` | 11-04 21:07 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga4-home.test.tsx` | 11-05 07:14 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga4-root-metadata.test.ts` | 11-05 13:02 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga4-shell.test.tsx` | 11-04 21:35 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga4-taxonomy-faq.test.tsx` | 11-04 21:09 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga5-seo.test.ts` | 11-05 12:25 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga5-site-seo.test.tsx` | 11-05 13:03 |  |
| 2 | Test | `??` | `tests/unit/faz6-dalga6-cache.test.ts` | 11-05 13:52 |  |
| 2 | Test | `??` | `tests/unit/faz7-tr-slug-redirect.test.ts` | 11-05 19:26 | R-B (onaylı) |
| 2 | Test | `M` | `tests/unit/BookingSidebar.hide-reservation-cta.test.tsx` | 11-04 18:42 |  |
| 2 | Test | `M` | `tests/unit/PageTranslationsCard.test.tsx` | 11-04 13:59 |  |
| 2 | Test | `M` | `tests/unit/cms-page-locale-routes.test.tsx` | 11-04 20:23 |  |
| 2 | Test | `M` | `tests/unit/cms-page-sections-locale.test.tsx` | 11-04 20:23 |  |
| 2 | Test | `M` | `tests/unit/cms-page-static-i18n.test.tsx` | 11-04 20:23 |  |
| 2 | Test | `M` | `tests/unit/cms-page-translation.test.ts` | 11-04 20:06 |  |
| 2 | Test | `M` | `tests/unit/contact-locale-routes.test.tsx` | 11-04 21:33 |  |
| 2 | Test | `M` | `tests/unit/faq-i18n.test.tsx` | 11-04 12:41 |  |
| 2 | Test | `M` | `tests/unit/footer-locale.test.tsx` | 11-04 21:31 |  |
| 2 | Test | `M` | `tests/unit/homepage-i18n.test.ts` | 11-04 20:50 |  |
| 2 | Test | `M` | `tests/unit/homepage-locale-routes.test.tsx` | 11-04 20:49 |  |
| 2 | Test | `M` | `tests/unit/kiralik-villalar-locale-routes.test.tsx` | 11-04 19:19 |  |
| 2 | Test | `M` | `tests/unit/layout-wrappers-cache-usage.test.tsx` | 11-04 21:32 |  |
| 2 | Test | `M` | `tests/unit/locale-routes.test.tsx` | 11-04 19:20 |  |
| 2 | Test | `M` | `tests/unit/menu-name-locale.test.tsx` | 11-04 21:30 |  |
| 2 | Test | `M` | `tests/unit/navigation-locale-persistence.test.tsx` | 11-04 20:10 |  |
| 2 | Test | `M` | `tests/unit/page-menu-title-locale.test.tsx` | 11-04 21:30 |  |
| 2 | Test | `M` | `tests/unit/page-translation.service.test.ts` | 11-04 13:59 |  |
| 2 | Test | `M` | `tests/unit/page-translations-action.test.ts` | 11-04 13:59 |  |
| 2 | Test | `M` | `tests/unit/page-translations-wiring.test.ts` | 11-04 13:59 |  |
| 2 | Test | `M` | `tests/unit/payment-method-translations.test.ts` | 11-04 12:44 |  |
| 2 | Test | `M` | `tests/unit/phase3-final-404-robots.test.ts` | 11-05 12:21 |  |
| 2 | Test | `M` | `tests/unit/phase4-root-locale-api.test.ts` | 11-04 13:43 |  |
| 2 | Test | `M` | `tests/unit/price-include-item-translation.service.test.ts` | 11-04 12:43 |  |
| 2 | Test | `M` | `tests/unit/private-villa-detail-parity.test.tsx` | 11-04 18:41 |  |
| 2 | Test | `M` | `tests/unit/public-default-locale-home.test.ts` | 11-04 20:49 |  |
| 2 | Test | `M` | `tests/unit/public-locale-completion.test.tsx` | 11-04 17:50 |  |
| 2 | Test | `M` | `tests/unit/public-locale-full-coverage.test.tsx` | 11-04 19:53 |  |
| 2 | Test | `M` | `tests/unit/public-tr-leak-forensic.test.ts` | 11-05 07:14 |  |
| 2 | Test | `M` | `tests/unit/routing-dispatch-proxy.test.tsx` | 11-04 12:23 |  |
| 2 | Test | `M` | `tests/unit/rule-item-translation.service.test.ts` | 11-04 12:43 |  |
| 2 | Test | `M` | `tests/unit/sec03-admin-api-permission.test.ts` | 11-04 13:43 |  |
| 2 | Test | `M` | `tests/unit/settings-translation-service.test.ts` | 11-04 13:43 |  |
| 2 | Test | `M` | `tests/unit/settings-translations-action.test.ts` | 11-04 13:43 |  |
| 2 | Test | `M` | `tests/unit/similar-villas-section.test.tsx` | 11-04 19:24 |  |
| 2 | Test | `M` | `tests/unit/site-locales-admin-route.test.ts` | 11-04 13:43 |  |
| 2 | Test | `M` | `tests/unit/site-locales-config.test.ts` | 11-04 17:46 |  |
| 2 | Test | `M` | `tests/unit/site-popup.test.tsx` | 11-04 13:35 |  |
| 2 | Test | `M` | `tests/unit/sitemap-locale-alternates.test.ts` | 11-05 12:21 |  |
| 2 | Test | `M` | `tests/unit/taxonomy-landing.test.tsx` | 11-05 12:23 |  |
| 2 | Test | `M` | `tests/unit/type-translations-action.test.ts` | 11-04 12:44 |  |
| 2 | Test | `M` | `tests/unit/villa-admin-helpers/cloneVillaPayload.test.ts` | 11-04 14:07 |  |
| 2 | Test | `M` | `tests/unit/villa-admin-helpers/createVillaOrchestrationContract.test.ts` | 11-04 14:07 |  |
| 2 | Test | `M` | `tests/unit/villa-admin-helpers/updateVillaOrchestrationContract.test.ts` | 11-04 14:07 |  |
| 2 | Test | `M` | `tests/unit/villa-detail-seo-en-de.test.ts` | 11-04 18:38 |  |
| 2 | Test | `M` | `tests/unit/villa-detail-seo-tr.test.ts` | 11-04 18:38 |  |
| 2 | Test | `M` | `tests/unit/villa-feature-translation.service.test.ts` | 11-04 12:43 |  |
| 2 | Test | `M` | `tests/unit/villa-translation-service.test.ts` | 11-04 14:07 |  |
| 2 | Test | `M` | `tests/unit/villa-translations-action.test.ts` | 11-04 14:07 |  |
| 2 | Test | `M` | `tests/unit/villa-type-name-locale.test.tsx` | 11-04 21:31 |  |
| 2 | Test | `M` | `tests/unit/villa-type-translation.service.test.ts` | 11-04 12:43 |  |
| 2 | Uygulama kodu | `??` | `app/(admin)/maki-admin/_content/content-layout.action.ts` | 11-04 12:30 |  |
| 2 | Uygulama kodu | `??` | `app/(admin)/maki-admin/_content/simple-content.server.ts` | 11-04 12:36 |  |
| 2 | Uygulama kodu | `??` | `app/(admin)/maki-admin/blog/blog-content.server.ts` | 11-04 13:50 |  |
| 2 | Uygulama kodu | `??` | `app/(admin)/maki-admin/faqs/faq-content.server.ts` | 11-04 12:34 |  |
| 2 | Uygulama kodu | `??` | `app/(admin)/maki-admin/pages/_content/page-content.server.ts` | 11-04 13:57 |  |
| 2 | Uygulama kodu | `??` | `app/(admin)/maki-admin/settings/_content/settings-content.server.ts` | 11-04 14:18 |  |
| 2 | Uygulama kodu | `??` | `app/(admin)/maki-admin/settings/popup/popup-content.server.ts` | 11-04 13:34 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/blog.tsx` | 11-04 19:48 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/cms-page.tsx` | 11-04 20:02 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/favorites.tsx` | 11-04 17:47 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/home.tsx` | 11-04 20:47 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/offer.tsx` | 11-04 17:47 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/region.tsx` | 11-04 19:05 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/villa-type.tsx` | 11-04 18:54 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/villa.tsx` | 11-05 12:22 |  |
| 2 | Uygulama kodu | `??` | `app/(public)/_routes/villas.tsx` | 11-04 18:30 |  |
| 2 | Uygulama kodu | `??` | `app/components/admin/shared/CollectionTitleTranslations.tsx` | 11-04 12:36 |  |
| 2 | Uygulama kodu | `??` | `app/components/admin/shared/LocaleTranslationsPanel.tsx` | 11-04 12:29 |  |
| 2 | Uygulama kodu | `??` | `app/components/admin/shared/RootLocaleNote.tsx` | 11-04 13:44 |  |
| 2 | Uygulama kodu | `??` | `app/components/admin/shared/TechnicalKeyNote.tsx` | 11-04 13:59 |  |
| 2 | Uygulama kodu | `??` | `app/components/admin/shared/useAdminLocaleLayout.ts` | 11-04 12:30 |  |
| 2 | Uygulama kodu | `??` | `app/services/villa-admin/_helpers/content.server.ts` | 11-04 14:04 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-admin.server.ts` | 11-05 13:52 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-admin.ts` | 11-04 12:24 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-cache-policy.ts` | 11-05 13:39 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-contract.ts` | 11-04 15:26 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-derived.ts` | 11-04 11:18 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-field-rules.ts` | 11-04 15:26 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-legacy-compare.ts` | 11-04 11:22 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-locale-context.ts` | 11-04 10:40 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-presence.ts` | 11-04 11:18 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-read-core.ts` | 11-04 17:55 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-read.server.ts` | 11-04 17:55 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-registry.ts` | 11-04 09:55 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-repository.ts` | 11-04 17:55 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-resolve-empty.ts` | 11-04 11:17 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-resolve.ts` | 11-04 15:26 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-sql.ts` | 11-04 17:55 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-technical-key.server.ts` | 11-04 14:14 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-technical-key.ts` | 11-04 14:14 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-write-core.ts` | 11-04 13:32 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-write-modules.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-write-sql.ts` | 11-04 13:32 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-write-validate.ts` | 11-04 11:46 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/content-write.server.ts` | 11-05 13:43 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/payment-method-tr.ts` | 11-04 14:12 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/public-seo-content.server.ts` | 11-05 13:40 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/public-seo-content.ts` | 11-05 12:19 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/public-shared-content.server.ts` | 11-05 13:01 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/public-shared-content.ts` | 11-05 13:01 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/public-text-content.ts` | 11-05 12:19 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/public-villa-content.server.ts` | 11-04 18:28 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/content/public-villa-content.ts` | 11-04 18:28 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/routing/route-content.server.ts` | 11-04 17:56 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/routing/route-content.ts` | 11-04 17:56 |  |
| 2 | Uygulama kodu | `??` | `lib/i18n/sitemap-sql.ts` | 11-05 12:34 |  |
| 2 | Uygulama kodu | `??` | `lib/seo-site-policy.ts` | 11-05 13:00 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/blog/BlogPostForm.tsx` | 11-04 13:59 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/blog/BlogTranslationsCard.tsx` | 11-04 14:27 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/blog/[id]/page.tsx` | 11-04 13:52 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/blog/blog-translations.action.ts` | 11-04 13:51 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/blog/page.tsx` | 11-04 13:59 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/discount-collection/discount-collection.action.ts` | 11-04 12:36 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/discount-collection/page.tsx` | 11-04 12:36 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/faqs/faq-translations.action.ts` | 11-04 12:34 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/faqs/faqs.action.ts` | 11-04 12:34 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/faqs/page.tsx` | 11-04 12:34 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/features/FeatureTranslationsPanel.tsx` | 11-04 12:26 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/features/feature-translations.action.ts` | 11-04 12:26 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/features/features.action.ts` | 11-04 12:26 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/features/page.tsx` | 11-04 12:53 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/homepage-collection/homepage-collection.action.ts` | 11-04 12:36 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/homepage-collection/page.tsx` | 11-04 12:36 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/menu/MenuTranslationsPanel.tsx` | 11-04 12:30 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/menu/menu-translations.action.ts` | 11-04 12:30 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/menu/new/page.tsx` | 11-04 12:30 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/pages/[id]/PageTranslationsCard.tsx` | 11-04 14:27 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/pages/[id]/page-translations.action.ts` | 11-04 13:57 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/pages/[id]/page.tsx` | 11-04 13:59 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/pages/page.tsx` | 11-04 13:59 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/payment-methods/PaymentMethodTranslationsPanel.tsx` | 11-04 12:29 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/payment-methods/page.tsx` | 11-04 14:12 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/payment-methods/payment-method-translations.action.ts` | 11-04 14:12 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/price-includes/PriceIncludeTranslationsPanel.tsx` | 11-04 12:28 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/price-includes/page.tsx` | 11-04 12:53 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/price-includes/price-include-translations.action.ts` | 11-04 12:28 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/price-includes/price-includes.action.ts` | 11-04 12:27 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/rules/RuleTranslationsPanel.tsx` | 11-04 12:28 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/rules/page.tsx` | 11-04 12:53 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/rules/rule-translations.action.ts` | 11-04 12:28 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/rules/rules.action.ts` | 11-04 12:27 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/_components/SettingsTranslationFields.tsx` | 11-04 13:42 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/ceviriler/SettingsTranslationsPage.tsx` | 11-04 13:42 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/ceviriler/page.tsx` | 11-04 13:41 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/ceviriler/settings-translations.action.ts` | 11-04 13:41 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/genel/page.tsx` | 11-04 13:44 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/iletisim/page.tsx` | 11-04 13:44 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/popup/page.tsx` | 11-04 13:34 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/popup/popup.action.ts` | 11-04 13:33 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/settings/seo/page.tsx` | 11-04 13:44 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/types/TypeTranslationsPanel.tsx` | 11-04 12:33 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/types/type-translations.action.ts` | 11-04 12:32 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/types/types.action.ts` | 11-04 14:13 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/villas/[id]/_components/VillaTranslationsCard.tsx` | 11-04 14:27 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/villas/[id]/_components/villa-translations.action.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/villas/[id]/page.tsx` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/(admin)/maki-admin/villas/[id]/villa-edit.action.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/blog/[slug]/page.tsx` | 11-04 19:48 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/blog/page.tsx` | 11-04 19:48 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/bolgeler/[slug]/page.tsx` | 11-04 19:05 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/favoriler/page.tsx` | 11-04 17:47 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/kiralik-villa/[slug]/page.tsx` | 11-04 18:30 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/kiralik-villalar/page.tsx` | 11-04 18:30 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/p/[slug]/page.tsx` | 11-04 20:02 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/page.tsx` | 11-04 20:47 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/teklif-al/page.tsx` | 11-04 17:47 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/(site)/villa-turleri/[slug]/page.tsx` | 11-04 18:54 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/[lang]/layout.tsx` | 11-05 13:01 |  |
| 2 | Uygulama kodu | `M` | `app/(public)/_shell/PublicShell.tsx` | 11-04 21:32 |  |
| 2 | Uygulama kodu | `M` | `app/_root/root-document.tsx` | 11-05 13:01 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/blog/[id]/route.ts` | 11-05 13:52 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/blog/route.ts` | 11-04 13:50 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/menu/route.ts` | 11-04 12:30 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/pages/[id]/route.ts` | 11-04 13:56 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/pages/route.ts` | 11-05 13:52 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/settings/route.ts` | 11-04 13:40 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/villas/[id]/clone/route.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/villas/[id]/full/route.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/api/admin/villas/route.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/components/admin/shared/LocalizedSlugField.tsx` | 11-04 12:31 |  |
| 2 | Uygulama kodu | `M` | `app/components/blog/BlogDetailPageBody.tsx` | 11-04 19:50 |  |
| 2 | Uygulama kodu | `M` | `app/components/blog/BlogIndexPageBody.tsx` | 11-04 19:48 |  |
| 2 | Uygulama kodu | `M` | `app/components/blog/blog-metadata.ts` | 11-04 19:50 |  |
| 2 | Uygulama kodu | `M` | `app/components/cms/cms-page-metadata.ts` | 11-04 20:02 |  |
| 2 | Uygulama kodu | `M` | `app/components/contact/ContactPageBody.tsx` | 11-04 21:26 |  |
| 2 | Uygulama kodu | `M` | `app/components/home/DiscountCollection.tsx` | 11-04 21:05 |  |
| 2 | Uygulama kodu | `M` | `app/components/home/HomePageBody.tsx` | 11-04 21:08 |  |
| 2 | Uygulama kodu | `M` | `app/components/home/home-metadata.ts` | 11-05 07:14 |  |
| 2 | Uygulama kodu | `M` | `app/components/layout/Footer.tsx` | 11-04 21:24 |  |
| 2 | Uygulama kodu | `M` | `app/components/layout/FooterWrapper.tsx` | 11-04 21:32 |  |
| 2 | Uygulama kodu | `M` | `app/components/layout/HeaderWrapper.tsx` | 11-04 21:32 |  |
| 2 | Uygulama kodu | `M` | `app/components/search/KiralikVillalarPageBody.tsx` | 11-04 18:30 |  |
| 2 | Uygulama kodu | `M` | `app/components/search/TaxonomyLandingPageBody.tsx` | 11-05 12:22 |  |
| 2 | Uygulama kodu | `M` | `app/components/seo/StructuredData.tsx` | 11-04 19:47 |  |
| 2 | Uygulama kodu | `M` | `app/components/short-gaps/short-gaps-metadata.ts` | 11-05 13:00 |  |
| 2 | Uygulama kodu | `M` | `app/components/villa/SimilarVillasSection.tsx` | 11-04 19:23 |  |
| 2 | Uygulama kodu | `M` | `app/components/villa/VillaList.tsx` | 11-04 21:05 |  |
| 2 | Uygulama kodu | `M` | `app/components/villa/VillaTypeCarousel.tsx` | 11-04 21:07 |  |
| 2 | Uygulama kodu | `M` | `app/services/blog-translation.service.ts` | 11-04 13:51 |  |
| 2 | Uygulama kodu | `M` | `app/services/faq-translation.service.ts` | 11-04 12:37 |  |
| 2 | Uygulama kodu | `M` | `app/services/menu-translation.service.ts` | 11-04 12:37 |  |
| 2 | Uygulama kodu | `M` | `app/services/page-translation.service.ts` | 11-04 13:57 |  |
| 2 | Uygulama kodu | `M` | `app/services/payment-method-translation.service.ts` | 11-04 12:37 |  |
| 2 | Uygulama kodu | `M` | `app/services/payment-method.action.ts` | 11-04 14:12 |  |
| 2 | Uygulama kodu | `M` | `app/services/price-include-item-translation.service.ts` | 11-04 12:37 |  |
| 2 | Uygulama kodu | `M` | `app/services/rule-item-translation.service.ts` | 11-04 12:37 |  |
| 2 | Uygulama kodu | `M` | `app/services/settings-translation.service.ts` | 11-04 13:42 |  |
| 2 | Uygulama kodu | `M` | `app/services/settings.service.ts` | 11-04 13:42 |  |
| 2 | Uygulama kodu | `M` | `app/services/site-popup.service.ts` | 11-04 21:26 |  |
| 2 | Uygulama kodu | `M` | `app/services/villa-admin/clone.service.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/services/villa-admin/create.service.ts` | 11-04 14:08 |  |
| 2 | Uygulama kodu | `M` | `app/services/villa-admin/update.service.ts` | 11-04 14:04 |  |
| 2 | Uygulama kodu | `M` | `app/services/villa-feature-translation.service.ts` | 11-04 12:37 |  |
| 2 | Uygulama kodu | `M` | `app/services/villa-translation.service.ts` | 11-04 14:05 |  |
| 2 | Uygulama kodu | `M` | `app/services/villa-type-translation.service.ts` | 11-04 12:37 |  |
| 2 | Uygulama kodu | `M` | `app/sitemap.ts` | 11-05 13:00 |  |
| 2 | Uygulama kodu | `M` | `lib/cache.helpers.ts` | 11-04 21:05 |  |
| 2 | Uygulama kodu | `M` | `lib/hero.helpers.ts` | 11-04 20:47 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/dictionaries/de.ts` | 11-05 07:14 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/dictionaries/en.ts` | 11-05 07:14 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/dictionaries/tr.ts` | 11-05 07:14 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/dictionaries/types.ts` | 11-05 07:39 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/routing/context.ts` | 11-05 19:24 | R-B (onaylı) |
| 2 | Uygulama kodu | `M` | `lib/i18n/routing/locale-route.tsx` | 11-05 13:00 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/routing/sql.ts` | 11-05 19:24 | R-B (onaylı) |
| 2 | Uygulama kodu | `M` | `lib/i18n/routing/url.ts` | 11-05 19:24 | R-B (onaylı) |
| 2 | Uygulama kodu | `M` | `lib/i18n/site-locales.validation.ts` | 11-04 17:45 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/sitemap-data.server.ts` | 11-05 12:34 |  |
| 2 | Uygulama kodu | `M` | `lib/i18n/taxonomy-name.helper.ts` | 11-04 21:22 |  |
| 2 | Uygulama kodu | `M` | `lib/short-gaps.helpers.ts` | 11-05 13:00 |  |
| 2 | Uygulama kodu | `M` | `lib/site-popup.cache.ts` | 11-04 21:26 |  |
| 2 | Uygulama kodu | `M` | `lib/site-popup.ts` | 11-04 21:25 |  |
| 2 | Uygulama kodu | `M` | `lib/taxonomy-landing.server.ts` | 11-05 12:20 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/canliya-gecis-hazirlik-plani.md` | 11-05 19:44 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/dinamik-ceviri-mimarisi-audit.md` | 11-04 09:13 | Faz 0 öncesi (commit 3) |
| 3 | Dokümantasyon | `??` | `Claude outputs/dinamik-temel-dil-mimarisi-analiz.md` | 11-04 09:24 | Faz 0 öncesi (commit 3) |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-0-1-teknik-dogrulama.md` | 11-04 09:49 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-0-6-final-teknik-denetim.md` | 11-05 18:08 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-0-simetrik-coklu-dil-mimari-plani.md` | 11-04 09:39 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-1-uygulama-raporu.md` | 11-04 10:07 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-2-veri-aktarimi-raporu.md` | 11-04 10:28 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-3-1-uyumluluk-raporu.md` | 11-04 11:40 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-3-merkezi-okuma-raporu.md` | 11-04 11:40 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-4-merkezi-yazma-raporu.md` | 11-04 12:04 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-5-admin-simetrik-dil-raporu.md` | 11-04 13:06 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-5-dalga-2-raporu.md` | 11-04 14:34 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-5-final-kapanis-raporu.md` | 11-04 16:01 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-5-son-kontroller-raporu.md` | 11-04 15:46 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-6-dalga-0-public-mimari-analizi.md` | 11-04 16:38 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-6-dalga-1-raporu.md` | 11-04 18:22 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-6-dalga-2-raporu.md` | 11-04 19:41 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-6-dalga-3-raporu.md` | 11-04 20:37 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-6-dalga-4-raporu.md` | 11-05 07:51 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-6-dalga-5-raporu.md` | 11-05 13:17 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/faz-6-dalga-6-raporu.md` | 11-05 14:10 |  |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/commit1-yollar.txt` | 11-05 19:42 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/commit2-yollar.txt` | 11-05 19:42 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/commit3-yollar.txt` | 11-05 19:42 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/g105_geri_al.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/g106_geri_al.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/g107_geri_al.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/g108_geri_al.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/k0_on_kontrol_105.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/k1_son_kontrol_105.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/k2_son_kontrol_106.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/k3_son_kontrol_107.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/k4_on_kontrol_108.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/k5_son_kontrol_108.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/gecis-kilavuzu/pz_parmak_izi.sql` | 11-05 19:09 | hazırlık süreci |
| 3 | Dokümantasyon | `??` | `Claude outputs/m108clean-sablon-raporu.md` | 11-04 16:16 |  |
| — (108, ilk push dışında) | Migration 108 (taslak) | `??` | `db/migrations/_drafts/108_language_slug_separation.DRAFT.sql` | 11-05 18:56 | lock_timeout (onaylı) |

_Envanter 2026-11-05'te, bu rapor dosyasının son güncellemesinden hemen önce alındı (348 giriş)._
