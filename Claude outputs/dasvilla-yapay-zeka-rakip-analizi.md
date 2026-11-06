# DasVilla — Yapay Zekâ ile Villa Arama: Rakip Teknik Analizi

**Tarih:** 6 Kasım 2026
**İncelenen:** https://dasvilla.com/ ve arama alt alan adı `ai.dasvilla.com`. Yalnız herkese açık sayfalar kullanıldı.
**Yöntem:** Claude'un tarayıcısında sıradan bir ziyaretçi gibi gezinildi:

- çerezlerde "Tümünü reddet" seçildi;
- sayfanın kendi kaynakları (HTML, `_astro/*.js`) okundu;
- Network ve Performance kayıtlarına bakıldı;
- 11 doğal dil araması yapıldı: siteye konmuş örnek cümleler ve bizim hedef cümlemiz.

Güvenlik testi, kimlik doğrulama, gizli uç nokta denemesi, otomatik tarama ya da veri çekme yapılmadı.

**Kanıt düzeyleri:**

| İşaret | Anlamı |
|---|---|
| **[K]** | Kesin: doğrudan gözlendi (HTML, URL, Network kaydı, ekran) |
| **[G]** | Güçlü çıkarım: birden fazla gözlem aynı yönü gösteriyor, ama arka uç kodu görülmedi |
| **[T]** | Tahmin: olası, kanıtı zayıf |
| **[?]** | Tespit edilemedi |

---

## Yönetici özeti

1. **Özellik var ve tarayıcı tarafında çok basit** [K]:
   - Hero'da "Tarihle Ara / Yapay Zekâ ile Ara" sekmeleri bulunuyor (ayrıca gizli bir "Biz Bulalım" sekmesi var).
   - AI sekmesi sıradan bir HTML formu: `GET https://ai.dasvilla.com/ara?q=<metin>&l=/kiralik-villalar`.
   - Sunucu metni çözüp kullanıcıyı doğrudan mevcut liste sayfasına **yönlendiriyor**: `/kiralik-villalar?region=115&feature=4&adults=2&check_in=…&check_out=…`.
   - Tarayıcı tarafında AI'a ait JavaScript, `fetch` çağrısı ya da JSON yanıtı **yok.**
2. **Mimari bizim kararımızla aynı fikirde** [K]: AI yalnız metni **mevcut liste filtrelerinin URL parametrelerine** çeviriyor. Sonuçları, müsaitliği ve fiyatı mevcut liste sayfası üretiyor.
3. **Onay adımı yok; anlaşılmayan istekler sessizce düşüyor** [K]:
   - "denize yakın", "evcil hayvan", "ısıtmalı havuz", "gecesi 10.000 TL altı", "Whirlpool" gibi istekler, sitede bu filtreler olsa bile URL'ye yansımadı ve kullanıcıya hiçbir uyarı gösterilmedi.
   - Anlamsız bir metin ("merhaba nasılsın…") filtresiz liste sayfasına gitti.
4. **Hangi yapay zekâ olduğu tespit edilemedi** [?]:
   - Ön yüzde Claude, OpenAI, Gemini, Groq ya da başka bir sağlayıcıya giden istek yok; bunlar sunucuda (ya da hiç) çalışıyor.
   - Davranış, **büyük ölçüde kural / sözlük tabanlı bir ayrıştırıcıya** benziyor [G]. Gerekçeler §3.2'de: Türkçe örnek cümlelere ayarlı eşleşmeler, "Whirlpool"un "Jakuzi"ye eşlenmemesi, 200–470 ms'lik yanıt süreleri, "August" için sabit 15–20 Ağustos ataması.
   - Arkada bir LLM olup olmadığı **kanıtlanamaz.**
5. **Bizim için en ekonomik yol** [Ö]:
   - Önce **kural tabanlı ayrıştırıcı** (sıfır API maliyeti; DasVilla da muhtemelen büyük ölçüde böyle çalışıyor);
   - yalnız kuralların çözemediği cümlelerde **küçük bir LLM** (Claude Haiku 5.5 ile sorgu başına yaklaşık $0,0005);
   - DasVilla'dan farklı olarak **kriter onay kartı** ve **"filtreleyemediklerimiz" bildirimi.**

   Ek sunucu ya da GPU gerekmez.

---

## 1. Özelliğin kullanıcı deneyimi

