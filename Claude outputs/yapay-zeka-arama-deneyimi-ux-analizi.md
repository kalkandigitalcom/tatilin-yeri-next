# Tatilinyeri Next — "Yapay Zekâ ile Ara" Deneyimi: Teknik ve UX Analizi

**Tarih:** 6 Kasım 2026 · **Tür:** Yalnız analiz. Kod, veritabanı, env, commit, push ve deploy **yok.**
**Temel:** çalışma ağacındaki nihai uygulama (`main` @ `6d09529` + commit edilmemiş AI arama dosyaları).

**İşaretler:**

- **[D]** Koddan ya da çalıştırılan ölçümden doğrulandı.
- **[Ö]** Öneri.

**Ekran görüntüsü:** Mesajda ekli bir görüntüye ulaşamadım. Değerlendirmeyi, uygulamanın önceki turda masaüstü ve mobilde aldığım kendi görüntüleri üzerinden yaptım: büyük beyaz "Bulunan kriterler" paneli, form satırları, seçim kutuları.

---

## Kısa cevap

- **Önerilen akış: B'yi temel alan "akıllı hibrit".**
  - Ayrıştırma **temiz** ise (belirsizlik yok, kayıp ifade yok) **doğrudan arama** yapılır (A).
  - Değilse büyük panel yerine arama alanının hemen altında **tek satırlık şık bir özet** gösterilir. Belirsizlik varsa satır içinde tek soru sorulur; arama tek dokunuşla başlar (B).
  - Sonuç sayfasında bilgilendirme bandı (C) **opsiyonel bir sonraki adım** olarak kalır.
- **Gerçekçi 44 sorguluk denemede:** sorguların **%45'i** doğrudan aranabilir, **%55'inde** kullanıcıya bir şey söylemek ya da sormak gerekiyor. Bu yüzden saf A riskli, saf C ise bugünkü `/arama`'da eksik kalıyor.
- **Arama motoru değişmez.** `buildHeroSearchParams`, `localeHref`, `/arama`, `/en/search`, `/de/suche` olduğu gibi kullanılır. Değişiklik yalnız `HeroAiSearch.tsx` arayüzünde olur, ayrıca iki küçük ayrıştırıcı iyileştirmesi gerekir (§2.6).
- C seçilirse `/arama`'ya küçük bir **arayüz** bandı eklenmesi gerekir; motor ya da sorgu değişmez.

---

## 1. Mevcut deneyimin değerlendirmesi

| Sorun | Neden |
|---|---|
| Büyük beyaz panel | Hero'nun koyu, sinematik görseli üzerinde ani ve ağır bir beyaz blok açılıyor; görsel hiyerarşiyi bozuyor |
| Form hissi | "Bölge / Kişi sayısı / Tarih / Villa tipi / Özellikler" satırları, seçim kutuları ve tarih alanları klasik bir filtre formu gibi görünüyor. Kullanıcı az önce bu formdan kaçmak için cümle yazdı |
| Her seferinde ekstra adım | Kusursuz anlaşılan bir sorguda bile kart + "Bu kriterlerle ara" tıklaması gerekiyor |
| Mobil | Kart Hero'yu çok uzatıyor. "Bu kriterlerle ara" düğmesi ekranın altına düşüyor (önceki mobil görüntü). Klavye ve kaydırma çakışıyor |
| Bilgi yoğunluğu | Seçim kutusu, öneri, "bulunamayan kriterler" ve gizlilik notu aynı anda görünüyor |

Doğru olanlar korunmalı:

- uydurmama;
- belirsizlikte sorma;
- desteklenmeyeni söyleme;
- mevcut URL hattı.

Sorun **mantıkta değil, sunumda.**

---

## 2. Teknik kontroller

### 2.1 Ayrıştırıcının belirsizlik ve çakışma ürettiği durumlar [D]

`ParseResult.choices` dört nedenle dolar. Seçim yapılmadan aramaya izin verilmez.

| Neden | Ne zaman | Örnek (canlı adlarla) |
|---|---|---|
| `multiple_types` | 2+ villa tipi bulunduğunda | "muhafazakar balayı villası" |
| `ambiguous_match` | Aynı ifade birden fazla kayda uyduğunda: tip + özellik ya da iki özellik | "ısıtmalı havuz", "kapalı havuzlu", "çocuk oyun alanı", "heated pool", "beheizter Pool" |
| `ambiguous_region` | Aynı ad birden fazla bölgeye uyduğunda ve tek grup kökü yoksa | "Üzümlü" (Kalkan / Fethiye) |
| `conflicting_guests` | Çelişen kişi sayıları olduğunda | "6 kişilik ama 8 kişi de olabiliriz" |

