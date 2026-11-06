# Tatilinyeri Next — "Yapay Zekâ ile Ara" (Kural Tabanlı) Uygulama Raporu · Nihai Sürüm

**Tarih:** 6 Kasım 2026 · **Temel:** `main` @ `6d09529` · **Sürüm:** 2 (nihai)
**Durum:** Uygulandı ve doğrulandı. Değişiklikler cihazdaki repoda, commit edilmemiş hâlde duruyor. Commit, push ve deploy **yapılmadı.**

Bu rapor üç çalışmayı birleştirir:

1. ilk uygulama;
2. canlı taksonomi denetimi ve düzeltmeler;
3. sekme animasyon tasarımı.

Ayrı tasarım raporları:

- `yapay-zeka-villa-arama-analizi.md`
- `yapay-zeka-villa-arama-revize-mimari-analizi.md`
- `dasvilla-yapay-zeka-rakip-analizi.md`

---

## 1. Özet

- Hero'daki arama alanında iki sekme var:
  - **Tarihle Ara:** mevcut sistem, hiç değişmedi.
  - **Yapay Zekâ ile Ara:** yeni.
- "Yapay Zekâ ile Ara" pazarlama adıdır. Teknik olarak **ücretsiz, kural tabanlı** bir doğal dil ayrıştırıcısıdır ve TR, EN, DE metni anlar.
- **Harici model, API anahtarı, yeni sunucu ya da yeni uç nokta yoktur.** Ayrıştırma tarayıcıda yapılır; kullanıcının metni hiçbir yere gönderilmez ve kaydedilmez.
- **Sözlük canlı veriden kurulur.** Mevcut `GET /api/public/taxonomies` cevabı (bölgeler, villa tipleri, villa özellikleri ve EN/DE adları) zod ile doğrulanıp kullanılır. Admin panelinde eklenen yeni bir kayıt, koda dokunmadan tanınır.
- **Akış:** metin → "Bulunan kriterler" kartı (düzenlenebilir) → kullanıcı onayı → **mevcut** `buildHeroSearchParams` → **mevcut** `/arama` sayfası. Yeni bir sonuç sayfası, ikinci bir arama motoru ya da ikinci bir URL kurucu yoktur.
- **Emin olunmayan durumlarda otomatik seçim yapılmaz:** kullanıcıdan seçim istenir. Desteklenmeyen ve anlaşılamayan ifadeler kartta açıkça listelenir.

---

## 2. Kullanıcı akışı

1. **Sekme.** Kullanıcı Hero'da "Yapay Zekâ ile Ara" sekmesine geçer.
   - Tarihle Ara paneli gizlenir ama **unmount edilmez**; seçimleri korunur.
   - AI paneli ilk kez açılırken ayrı bir chunk olarak yüklenir.
2. **Metin.** Kullanıcı serbest metin yazar ya da örnek bir cümleye tıklar.
3. **Sözlük.** Mevcut taksonomi uç noktasından bir kez alınır ve zod ile doğrulanır.
4. **Ayrıştırma.** `parseNaturalQuery` metni tarayıcıda ayrıştırır; sonuç zod ile doğrulanır.
5. **"Bulunan kriterler" kartı.** Kart şunları gösterir:
   - **Bölgeler:** VEYA (OR) mantığı; ekleme ve kaldırma yapılabilir.
   - **Kişi sayısı:** düzenlenebilir.
   - **Tarihler:** iki tarih alanı; uydurma tarih yoktur.
   - **Villa tipi:** tek seçim, çünkü `/arama` tiplerde VE (AND) mantığı kullanır.
   - **Özellikler:** VE mantığı; ekleme ve kaldırma yapılabilir.
   - **Seçim gerektiren belirsizlikler.** Seçim yapılmadan arama düğmesi pasif kalır.
   - **Yazım önerileri.** Yalnızca tıklanırsa eklenir.
   - **"Bulunamayan kriterler":** tarih sorunu, desteklenmeyen istekler, anlaşılamayan kelimeler.
   - **Hiç kriter yoksa:** "Tarihle Ara'ya geç" önerisi.
6. **Onay.** "Bu kriterlerle ara" → `buildAiSearchHref` → `buildHeroSearchParams` + `localeHref` → `router.push`.

Bu son adım, Tarihle Ara panelindeki `handleSearch`'ün yaptığıyla birebir aynıdır.

---

## 3. Dosya mimarisi

### 3.1 Yeni dosyalar (14)

