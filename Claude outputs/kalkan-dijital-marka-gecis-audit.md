# Kalkan Dijital marka geçişi — salt okunur kod tabanı analizi

**Tarih:** 2026-10-10 · **Klasör:** `tatilin-yeri-next` (aktif proje) · **Dal:** `main` · **HEAD:** `bb9e847 fix: render email logos with compatible PNG`
**Kapsam:** Yalnız okuma (`git grep`, `rg`, `sed`, `ls`). Kod, migration, DB, `.env`, R2 ve harici servis değişikliği YOK. Commit/push/deploy YOK.
**Not:** Bu rapor dosyası, istenen tek çıktıdır; başka dosya oluşturulmadı/değiştirilmedi.

---

## 1. Yönetici özeti

- Proje **Tatilin Yeri** müşteri sitesidir; **Maki Dijital** bu sitede *geliştirici ajans* olarak geçer. Sitenin kendi markası (logo, site adı, e-posta gönderici adı) büyük ölçüde **veritabanı `settings`** ve **R2 `site-assets`** üzerinden gelir; kodda sabit Maki Dijital izi sınırlıdır.
- **Gerçek marka izi (kaynak kod, `Claude outputs` hariç): 29 dosya / 45 satır "Maki Dijital / MAKİ Dijital / MAKI DIGITAL / makidijital" varyantı** (yorumlar dahil) + `makidijital.com` linki + footer'daki **Maki Dijital logolu görsel** (`public/brand/logos/Developer-Credit.png`) + admin modül adı **"Maki Finans"** + TOTP varsayılan adı **"Maki Admin"** + giriş ekranı placeholder'ı `ornek@maki.com`.
- **En büyük teknik iz:** Admin paneli URL'i **`/maki-admin`**. 202 dosya bu klasörde; içerikte 233 dosyada 546 satır referans (78 test dosyası dahil). Bu bir **dahili tanımlayıcıdır, marka metni değildir** → şimdilik **değiştirilmemeli**.
- **Müşteriye görünen kritik noktalar:**
  1. `/liste/[token]` paylaşılan liste sayfası alt metni: "Maki Dijital — tüm villaları görmek için…" (TR/EN/DE) — **her zaman görünür**.
  2. Site footer'ı "Web Geliştirme: [Maki Dijital logosu]" → `https://makidijital.com` — **her sayfada görünür**.
  3. Tüm müşteri e-postaları ve voucher: gönderici/marka adı **`RESEND_FROM_NAME` env → DB `mail_from_name` → "Maki Dijital"** sırasıyla çözülür. Production'da ilk ikisi doluysa müşteri "Maki Dijital" görmez — **harici olarak doğrulanmalı**.
- **Genel risk:** Görünen metin/varlık değişiklikleri **düşük risk**. `/maki-admin` route'u, localStorage anahtarları, DB izin anahtarları gibi teknik isimleri değiştirmek **yüksek risk / düşük fayda**.

---

## 2. Tam eşleşme envanteri

Arama: `git grep -i` ile `mak[iı]|makİ|MAKİ` (tüm izlenen dosyalar, 1.333 dosya). Eşleşen 317 dosya / 1.111 satır aşağıda **hiçbiri atlanmadan** gruplandı. Tesadüfi eşleşmeler (ör. "makine") ayrı listelendi.

Sütunlar: **Kat.** = A görünen metin · B varlık · C domain/iletişim · D teknik · E entegrasyon · F doküman/test.

### 2.1 Görünen marka metni ve varlıklar (A/B/C) — gerçek marka izi