### 1.1 Giriş noktaları [K]

| Öğe | Gözlem |
|---|---|
| Sekmeler | `role="tab"`: **Tarihle Ara** · **Yapay Zekâ ile Ara** (yanında turuncu "yeni" noktası) · **Biz Bulalım** (DOM'da var, ekranda sekme olarak görünmüyor) |
| Tarihle Ara içinde tanıtım şeridi | "Yeni · Yapay zekâya sorun: …" metni + **Dene →** butonu. AI sekmesine yönlendiriyor |
| AI formu | Tek satır metin kutusu (`name="q"`, `aria-label="Yapay zekâya villa sorusu"`); solda güneş/yıldız ikonu; sağda turuncu **Villa Bul →** |
| Yer tutucu (TR) | "5-10 Ağustosta denize yakın, çocuk dostu 8 kişilik villa" |
| Örnek chip'ler | "Şunu sorabilirsiniz:" altında 3 bağlantı. Her biri doğrudan `ai.dasvilla.com/ara?q=…` adresine giden `<a rel="nofollow">` |
| Alt bağlantı | "Aradığınızı bulamadınız mı? **Biz bulalım** →" |
| Gece / gündüz görseli | Hero başlığı ve görseli değişiyor ("Güne kuş sesleriyle uyanın" / "Geceler burada daha güzel"); altta bir slider var |

### 1.2 İstenen metin [K]

Serbest cümle. Örnekler tarih aralığı, bölge, kişi sayısı ve bir ya da iki özellik içeriyor:

- **TR:**
  - "5-10 Ağustosta denize yakın, çocuk dostu 8 kişilik villa"
  - "Kalkan'da 8-13 Mayıs 2 kişilik jakuzili villa var mı?"
  - "20-27 Mayıs Fethiye'de 6 kişilik havuzlu villa"
- **EN:**
  - "A beachfront, child-friendly villa for 8 in August"
  - "Is there a villa with a jacuzzi for 2 in Kalkan?"
  - "A pet-friendly villa with a heated pool in Fethiye"
- **DE:**
  - "Eine strandnahe, kinderfreundliche Villa für 8 Personen im August"
  - "Gibt es in Kalkan eine Villa mit Whirlpool für 2 Personen?"
  - "Eine Villa mit beheiztem Pool in Fethiye, die Haustiere erlaubt"

### 1.3 Buton, yükleme ve sonuç ekranı [K]

- **Buton:**
  - Basınca ayrı bir AI ekranı, yükleme animasyonu ya da kriter özeti **gösterilmiyor.**
  - Tarayıcı `ai.dasvilla.com/ara`'ya gidiyor ve oradan liste sayfasına yönlendiriliyor.
  - Kullanıcı yalnız sayfa geçişini görüyor.
- **Sonuç ekranı:** Normal liste sayfası (`/kiralik-villalar`, `/en/rental-villas`, `/de/mietvillen`). Üstte:
  - arama kutusu ("Kalkan villaları · 8–13 May · 2 misafir");
  - kategori chip'leri;
  - "Filtreler (n)" sayacı;
  - ±1 gün alternatif tarih kartları ("15 müsait villa");
  - "15 villa bulundu";
  - kaldırılabilir filtre chip'leri (ör. Kişi Sayısı: 2 ×, Kalkan ×, Jakuzi ×) ve "Tümünü temizle".
- **AI'a özel bir bant yok:** "Yapay zekâ şöyle anladı" ya da "şunları filtreleyemedik" gibi bir şey **yok.** Kullanıcı ne anlaşıldığını yalnız filtre chip'lerinden çıkarabiliyor.

### 1.4 Kriter onayı [K]

**Yok.** Metin gönderilince doğrudan sonuç listesine gidiliyor. Düzeltme, sonradan filtre chip'leri ya da kenar çubuğuyla yapılıyor.

### 1.5 Dil desteği [K]

| Dil | Ana sayfa | Form hedefi (`l`) | Sonuç sayfası |
|---|---|---|---|
| TR | `/` | `/kiralik-villalar` | `/kiralik-villalar?...` |
| EN | `/en` | `/en/rental-villas` | `/en/rental-villas?...` |
| DE | `/de` | `/de/mietvillen` | `/de/mietvillen?...` |

- Yer tutucu ve örnekler her dilde ayrı (hreflang: tr, en, de, x-default).
- **Uç nokta tek** (`ai.dasvilla.com/ara`). Dil, `l` parametresindeki sayfa yolundan anlaşılıyor [G].
- İngilizce ve Almanca anlama kalitesi Türkçeden belirgin biçimde düşük (§3.2).

### 1.6 Masaüstü ve mobil [K]

| | Masaüstü (1366 × 900) | Mobil (375 × 812) |
|---|---|---|
| Sekmeler | Hero başlığının altında, küçük "pill" butonlar | Tam genişlikte iki pill; aktif olan beyaz |
| AI kutusu | Tek satır, geniş; buton metinli ("Villa Bul →") | Tek satır; buton yalnız ok ikonu (→); yer tutucu kesiliyor |
| Örnekler | Yan yana chip'ler | Alt alta, tam genişlikte, iki satıra kırılan chip'ler |
| Diğer | Üst menü + dil/para birimi seçici | Alt gezinme çubuğu (Ana Sayfa, Tüm Villalar, Villanı Bul, WhatsApp, Ara); en altta gece/gündüz slider'ı |
| Sonuç | Kenar çubuğunda filtreler | "Filtreler / Sırala / Harita" üst barı; kartlar 2 sütun |

Bu yapı, bizim revize raporumuzdaki mobil öneriyle (§8.2) büyük ölçüde örtüşüyor. Fark: DasVilla'da kriter kartı yok.

---

## 2. Teknik mimari ve tespit edilen istekler

### 2.1 Ön yüz yığını [K]

| Bulgu | Kanıt |
|---|---|
| **Astro v7.3.5** | `<meta name="generator" content="Astro v7.3.5">`; `/_astro/*.astro_astro_type_script_index_0_lang.*.js` dosyaları |
| Next.js / React / Vue / Nuxt değil | `__NEXT_DATA__`, `self.__next_f`, `__NUXT__` yok |
| Kendi küçük bileşen kütüphanesi | `data-vf-*` öznitelikleri (`data-vf-tabs-panel`, `data-vf-popover`, `data-vf-search-form`); `tabs.js`, `popover.js`, `focus-trap.js`, `scroll-lock.js`; derleme izi `rolldown-runtime.js` |
| Tailwind sınıfları | `min-h-12`, `text-[15px]`, `group-open/dd:` |
| Kendi API'leri | `/api/kit/core`, `/api/kit/visitor.js`, `/api/kit/consent`, `/api/pulse` (POST, analitik), `/api/marketing`, `/api/consent-record` |
| Cloudflare | `/cdn-cgi/rum` (POST) ve `static.cloudflareinsights.com/beacon.min.js` |
| Görsel CDN | `cdn.dasvilla.com/o/xlarge/...` |
| Minimum konaklama ön yüzde biliniyor | `min-stay-runs.*.js`; liste filtresinde "Takvim Kurallarına uygun · Minimum konaklama" seçeneği (`calendar=1`) |

### 2.2 AI arama akışı [K]

```
[Hero formu]  <form method="get" action="https://ai.dasvilla.com/ara">
                 <input type="hidden" name="l" value="/kiralik-villalar">
                 <input type="text" name="q">
      │  tarayıcı tam sayfa GET (JS yok)
      ▼
GET https://ai.dasvilla.com/ara?q=<serbest metin>&l=<liste sayfası yolu>
      │  sunucu tarafı işlem (içeriği görülemiyor)
      ▼  HTTP yönlendirmesi (tarayıcı adres çubuğunda ara adım görünmüyor)
GET https://dasvilla.com/kiralik-villalar?region=…&category=…&feature=…&adults=…&bedrooms=…&check_in=…&check_out=…
      │
      ▼
Mevcut liste sayfası (sunucuda render, Astro) → sonuçlar
```

**Kanıtlar:**

- Formun HTML'i; Network kaydında `ai.dasvilla.com`'a giden **hiçbir** XHR ya da fetch yok.
- Son belgenin `PerformanceNavigationTiming.fetchStart` değeri 200–3 860 ms. Bu süre, ara alan adındaki işlemin ve yönlendirmenin süresi.
- Ana sayfadaki 41 JS dosyası tarandı: `ai.dasvilla`, `anthropic`, `claude`, `gemini`, `groq`, `mistral`, `ollama`, `huggingface`, `deepseek`, `openrouter`, `workers.ai`, `gpt-` geçmiyor. Tek istisna §3.1'de.

**Diğer gözlemler:**

- `ai.dasvilla.com/` kökü **404** veriyor; gövdede yalnız "Bulunamadı" ve `<meta name="color-scheme">` var. Bu, ayrı ve çok küçük bir servis olduğunu düşündürüyor [G].
- `ai.dasvilla.com/ara` parametresiz çağrılınca filtresiz `/kiralik-villalar`'a gidiyor [K].
- `l` parametresi yönlendirme hedefini belirliyor [K]. Yanlış dil yolu verildiğinde (`/en/kiralik-villalar`) hedef sayfa 404 döndü.
- Bu parametrenin güvenlik açısından nasıl doğrulandığı **test edilmedi** (kapsam dışı).

### 2.3 Liste sayfasının parametre sözleşmesi [K]

Kenar çubuğu formundaki `name` değerleri:

| Parametre | Örnek değer | Anlamı |
|---|---|---|
| `region` | `115` (Kalkan), `3` (Fethiye), `80` (Kaş), `78` (Antalya); virgülle çoklu `3,115` | Sayısal bölge id'si, ağaç yapısında (il → ilçe → köy) |
| `category` | `8720` Korunaklı villalar, `8784` Deniz manzaralı, `8785` Jakuzili, `8790` Doğa manzaralı, `8789` Merkeze yakın, `8722` Büyük gruplar | "Tesis kategorisi" |
| `feature` | `3` Korunaklı Havuz, `4` Jakuzi, `16` Çocuk Havuzu, `70` Kapalı Havuz, `104` Sonsuzluk Havuzu | Havuz ve öne çıkan özellikler |
| `adults`, `children`, `infants` | `2`, `0`, `0` | Misafir kırılımı |
| `bedroom_counts` / `bedrooms` | `1–5` (filtre); AI çıktısında `bedrooms=3` | Yatak odası |
| `price_min`, `price_max` | ₺ | Fiyat aralığı |
| `sea_max` | (boş) | **Denize en fazla mesafe** |
| `check_in`, `check_out` | `2027-05-08` | Tarih |
| `calendar=1` | — | Takvim kurallarına (min. konaklama) uygun olanlar |
| `instant=1`, `discounted=1` | — | Anında rezervasyon, indirimli |
| `sort` | `recommended` | Sıralama |

**Not:** DasVilla'nın filtre altyapısı bizimkinden **daha zengin.** Havuz tipi, yatak odası, fiyat aralığı, denize mesafe ve minimum konaklama filtreleri var. Buna rağmen AI bunların bir kısmını kullanmıyor (§3.2).

### 2.4 Yapılan AI aramaları ve dönüştürüldükleri filtreler [K]

Her satır tarayıcıda gerçekten yapılan bir aramadır. "Süre", yönlendirmeyle varılan son sayfanın `fetchStart` değeri: ara servis + yönlendirme + ağ gecikmesi.

| # | Girdi | Son URL parametreleri | Yansımayan istekler | Süre |
|---|---|---|---|---|
| 1 | Kalkan'da 8-13 Mayıs 2 kişilik jakuzili villa var mı? (TR örnek) | `region=115&feature=4&adults=2&check_in=2027-05-08&check_out=2027-05-13` | — | ≈ 3 860 ms (ilk istek) |
| 2 | **Kalkan'da 6 kişilik, özel havuzlu, muhafazakâr, denize yakın bir villa arıyorum** (bizim hedef cümlemiz) | `region=115&category=8720&feature=3&adults=6` → 137 villa | **denize yakın** (`sea_max` var ama kullanılmadı); "özel havuzlu" ile "muhafazakâr" → Korunaklı villalar + Korunaklı Havuz (hangi kelimenin hangisine eşlendiği belirsiz) | ≈ 1 500 ms |
| 3 | 12-18 Haziran 2027 Kalkan veya Fethiye'de 2 kişilik, denize 500 metre, gecesi 10.000 TL altı, 3 yatak odalı villa | `region=3,115&bedrooms=3&adults=2&check_in=2027-06-12&check_out=2027-06-18` | **denize 500 m** (`sea_max` var), **fiyat sınırı** (`price_max` var) | ≈ 440 ms |
| 4 | Villa in Kas for 4 people with a heated pool, July 10 to 17 | `region=80&adults=4&check_in=2027-07-10&check_out=2027-07-17` | **heated pool** ("Isıtmalı villalar" kategorisi menüde var) | ≈ 450 ms |
| 5 | A pet-friendly villa with a heated pool in Fethiye (EN örnek) | `region=3` | **pet-friendly, heated pool**: sitenin kendi örnek cümlesinin iki kriteri de düşüyor | ≈ 360 ms |
| 6 | Gibt es in Kalkan eine Villa mit Whirlpool für 2 Personen? (DE örnek) | `region=115&adults=2` | **Whirlpool** (TR "jakuzili" → `feature=4` çalışırken DE karşılığı çalışmadı) | ≈ 320 ms |
| 7 | A beachfront, child-friendly villa for 8 in August (EN örnek) | `check_in=2027-08-15&check_out=2027-08-20` | **beachfront, child-friendly, "for 8"** düştü; "August" için **sabit 15–20 Ağustos** üretildi | ≈ 265 ms |
| 8 | 5-10 Ağustosta denize yakın, çocuk dostu 8 kişilik villa (TR örnek) | `category=8784&feature=16&adults=8&check_in=2027-08-05&check_out=2027-08-10` | "denize yakın" → **Deniz manzaralı** kategorisi (anlam kayması); "çocuk dostu" → Çocuk Havuzu | ≈ 265 ms |
| 9 | Fethiye ısıtmalı havuzlu evcil hayvan kabul eden 4 kişilik villa | `region=3&adults=4` | **ısıtmalı havuz, evcil hayvan** (TR'de de) | ≈ 470 ms |
| 10 | merhaba nasılsın bugün hava nasıl | filtresiz `/kiralik-villalar` | Uyarı ya da yönlendirme metni yok | ≈ 200 ms |
| 11 | (parametresiz `/ara`) | filtresiz `/kiralik-villalar` | — | — |

**Doğru çalışan kısımlar** [K]:

- TR/EN/DE tarih aralıkları; yıl verilmeyince bir sonraki uygun yıl (2027).
- "X kişilik", "for 4 people", "für 2 Personen" → `adults`.
- Bölge adları: Kalkan, Fethiye, Kaş/Kas; çoklu bölge (`3,115`).
- TR "jakuzili", "çocuk dostu", "3 yatak odalı".

---

## 3. Kullanılan AI sağlayıcısı

### 3.1 Doğrudan kanıt

| Soru | Cevap | Düzey |
|---|---|---|
| Tarayıcıdan bir AI servisine istek var mı? | **Yok.** Bütün işlem `ai.dasvilla.com` sunucusunda; ön yüz yalnız form GET'i yapıyor | [K] |
| Ön yüz kodunda sağlayıcı adı var mı? | **Yalnız `openai`**, o da `dist.*.js` içindeki pazarlama ve dönüşüm olayı biçimlendiricisinde (`vf_platforms:{google_ads:…, openai:…}`). Reklam / dönüşüm platformu verisi; arama ile ilgisi görülmedi | [K] (varlık); arama ile ilişkisi **yok** [G] |
| Claude, Gemini, Groq, Mistral, Llama, HF, DeepSeek, OpenRouter, Workers AI izi | Yok | [K] (ön yüz için) |
| `ai.dasvilla.com`'un barındırması (Cloudflare Worker mı, kendi sunucusu mu) | Belirlenemedi. DNS sorgusu bu ortamdan yapılamadı; yanıt başlıkları tarayıcı yönlendirmesinde görünmüyor | [?] |

### 3.2 Davranıştan çıkarım

Arka uçta **büyük ölçüde kural ya da sözlük tabanlı bir ayrıştırıcı** çalıştığına işaret eden gözlemler [G]:

1. **Eş anlamlılarda dil asimetrisi.** TR "jakuzili" → Jakuzi (`feature=4`). DE "Whirlpool" ve EN "heated pool" eşlenmiyor. Genel amaçlı bir LLM bu eşlemeleri kolayca yapardı; kelime listesi tabanlı bir eşleyici yapmaz.
2. **Örnek cümlelere ayar.** Sitenin kendi TR örneklerindeki ifadeler ("denize yakın", "çocuk dostu", "jakuzili") filtreye dönüşüyor. EN/DE örneklerdeki "beachfront", "pet-friendly", "heated pool", "Whirlpool" dönüşmüyor.
3. **Kalıp eşleşmesi.** "for 4 people" ve "für 2 Personen" çalışıyor, "for 8" çalışmıyor. "August" yalnız ay olarak verilince sabit 15–20 Ağustos atanıyor. Bu, ay adı için varsayılan aralık kuralı gibi görünüyor.
4. **Gecikme.** 200–470 ms aralığı, uzak bir LLM çağrısı için kısa: tipik LLM yanıtı yarım saniyeden uzun sürer [T]. İlk iki istekteki 1,5–3,9 sn bir "soğuk başlangıç" ya da önbelleksiz bir LLM çağrısı olabilir [T].
5. **Gürültüye tepki.** Alakasız metin hiçbir filtre üretmiyor; bir LLM de aynısını yapabilirdi, bu ayırt edici değil.

**Karşı ihtimal** [T]: Arkada çok hızlı bir model (ör. küçük bir model, yoğun önbellek) dar bir sözlükle çalışıyor da olabilir. "muhafazakâr + özel havuzlu" → kategori 8720 + özellik 3 eşlemesi, bir iş sözlüğüyle de bir LLM'le de açıklanabilir.

**Sonuç:** Hangi sağlayıcının ya da modelin kullanıldığı (ya da hiç LLM olup olmadığı) bu kanıtlarla **belirlenemez.** Raporda tahmin gerçekmiş gibi yazılmamıştır.

### 3.3 Sorulan sorulara kısa cevaplar

| Soru | Cevap |
|---|---|
| Claude / OpenAI / Gemini / Groq / diğer? | **[?]** Kanıt yok |
| Açık kaynak model mi? | **[?]** Kanıt yok |
| API kullanıyor mu? | Tarayıcı açısından yalnız kendi alt alan adına GET [K]. Arka uçta harici bir API çağrılıp çağrılmadığı **[?]** |
| Ücretsiz servis / kota olabilir mi? | Mümkün [T]. Davranış ağırlıklı kural tabanlıysa maliyet zaten sıfıra yakın [G] |
| AI işlemi kendi sunucusunda mı? | Ayrı bir alt alan adında, sunucu tarafında [K]. Fiziksel olarak nerede çalıştığı **[?]** |

---

## 4. Ücretsiz mi ücretli mi?

| Senaryo | Olasılık | Gerekçe |
|---|---|---|
| Kural / sözlük tabanlı, LLM yok → **ücretsiz** | Yüksek [G] | §3.2 maddeleri 1–4 |
| Kural + seyrek LLM yedeği → **çok düşük maliyet** | Orta [T] | İlk isteklerdeki uzun süreler |
| Her sorguda ücretli LLM | Düşük [T] | Gecikme profili ve eşleme hatalarının türü |
| Kendi sunucusunda açık kaynak model | Düşük [T] | 200–470 ms ve dil asimetrisi buna uymuyor; kanıt yok |

---

## 5. Tespit edilemeyen noktalar

| Nokta | Neden |
|---|---|
| Arka uç dili / çatısı (`ai.dasvilla.com`) | Kod görünmüyor; 404 sayfası çok yalın |
| LLM varlığı, sağlayıcı ve model | Yalnız davranış gözlendi |
| Barındırma (Cloudflare Worker / VPS / başka) | DNS ve yanıt başlıkları bu ortamdan alınamadı |
| Önbellek, rate limit, bot koruması | Ölçmek için tekrarlı ya da yük oluşturan istek gerekir; kapsam dışı |
| Sorguların kaydedilip kaydedilmediği | Görünmüyor; KVKK metni incelenmedi |
| `l` parametresinin doğrulanması | Güvenlik testi kapsam dışı |
| "özel havuzlu" ve "muhafazakâr" kelimelerinin hangi filtreye eşlendiği | Tek sorguda ikisi birlikte geldi; ayrıştırmak için ek sorgu yapılmadı |

---

## 6. Bizim sistemimizle karşılaştırma

**Yığın notu:** Brief'te "Drizzle ORM" yazıyor. Repoda (`main` @ `6d09529`) Drizzle **yok.** `package.json`'da `pg` var; veri erişimi `lib/db/*.repository*.ts` ve yerel bir sorgu oluşturucu (`native-db.provider`) üzerinden yapılıyor [D]. Bu, öneriyi değiştirmiyor: AI katmanı ORM'e dokunmuyor.

| Konu | DasVilla [K] | Tatilinyeri Next (bugün) [D] | Revize planımız [Ö] |
|---|---|---|---|
| Çatı | Astro (SSR) | Next.js 16 App Router | — |
| AI giriş yeri | Hero sekmesi + tanıtım şeridi | Yok | Hero sekmesi (bayrakla) |
| Tarayıcı → AI | Düz form GET → ayrı alt alan adı → 30x | — | `POST /api/public/ai-search` (aynı site) → JSON |
| Sonuca aktarım | Sunucu yönlendirmesiyle liste URL'si | — | Kullanıcı onayından sonra `buildHeroSearchParams` → `/arama` |
| Onay adımı | **Yok** | — | **Var** (kriter kartı) |
| Filtrelenemeyenlerin bildirimi | **Yok**; sessizce düşüyor | — | **Var** (`unsupported` kutusu) |
| Bölge | Sayısal id, ağaç | `bolgeler` slug/UUID; grup kökü genişlemesi | Aynı |
| Villa türü / kategori | `category` (id) | `villa-turleri` (slug; **AND**) | Aynı; "veya" için tek takip sorusu |
| Özellik | `feature` (id) | `ozellikler` (UUID; AND) | Aynı |
| Kişi | `adults` / `children` / `infants` | `guests` (toplam) | Toplam |
| Yatak odası | **Var** | Yok | Bildirilir |
| Fiyat aralığı | **Var** | Yok (yalnız sıralama) | Bildirilir |
| Denize mesafe | **Var** (`sea_max`) | Yok | Bildirilir |
| Havuz tipi | **Var** (feature) | Kolonlar var, aramada yok | Bildirilir (DB'de özellik kaydı varsa eşlenir) |
| Minimum konaklama aramada | **Var** (`calendar=1`) | Yok (yalnız rezervasyonda) | Not düşülür |
| EN/DE anlama | Zayıf (eş anlamlılar eksik) | — | Sözlük + çeviri adları + LLM yedeği |
| Hedef cümle sonucu | `region=115&category=8720&feature=3&adults=6`; "denize yakın" sessizce düştü | — | `bolgeler=kalkan&guests=6&villa-turleri=<muhafazakâr slug'ı>` + "özel havuz" ve "denize yakın" için açık bildirim (DB'de karşılığı yoksa) |

**Çıkarılacak dersler:**

1. **Aynı mimari doğru.** AI yalnız mevcut URL parametrelerini üretiyor; liste sayfası değişmiyor. Bizim kararımızla birebir.
2. **Kaçınılması gereken:**
   - sessiz düşürme;
   - anlam kayması ("denize yakın" → "deniz manzaralı");
   - kullanıcının vermediği tarihi uydurma ("August" → 15–20 Ağustos).
3. **Örnek cümleleri test seti yapmak:** DasVilla'nın kendi EN/DE örnekleri kendi sisteminde kısmen çalışmıyor. Bizim örnek chip'lerimiz otomatik testle kilitlenmeli.
4. **Tanıtım şeridi** (Tarihle Ara panelinin altında "Yeni · Yapay zekâya sorun") düşük maliyetli, iyi bir keşif aracı. Bizde `HeroSearchPanel`'e dokunmadan, sarmalayıcı bileşende eklenebilir.

---

## 7. En ekonomik uygulama önerisi

**Öneri: "Önce kural, gerekirse LLM" + onay kartı** [Ö].

| Katman | Ne yapar | Maliyet |
|---|---|---|
| 1. Kural tabanlı ayrıştırıcı (`lib/ai-search/rules.ts`) | TR/EN/DE tarih, kişi, bölge; sözlükte birebir geçen tip ve özellik adları; eş anlamlı listesi (jakuzi / jacuzzi / Whirlpool, denize sıfır / beachfront / strandnah…) | **0** |
| 2. Sonuç önbelleği (mevcut Upstash) | Aynı normalize metin + gün + sözlük sürümü | ≈ 0 (mevcut plan) |
| 3. LLM yedeği | Yalnız kuralların çözemediği anlamlı metin kaldığında. Yapılandırılmış çıktı (`output_config.format: json_schema`, sözlük `enum`) | Claude Haiku 5.5: sorgu başına ≈ $0,0004–0,0006 [önceki raporda resmi fiyattan hesaplandı]; günlük bütçe tavanı |
| 4. Doğrulama (zod) + onay kartı | Uydurma ya da sözlük dışı değer `/arama`'ya gidemez; desteklenmeyenler gösterilir | 0 |

**"Tamamen ücretsiz" seçenekleri:**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Yalnız kural tabanlı** (DasVilla'nın muhtemel yolu) | Sıfır maliyet, düşük gecikme, KVKK açısından metin dışarı çıkmaz | EN/DE ve serbest ifadelerde zayıf; eş anlamlı listesinin bakımı gerekir |
| Sağlayıcıların ücretsiz kotaları | Başlangıçta ücretsiz | Koşullar ve limitler sık değişir; bazı ücretsiz katmanlarda verinin model iyileştirmede kullanılabilmesi KVKK riski [T]. Güncel koşullar ayrıca doğrulanmalı |
| Hetzner'de açık kaynak küçük model (CPU) | API ücreti yok, veri içeride kalır | CPU'da gecikme saniyeler mertebesinde [T]; ek RAM/CPU ve bakım yükü; doğruluk küçük ticari modellerden düşük olabilir |

**Pratik öneri:**

1. **Aşama 1'i yalnız kural tabanlı yayınlamak.** Maliyet sıfır; DasVilla düzeyinde ya da onay kartı sayesinde onun üstünde bir deneyim.
2. Kuralların çözemediği sorguları **sayaçla** ölçmek. Ham metin saklanmaz; yalnız "çözülemedi" oranı tutulur.
3. Oran anlamlıysa LLM yedeğini **bayrakla** açmak. Ayda 10 000 AI aramasında bile beklenen maliyet birkaç dolar [T].

---

## 8. Tahmini altyapı gereksinimleri [T]

| Bileşen | Kural tabanlı | + LLM yedeği | + Kendi modelimiz (karşılaştırma) |
|---|---|---|---|
| Ek sunucu | Yok (mevcut Next.js konteyneri) | Yok | Ayrı Hetzner sunucusu ya da mevcut sunucuda ek kaynak (8–16 GB RAM, çok çekirdekli CPU); GPU'suz yavaş |
| Ek servis | Yok | LLM sağlayıcı hesabı + harcama limiti | Ollama / llama.cpp benzeri servis + izleme |
| Redis | Mevcut Upstash (rate limit + önbellek) | Aynı + günlük bütçe sayacı | Aynı |
| DB | Değişiklik yok; mevcut taksonomi okumaları | Aynı | Aynı |
| Env | `AI_SEARCH_ENABLED` | `+ AI_SEARCH_API_KEY`, `AI_SEARCH_MODEL`, `AI_SEARCH_DAILY_LLM_LIMIT` | `+ servis adresi` |
| Aylık maliyet | ≈ 0 | ≈ birkaç $ (10 bin AI araması) | Sunucu kirası + bakım |
| Gecikme | < 50 ms (sunucu içi) | Kural isabetinde aynı; LLM'de ≈ 0,5–2 sn | CPU'da ≈ 2–10 sn |

---

## Ek — İşlem beyanı

- Yalnız herkese açık sayfalar, sıradan bir ziyaretçinin yapabileceği işlemlerle incelendi.
  - Çerezler reddedildi; form ya da hesap bilgisi girilmedi.
  - 11 arama yapıldı: 7'si sitenin kendi örnek cümleleri ya da benzerleri, 1'i bizim hedef cümlemiz, 1'i anlamsız metin, 1'i yanlış dil yolu, 1'i parametresiz.
- Güvenlik açığı araştırması, kimlik doğrulama atlatma, gizli uç nokta denemesi ve toplu veri çekme **yapılmadı.**
- Bulut ortamından `ai.dasvilla.com`'a yapılan tek doğrudan istek, ajan proxy'si tarafından 403 ile engellendi. Başka bir yolla tekrar denenmedi.
- Kendi projemizde hiçbir dosya, kod, DB ya da env değiştirilmedi. Yalnız bu rapor yazıldı (`Claude outputs/dasvilla-yapay-zeka-rakip-analizi.md`). Repoda yalnız `package.json` ve `lib/db` dizini **okundu.**
- Commit, push ve deploy **yok.**