Seçim istemeyen ama **otomatik de uygulanmayan** durumlar:

- **Zayıf eşleşme:** "Yalı", "Çiftlik" gibi yaygın kelime olan bölge adları → `suggestions` + `unknown`.
- **Yazım hatası:** "Fethye" → `suggestions` (öneri).

### 2.2 Birden fazla villa tipi [D]

- `/arama` tipleri **VE (AND)** ile filtreler (`AramaPageBody.tsx`, `typeSet.size === required`).
- Ayrıştırıcı bu yüzden 2+ tipi otomatik göndermez: `types` boşaltılır, `multiple_types` seçimi eklenir. Onay ekranında tek tip seçilir.
- Seçim yapılmadan doğrudan arama yapılırsa iki ihtimal var:
  - iki tip birlikte gönderilir → çoğu zaman **0 sonuç**;
  - hiç tip gönderilmez → **istek kaybolur.**
- Bu yüzden bu durum **her akışta soru gerektirir.**

### 2.3 Hem tip hem özellik eşleşmesi [D]

- `ambiguous_match` üretir; iki seçenek de canlıdaki gerçek kayıtlardır.
- Canlıda örnekler:
  - "Kapalı Havuzu Isıtmalı" (özellik) ↔ "Kapalı Havuzlu Isıtmalı Villalar" (tip);
  - "Çocuk Oyun Alanı" ↔ "Çocuk Oyun Alanlı Villalar".
- Tam ad yazılırsa ("kapalı havuzu ısıtmalı") birebir eşleşme kazanır ve soru sorulmaz.
- **[Ö]** Bu çiftler için bir iş kuralı konursa ("aynı kavramda tip varsa tipi tercih et" ya da tersi) soru ortadan kalkar ve bu sorgular doğrudan aranabilir hâle gelir. Ayrıştırıcıda tek bir kural değişikliği; motor değişmez. Karar ürün tarafının.

### 2.4 Desteklenmeyen kriterler [D]

- `unsupported` listesi: `bedrooms`, `budget`, `sea_distance`, `pool`, `min_stay`, `not_in_system` (+ kavram adı; ör. `private_pool`, `near_sea`).
- Filtreye **asla** dönüşmez. URL'ye girmez, kartta gösterilir.
- Doğrudan aramada bunlar **sessizce kaybolur.** Kullanıcı "denize yakın" yazıp sonuçların buna göre süzüldüğünü sanır. Doğrudan arama yapılmaması gereken en önemli durum budur.

### 2.5 Tarih belirsizliği ve geçersiz tarih [D]

- `dateIssue` olduğunda **tarih URL'ye girmez**; tarih uydurulmaz.
- Olası kodlar: `month_only`, `partial`, `relative`, `nights_only`, `invalid_calendar`, `end_before_start`, `past`, `too_long`, `ambiguous_format`, `multiple`.
- Doğrudan aramada sonuç **tarihsiz** gelir: müsaitlik kontrolü yapılmaz, fiyat "…'den başlayan" olur. Kullanıcı "Ağustos'ta boş villaları" gördüğünü sanır.
- **Bulgu:** tek ve geçersiz bir tarih ("30 Şubat Kalkan") `invalid_calendar` yerine `partial` olarak raporlanıyor. Aralık hâlinde ("30 Şubat - 3 Mart") doğru kod (`invalid_calendar`) dönüyor. Küçük bir iyileştirme. [Ö]

### 2.6 Ölçüm: gerçekçi sorgularda sonuç dağılımı [D]

Canlı taksonomi adlarıyla (fixture) 44 TR/EN/DE sorgu çalıştırıldı:

| Sınıf | Adet | Örnek | Doğrudan arama uygun mu? |
|---|---|---|---|
| **A — Temiz** | 20 (%45) | "12-18 Haziran Kaş'ta 4 kişilik deniz manzaralı villa", "Villa in Kalkan for 6 people", "haustierfreundliche Villa in Göcek" | **Evet** |
| **B — Notlu** (desteklenmeyen ya da anlaşılmayan var) | 8 (%18) | "Kalkan denize yakın villa", "özel havuzlu villa Kaş", "ucuz villa Fethiye", "3 yatak odalı villa Kalkan" | Hayır; önce kısa not gerekir |
| **C — Seçim** | 6 (%14) | "muhafazakar balayı villası", "ısıtmalı havuzlu villa Kalkan", "Üzümlü'de villa" | Hayır; tek soru gerekir |
| **D — Tarih sorunu** | 5 (%11) | "Ağustosta Kalkan'da 6 kişilik villa", "hafta sonu Kaş'ta villa", "5 gece Kalkan" | Hayır; tarih sorulmalı ya da "tarihsiz ara" seçilmeli |
| **E — Kriter yok** | 5 (%11) | "sessiz sakin villa", "Luxusvilla im August", "merhaba" | Hayır; Tarihle Ara ya da örnekler önerilmeli |