| Dosya:satır | Eşleşme | Kat. | Kim görür | Değişmeli mi | Risk | Öneri |
|---|---|---|---|---|---|---|
| `lib/i18n/dictionaries/tr.ts:421` | `sharedList.footerNote` "Maki Dijital — tüm villaları görmek için…" | A | Müşteri (`/liste/[token]`) | Evet | Düşük | "Kalkan Dijital" yerine site markası/nötr metin önerilir (ajans adı müşteri sayfasında marka gibi duruyor) |
| `lib/i18n/dictionaries/en.ts:407` | aynı (EN) | A | Müşteri | Evet | Düşük | aynı |
| `lib/i18n/dictionaries/de.ts:408` | aynı (DE) | A | Müşteri | Evet | Düşük | aynı |
| `app/components/layout/Footer.tsx:541` | `href="https://makidijital.com"` | C | Tüm ziyaretçiler | Evet (yeni domain belli olunca) | Orta: yeni domain yayında değilse kırık link | Yeni ajans domaini doğrulandıktan sonra değiştir |
| `app/components/layout/Footer.tsx:544` | `aria-label="…: Maki Dijital"` | A | Ekran okuyucu | Evet | Düşük | "Kalkan Dijital" |
| `app/components/layout/Footer.tsx:560` | `alt="Maki Dijital"` | B | Görsel yüklenmezse / SEO | Evet | Düşük | "Kalkan Dijital" |
| `public/brand/logos/Developer-Credit.png` (1254×1254, şeffaf PNG) | Görselin **içinde "maki DİJİTAL" yazıyor** (dosya adı nötr) | B | Tüm ziyaretçiler | Evet | Düşük; aynı ad/ölçüyle değiştirilirse kod değişmez | Yeni Kalkan Dijital görseli aynı yol ve 1:1 oranla konur |
| `app/components/layout/Footer.tsx:474, 537` | Yorum ("Maki Dijital — ajans imzası") | F | — | Opsiyonel | Yok | Metinle birlikte güncellenebilir |
| `app/(admin)/layout.tsx:74` | `title: "MAKİ Dijital — Yönetim Paneli"` | A | Admin (tarayıcı sekmesi) | Evet | Düşük | "Kalkan Dijital — Yönetim Paneli" |
| `app/(admin)/layout.tsx:49-50` | Yorum (MAKİ başlık/favicon) | F | — | Opsiyonel | Yok | — |
| `app/(admin)/maki-admin/layout.tsx:968` | Sidebar marka adı "Maki Dijital" | A | Admin | Evet | Düşük | "Kalkan Dijital" |
| `app/(admin)/maki-admin/login/page.tsx:257` | "Maki Dijital · Admin · CRM" | A | Admin giriş | Evet | Düşük | — |
| `app/(admin)/maki-admin/login/page.tsx:280` | "© {yıl} Maki Dijital" | A | Admin giriş | Evet | Düşük | — |
| `app/(admin)/maki-admin/login/page.tsx:305` | Mobil marka adı "Maki Dijital" | A | Admin giriş | Evet | Düşük | — |
| `app/(admin)/maki-admin/login/page.tsx:590` | "© {yıl} Maki Dijital" | A | Admin giriş | Evet | Düşük | — |
| `app/(admin)/maki-admin/login/page.tsx:380` | `placeholder="ornek@maki.com"` | C | Admin giriş | Evet | Yok (yalnız placeholder) | Nötr örnek (ör. `ornek@alanadi.com`) |
| `app/(admin)/maki-admin/settings/entegrasyonlar/page.tsx:111` | Gönderici adı placeholder `"MAKI DIGITAL"` | A | Admin ayarları | Evet | Yok (placeholder) | Site adına uygun örnek |
| `app/(admin)/maki-admin/layout.tsx:196` | Menü öğesi adı **"Maki Finans"** | A | Admin menüsü | Karar sizde | Düşük (yalnız etiket) | Etiket "Finans"/"Kalkan Finans" yapılabilir; **href değişmemeli** |
| `app/(admin)/maki-admin/maki-finans/page.tsx:102` | Sayfa başlığı "Maki Finans" | A | Admin | Karar sizde | Düşük | Etiketle birlikte |
| `app/services/admin-user.service.ts:237` | İzin listesi etiketi `label: "Maki Finans"` (`key: "finance"`) | A | Admin kullanıcı yetkileri | Karar sizde | Düşük; **`key` değişmemeli** | Yalnız `label` |
| `lib/auth/native/totp.ts:71` | 2FA varsayılan uygulama adı `"Maki Admin"` | A/E | Admin'in authenticator uygulaması | Evet | Düşük: yalnız **yeni** kayıtların etiketi değişir; mevcut kodlar çalışmaya devam eder, eski kayıtlarda "Maki Admin" etiketi kalır | "Kalkan Admin" veya site adı; testi de güncelle |
| `app/(admin)/maki-admin/layout.tsx` + `login/page.tsx` | Admin logo/favicon **R2'den**: `site-assets/branding/admin-logo.webp`, `admin-icon.webp` (`lib/admin-branding.ts:41-42`) | B | Admin | Muhtemelen (görseller koddan görülemedi) | Düşük; aynı yola yükleme yeterli | R2'deki dosyalar kontrol edilmeli (bkz. §6) |

