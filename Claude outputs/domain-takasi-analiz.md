# Domain takası analizi: tatilinyeri.com ⇄ balayivillaniz.com

**Tarih:** 2026-10-26 · **Tür:** Salt okuma. Hiçbir dosya, DNS kaydı, sertifika, deploy veya veritabanı değiştirilmedi.

**Hedef:**

| Site | Şu an | Hedef |
|---|---|---|
| PHP sitesi | `tatilinyeri.com` | `balayivillaniz.com` |
| Next.js sitesi (Coolify) | `balayivillaniz.com` | `tatilinyeri.com` |

## Nasıl incelendi, neye erişilemedi

| Kaynak | Durum |
|---|---|
| Herkese açık DNS (Google DNS-over-HTTPS) | ✅ Okundu |
| İki sitenin canlı yanıtları (header, robots, sitemap, canonical, hreflang) | ✅ Okundu |
| Next.js deposu (`tatilin-yeri-next`, HEAD `4158163`) | ✅ Okundu; `.env` dosyalarından yalnız değişken adları ve gizli olmayan URL'ler alındı |
| Sertifika geçmişi (crt.sh) ve `http://` yönlendirme testi | ❌ Tarayıcı erişim izni verilmedi. Sertifika ayrıntıları doğrulanamadı |
| PHP sunucusunun içi (Nginx config, document root, PHP kodu, `.env`, MySQL) | ❌ Erişim yok. PHP kodu bu bilgisayarda bulunmuyor; bu oturumdan SSH ağ izni yok |
| Coolify paneli (domainler, port, env, scheduled task'lar) ve Cloudflare paneli | ❌ Erişim yok |

Erişilemeyen her konu için **§7**'de sunucuda çalıştırılacak salt-okuma komutları var.

---

## 1. Mevcut DNS (kanıt: Google DNS, 2026-10-26)

### tatilinyeri.com — DNS: Güzel Hosting (cPanel)

| Kayıt | Değer | TTL |
|---|---|---|
| NS | `ns1/ns2/ns11/ns12.guzelhosting.com` | 21600 |
| A `@` | **`178.105.249.77`** (PTR `static.77.249.105.178.clients.your-server.de` → **Hetzner**) | **14400 (4 saat)** |
| AAAA `@` | yok | – |
| CNAME `www` | → `tatilinyeri.com` | 14400 |
| CNAME `mail` | → `tatilinyeri.com` | 14400 |
| A `ftp`, `cpanel`, `webmail` | `104.247.179.243` (Güzel Hosting paylaşımlı sunucusu) | – |
| MX | **Google Workspace**: `ASPMX.L.GOOGLE.com` (1), `ALT1/ALT2` (5), `ALT3/ALT4` (10) | 14400 |
| TXT (SPF) | `v=spf1 ip4:104.247.179.242 ip4:104.247.160.210 ip4:37.59.29.91 a mx include:relay.mailchannels.net include:relay.guzelhosting.com ?all` | 14400 |
| TXT | `google-site-verification=LR1R…` (Search Console doğrulaması) | 14400 |
| TXT `default._domainkey` | DKIM (RSA), cPanel tarafından üretilmiş | 14400 |
| `_dmarc` | yok (NXDOMAIN) | – |
| CAA | yok | – |

### balayivillaniz.com — DNS: Cloudflare

| Kayıt | Değer | TTL |
|---|---|---|
| NS | `lynn.ns.cloudflare.com`, `sue.ns.cloudflare.com` | – |
| A / AAAA `@` | `188.114.96.12`, `188.114.97.12` / `2a06:98c1:3120::c`, `2a06:98c1:3121::c` (**Cloudflare proxy**; gerçek origin IP gizli) | 300 |
| `www` | Cloudflare proxy IP'leri (`…96.7/…97.7`) | 300 |
| **`cdn`** | Cloudflare proxy (**R2: villa görselleri**) | 300 |
| **`assets`** | Cloudflare proxy (**R2: site görselleri**) | 300 |
| MX / SPF / DKIM / DMARC / CAA | **hiçbiri yok** | – |

> ⚠️ **En kritik DNS bulgusu:** Next.js sitesinin bütün görselleri `cdn.balayivillaniz.com` ve `assets.balayivillaniz.com`'dan geliyor. Canlı CSP header'ında ve sayfadaki `<img>` host'larında görüldü. Bu iki alt alan **Next.js'e ait kalmalı.** Takas sırasında Cloudflare'de `balayivillaniz.com` zone'u silinmemeli veya başka hesaba taşınmamalı. Yalnızca `@` ve `www` kayıtları değişmeli.

---

## 2. PHP sitesi (şu an tatilinyeri.com)

### Mevcut yapı (dışarıdan doğrulanan)

| Konu | Bulgu |
|---|---|
| Sunucu | `178.105.249.77` (Hetzner), `Server: nginx/1.28.3 (Ubuntu)`, PHP oturum header'ları var. Cloudflare yok; doğrudan sunucuya gidiyor |
| HTTPS | `https://tatilinyeri.com` geçerli bir sertifikayla açılıyor (tarayıcı hata vermedi). Sertifikayı veren kurum ve bitiş tarihi **doğrulanamadı** (büyük ihtimalle certbot/Let's Encrypt) |
| robots.txt | `User-agent: *` + `Sitemap: https://www.tatilinyeri.com/sitemap.xml` (**www'lu**) |
| sitemap.xml | Statik dosya, son değişiklik **28.12.2023**. **568 URL**, hepsi `https://www.tatilinyeri.com/...` |
| URL yapısı | Düz (tek seviye): 530 villa/apart sayfası (`/villa-in-love`, `/reyhan-apart`), 18 bölge (`/kas`, `/kalkan`…), 13 kategori (`/balayi-villalari`…), 6 yasal/kurumsal sayfa, 1 blog yazısı (`/kas-gezilecek-yerler`) |
| Canonical | Ana sayfada `<link rel=canonical>` **yok**. `og:url = https://tatilinyeri.com/` |
| Sayfadaki mutlak linkler | `https://tatilinyeri.com/...` (www'suz). Formlar `https://tatilinyeri.com/villalarimiz`'e gidiyor → **base URL bir config değerinden ya da sabit yazılmış bir değerden üretiliyor** |
| balayivillaniz.com referansı | Ana sayfa HTML'inde **yok** |
| Üçüncü taraf | GTM/GA4 (`_ga_CECS8ZPP5W`), Microsoft Clarity, Google Ads, Google Translate, WhatsApp; footer'da makidijital.com |
| Çerezler | Yalnız analitik çerezleri görüldü (`_ga`, `_gcl_au`, `_clck`, `_clsk`). Oturum çerezinin domain ayarı doğrulanamadı |

**Doğrulanamayanlar:** Nginx `server_name` ve `root`, SSL dosya yolları, PHP'nin site URL'i ve e-posta/ödeme/iCal ayarları, veritabanı. Hepsi §7'deki komutlarla kontrol edilmeli.

### Değişmesi gereken ayarlar ve dosyalar (PHP)

1. **Nginx:** Yeni bir `server` bloğu açılmalı: `server_name balayivillaniz.com www.balayivillaniz.com;`, aynı `root`, aynı PHP-FPM ayarları.
   - Mevcut `tatilinyeri.com` bloğu geçiş anına kadar kalmalı (geri dönüş için).
2. **PHP site URL'i:** Config dosyası veya veritabanındaki `site_url`/`base_url` benzeri değer `https://balayivillaniz.com` olmalı. Sayfadaki mutlak linkler bu değerden üretiliyor.
   - Ayrıca kodda sabit yazılmış `tatilinyeri.com` aranmalı (§7 komut 4). Özellikle SEO, e-posta şablonları, ödeme ve rezervasyon callback'leri, iCal export linkleri.
3. **robots.txt ve sitemap.xml:** İkisi de `www.tatilinyeri.com` gösteriyor. `balayivillaniz.com` için yeniden üretilmeli. Sitemap statik ve 2023 tarihli.
4. **Canonical:** Şu an yok. Yeni domainde mutlaka `https://balayivillaniz.com/...` canonical eklenmeli (aynı içerik eski domainde indeksli olduğu için).
5. **Next.js URL'lerinin yönlendirilmesi:** Takastan sonra Google ve kullanıcılar `balayivillaniz.com`'daki eski Next.js URL'lerine gelmeye devam edecek. Next.js sitemap'inde **1.118 URL** var.
   - PHP tarafında Nginx'e şu yollar için `301 → https://tatilinyeri.com$request_uri` kuralı eklenmeli: `/kiralik-villa/`, `/kiralik-villalar`, `/villa-turleri/`, `/bolgeler/`, `/blog`, `/p/`, `/en`, `/de`, `/teklif-al`, `/iletisim`, `/rezervasyon`, `/favoriler`, `/liste/`, `/v/`, `/kisa-sureli-tarihler/`, `/_next/`, `/api/`.
   - PHP sitemap'inde bu yollar yok, **çakışma görünmüyor**. Ama PHP'de `/iletisim` gibi sitemap dışı bir sayfa varsa kontrol edilmeli.
6. **E-posta:**
   - `tatilinyeri.com` posta kutuları Google Workspace'te ve **MX kayıtlarına dokunulmamalı.**
   - PHP sunucusu şu an SPF'teki `a` mekanizmasıyla yetkili, çünkü `a` = `@` A kaydı = 178.105.249.77. `@` Coolify'a döndüğünde bu yetki kaybolur. PHP @tatilinyeri.com adresinden doğrudan mail atıyorsa SPF'e **önceden** `ip4:178.105.249.77` eklenmeli.
   - PHP @balayivillaniz.com adresinden mail atacaksa o domainde SPF, DKIM ve DMARC **hiç yok**; oluşturulmalı.
7. **Ödeme / iCal / harici entegrasyonlar:** OTA'lara (Airbnb, Booking vb.) verilmiş iCal export URL'leri, ödeme sağlayıcısındaki callback/return URL'leri, Google Ads ve Analytics hedef URL'leri `tatilinyeri.com` ise, takastan sonra bu istekler **Next.js'e gider ve kırılır.** PHP kodunda ve sağlayıcı panellerinde tek tek listelenmeli.
   - Not: Sayfada görülen ödeme formu yok; "Ödeme yöntemleri ve hesaplar" sayfası var, yani havale/EFT ağırlıklı olabilir. Doğrulanmalı.

### DNS (PHP için)
- `balayivillaniz.com` Cloudflare'de kalır. `@` ve `www` A kayıtlarının origin'i **178.105.249.77** yapılır; proxy açık (turuncu bulut) kalabilir.
- **`cdn` ve `assets` kayıtlarına dokunulmaz.**

### SSL (PHP için)
- `balayivillaniz.com` Cloudflare proxy arkasında. Cloudflare SSL modu **doğrulanamadı**. Full (strict) ise PHP origin'inde `balayivillaniz.com` için geçerli bir sertifika **önceden** bulunmalı. İki yol var, ikisi de DNS değişmeden önce yapılabilir, kesinti olmaz:
  - **(a)** Cloudflare Origin CA sertifikası (`balayivillaniz.com, *.balayivillaniz.com`) → Nginx'e kurulur.
  - **(b)** certbot DNS-01 doğrulaması (Cloudflare API token ile).
- HTTP-01 (webroot) yöntemi, DNS PHP'ye dönmeden çalışmaz. Bu yüzden önerilmez.

---

## 3. Next.js sitesi (şu an balayivillaniz.com, Coolify)

### Mevcut yapı

| Konu | Bulgu (kanıt) |
|---|---|
| Önünde | Cloudflare proxy (`server: cloudflare`, `cf-ray`). Origin IP gizli |
| Barındırma | Hetzner VPS + Coolify (`docs/coolify-scheduled-tasks.md`). Uygulama `next start` (varsayılan port 3000); depoda Dockerfile/nixpacks yok, Coolify build pack'i kullanılıyor |
| Coolify domain, port, proxy (Traefik), SSL | **Doğrulanamadı** (panel erişimi yok) |
| `NEXT_PUBLIC_SITE_URL` (prod) | Canlıda `https://balayivillaniz.com`: canonical, hreflang (tr/en/de/x-default), JSON-LD `url`, `robots.txt` (`Host:` + `Sitemap:`), sitemap'teki 1.118 URL'in hepsi |
| CDN env'leri (prod) | `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES` → `https://cdn.balayivillaniz.com`, `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS` → `https://assets.balayivillaniz.com` (canlı CSP header'ından) |
| robots.txt | Cloudflare'in "Managed robots.txt / Content Signals" bloğu + uygulamanın kendi kuralları |
| Kod içi sabit domain | **Yok.** `tatilinyeri.com` ve `balayivillaniz.com` uygulama kodunda geçmiyor; yalnız bir test dosyasında örnek URL var (`tests/unit/site-popup.test.tsx`). Site URL'i tek bir env'den geliyor |
| Veritabanı | Supabase Postgres (`aws-0-eu-west-1.pooler.supabase.com`). PHP'den bağımsız |
| Dosyalar | Cloudflare R2: `tatilinyeri-villa-images`, `tatilinyeri-site-assets` (bucket adları domainle ilgili değil) |
| Ödeme sağlayıcısı | Kodda **yok** (PayTR, iyzico, Stripe vb. bulunmadı) |
| OAuth / harici SSO | **Yok.** Admin girişi native JWT + TOTP |

### Domain bağımlılığı olan yerler (Next.js)

| # | Yer | Dosya / kanıt | Takasta ne olur |
|---|---|---|---|
| 1 | `NEXT_PUBLIC_SITE_URL` | `lib/seo.ts`, `app/sitemap.ts`, `app/robots.ts`, `StructuredData.tsx`, `KiralikVillalarPageBody.tsx`, `TaxonomyLandingPageBody.tsx`, `kiralik-villalar-metadata.ts`, `lib/reservation-share.helper.ts`, `lib/email-logo.server.ts` | **Build anında koda gömülür** (`NEXT_PUBLIC_*`, statik ve ISR sayfalar). Coolify'da değeri `https://tatilinyeri.com` yapıp **yeniden build** etmek şart; restart yetmez |
| 2 | E-posta logosu URL'i | `lib/email-logo.server.ts` → `${SITE_URL}/api/public/email-logo` | Daha önce gönderilmiş e-postalardaki logo `balayivillaniz.com/api/...` adresini gösterir. Takastan sonra bu adres PHP'ye düşer ve logo kırılır. PHP'deki `/api/` → tatilinyeri.com 301 kuralı bunu çözer |
| 3 | **Coolify Scheduled Tasks** | `docs/coolify-scheduled-tasks.md`: `curl … https://DOMAIN/api/cron/...` | Komutlarda `https://balayivillaniz.com` yazıyorsa takastan sonra cron'lar **PHP sitesine gider ve sessizce başarısız olur.** `app/api/cron/` altındaki 7 iş etkilenir: iCal senkronu, kur yenileme, mail/aktivite log temizliği, kısa boşluklar, fiyat ve indirim temizliği. `https://tatilinyeri.com` yapılmalı (ya da daha iyisi container içinden `http://localhost:3000`) |
| 4 | **R2 CORS (admin galeri doğrudan yükleme)** | `docs/r2-direct-upload-cors.md`: `AllowedOrigins: ["https://ORIGIN"]` | Bucket'ta yalnız `https://balayivillaniz.com` tanımlıysa admin görsel yükleme tatilinyeri.com'da **CORS hatası** verir. `https://tatilinyeri.com` takastan **önce eklenmeli** (eskisi geçiş bitene kadar kalmalı) |
| 5 | Admin oturum çerezleri | `lib/auth/native/cookies.ts`: `__Host-admin_at`, `__Host-admin_rt` (host'a kilitli, Domain yok) | Yeni domainde adminler **bir kez yeniden giriş yapar.** Başka bir etkisi yok |
| 6 | CSRF origin guard | `lib/auth/native/origin-guard.ts`: `Origin` ile `Host` karşılaştırılıyor | Cloudflare/Traefik `Host` başlığını koruduğu sürece sorun yok. Takastan sonra login test edilmeli |
| 7 | Tarayıcıda üretilen linkler | `window.location.origin` (favori paylaşım, geçici villa linki, zip paylaşımı, iCal kartı) | Otomatik olarak yeni domaini kullanır. **Önceden paylaşılmış** `balayivillaniz.com/...` linkleri PHP'deki 301 kuralıyla kurtarılır |
| 8 | Mail gönderici | `RESEND_FROM` env ya da DB `settings.mail_from` (değer **doğrulanamadı**) | Gönderici @balayivillaniz.com ise: bu domainde SPF/DKIM **yok** (Resend'in `send.` ve `resend._domainkey` kayıtları da yok). Gönderen domain Resend panelinde kontrol edilmeli. @tatilinyeri.com'a geçilecekse Resend DNS kayıtları **Güzel Hosting zone'una** eklenmeli |
| 9 | Admin bildirim maili, `MAIL_ADMIN_NOTIFY_TO` | Önceki audit (`Claude outputs/domain-hardcoding-audit.md`) | Domainle ilgili değil. Prod değeri ayrıca kontrol edilmeli |
| 10 | Cookie Domain / CORS / OAuth | `Domain=` kullanılmıyor, uygulama CORS header'ı yok, OAuth yok | Etkilenmez |

### DNS (Next.js için)
- `tatilinyeri.com` zone'u Güzel Hosting'de. **Yalnız `@` A kaydı** Coolify sunucusunun IP'sine çevrilir. `www`, `@`'a CNAME olduğu için onu otomatik izler.
- **MX, SPF, DKIM, google-site-verification, `ftp`/`cpanel`/`webmail` kayıtlarına dokunulmaz.**
- TTL şu an **14400 (4 saat)**. Geçişten **en az 24 saat önce** `@` (ve `www`) TTL'i 300'e düşürülmeli. Aksi halde bazı ziyaretçiler 4 saate kadar eski sunucuya gider.

### SSL (Next.js için)
- **Seçenek A (önerilen):** `tatilinyeri.com` zone'unu önceden Cloudflare'e taşımak. Bu, mevcut kayıtların **birebir kopyalanması** ve NS değişikliği demek; ayrı bir onay gerektirir.
  - Sonrasında iki domain de proxy'li olur: geçiş anlık origin değişimi olur ve edge sertifikası hazır olur.
  - Origin tarafında Coolify/Traefik için Cloudflare Origin CA ya da DNS-01 kullanılır.
- **Seçenek B:** DNS Güzel Hosting'de kalır. Coolify'a `tatilinyeri.com,www.tatilinyeri.com` eklenir. Traefik, Let's Encrypt HTTP-01 sertifikasını **ancak A kaydı Coolify'ı gösterdikten sonra** alabilir. Bu yüzden ilk birkaç dakika sertifika uyarısı olabilir.
  - Bu pencere TTL düşürülerek kısaltılır. Ayrıca A kaydı değiştikten hemen sonra Coolify'da "Redeploy / Generate certificate" izlenir.

### Uygulama değişiklikleri (Next.js; kod değil, çoğu ayar)
1. Coolify domainleri: `https://tatilinyeri.com, https://www.tatilinyeri.com` eklenir. `balayivillaniz.com` geçiş bitene kadar **kalır** (geri dönüş için).
2. Coolify env: `NEXT_PUBLIC_SITE_URL=https://tatilinyeri.com`, **Build + Runtime** olarak. Ardından yeniden build.
3. CDN env'leri **aynı kalır** (`cdn.`/`assets.balayivillaniz.com`). İleride `cdn.tatilinyeri.com`'a geçmek ayrı bir proje: R2 custom domain zone'un Cloudflare'de olmasını gerektirir, ayrıca DB'de tam URL tutan satırlar var.
4. Coolify scheduled task komutları güncellenir (#3). R2 CORS'a yeni origin eklenir (#4).
5. **SEO yönlendirmeleri (kod değişikliği gerekir):** `tatilinyeri.com`'un Google'daki **568 eski PHP URL'i** takastan sonra Next.js'te 404 olur.
   - Next.js'te kök dizinde catch-all route yok, yani yol çakışması yok; `next.config.ts` `redirects()` ile 301 eşlemesi eklenmeli. Eşleme:
     - **163 villa** slug'ı Next.js'te birebir var → `/villa-x` ⇒ `/kiralik-villa/villa-x` (örn. `villa-in-love`, `villa-bergama`, `villa-tugra`, `villa-black-forest-3`).
     - Kalan **367 villa/apart** Next.js'te yok → `https://balayivillaniz.com/villa-x`'e 301 (PHP orada yaşamaya devam edecek). Alternatif: ilgili bölge/listeye 301 veya 410.
     - Bölgeler: `/kas` `/kalkan` `/patara` `/fethiye` `/bodrum` ⇒ `/bolgeler/<slug>`. Diğer 13 bölgede (Yeşilköy, Üzümlü vb.) Next.js karşılığı yok; liste sayfasına ya da PHP'ye yönlendirilir.
     - Kategoriler: `balayi-villalari`, `cocuk-havuzlu-villalar`, `deniz-manzarali-villalar`, `luks-villalar`, `ekonomik-villalar`, `muhafazakar-villalar` ⇒ `/villa-turleri/<aynı>`. Yaklaşık karşılıklar: `kapali-havuzlu-villalar` ⇒ `kapali-havuzlu-isitmali-villalar`, `kiralik-apartlar` ⇒ `apartlar`, `genis-aile-gruplari-icin` ⇒ `genis-aileye-uygun-villalar`.
     - Yasal sayfalar: `hakkimizda` ⇒ `/p/hakkimizda`, `cerezler-politikasi` ⇒ `/p/cerez-politikasi`, `mesafeli-kiralama-sozlesmesi` ⇒ `/p/mesafeli-satis-sozlesmesi`, `kisisel-verilerin-korunmasi-ve-gizlilik-politikasi` ⇒ `/p/kvkk-ve-gizlilik-politikasi`, `iptal-ve-iade-kosullari` ⇒ `/p/rezervasyon-ve-iptal-kosullari`.
   - Bu eşleme listesi kod değişikliği olduğu için **ayrı bir görevde** hazırlanıp test edilmeli.

---

## 4. Veritabanı ve dosya bağımsızlığı

| | Next.js | PHP |
|---|---|---|
| Veritabanı | Supabase Postgres (eu-west-1, `DATABASE_URL`) | **Doğrulanamadı.** Büyük ihtimalle aynı sunucuda MySQL (Ubuntu + nginx) |
| Dosyalar | Cloudflare R2 (iki bucket) + `cdn.`/`assets.balayivillaniz.com` | Sunucunun disk dizini (görseller `tatilinyeri.com`'dan servis ediliyor) |
| Ortak nokta | Yalnız **domain adları ve Cloudflare'deki `balayivillaniz.com` zone'u** | |

Next.js tarafında PHP'ye ya da tatilinyeri.com'a veri bağımlılığı **yok**. PHP tarafının Supabase/R2 kullanmadığı §7 komut 4–5 ile doğrulanmalı.

Açık risk: Next.js'in Coolify sunucusu ile PHP sunucusu **aynı makine mi?** Cloudflare origin'i gizlediği için bilinmiyor. Aynı makineyse Nginx ile Traefik 80/443 portlarını paylaşıyor demektir; bu ayrı bir plan gerektirir. §7 komut 1 ile kontrol edilmeli.

---

## 5. SEO ve 301 stratejisi

- **Çakışma noktası:** İki site birbirinin domainine geçtiği için "tüm domaini 301'le" yöntemi (Search Console "Adres Değişikliği" aracı) **kullanılamaz**. Her domain yeni bir site sunmaya devam edecek.
- **Önerilen model:** Next.js, `tatilinyeri.com` marka değerini devralıyor (sitenin başlığı zaten "Tatilinyeri | …").
  - `tatilinyeri.com`: eski PHP yolları → §3.5 eşlemesi (Next.js'te karşılığı olan 301 içeride, olmayan 301 balayivillaniz.com'a).
  - `balayivillaniz.com`: eski Next.js yolları → PHP Nginx kuralıyla tatilinyeri.com'a 301 (§2.5). Next.js ve PHP yol kalıpları farklı (`/kiralik-villa/` ⇄ düz `/villa-x`), bu yüzden kurallar çakışmaz.
- **Search Console:**
  - `tatilinyeri.com` zaten TXT ile doğrulanmış; bu kayıt korunmalı.
  - `balayivillaniz.com` için Cloudflare'de doğrulama kaydı görünmüyor; başka bir yöntemle doğrulanmış olabilir, kontrol edilmeli.
  - Takastan sonra iki mülke de yeni sitemap gönderilmeli. 301'ler en az 12 ay korunmalı.
- **Kopya içerik:** PHP içeriği yeni bir domainde yeniden indekslenecek. 163 ortak villa iki sitede de var. PHP sayfalarında `balayivillaniz.com` canonical'ı şart.
- **Google Ads, Analytics, Clarity:** PHP'nin GA4/Ads hedef URL'leri `tatilinyeri.com` ise reklamlar Next.js'e gider. Kampanya URL'leri güncellenmeli. Next.js GA4/GTM kimliği ayrı mı aynı mı, kontrol edilmeli.

---

## 6. Güvenli işlem sırası (iki sitenin aynı anda kapanmasını önleyen)

Temel ilke: önce **ek** değişiklikler yapılır; her iki uygulama da iki domaini kabul edecek hale getirilir. DNS en son ve **tek tek** çevrilir. Her adımın ayrı bir geri dönüşü var.

### Faz 0 — Hazırlık (kesinti yok, D-2 / D-1)
1. §7 komutlarıyla eksik bilgiler toplanır: Nginx config, PHP base URL, cron URL'leri, CORS, Cloudflare SSL modu, Coolify sunucu IP'si.
2. `tatilinyeri.com` `@` ve `www` TTL'i **300**'e düşürülür. Değişiklik en az 24 saat önce yapılır, çünkü eski TTL 4 saat.
3. SPF'e `ip4:178.105.249.77` eklenir. PHP sunucusunun mail yetkisi `a` mekanizmasına bağlı kalmasın diye.
4. PHP için `balayivillaniz.com` sertifikası **önceden** hazırlanır (Origin CA veya DNS-01) ve yeni Nginx server bloğu eklenir.
   - Bu bloğa §2.5'teki Next.js yollarını tatilinyeri.com'a 301'leyen kurallar da girer. Henüz DNS gelmediği için etkisi yoktur.
5. Coolify: `tatilinyeri.com` ve `www` domainleri **eklenir**, `balayivillaniz.com` kalır. R2 CORS'a `https://tatilinyeri.com` eklenir.
6. Next.js'e §3.5 redirect eşlemesi eklenir (ayrı görev, test edilir), henüz deploy edilmez. Hazır olması yeterli.
7. (Seçenek A seçildiyse) `tatilinyeri.com` zone'u Cloudflare'e birebir kopyalanır ve NS taşınır. NS yayılması 24–48 saat bekletilir; bu sürede davranış değişmez.

### Faz 1 — Geçiş penceresi (gece, düşük trafik; tahmini 15–30 dk)
| Adım | İşlem | Bu adımda kim erişilemez? |
|---|---|---|
| 1 | Coolify'da `NEXT_PUBLIC_SITE_URL=https://tatilinyeri.com` + redirect eşlemesiyle **build başlatılır** (birkaç dakika). Build bitene kadar eski sürüm yayında kalır | Kimse |
| 2 | Build biter ve yeni sürüm yayına girer. Next.js hâlâ **balayivillaniz.com**'dan erişilir; canonical artık tatilinyeri.com'u gösterir. Bu kısa ara SEO açısından zararsızdır | Kimse |
| 3 | **`balayivillaniz.com` `@`/`www` origin'i → 178.105.249.77** (Cloudflare, anında). PHP, eski Next.js yollarını tatilinyeri.com'a 301'ler. PHP base URL `balayivillaniz.com` yapılır | **Next.js** erişilemez: adım 4'te `tatilinyeri.com` DNS'i Coolify'a dönene kadar (TTL 300 → birkaç dakika). PHP iki domainden de çalışıyor |
| 4 | **`tatilinyeri.com` `@` A → Coolify IP** (Güzel Hosting; ya da Seçenek A ile Cloudflare'de anında). Seçenek B'de Traefik sertifikası izlenir | Seçenek B'de ilk 1–5 dakika sertifika uyarısı olabilir |
| 5 | Coolify scheduled task URL'leri `https://tatilinyeri.com` (ya da `http://localhost:3000`) yapılır. Bir cron elle tetiklenir ve test edilir | Kimse |

**Neden bu sıra:** Adım 3'ten önce iki uygulama da hedef domaini kabul edecek şekilde hazır. Herhangi bir anda **en fazla bir site** geçişte. PHP hiçbir zaman erişilemez olmuyor; Next.js'in erişilemediği süre TTL kadar (300 sn). Seçenek A ile bu süre neredeyse sıfıra iner.

Next.js'in hiç kesinti yaşamaması gerekiyorsa adım 3 ve 4'ün sırası ters çevrilebilir. O zaman bu kesinti PHP'ye kayar. Hangi sitenin kısa kesintiye girebileceği bir **iş kararı**dır.

### Faz 2 — Doğrulama (geçişten hemen sonra)
- Her iki domainde: `https://` ve `www` yanıtı, sertifika sahibi (CN/SAN).
- tatilinyeri.com'da: canonical, hreflang, `robots.txt`, `sitemap.xml`, örnek 301'ler (`/villa-in-love` → `/kiralik-villa/villa-in-love`), admin login, galeri yükleme (CORS), voucher e-postası, logo.
- balayivillaniz.com'da: PHP ana sayfa, villa sayfası, formlar, `/kiralik-villa/x` → tatilinyeri.com 301'i, `cdn.`/`assets.` görselleri hâlâ açılıyor mu.
- Cron logları ve mail teslimi (SPF/DKIM pass).
- Search Console'a iki sitemap gönderilir.

### Geri dönüş planı
| Ne bozuldu | Geri dönüş | Süre |
|---|---|---|
| PHP balayivillaniz.com'da çalışmıyor | Cloudflare `@`/`www` origin'i eski Coolify IP'sine geri alınır (Coolify'da balayivillaniz.com domaini silinmediği için hemen çalışır) | Anında |
| Next.js tatilinyeri.com'da çalışmıyor | Güzel Hosting `@` A → 178.105.249.77 (PHP'nin eski server bloğu korunduğu için hemen çalışır) | TTL 300 → ~5 dk |
| Build/canonical hatalı | Coolify'da önceki deployment'a "Rollback" + env'i geri almak | Birkaç dakika |
| Mail teslim sorunu | SPF/DKIM değişiklikleri geri alınır; MX'e hiç dokunulmadığı için posta kutuları etkilenmez | – |

Geri dönüş garantisi için **eski domain ayarları (Nginx tatilinyeri bloğu, Coolify balayivillaniz domaini, R2 CORS'taki eski origin) en az 1–2 hafta silinmemeli.**

---

## 7. Eksik bilgiler için salt-okuma komutları (sunucuda siz çalıştırın)

PHP sunucusu (178.105.249.77):
```bash
# 1) Hangi süreç 80/443'ü dinliyor (Coolify ile aynı makine mi?)
sudo ss -ltnp | grep -E ':(80|443)\s'
# 2) Nginx server blokları, root ve SSL yolları
sudo nginx -T 2>/dev/null | grep -nE 'server_name|root |ssl_certificate|listen|return 301'
# 3) Sertifika durumu
sudo certbot certificates 2>/dev/null; echo | openssl s_client -connect 127.0.0.1:443 -servername tatilinyeri.com 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
# 4) PHP kodunda domain referansları (DOCROOT'u 2. komuttan alın)
grep -rnoiE "https?://(www\.)?(tatilinyeri|balayivillaniz)\.com[^\"' ]*" DOCROOT --include=*.php --include=*.js --include=*.env --include=*.ini --include=*.json | cut -c1-200 | sort | uniq -c | sort -rn | head -50
grep -rnliE "site_url|base_url|callback|notify_url|ok_url|fail_url|ical|smtp" DOCROOT --include=*.php | head -50
# 5) .env / config'te yalnız ANAHTAR adları (değerleri yazdırmayın)
grep -hoE '^[A-Z_]+=' DOCROOT/.env 2>/dev/null
# 6) Cron işleri
sudo crontab -l; ls /etc/cron.d
```
Coolify paneli: uygulamanın **Domains**, **Ports Exposes**, **Environment Variables** (yalnız `NEXT_PUBLIC_SITE_URL`, `RESEND_FROM`, `MAIL_ADMIN_NOTIFY_TO` değerleri), **Scheduled Tasks** komutları ve sunucu IP'si.

Cloudflare (`balayivillaniz.com`): **SSL/TLS modu**, `@`/`www` origin IP'si, Page/Redirect Rules, R2 bucket **CORS** ayarı, `cdn`/`assets` custom domain bağlantıları.

Resend: doğrulanmış gönderici domain(ler)i.

---

## 8. Kararınızı bekleyen konular

1. Hangi site kısa kesintiye girebilir? Varsayılan: Next.js birkaç dakika.
2. `tatilinyeri.com` zone'u Cloudflare'e taşınsın mı (Seçenek A: NS değişikliği), yoksa Güzel Hosting'de mi kalsın (Seçenek B)?
3. Next.js'te karşılığı olmayan 367 PHP villa URL'i: balayivillaniz.com'a mı, bölge/liste sayfasına mı 301'lensin, yoksa 410 mu dönsün?
4. `@tatilinyeri.com` Google Workspace posta kutuları kimde kalacak? Varsayılan: aynen kalır, MX'e dokunulmaz.
5. Next.js mail göndericisi hangi domainden gönderecek?