**Ek bulgu:** Almanca bileşik kelimeler ("Luxusvilla") ayrılmıyor; "Luxus Villa" tanınıyor, "Luxusvilla" tanınmıyor. Bitişik "-villa / -villen" ekini ayırmak küçük bir tokenizer iyileştirmesi. [Ö]

### 2.7 Onay kaldırılırsa yanlış filtre riski

| Risk | Olasılık | Etki | Önlem |
|---|---|---|---|
| Desteklenmeyen istek sessizce kaybolur ("denize yakın", "özel havuz", "ucuz") | Yüksek (sorguların %18'i) | Kullanıcı yanlış sonuçlara güvenir | Bu sorgular doğrudan aranmaz; tek satırlık not |
| Tarih anlaşılmadan tarihsiz arama | Orta (%11) | Müsaitlik süzülmez | Tarih sorunu varsa satır içi tarih sorusu |
| Belirsiz seçimin otomatik çözülmesi | Ayrıştırıcı bunu zaten yapmıyor | Yanlış tip ya da özellik | Soru zorunlu kalır |
| Birden fazla özellik (VE) ile aşırı daraltma ("jakuzili, saunalı, sinemalı") | Düşük–orta | 0 sonuç | Kabul edilebilir; kullanıcı `/arama` kenar çubuğundan kaldırabilir. Sonuç 0 ise mevcut boş durum ekranı açılır |
| Yanlış tanıma (temiz görünen ama yanlış eşleşme) | Düşük | Yanlış filtre | Kurallar deterministik ve testli. Kalan risk, canlı adlardan kaynaklanan etiket farkı (EN "Private Villas" = Muhafazakâr) |
| Kişi sayısı yorumu ("for 8") | Düşük | `guests >= 8` | Kabul edilebilir; `/arama`'da görünür ve düzenlenebilir |

**Sonuç:**

- **Yalnız A sınıfında onaysız arama güvenli.** Bu sınıfta URL'ye giden her değer kullanıcının yazdığı bir ifadeden birebir çıkmış oluyor ve kaybolan bir istek yok.
- Diğer sınıflarda onay **küçültülmeli**, kaldırılmamalı.

### 2.8 `buildHeroSearchParams` ve dil yolları [D]

- Değişmeden kullanılabilir. AI akışı zaten `buildAiSearchQuery` → `buildHeroSearchParams` → `localeHref('/arama?…', locale)` zincirini kullanıyor. Bu, Tarihle Ara'nın `handleSearch`'ü ile aynı.
- Dil yolları `route-registry.ts`'ten geliyor: `search` → `arama / search / suche`.
- Önceki turda tarayıcıda doğrulandı:
  - TR / EN / DE, masaüstü ve mobil, 6 senaryonun hepsinde adresler beklenen değerlerle birebir eşleşti;
  - `/en/arama` → 308 → `/en/search`.
- Önerilen akışlarda URL hattı **hiç değişmez**; değişen yalnız "ne zaman yönlendirileceği".

### 2.9 `/arama`, `/en/search`, `/de/suche` bu akışları destekliyor mu? [D]

| Akış | Destek |
|---|---|
| A — Doğrudan | **Tam.** Aynı parametreler, aynı sayfa. |
| B — Küçük onay | **Tam.** `/arama` tarafında değişiklik yok. |
| C — Sonuçta bilgilendirme | **Kısmen.** Aşağıda. |

C için bugünkü durum:

- **Sayfanın üst kısmındaki etiketler** yalnız sayı gösteriyor: "2 bölge", "1 tip", "4 kişi" ve tarih. Özellikler bu etiketlerde yok; ad olarak da gösterilmiyor (`AramaPageBody.tsx:1232-1243`).
- **Kenar çubuğu** bütün filtreleri düzenlenebilir hâlde zaten gösteriyor.
- **"Şunları filtreleyemedik"** gibi bir alan yok. Desteklenmeyen istekleri sonuç sayfasında göstermek için `/arama`'ya bir arayüz bileşeni eklemek gerekir.
- **Taşıma yolu:** `buildHeroSearchParams` bilinmeyen parametre yazamıyor (değişmemeli). Kenar çubuğu ve sayfalama da bilinmeyen parametreleri siliyor. Bu bilginin URL yerine `sessionStorage` ile taşınması gerekir.
- **Kapsam:** motor, sorgu, fiyat ve müsaitlik değişmez; ama sonuç sayfası **dosyası** değişir. Bu, "mevcut `/arama`'ya dokunma" kuralıyla çeliştiği için ayrı onay gerektirir.

---

## 3. Üç alternatifin karşılaştırması

| Ölçüt | A — Doğrudan | B — Küçük onay | C — Doğrudan + sonuç bandı | **Önerilen: akıllı hibrit (A + B)** |
|---|---|---|---|---|
| Hız (temiz sorguda) | En hızlı (0 ek dokunuş) | 1 ek dokunuş | En hızlı | **0 ek dokunuş** |
| Yanlış filtre / kayıp ifade riski | **Yüksek** (%55 sorguda bir şey kaybolur ya da yanlış anlaşılır) | Düşük | Orta; kullanıcı bandı görmeyebilir | **Düşük** |
| Belirsizlikte davranış | Ya soru sorulamaz ya da tahmin edilir | Satır içi tek soru | Sonuç sayfasında soru sormak zor (sorgu çoktan çalıştı) | **Satır içi tek soru** |
| "Gerçek AI" hissi | Var ama hatalar güveni bozar | Var, şık "anladım" satırı | Var | **Var: anladığını gösterir, gerekirse tek soru sorar** |
| Form hissi | Yok | Yok (chip'ler) | Yok | **Yok** |
| Mobil | İyi | İyi (tek satır, yatay kayan chip'ler) | İyi | **İyi** |
| `/arama` değişikliği | Yok | Yok | **Var** (arayüz bandı) | **Yok** |
| Motor değişikliği | Yok | Yok | Yok | **Yok** |
| Uygulama eforu | Çok düşük | Düşük–orta | Orta | **Düşük–orta** (yalnız `HeroAiSearch.tsx` + metinler) |

---

## 4. Önerilen akış: akıllı hibrit

### 4.1 Karar ağacı [Ö]

```
"Villa Bul" (veya Enter)
   │
   ├─ Hiç kriter yok (E) ──────────► Satır içi: "Bunu anlayamadım" + 3 örnek chip + "Tarihle Ara'ya geç"
   │
   ├─ Seçim gerekiyor (C) ─────────► Satır içi tek soru: "Hangisi?" [Seçenek 1] [Seçenek 2]
   │                                   └─ seçilince → kalan duruma göre tekrar değerlendirilir
   │
   ├─ Tarih sorunu (D) ────────────► Özet satırı + "Ağustos'ta hangi günler?" [📅 Tarih seç] [Tarihsiz ara]
   │
   ├─ Not var (B: desteklenmeyen / anlaşılmayan / öneri)
   │                               ► Özet satırı + soluk not: "Filtrelenemedi: denize yakınlık"
   │                                 + [Villaları göster →]  (tek dokunuş)
   │
   └─ Temiz (A) ───────────────────► Özet satırı ~0,5 sn belirir (chip'ler sırayla gelir)
                                      ve otomatik olarak /arama'ya gidilir
                                      (reduced-motion: anında gidilir)
```

### 4.2 Doğrudan arama koşulları (hepsi aynı anda)

1. Sözlük yüklü ve en az **bir kriter** var: bölge, tip, özellik, kişi ya da **geçerli** tarih aralığı.
2. `choices` boş: bekleyen belirsizlik yok.
3. `dateIssue` yok: tarih ya hiç yazılmamış ya da geçerli bir aralık olarak anlaşılmış.
4. `unsupported`, `unknown` ve `suggestions` boş: kullanıcının yazdığı hiçbir şey kaybolmuyor.
5. En çok 1 villa tipi (ayrıştırıcı bunu zaten garanti ediyor).

Bu koşullar ölçümde sorguların **%45'ini** kapsıyor.

**[Ö] İsteğe bağlı genişletme:**

- §2.3'teki tip + özellik çiftleri için iş kuralı konursa C sınıfının bir kısmı da doğrudan aranır.
- §2.5 ve §2.6'daki küçük iyileştirmeler yapılırsa kapsam yaklaşık **%55**'e çıkar.

### 4.3 Kullanıcıdan açıklama istenmesi gereken durumlar

| Durum | Ne sorulur / gösterilir | Etkileşim |
|---|---|---|
| Birden fazla villa tipi | "Hangi villa tipiyle arayalım?" | 2–3 seçenek chip'i; tek dokunuş |
| Tip + özellik çakışması | "Isıtmalı kapalı havuz: özellik olarak mı, villa kategorisi olarak mı?" Daha sade metin [Ö]: "Isıtmalı kapalı havuzlu villalar" / "Kapalı havuzu ısıtmalı olanlar" | Tek dokunuş |
| Aynı adlı bölge | "Hangi Üzümlü? Kalkan · Fethiye" | Tek dokunuş |
| Çelişen kişi sayısı | "Kaç kişisiniz? 6 · 8" | Tek dokunuş |
| Yalnız ay / tek tarih / göreli tarih / yalnız gece sayısı | "Hangi tarihler?" + takvim | Takvim ya da "Tarihsiz ara" |
| Geçersiz / geçmiş / ters tarih | "30 Şubat geçerli bir tarih değil" + takvim | Takvim ya da "Tarihsiz ara" |
| Desteklenmeyen kriter | Soru değil, **not**: "Denize yakınlığa göre filtreleyemiyoruz" | "Villaları göster" ile devam |
| Anlaşılmayan kelime / öneri | Not + öneri chip'i: "Fethiye mi demek istediniz? [+ Fethiye]" | İsteğe bağlı tek dokunuş |
| Hiç kriter yok | "Bunu anlayamadım" + örnekler + Tarihle Ara | — |

**Kural:** aynı anda **en fazla bir soru** gösterilir. Birden fazla belirsizlik varsa sırayla sorulur: tip → bölge → kişi → tarih.

---

## 5. Görsel ve etkileşim tasarımı [Ö]

### 5.1 Masaüstü

```
[ ✦ 12-18 Haziran Kaş'ta 4 kişilik deniz manzaralı villa              ] [ Villa Bul → ]

  ✦ Anladığım   📍 Kaş   👥 4 kişi   📅 12–18 Haz   ◈ Deniz manzaralı      Düzenle
  ─────────── (akan ince gradient çizgi, ~0,5 sn) ──────────→ /arama
```

- **Büyük beyaz kart yok.** Özet, giriş alanının altında koyu cam zemin üzerinde **tek satır** (Hero ile aynı dil).
- **Chip'ler:** ikonlu, yarı saydam (`bg-white/12`, ince beyaz çerçeve), beyaz metin. 60 ms arayla belirir (stagger); reduced-motion'da animasyonsuz.
- **"Anladığım" etiketi** sekmedeki gradient ve Sparkles diliyle uyumlu; AI sekmesinin premium dili özete taşınır.
- **Düzenleme:** chip'e dokununca küçük bir popover açılır.
  - Kişi: − / +.
  - Bölge ve tip: kısa liste.
  - Tarih: mini takvim; mevcut `react-datepicker` lazy yüklenebilir, Tarihle Ara paneline dokunulmaz.
  - Her chip'te × ile kaldırma.
  - Form satırı yok.
- **Not satırı** (B sınıfı): soluk tek satır, örneğin `ⓘ Filtrelenemedi: denize yakınlık · özel havuz`.
- **Soru satırı** (C/D sınıfı): `Hangisi?` [Isıtmalı kapalı havuzlu villalar] [Kapalı havuzu ısıtmalı] · [Hiçbiri].
- **Birincil düğme:**
  - A sınıfında gerekmez (otomatik geçiş). İptal etmek isteyen için geçiş sırasında "Düzenle" bağlantısı görünür kalır.
  - B, C ve D sınıflarında "Villaları göster →"; C'de seçim yapılınca aktif olur.
- **Hız:**
  - Sözlük, sekmeye niyet edildiğinde (hover ya da focus) önceden yüklenir. Böylece "Villa Bul" anında yanıt verir; ayrıştırma birkaç ms.
  - Sahte "düşünüyor" beklemesi yok. Yalnız ≤ 0,5 sn'lik görsel geçiş var.

### 5.2 Mobil

- Giriş alanı + tam genişlikte "Villa Bul" (bugünkü gibi).
- Gönderince **klavye kapanır** (blur). Özet satırı yatay kayan **tek sıra** chip'ler olarak gösterilir; Hero yüksekliği neredeyse değişmez.
- Chip düzenleme **alttan açılan bir sayfada** (bottom sheet) yapılır: büyük dokunma hedefleri, kişi stepper'ı, takvim, bölge listesi.
- Soru satırı chip'leri tam genişlikte ve alt alta; en az 44 px dokunma hedefi.
- "Villaları göster" düğmesi soru ya da not olduğunda görünür alanda kalır (`scrollIntoView`).
- A sınıfında otomatik geçiş mobilde de aynı; reduced-motion'da anında.

### 5.3 Erişilebilirlik

- Özet satırı `aria-live="polite"`: "Kaş, 4 kişi, 12–18 Haziran, deniz manzaralı; sonuçlar açılıyor".
- Soru satırı `role="group"` ve etiketli düğmeler içerir; otomatik geçiş yalnız A sınıfında olur.
- Klavye: Enter ile arama, Esc ile düzenlemeyi kapatma.
- Otomatik geçişe "Düzenle" ile müdahale edilebilir. `prefers-reduced-motion`'da geçiş animasyonsuz.

---

## 6. Arama motoru değişmeli mi?

**Hayır.**

- Önerilen akışın tamamı mevcut `buildHeroSearchParams` → `localeHref` → `/arama` (`/en/search`, `/de/suche`) hattını olduğu gibi kullanır.
- Değişmeyenler:
  - **Arama sayfası ve motor:** `AramaPageBody`, `findSearchResults`, müsaitlik, fiyat ve URL parametreleri;
  - **Tarihle Ara ve sekmeler:** `HeroSearchPanel`, `HeroSearchModes` (premium sekme aynen kalır).

Değişecekler (uygulama onaylanırsa) [Ö]:

| Dosya | Değişiklik |
|---|---|
| `HeroAiSearch.tsx` | Büyük kart yerine özet satırı, satır içi soru, chip popover / bottom sheet, A sınıfı otomatik geçiş |
| `lib/i18n/dictionaries/*` | Birkaç yeni ya da sadeleşmiş metin anahtarı (eklemeli) |
| `lib/ai-search/*` (isteğe bağlı küçük iyileştirmeler) | Tek geçersiz tarihte `invalid_calendar`; Almanca "-villa / -villen" bileşik ayrımı; §2.3'teki tip + özellik tercih kuralı (iş kararına bağlı) |
| Testler | UI testleri yeni akışa göre güncellenir; parser testleri korunur |

**Opsiyonel C (ayrı onay):** `/arama`'ya `sessionStorage` ile beslenen küçük bir "Yapay zekâ şöyle anladı / filtrelenemedi" bandı. Motor değişmez ama sonuç sayfası dosyası değişir.

---

## 7. Sonuç ve öneri

1. **Büyük beyaz panel kaldırılmalı.** Yerine giriş alanının altında Hero'nun koyu cam dilinde **tek satırlık "Anladığım" özeti** gelmeli.
2. **Temiz anlaşılan sorgular (bugün yaklaşık %45) doğrudan aranmalı:** ek dokunuş yok, kısa ve zarif bir geçişle `/arama`'ya.
3. **Bir şey kaybolacaksa ya da belirsizse** kullanıcıya **tek satırda** söylenmeli ya da **tek soru** sorulmalı:
   - desteklenmeyen kriter;
   - anlaşılmayan kelime;
   - tarih sorunu;
   - çoklu tip, tip + özellik çakışması, aynı adlı bölge.
4. **Arama motoru, `buildHeroSearchParams`, dil yolları ve Tarihle Ara değişmez.** Değişiklik yalnız AI panelinin arayüzünde.
5. Sonuç sayfası bandı (C), istenirse ayrı bir adım olarak eklenebilir.

**Bekleyen kararlar:**

- A sınıfında otomatik geçiş mi, yoksa A'da da tek dokunuşlu "Villaları göster" mi? Öneri: otomatik geçiş.
- Tip + özellik çiftlerinde (ısıtmalı kapalı havuz, çocuk oyun alanı) varsayılan tercih: tip mi, özellik mi, yoksa soru mu kalsın?
- C bandı için `/arama`'ya küçük bir arayüz eklemesi yapılsın mı?

---

## İşlem beyanı

- Kod, veritabanı ve env değiştirilmedi; commit, push ve deploy yok.
- Ölçüm (44 sorgu), bulut ortamındaki salt okunur repo kopyasında geçici bir test dosyasıyla yapıldı; dosya ardından silindi.
- Repoya yazılan tek dosya bu rapor: `Claude outputs/yapay-zeka-arama-deneyimi-ux-analizi.md`.