### 2.2 E-posta marka fallback'leri (A/E)

Müşteri e-postalarında ve voucher'da marka adı **`getMailConfig().fromName`** = `RESEND_FROM_NAME` (env) → `settings.mail_from_name` (DB) → **"Maki Dijital"** (sabit). Yalnız ilk ikisi boşsa sabit görünür.

| Dosya:satır | Eşleşme | Kat. | Öneri |
|---|---|---|---|
| `app/lib/mail/client.ts:96` | `fromName = envName \|\| dbName \|\| "Maki Dijital"` — **asıl kaynak** | A/E | Fallback site adı (`settings.site_name`) veya nötr değer; ajans adı müşteri e-postasında gönderici olmamalı |
| `app/lib/mail/client.ts:143` | Yorum örneği | F | Opsiyonel |
| `app/api/mail/bank-transfer-payment/route.ts:190` | `cfg.fromName \|\| "Maki Dijital"` | A | Merkezi fallback ile tekleştir |
| `app/api/mail/payment-confirmed/route.ts:176` | aynı | A | aynı |
| `app/api/mail/payment-link/route.ts:163` | aynı | A | aynı |
| `app/api/mail/reservation-approved/route.ts:112` | aynı | A | aynı |
| `app/api/mail/reservation-cancelled/route.ts:110` | aynı | A | aynı |
| `app/api/mail/reservation-request/route.ts:101` | aynı | A | aynı |
| `app/api/mail/test/route.ts:129` | aynı | A | aynı |
| `app/api/mail/western-union-payment/route.ts:160` | aynı | A | aynı |
| `app/lib/voucher/data.ts:196` | Voucher belge/e-posta marka adı fallback'i | A | aynı |
| `app/lib/mail/templates/BankTransferPaymentEmail.ts:78` | `props.brandName \|\| "Maki Dijital"` | A | aynı |
| `app/lib/mail/templates/PaymentConfirmedEmail.ts:64` | aynı | A | aynı |
| `app/lib/mail/templates/PaymentLinkEmail.ts:70` | aynı | A | aynı |
| `app/lib/mail/templates/ReservationApprovedEmail.ts:95` | aynı | A | aynı |
| `app/lib/mail/templates/ReservationCancelledEmail.ts:95` | aynı | A | aynı |
| `app/lib/mail/templates/ReservationRequestEmail.ts:97` | aynı | A | aynı |
| `app/lib/mail/templates/TestEmail.ts:22` | aynı | A | aynı |
| `app/lib/mail/templates/WesternUnionPaymentEmail.ts:71` | aynı | A | aynı |
| `app/lib/mail/templates/email-shell.ts:31` | `brandName = "Maki Dijital"` (layout varsayılanı) | A | aynı |
| `app/lib/mail/templates/{PaymentLink:22, ReservationApproved:17, ReservationCancelled:17, ReservationRequest:17}Email.ts`, `email-shell.ts:5` | Yorumlar ("Maki Dijital branding") | F | Opsiyonel |
| `app/services/settings.types.ts:67` | Yorum `// örn: MAKI DIGITAL` | F | Opsiyonel |

> E-posta **logosu** marka adından bağımsızdır: `settings.site_logo` (R2 `site-assets/logo/logo.webp`) → `/api/public/email-logo` PNG. Kodda Maki logosu yok.

### 2.3 Teknik tanımlayıcılar (D) — marka değil, şimdilik dokunulmamalı