| Katman | Dosya | Satır | Görev |
|---|---|---|---|
| Ayrıştırıcı (saf) | `lib/ai-search/tokenize.ts` | 153 | Normalizasyon ve tokenizer: TR harf katlama, `ß→ss`, kesme işaretli ek, sayı ve tarih token'ları |
| | `lib/ai-search/lexicon.ts` | 468 | TR/EN/DE sözlük (yalnız veri) |
| | `lib/ai-search/vocabulary.ts` | 260 | Canlı taksonomiden eşleştirme sözlüğü; ek, kök ve çoğul toleransı |
| | `lib/ai-search/parse.ts` | 720 | `parseNaturalQuery`: deterministik ayrıştırma |
| | `lib/ai-search/schema.ts` | 145 | Zod şemaları: taksonomi cevabı, ayrıştırma sonucu, onaylanan kriterler |
| Arayüz | `app/components/ui/hero/_components/HeroSearchModes.tsx` | 240 | Sekmeler, premium AI sekmesi tasarımı ve AI panelinin geç yüklenmesi |
| | `app/components/ui/hero/_components/HeroAiSearch.tsx` | 602 | Giriş, örnekler, kriter kartı, düzenleme, onay |
| Entegrasyon (saf) | `app/components/ui/hero/_helpers/build-ai-search-query.ts` | 61 | Onaylanan kriterler → mevcut `buildHeroSearchParams` → `localeHref` |
| Test | `tests/unit/ai-search-parser.test.ts` | 466 | 119 test |
| | `tests/unit/ai-search-live-taxonomy.test.ts` | 311 | 75 test (canlı adlarla) |
| | `tests/unit/ai-search-url.test.ts` | 206 | 14 test |
| | `tests/unit/hero-ai-search-ui.test.tsx` | 198 | 11 test |
| | `tests/unit/ai-search-fixtures.ts` | 39 | Küçük test taksonomisi |
| | `tests/unit/ai-search-live-fixture.ts` | 722 | Canlı `/api/public/taxonomies` adları ve slug'ları. Kimlikler sentetik. |

### 3.2 Değiştirilen dosyalar (7; git: +301 / −5)

| Dosya | Değişiklik |
|---|---|
| `app/components/ui/Hero.tsx` | 1 import. Mevcut `<HeroSearchPanel locale={locale} />` satırı aynen duruyor; yalnız `<HeroSearchModes locale={locale}>…</HeroSearchModes>` ile sarıldı. |
| `lib/i18n/dictionaries/types.ts`, `tr.ts`, `en.ts`, `de.ts` | `home.aiSearch` bloğu, 70 anahtar. Eklemeli; mevcut anahtarlar değişmedi. |
| `package.json`, `package-lock.json` | `zod@^4.4.3` `dependencies`'e taşındı. Paket zaten `node_modules`'ta 4.4.3 olarak vardı; yeni paket indirilmedi. |

### 3.3 Dokunulmayan dosyalar (git ile doğrulandı)

- **Arama paneli:** `HeroSearchPanel.tsx`, `build-search-params.ts`, `format-date.ts`, `date-label.ts`, `hero-filters.action.ts`, `hero-features.action.ts`.
- **Arama sayfası:** `AramaPageBody.tsx`, `app/(public)/[lang]/(site)/arama/page.tsx`, `FilterSidebar.tsx`.
- **Veri, fiyat ve müsaitlik:** `villa.repository.server.ts`, `price.engine.ts`, `availability.helper.ts`, `stay-rules.helper.ts`.
- **Diğer:** `VillaCard.tsx`, `api/public/taxonomies/route.ts`, `rate-limit.ts`, `locale-href.ts`, `route-registry.ts`, `proxy.ts`, `next.config.ts`, `.env*`.
- Migration ve veritabanı değişikliği yok.

---

## 4. Mevcut arama sistemiyle entegrasyon

| Konu | Uygulama |
|---|---|
| Hero'ya ekleme | `Hero.tsx` (server) paneli `children` olarak `HeroSearchModes`'a verir. Panelin kökündeki `mt-12 md:mt-16`, dosyaya dokunulmadan sarmalayıcıdaki `[&>.hero-panel-in]:!mt-0` ile sekme çubuğuna taşındı. |
| Sözlük kaynağı | Mevcut `GET /api/public/taxonomies` (teklif formunun da kullandığı uç nokta). `name_by_locale` yalnız çok dillilik açıkken dolar; kapalıysa EN/DE için kavram eş anlamlıları devreye girer. |
| URL üretimi | `buildAiSearchQuery` → **mevcut** `buildHeroSearchParams`. Kaynakta `URLSearchParams` ya da `.set("bolgeler"…)` yok (testle kilitli). |
| Parametreler | `villa-turleri` (Türkçe teknik slug, ör. `muhafazakar-villalar`; slug yoksa UUID) · `bolgeler` (slug ya da UUID; virgül `%2C`) · `start` / `end` (`YYYY-MM-DD`) · `guests` (0 ise yazılmaz) · `ozellikler` (UUID) |
| Dil yolları | `localeHref('/arama?…')`: TR `/arama`, EN `/en/search`, DE `/de/suche`. Kaynak `route-registry.ts`; Tarihle Ara ile aynı çağrı. |
| `/arama` mantığı | Bölgeler VEYA (grup kökü alt bölgeleri kapsar), tipler VE, özellikler VE. AI bu mantığa uyar: birden fazla tip otomatik gönderilmez. |
| Tarih doğrulaması | `/arama`'nınki değişmedi. Takvim kontrolü AI tarafında ayrıca yapılıyor; `/arama` yalnız biçime bakıyor. |
| Minimum konaklama | `/arama` bugün de uygulamıyor (rezervasyon adımı uyguluyor). Arama davranışı değiştirilmedi; istek kartta "filtre yok" olarak gösteriliyor. |