| Tanımlayıcı | Yer / sayı | Ne işe yarar | Değiştirilirse risk |
|---|---|---|---|
| **`/maki-admin` route'u** | `app/(admin)/maki-admin/**` = **202 dosya**; içerik referansı **233 dosya / 546 satır**: `app/(admin)` 93 dosya/203 satır · `tests/unit` 78/219 · `app/services` 16/25 · `lib` 14/50 · `app/components` 10/16 · `db` 10/11 (yalnız migration yorumları) · `app/api` 4/4 · `app/(public)` 2/2 · `middleware.ts` 1/5 · `next.config.ts` 1/2 · `app/robots.ts` 1/4 · `app/sitemap.ts` 1/1 · `app/layout.tsx` 1/1 · `types/database.ts` 1/3 (yorum) | Admin paneli URL'i; middleware koruması (`middleware.ts:21-22,64`), CSP başlıkları (`next.config.ts:201,207`), robots engeli (`app/robots.ts:59,69`), izin haritası (`lib/auth/admin-permission-map.ts`), mail/link'lerdeki admin linkleri | **Yüksek:** yer imleri, admin'lerin kayıtlı linkleri, robots, CSP, middleware, 78 test, olası e-posta içi admin linkleri kırılır; 200+ dosya dokunuşu. Müşteri görmez. **Önerilmez.** Gerekirse ayrı proje olarak + eski yoldan 301 ile. |
| `maki-finans` alt route'u + `MakiFinansPage` | `app/(admin)/maki-admin/maki-finans/{page,layout,finance.action}.ts(x)`, `layout.tsx:197`, `lib/auth/admin-permission-map.ts:40`, `tests/unit/server-action-authz.test.ts:108`, yorumlar: `app/services/{finance.service.ts:11,43, finance.constants.ts:4-5, analytics.service.ts:23, admin-user.service.ts:233}`, `lib/db/finance.repository.ts:4`, `layout.tsx:190` | Finans modülü URL'i, bileşen adı | Orta: URL/izin haritası/test; **izin anahtarı `finance` zaten nötr**. Yalnız görünen etiket değiştirilebilir (§2.1). |
| localStorage `maki_favorites` | `hooks/use-favorites.ts:53` (+yorum :14) | **Ziyaretçilerin favori villaları** | **Yüksek (veri kaybı):** anahtar değişirse tüm ziyaretçilerin favorileri kaybolur. Değiştirilecekse eski anahtardan okuyup taşıyan geçiş kodu şart. **Önerilmez.** |
| Olay adı `maki:favorites:change` | `hooks/use-favorites.ts:54` (+yorum :35) | Aynı sekmede favori senkronu | Düşük ama fayda yok; görünmez. Dokunma. |
| localStorage `maki:admin:notifications:v1` | `app/components/admin/notifications/NotificationProvider.tsx:47` | Admin bildirim durumu | Düşük (admin bildirim geçmişi sıfırlanır). Fayda yok. Dokunma. |
| `package.json` `"name": "villa-kiralama"` | — | Paket adı | Marka izi yok. |
| Git remote `github.com/makidijital/tatilin-yeri-next` | `.git/config` (izlenmez) + `Claude outputs/security-audit-raporu.md:746` | GitHub organizasyonu | Organizasyon adı değişirse remote URL, CI/Coolify deploy bağlantısı güncellenmeli → **harici kontrol** |

### 2.4 Dokümantasyon, yorum ve testler (F)