---

## 5. Ayrıştırma kuralları

**Girdi** en çok 300 karakter. **Çıktı** zod ile doğrulanan `ParseResult`:

- bulunan kriterler: `regions`, `types`, `features`, `guests`, `guestBreakdown`, `start`, `end`;
- kullanıcıya gösterilecek notlar: `dateIssue`, `choices`, `unsupported`, `unknown`, `suggestions`;
- `nothingParsed`.

Adımlar sırayla çalışır; her adım kullandığı kelimeleri işaretler, sonraki adım onları tekrar kullanamaz.

1. **Normalizasyon (`tokenize.ts`)**
   - Mevcut `normalizeSearchText` kullanılır: TR katlama (`ç ğ ı İ ö ş ü`), aksan silme, küçük harf. Ek olarak `ß→ss`.
   - Kesme işaretinden sonraki ek ayrılır ve eşleştirmede yalnız taban kullanılır: "Kaş'ta" → `kas`, "Children's" → `children`. Bu kural sözlük tarafında da aynıdır.
   - Bitişik yazım ayrılır ("6kişilik" → `6 kisilik`). Kelime arasındaki tire atılır ("pet-friendly" → `pet friendly`); sayılar arasındaki tire tarih aralığı için kalır.
2. **Sayılı desteklenmeyen kalıplar.** Filtreye **dönüşmez**, raporlanır:
   - minimum konaklama ("en az 5 gece", "minimum 7 nights", "mindestens 5 Nächte");
   - bütçe (sayı + TL/€/$/EUR…, "altı / under / unter");
   - mesafe ("denize 500 m", "200 m to the beach");
   - yatak odası ("3 yatak odalı", "3 bedrooms", "3 Schlafzimmer").
3. **Tarih.**
   - Desteklenen biçimler:
     - "2-8 Ağustos", "2 Ağustos - 8 Ağustos", "2 Ağustos'tan 8 Ağustos'a";
     - "28 Temmuz - 3 Ağustos", "August 2-8", "July 28 to August 3";
     - "vom 2. bis 8. August", "2.–8. August";
     - `02.08.2027`, ISO, "12.06.";
     - "2 Ağustos'tan itibaren 5 gece".
   - Yıl yoksa bugünden (Europe/Istanbul) sonraki ilk uygun yıl seçilir; Aralık–Ocak geçişi desteklenir.
   - **Tarih uydurulmaz.** Şu durumlarda tarih boş kalır ve kullanıcıya açıklama gösterilir:
     - yalnız ay;
     - tek tarih;
     - göreli ifade ("hafta sonu", "next week", "nächste Woche");
     - yalnız gece sayısı;
     - EN'de belirsiz `02/08/2027`;
     - birden fazla tarih;
     - geçersiz takvim tarihi (30 Şubat, 31 Nisan);
     - ters aralık;
     - geçmiş tarih;
     - 60 geceden uzun aralık.
4. **Kişi sayısı.**
   - Rakam ya da sayı kelimesi + birim: "6 kişilik", "altı kişi", "for 6 people", "6 guests", "für 6 Personen", "zwei Erwachsene".
   - Birimsiz kalıp: "for 6" / "für 6". Gece, ay ya da para birimi önündeyse kişi sayısı sayılmaz.
   - Yetişkin + çocuk + bebek toplanır, kırılım kartta not edilir.
   - Çelişen sayılarda seçim istenir; 1–50 dışı değerler reddedilir.