- **Kod yorumları (marka değil, görünmez):** `app/globals.css:928, 951, 965, 991` ("Maki Dijital branded…", "Maki cyan-blue" — admin paleti yorumları; CSS değeri değil) · `lib/i18n/dictionaries/{tr.ts:910, en.ts:884, de.ts:894, types.ts:1213}` ("PHASE 12 — MAKI ADMIN") · `tests/unit/admin-pages-i18n.test.tsx:2`. Öneri: opsiyonel, toplu metin değişikliğine dahil edilebilir.
- **Test verileri:** `admin@maki.com` → `tests/unit/auth/jwt-access-typ.test.ts:55,65`, `tests/unit/auth/login-totp-gate.test.ts:163,182,210,255,277,309,512`, `tests/unit/auth/totp.test.ts:60,65` (sahte adres, gerçek hesap değil). `"Maki Admin"` → `tests/unit/auth/totp.test.ts:61,64,69,72` — **TOTP varsayılanı değişirse bu test güncellenmeli**. `makihotel.webp` → `tests/unit/site-asset-version.test.tsx:53,74,75` (örnek dosya adı). Öneri: zorunlu değil; TOTP testi hariç dokunmaya gerek yok.
- **`Claude outputs/` (izlenen rapor arşivi) — 38 dosya, toplam 462 satır** (çoğu `/maki-admin` yolu): `patches/admin-authz.patch` 162 · `security-sec01-analysis.md` 51 · `comprehensive-system-audit.md` 33 · `patches/site-asset-image-versioning.patch` 31 · `full-project-audit-raporu.md` 28 · `villa-listesi-pagination-analiz.md` 17 · `security-audit-raporu.md` 14 · `patches/site-popup.patch` 11 · `havuz-isitma-sezon-analizi.md` 10 · `domain-hardcoding-audit.md` 10 · `patches/villa-sort-drag-speed.patch` 8 · `sentry-removal-audit-raporu.md` 7 · `final-project-audit.md` 7 · `patches/sec05-csp-report-only.patch` 6 · `patches/popup-datepicker-layer.patch` 6 · `legacy-brand-cleanup-audit.md` 6 · `coklu-dil-mimari-audit-raporu.md` 6 · `security-sec05-phase2-analysis.md` 5 · `security-sec05-phase2-fix-raporu.md` 4 · `production-audit.md` 4 · `performance-audit-raporu.md` 4 · `security-sec05-analysis.md` 3 · `patches/popup-i18n.patch` 3 · `arama-performance-reaudit.md` 3 · `villa-ozellik-filtresi-audit.md` 2 · `security-sec05-csp-report-only-raporu.md` 2 · `security-sec03-analysis.md` 2 · `production-audit-v2.md` 2 · `patches/sec05-phase2.patch` 2 · `patches/popup-datepicker.patch` 2 · `legacy-brand-cleanup-raporu.md` 2 · `indirimli-villa-coklu-donem-secim-audit.md` 2 · `indirimli-villa-P3-coklu-kart-uygulama-plani.md` 2 · `public-performance-audit-v2.md` 1 · `indirimli-kart-cta-musaitlik-audit.md` 1 · `fiyat-engine-missing-price-audit.md` 1 · `direct-r2-upload-analysis.md` 1 · `arama-index-audit.md` 1. **Geçmiş kayıt — değiştirilmemeli.**
- **README / `.env.example` / `docs/`:** marka izi **yok**. (`.env.example` git'te izlenmiyor; içinde `maki` yok. `.env.local`'da da yok — değerler okunmadı/yazılmadı.)

### 2.5 Tesadüfi eşleşmeler (marka değil — dokunma)

- "makine/makinesi…" (Türkçe kelime, ~20 satır): `LEGACY_PROVIDER_PURGE_REPORT.md:72`, `docs/coolify-scheduled-tasks.md:166` ve `Claude outputs/` içindeki raporlar.
- `package-lock.json:4129` — bir `integrity` hash'i içinde rastgele "MAki" harfleri.
- `tests/unit/site-asset-version.test.tsx` `makihotel.webp` (örnek dosya adı; yukarıda F).

### 2.6 Üretilmiş alanlar (ayrı tutuldu, kaynak değil)

- `.next/` → 61 dosyada "Maki Dijital/makidijital" (build çıktısı; yeniden build ile güncellenir).
- `tsconfig.scope.tsbuildinfo` (izlenmeyen derleme önbelleği).
- `node_modules/`, `.git/` taranmadı.

---

## 3. Değiştirilebilirler (düşük risk, doğrudan metin/varlık)

1. `lib/i18n/dictionaries/{tr:421, en:407, de:408}` — `sharedList.footerNote` (müşteri sayfası).
2. Admin görünen metinleri: `app/(admin)/layout.tsx:74`, `maki-admin/layout.tsx:968`, `login/page.tsx:257, 280, 305, 590`.
3. Placeholder'lar: `login/page.tsx:380` (`ornek@maki.com`), `settings/entegrasyonlar/page.tsx:111` (`MAKI DIGITAL`).
4. Footer kredisi metinleri: `Footer.tsx:544` (aria-label), `:560` (alt) + `public/brand/logos/Developer-Credit.png` görseli (aynı yol, 1:1 kare, şeffaf PNG).
5. "Maki Finans" **etiketleri** (karar sizde): `maki-admin/layout.tsx:196`, `maki-finans/page.tsx:102`, `admin-user.service.ts:237` — yalnız `name`/`label`, URL ve `key` değil.
6. Yorumlar (opsiyonel): `globals.css`, mail şablon başlık yorumları, `settings.types.ts:67`, i18n "PHASE 12" yorumları.

## 4. Kontrollü değiştirilmesi gerekenler