5. **Taksonomi eşleştirme (en uzun ifade kazanır).**
   - **Girdi türleri:**
     - gerçek kayıt adları ve çekirdekleri;
     - kavram eş anlamlıları;
     - desteklenmeyen ifadeler.
   - **Kayıt tamamen bir rakama inerse** ("2027 Kiralık Villalar" → `2027`), rakam tek başına eşleşmez; bir villa kelimesiyle birlikte aranır ("2027 villaları", "Ferienvillen 2027"). Böylece tarihteki yıl villa tipine dönüşmez.
   - **Kelime toleransları:**
     - TR çekim ekleri ("jakuzili", "Fethiye'de", "kalkanda");
     - kök eşleşmesi ("manzarası" ↔ "manzaralı");
     - Almanca sıfat ekleri ("privatem");
     - EN tekil–çoğul ("area" ↔ "areas"; yalnız -s/-es, çünkü TR'de -n eki "kişi" ↔ "kışın" gibi yanlış eşleşme üretir).
     - 4 harften kısa adlar ("Kaş") yalnız yer ekleriyle eşleşir; "kasım" Kaş'a gitmez.
   - **Aynı uzunlukta birebir eşleşme, toleranslı eşleşmeye tercih edilir** ("Heated Indoor Pool" özelliği ≠ "…Pools" tipi).
   - **Çakışma kararları:**
     - tek kayıt → seçilir;
     - aynı ifade bir tipe ve bir özelliğe uyuyorsa → seçim istenir;
     - birden fazla bölge eşleşirse → tek grup kökü varsa o seçilir, yoksa seçim istenir;
     - birden fazla villa tipi bulunursa → VE mantığı nedeniyle seçim istenir.
   - **Zayıf eşleşmeler** (yaygın kelime olan alt bölge adları) otomatik seçilmez; "anlaşılamayan" + öneri olarak döner.
   - Kavram canlıda karşılıksızsa "sistemde bu filtre yok" diye raporlanır; başka bir filtreye **çevrilmez.**
6. **Kalanlar.**
   - Dolgu kelimesi olmayan her kelime "anlaşılamayan" olarak listelenir.
   - Yazım önerisi koşulları: ilk harf aynı olmalı; 8+ harfte en çok 2, daha kısa kelimede en çok 1 harf farkı ("Fethye" → Fethiye; "Kalamar" → Dalaman **önerilmez**). Öneriler yalnız tıklanırsa uygulanır.

---

## 6. TR / EN / DE sözlük yapısı (`lib/ai-search/lexicon.ts`)

| Bölüm | İçerik | Kullanım |
|---|---|---|
| `CONCEPTS` | Kavram anahtarı · `db` (canlı kayıt adında aranacak çekirdek adlar) · `phrases` (TR/EN/DE ifadeler) | Kavram yalnız canlıda adı birebir örtüşen kayıtlara bağlanır |
| `UNSUPPORTED_PHRASES` | Bütçe, minimum konaklama, genel "havuz", yatak odası kelimeleri | Raporlanır, filtre üretmez |
| `MONTHS` · `RANGE_WORDS` · `DATE_FILLERS` · `RELATIVE_DATE_PHRASES` · `NIGHT_UNITS` | Ay adları ve kısaltmaları; aralık ayırıcıları (bis, to, ile…); dolgu; göreli tarih; gece birimi | Tarih ayrıştırma |
| `GUEST_UNITS` · `FOR_WORDS` · `NUMBER_WORDS` | Kişi, yetişkin, çocuk, bebek birimleri; "for / für"; 1–20 sayı kelimeleri | Kişi sayısı |
| `CURRENCY_WORDS` · `BUDGET_QUALIFIERS` · `DISTANCE_UNITS` · `ROOM_UNITS` | Para, mesafe ve oda birimleri | Sayılı desteklenmeyen kalıplar |
| `STOPWORDS` · `NUMBER_SUFFIX_FRAGMENTS` | Üç dilde dolgu kelimeleri; rakama bitişik TR ekleri | "Anlaşılamayan" listesinin gürültüsüz olması |
| `VILLA_WORDS` · `RENT_WORDS` · `LINK_WORDS` | villa, villalar, Villen…; kiralık, for rent…; with, mit, für… | Kayıt adlarından çekirdek ve varyant üretimi |
| `GENERIC_PLACE_WORDS` | merkez, center, Zentrum | Tek başına bölge sayılmaz |
| `WEAK_PLACE_WORDS` | yalı, çiftlik, kasaba, ordu, çalış | Alt bölge adı ama yaygın kelime: yalnız öneri olur |

**Kavramlar ve TR / EN / DE ifadeleri** (her biri **yalnız canlıda karşılığı varsa** filtre olur):

| Kavram | TR | EN | DE |
|---|---|---|---|
| jacuzzi | jakuzi, jakuzili | jacuzzi, hot tub, whirlpool | Whirlpool, Jacuzzi |
| secluded_pool | korunaklı havuz(lu) | secluded / sheltered pool | geschützter, sichtgeschützter Pool |
| private_pool | özel havuz(lu) | private pool, own pool | privater / eigener Pool |
| shared_pool | ortak havuz | shared / communal pool | Gemeinschaftspool |
| indoor_pool | kapalı havuz(lu) | indoor pool | Innenpool, Hallenbad |
| heated_pool | ısıtmalı havuz, havuz ısıtma | heated pool | beheizter Pool, Poolheizung |
| child_pool | çocuk havuzu / havuzlu | kids / children's pool | Kinderbecken, Kinderpool |
| infinity_pool | sonsuzluk havuzu | infinity pool | Infinity Pool |
| play_area | çocuk oyun alanı, oyun alanı | (children's) play area, playground | Kinderspielplatz, Spielplatz |
| cinema | sinema odası / odalı, ev sineması | cinema room, home cinema | Kinoraum, Heimkino |
| sauna · hammam | sauna · hamam, Türk hamamı | sauna · Turkish bath | Sauna · türkisches Bad |
| sea_view · nature_view | deniz / doğa manzarası, manzaralı | sea / nature view | Meerblick, Naturblick |
| near_sea | denize sıfır / yakın | near the sea / beach, beachfront | strandnah, am Meer |
| honeymoon · conservative · luxury | balayı · muhafazakâr · lüks | honeymoon · conservative · luxury | Flitterwochen · konservativ · Luxus |
| child_friendly | çocuk dostu, aileye uygun | child / family friendly | kinderfreundlich |
| pet_friendly | evcil hayvan(lı), … kabul eden, … izinli, köpekli | pet friendly, pets allowed | haustierfreundlich, Haustiere erlaubt, mit Hund |
| garden · bbq · fireplace · gym | bahçe · mangal / barbekü · şömine · spor salonu | garden · BBQ · fireplace · gym | Garten · Grill · Kamin · Fitness |

**Bilerek ayrı tutulan kavramlar** (testlerle kilitli; biri ötekine dönüşmez):

- özel havuz ≠ korunaklı havuz ≠ muhafazakâr;
- denize yakın ≠ deniz manzarası;
- çocuk dostu ≠ çocuk havuzu.

---

## 7. Canlı taksonomi eşleştirmeleri

**Kaynak:** `https://tatilinyeri.com/api/public/taxonomies` (herkese açık GET, 6 Kasım 2026): 67 bölge, 15 villa tipi, 22 özellik. Adlar `tests/unit/ai-search-live-fixture.ts` dosyasında birebir duruyor; canlı DB'ye bağlanılmadı.

| Ölçüt | İlk sürüm | Nihai |
|---|---|---|
| Tip ve özellik adlarının (TR/EN/DE) kendi kaydına ulaşması | 102 / 106 | **106 / 106** |
| Bölgelerin kısa adıyla tanınması | 8 / 67 | **55 / 67 otomatik.** Kalan 12: 7 × "Merkez" (bilinçli olarak eşleşmez) + 5 yaygın kelime (öneri olur) |

**Önemli eşleşmeler:**

| İfade | Sonuç |
|---|---|
| Ölüdeniz / Göcek / Hisarönü / Kayaköy / İslamlar / Kalamar | Kendi alt bölge kaydı (ör. `bolgeler=oludeniz`); etiket "Fethiye / Ölüdeniz" |
| Üzümlü | Kalkan / Üzümlü ile Fethiye / Üzümlü arasında seçim; "Kalkan Üzümlü" doğrudan |
| Yalı, Çiftlik | Yalnız öneri ("Patara / Yalı ekle"); "Patara Yalı" doğrudan |
| Merkez | Eşleşmez; "Kaş merkez" → Kaş / Merkez |
| kapalı havuzlu, ısıtmalı havuz, indoor pool, heated pool, beheizter Pool, Innenpool | "Kapalı Havuzu Isıtmalı" (özellik) ile "Kapalı Havuzlu Isıtmalı Villalar" (tip) arasında seçim. Canlıda kapalı havuz yalnız ısıtmalı olarak var. |
| kapalı havuzu ısıtmalı, Heated Indoor Pool, beheizter Innenpool | Doğrudan özellik |
| kapalı havuzlu ısıtmalı villa, villas with heated indoor pools | Doğrudan tip |
| evcil hayvan kabul eden, evcil hayvanlı, pet friendly, pets allowed, haustierfreundlich, Haustiere erlaubt, mit Hund | "Evcil Hayvan İzinli" tipi (`villa-turleri=evcil-hayvan-izinli`) |
| 2027 kiralık villalar, 2027 villaları, 2027 villas (for rent), Ferienvillen 2027 | "2027 Kiralık Villalar" tipi; tarihteki 2027 dönüşmez |
| Villas with Children's Play Areas | Tip |
| çocuk oyun alanı, children's play area, Kinderspielplatz | Özellik ile tip arasında seçim |
| sinema odalı, cinema room, Kinoraum, Heimkino | "Sinema Odası" özelliği |
| jakuzili / çift jakuzili | "Jakuzi" / "Çift Jakuzi" (ayrı kayıtlar) |
| korunaklı havuz, secluded pool, Blickgeschützter Pool | "Korunaklı Havuz" özelliği |
| muhafazakâr, conservative, konservative | "Muhafazakar Villalar" tipi (canlı EN adı: "Private Villas") |
| private pool, privater / privatem Pool, özel havuzlu | "Sistemde bu filtre yok" |
| denize sıfır / yakın | "Sistemde bu filtre yok" (canlıda karşılığı yok; "Deniz Manzaralı"ya çevrilmez) |

---

## 8. Desteklenmeyen kriterler

| Kriter | Örnek | Kullanıcıya gösterilen |
|---|---|---|
| Yatak odası | 3 yatak odalı · 3 bedrooms · 3 Schlafzimmer | Yatak odası sayısına göre filtreleme yok |
| Bütçe | gecesi 10.000 TL altı · cheap · bis 400 Euro | Fiyat aralığı filtresi yok; fiyata göre sıralanabilir |
| Mesafe | denize 500 metre · 200 m to the beach | Mesafe filtresi yok |
| Genel havuz | havuzlu · pool | Havuz varlığı ya da tipi için ayrı filtre yok |
| Minimum konaklama | en az 5 gece · Mindestaufenthalt | Filtre yok; rezervasyonda kontrol edilir |
| Canlıda karşılığı olmayan kavram | özel havuz · denize yakın · çocuk dostu | Sistemimizde bu kritere karşılık gelen bir filtre yok |

Canlıda "Ekonomik Villalar" (EN "Budget Villas") tipi olduğu için **"ekonomik villa" ve "budget villa" bu tipe gider.** "ucuz" ve "cheap" ise bütçe isteği olarak raporlanır.

---

## 9. Arayüz ve animasyon tasarımı

**"Tarihle Ara" sekmesi** eski görünümündedir (`tabClass`, değişmedi): aktifken beyaz, pasifken cam görünümlü.

**"Yapay Zekâ ile Ara" sekmesi** — premium görünüm, yalnız görsel değişiklik. Katmanlar dıştan içe:

| Katman | Tasarım | Pasif | Aktif |
|---|---|---|---|
| Glow | Bulanık gradient hâle; parlayıp söner (`heroAiBreathe`, 3,8 s ease-in-out) | Opaklık 0,28 ↔ 0,55 | 0,60 ↔ 0,95 |
| Çerçeve | 1,5 px gradient: turuncu `#ED7926`, altın `#F7B267`, mavi `#0973BA`, açık mavi `#7FA8FF`; sürekli akar (`heroAiFlow`, linear, kesintisiz döngü) | 8 s | 5 s |
| İç yüzey | Hap biçimli yüzey | Koyu lacivert cam (`#0b1b3a`/70, blur), beyaz yazı | Beyaz zemin, okunurluk için koyulaştırılmış akan gradient yazı |
| Işık şeridi | İnce, eğik beyaz şerit; döngünün ilk %40'ında geçer, sonra bekler (`heroAiShimmer`, 6,5 s) | Görünür | Beyaz zeminde neredeyse görünmez |
| İkon | Lucide `Sparkles`; hafif büyüme ve dönme (`heroAiTwinkle`, 3,2 s) + arkasında yumuşak altın hâle (`heroAiIconGlow`) | ✓ | ✓ |

**Teknik:**

- Tailwind sınıfları + bileşen içi `<style>` keyframe'leri. Bu, `HeroSearchPanel`'in kullandığı yaklaşımla aynıdır; `globals.css`'e dokunulmadı.
- Ek bağımlılık yok.
- Hover'da 1 px yükselme.
- `focus-visible` halkası.
- `role="tab"`, `aria-selected`, ok tuşlarıyla gezinme.

**`prefers-reduced-motion`:** bütün animasyonlar durur, ışık şeridi gizlenir ve glow sabit kalır. Tarayıcıda doğrulandı: hesaplanan `animation-name: none`.

**Mobil:** iki sekme eşit genişlikte (`flex-1`); masaüstünde içeriğe göre.

**Performans:** AI paneli ayrı chunk olarak yüklenir (`4096.*.js`: 46,1 KB, gzip 15,3 KB). Ayrıştırıcı ana sayfa chunk'ında yok; sekmeye niyet edilince (hover, focus, click) indirilir.

---

## 10. Test sonuçları

**Yeni testler (219):**

| Dosya | Test | Kapsam |
|---|---|---|
| `ai-search-parser.test.ts` | 119 | TR/EN/DE örnekleri; bölge, kişi, villa tipi, özellik; çoklu kriter; tarih; geçersiz ve belirsiz tarih; desteklenmeyen kriter; çoklu tip; korunaklı havuz ≠ muhafazakâr; boş sorgu; determinizm; zod |
| `ai-search-live-taxonomy.test.ts` | 75 | Canlı adlar: alt bölgeler, "Üzümlü" ve "Merkez" kuralları, zayıf adlar, yanlış "Dalaman" önerisinin olmaması; kapalı/ısıtmalı havuz; evcil hayvan; 2027 tipi; oyun alanı; sinema; 106/106 ad; özel / korunaklı / muhafazakâr ayrımı; seçeneklerin yalnız canlı kayıtlardan gelmesi |
| `ai-search-url.test.ts` | 14 | `buildHeroSearchParams` ile birebir çıktı; `/arama` çözümleme kurallarıyla gidiş-dönüş; `localeHref`; kaynak kilitleri (ikinci URL kurucu yok, harici API / env / DB yok) |
| `hero-ai-search-ui.test.tsx` | 11 | Sekmeler; Tarihle Ara state'inin korunması; önce onay; düzenleme; çoklu tip; boş sorgu; EN arayüz; metnin ağa gönderilmemesi |

**Tüm unit test paketi** (cihazdaki repoda):

- 284 dosya: **5 723 test geçti, 11 atlandı** (önceden de atlanıyordu), **0 hata.**
- Veritabanı gerektiren `tests/integration/*` testleri önceki çalışmalarda olduğu gibi çalıştırılmadı.

**Statik kontroller ve build:**

| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit` | EXIT 0 |
| `eslint .` | 0 hata, 194 uyarı. Önceki ölçümle aynı; yeni dosyalarda uyarı yok. |
| `next build --webpack` | EXIT 0: Compiled 34 s, TypeScript tamam, 49/49 statik sayfa |

Build repo dışındaki kopyada, `.env` olmadan yapıldı; Google Fonts'a erişilemediği için font taklidi kullanıldı. Cihazdaki çalışma ortamının diski dolduğu için repo dışındaki eski build çıktısı silindi; repoya etkisi yok.

**Tarayıcıda uçtan uca doğrulama** (bulut ortamında production build + canlı adlarla doldurulmuş geçici bir veritabanı; canlı DB'ye bağlanılmadı):

- **TR / EN / DE, masaüstü ve mobil** (6 senaryo):
  - onaydan önce yönlendirme yok;
  - adresler `/arama?…`, `/en/search?…`, `/de/suche?…` beklenen parametrelerle birebir;
  - hedef sayfa doğru dilde açılıyor;
  - site dışına istek yok.
- **Eski tip adresler:** `/en/arama` ve `/de/arama` 308 ile `/en/search` ve `/de/suche`'ye yönleniyor.
- **Tarihle Ara state'i:** kişi sayısı ve "esnek tarih" seçimi sekme geçişinden sonra korunuyor.
- **Animasyonlar:** masaüstü ve mobilde çalışıyor; `prefers-reduced-motion` açıkken hepsi duruyor.

---

## 11. Taşınabilirlik: başka villa kiralama sitelerine aktarım

### 11.1 Taşınabilir (genel çekirdek)

Bu parçalar siteye bağlı değil; başka bir villa kiralama sitesine doğrudan ya da küçük uyarlamayla taşınabilir:

| Parça | Neden taşınabilir |
|---|---|
| `lib/ai-search/tokenize.ts` | Dil normalizasyonu ve token'lama; yalnız `normalizeSearchText`'e (küçük, saf fonksiyon) bağlı |
| `lib/ai-search/parse.ts` | Ayrıştırma motoru: tarih, kişi, en uzun eşleşme, belirsizlik ve öneri kuralları. Site verisini yalnız `Vocabulary` üzerinden görür |
| `lib/ai-search/vocabulary.ts` | Taksonomiden sözlük kurma. Girdi `{locations, types, features}` biçiminde olduğu sürece genel |
| `lib/ai-search/schema.ts` | `ParseResult`, `ConfirmedCriteria` ve taksonomi şeması |
| `lexicon.ts` — dile ait kısımlar | Ay adları, aralık ve dolgu kelimeleri, göreli tarih, gece ve kişi birimleri, sayı kelimeleri, para / mesafe / oda birimleri, `STOPWORDS`, `VILLA_WORDS`, `RENT_WORDS`, `LINK_WORDS`, desteklenmeyen kriter ifadeleri (TR/EN/DE) |
| `lexicon.ts` — genel kavramlar | Jakuzi, sauna, hamam, korunaklı / özel / ortak / kapalı / ısıtmalı / çocuk / sonsuzluk havuzu, manzara, denize yakın, balayı, evcil hayvan, oyun alanı, sinema… Kavram yalnız hedef sitede karşılığı varsa bağlanır, yoksa "filtre yok" der; bu yüzden güvenle taşınır |
| Kriter kartı akışı | Onay, düzenleme, belirsizlikte seçim, desteklenmeyen ve anlaşılamayan ifadeler, uydurmama ilkeleri |
| Testlerin yapısı | Parser ve canlı taksonomi testlerinin kalıbı. Fixture'lar hedef sitenin adlarıyla değiştirilir |

**Taşıma için gerekenler:**

1. Hedef sitenin taksonomisini `TaxonomyResponseSchema` biçimine çeviren küçük bir adaptör.
2. Hedef sitenin URL kurucusunu çağıran bir `build…Query` eşleniği.
3. Arayüz metinleri.
4. Hedef sitenin kayıt adlarına göre kavramların `db` listelerinin gözden geçirilmesi.

### 11.2 Siteye özel kalması gerekenler

| Parça | Neden siteye özel |
|---|---|
| `app/components/ui/hero/_helpers/build-ai-search-query.ts` | Tatilinyeri'nin `buildHeroSearchParams`'ına, `/arama` parametre adlarına (`villa-turleri`, `bolgeler`, `ozellikler`…) ve `localeHref` dil yollarına bağlı |
| `HeroSearchModes.tsx` | Hero yerleşimi, `.hero-panel-in` boşluk düzeltmesi, marka renkleri (`#ED7926`, `#0973BA`) ve animasyon tasarımı |
| `HeroAiSearch.tsx` | Tatilinyeri'nin Tailwind görünümü, `/teklif-al` bağlantısı, `/api/public/taxonomies` uç noktası, `todayIstanbulYmd` saat dilimi |
| `Hero.tsx` sarmalayıcısı · `home.aiSearch` sözlük metinleri | Site arayüzü ve metinleri (örnek cümlelerde Kalkan, Kaş, Fethiye) |
| `/arama` semantiğine bağlı kurallar | Tiplerde VE (çoklu tipte seçim), bölgelerde VEYA, grup kökü genişlemesi (`filter_group_name`), "Bölge / Alt bölge" ad biçimi |
| Canlı veriye göre ayarlanmış listeler | `GENERIC_PLACE_WORDS` ("Merkez"), `WEAK_PLACE_WORDS` (Yalı, Çiftlik, Kasaba, Ordu, Çalış), kavramlardaki canlı adlara özgü `db` girdileri ("kapalı havuzu ısıtmalı", "evcil hayvan izinli", "çocuk oyun alanlı", "sinema odalı") |
| `tests/unit/ai-search-live-fixture.ts` | Tatilinyeri'nin 6 Kasım 2026 tarihli canlı adları |
| Desteklenmeyen kriter listesi | Bu sitenin `/arama`'sında olmayan filtrelere göre (yatak odası, bütçe, mesafe, minimum konaklama). Başka bir sitede bu filtreler varsa doğrudan eşlenmelidir |

---

## 12. Kararlar ve bilinen sınırlar

1. **Özel havuz ayrı bir kavram.** Canlıda "Özel Havuz" filtresi yok; "private pool / privater Pool / özel havuzlu" raporlanır. Korunaklı havuza ya da muhafazakâr tipe çevrilmez.
2. **Aynı şeyi anlatan tip + özellik çiftleri seçim istiyor:** kapalı ve ısıtmalı havuz, çocuk oyun alanı. Bunlar canlıda iki ayrı gerçek filtre ve sonuçları farklı olabilir. Otomatik tercih istenirse kural tek satırla eklenebilir; bu bir iş kararı.
3. **Canlı EN adı.** Muhafazakar Villalar'ın İngilizce adı "Private Villas". "conservative villa" doğru tipe gidiyor ama kartta "Private Villas" yazıyor. Değiştirmek admin panelinden bir çeviri düzeltmesidir; kod gerekmez.
4. **Yaygın kelime olan alt bölgeler** (Yalı, Çiftlik, Kasaba, Ordu, Çalış) otomatik seçilmez, öneri olarak sunulur. **"Merkez"** tek başına eşleşmez.
5. **Minimum konaklama** `/arama`'da uygulanmıyor (Tarihle Ara için de geçerli); bu çalışmada değiştirilmedi.
6. **Açma / kapama bayrağı yok** (env değişikliği istenmedi). Geri almak için `Hero.tsx`'teki sarmalayıcıyı kaldırmak yeterli.
7. **Dil yolları.** Revize mimari analizdeki "`/en/search` yanlış" ifadesi hatalıydı; doğrusu `/en/search` ve `/de/suche`. O rapordaki ilgili satırlar düzeltildi.
8. **Staging kontrolü önerisi.** Görsel ve uçtan uca kontroller geçici bir veritabanıyla yapıldı. Canlı içerik ve görsellerle staging'de son bir göz kontrolü önerilir.

---

## 13. İşlem beyanı

- Canlı DB, rezervasyon, fiyat ve müsaitlik kayıtlarına dokunulmadı.
- Migration oluşturulmadı ya da çalıştırılmadı; `.env*` dosyaları değiştirilmedi.
- Harici AI / model servisi ya da yeni API eklenmedi.
- Canlı taksonomi adları yalnız herkese açık `GET /api/public/taxonomies` ile okundu.
- Commit, push ve deploy **yok.**
- Repo durumu: 7 değiştirilmiş + 14 yeni kod ve test dosyası (çalışma ağacında, commit edilmemiş).