1. **`https://makidijital.com` linki** (`Footer.tsx:541`): Kalkan Dijital domaini yayında ve HTTPS çalışır olduktan sonra. Eski domain bir süre yeni domaine 301 yönlendirmeli (harici).
2. **E-posta marka fallback'i** (`app/lib/mail/client.ts:96` + 8 route + 9 şablon + `email-shell.ts:31` + `voucher/data.ts:196`, toplam **20 yer**): Önce production'da `RESEND_FROM_NAME` / `settings.mail_from_name` değerleri kontrol edilmeli. Fallback'i "Kalkan Dijital" yapmak yerine **site adı** (`settings.site_name`) veya nötr değer önerilir — müşteri e-postasında ajans adı gönderici olmamalı. Tek merkezi sabitte toplanması tekrarı azaltır.
3. **TOTP varsayılanı** `lib/auth/native/totp.ts:71` + test `tests/unit/auth/totp.test.ts:61-72`: yeni 2FA kayıtlarının etiketini değiştirir; mevcut kayıtlar etkilenmez (etiket doğrulamaya dahil değil). Admin'lere "eski kayıtlarınızda 'Maki Admin' görünmeye devam eder" bilgisi verilmeli.
4. **Admin R2 görselleri** `site-assets/branding/admin-logo.webp`, `admin-icon.webp`: Maki logosu içeriyorsa aynı yola yeni görsel yüklenmeli (kod değişmez; `?ts=` cache-bust var).
5. **Metadata/SEO:** Public metadata, JSON-LD, OG, manifest ve sitemap'te **Maki izi yok** (site adı/canonical `NEXT_PUBLIC_SITE_URL` + DB `settings`'ten). Yalnız admin sekme başlığı (§3.2) var. Ajans domain değişikliği site SEO'sunu etkilemez; yalnız footer dış linkini etkiler.

## 5. Şimdilik dokunulmaması gerekenler

| Alan | Gerekçe |
|---|---|
| `/maki-admin` URL'i ve klasörü (202 dosya) | Müşteri görmez; middleware, CSP, robots, izin haritası, 78 test, admin yer imleri bağlı. Fayda yok, risk yüksek. |
| `maki-finans` URL'i, `MakiFinansPage`, `finance.action` yolu | Aynı gerekçe; izin anahtarı (`finance`) zaten nötr. |
| `maki_favorites`, `maki:favorites:change` | Ziyaretçi favorilerini siler. |
| `maki:admin:notifications:v1` | Görünmez; değişince admin bildirim durumu sıfırlanır. |
| DB tablo/kolon isimleri | Hiçbirinde `maki` yok. Migration yorumlarındaki `/maki-admin` (10 dosya, `db/migrations/**`) geçmiş kayıttır — **değiştirilmemeli**. |
| Eski migration'lar ve `Claude outputs/` raporları/patch'leri | Geçmiş kayıt. |
| Env değişken adları | Hiçbiri marka içermiyor (`RESEND_FROM_NAME`, `NEXT_PUBLIC_SITE_URL` vb. nötr). |
| Gönderilmiş e-postalar, eski voucher/rezervasyon belgeleri | Müşteride kalan kopyalar; geriye dönük değiştirilemez ve değiştirilmemeli. Voucher yeniden oluşturulursa o anki ayarlarla basılır. |
| Test fixture'ları (`admin@maki.com`, `makihotel.webp`) | Sahte veri; davranışa etkisi yok. (TOTP testi hariç — §4.3.) |

## 6. Veritabanı ve harici servis kontrol listesi

**Koddan doğrulananlar**
- Site markası DB'den: `settings.site_name`, `site_logo`, `footer_logo`, `favicon_url`, `watermark_logo`, `default_meta_title`, `footer_copyright`, `company_legal_name`, `mail_from`, `mail_from_name` (`app/services/settings.types.ts`). Kod bunlarda Maki varsaymaz.
- Logolar R2 `site-assets` altında sabit yollarda: `logo/logo.webp`, `branding/admin-logo.webp`, `branding/admin-icon.webp` (+ favicon/og/watermark). Dosya adlarında marka yok.
- Admin oturum çerezi `admin-session`, `path: "/"` — marka/domain'e bağlı değil.
- CORS / OAuth callback / webhook / ödeme sağlayıcı tanımlarında `maki` veya `makidijital` **yok**.
- Kodda sabit `makidijital.com` yalnız footer linkinde.

**Harici olarak kontrol edilmeli (koddan görülemez)**
- [ ] Production `settings` satırı: `mail_from_name`, `site_name`, `footer_copyright`, `default_meta_title`, `company_legal_name` içinde "Maki" var mı?
- [ ] Coolify env: `RESEND_FROM_NAME`, `RESEND_FROM` (gönderen adı/adresi) — Maki/makidijital içeriyor mu?
- [ ] Resend: doğrulanmış gönderici domaini makidijital.com mu? (Öyleyse yeni domain doğrulanmadan değiştirilmemeli; SPF/DKIM.)
- [ ] R2 `site-assets/branding/admin-logo.webp`, `admin-icon.webp` ve gerekirse `logo/logo.webp`, favicon görsellerinin içeriği.
- [ ] GitHub organizasyonu `makidijital` → ad değişirse remote URL ve Coolify'ın GitHub bağlantısı/webhook'u.
- [ ] `makidijital.com` → yeni ajans domainine 301 yönlendirmesi (footer'daki eski linkler ve dış referanslar için).
- [ ] Admin kullanıcı e-postaları gerçekten `@maki…` domaininde mi? (Testlerdeki adresler sahte; gerçek hesaplar DB'de.) Değişirse giriş, 2FA ve bildirim alıcıları (`MAIL_ADMIN_NOTIFY_TO`) etkilenir.

## 7. Önerilen uygulama sırası (her adım ayrı commit, geri alınabilir)

1. **Harici hazırlık:** Kalkan Dijital domaini ve görselleri hazır; production `settings`/env değerleri kontrol edildi (§6).
2. **Müşteriye görünen metin:** `sharedList.footerNote` (TR/EN/DE) → nötr/site adı.
3. **E-posta fallback'leri:** 20 yer tek merkezi değere; production env/DB değerleri doğru ayarlandı.
4. **Footer kredisi:** `Developer-Credit.png` görseli + `alt`/`aria-label`; domain hazırsa `href`.
5. **Admin görünen metinleri:** sekme başlığı, sidebar, giriş ekranı, placeholder'lar; R2 admin logo/ikon.
6. **Opsiyonel:** "Maki Finans" etiketleri, TOTP varsayılan adı (+test), yorumlar.
7. **Yapılmayacaklar:** `/maki-admin`, `maki-finans` URL'leri, localStorage anahtarları, migration'lar, rapor arşivi.

## 8. Doğrulama planı

- `npx tsc --noEmit`, `npx eslint .` (temel: 195 uyarı / 0 hata), `npx vitest run` (temel: 235 dosya / 4541 test).
- Test güncellemesi gerekirse yalnız `tests/unit/auth/totp.test.ts`.
- `git grep -i -E "maki dijital|makidijital|MAK[Iİ] Dijital|MAKI DIGITAL"` → yalnız bilinçli kalanlar (rapor arşivi) dönmeli.
- `npm run build` sonrası `.next` içinde eski metin kalmamalı.
- **Ekranlar:** `/liste/[token]` (TR/EN/DE), site footer'ı (desktop/mobil, görsel + link), admin giriş (desktop/mobil), admin sidebar, sekme başlığı ve favicon, Ayarlar → Entegrasyonlar.
- **E-posta:** Admin → Test e-postası; voucher gönderimi; gönderici adı ve gövdedeki marka adı Gmail/Outlook/iPhone Mail'de.
- **2FA:** Test hesabıyla yeni kayıt → authenticator'da yeni ad; mevcut kayıtla giriş hâlâ çalışıyor.
- **Favoriler:** Mevcut tarayıcıda kayıtlı favoriler kaybolmamalı (anahtar değişmediği için).
- **Production:** footer linki 200/301, admin logo/ikon cache-bust, Resend teslimat ve SPF/DKIM.

## 9. Git durumu

- **Başlangıç (2026-10-10T20:18:31Z):** dal `main`, HEAD `bb9e847`, `git status --porcelain` → **boş (temiz)**.
- **Bitiş:** yalnız bu rapor eklendi → `?? "Claude outputs/kalkan-dijital-marka-gecis-audit.md"`. Başka hiçbir dosya değişmedi; `git add`/commit/push yapılmadı.
