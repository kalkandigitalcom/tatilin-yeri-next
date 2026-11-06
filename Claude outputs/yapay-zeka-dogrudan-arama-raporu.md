# Yapay Zekâ ile Ara — Doğrudan Arama (DasVilla tipi) Uygulama Raporu

Tarih: 6 Kasım 2026 · Taban commit: `850be55` · Commit / push / deploy **yapılmadı**.
Canlı veritabanı, fiyat, rezervasyon ve müsaitlik kayıtlarına dokunulmadı.

---

## 1. Karar

"Villa Bul" → metin tarayıcıda ayrıştırılır → belirsizlikler bağlamla **otomatik** çözülür → mevcut sonuç sayfasına **doğrudan** gidilir.

Kaldırılanlar:

- büyük kriter paneli;
- "Anladığım" özeti, çip düzenleyici, popover ve alt sayfa;
- "Tarih seç" ve "Tarihsiz ara" soruları, takvim;
- tip / özellik / bölge / kişi seçim soruları;
- "Villaları göster" gibi ikinci onay düğmesi.

Tek istisna: Hiçbir kriter tanınmazsa ("asdf qwerty", yalnız "30 Şubat") yönlendirme yapılmaz. Kısa bir satır, örnek aramalar ve "Tarihle Ara'ya geç" gösterilir. Filtresiz tüm villa listesine göndermek yerine bu tercih edildi.

## 2. DasVilla referansı

DasVilla'da:

- `region=140`, sonuç kartlarında "Antalya / Üzümlü" olarak görünüyor; Kalkan, İslamlar ve Bezirgan ile aynı grupta;
- `category=8721` = Balayı villaları;
- 2 misafir, 20–25 Haziran;
- 12 sonuç.

Bu değerler bizim sisteme **kopyalanmadı**. Bizde aynı sorgu, canlı taksonomideki gerçek kayıtlara gidiyor:

| Kriter | Bizdeki kayıt |
|---|---|
| Bölge | `Kalkan / Üzümlü` → slug `uzumlu` (DasVilla'daki Antalya/Kalkan bölgesindeki Üzümlü ile aynı yer) |
| Kategori | `Balayı Villaları` → slug `balayi-villalari` |
| Kişi | 2 |
| Tarih | 2027-06-20 → 2027-06-25 |

Sonuç URL'si:

`/arama?villa-turleri=balayi-villalari&bolgeler=uzumlu&start=2027-06-20&end=2027-06-25&guests=2`

EN'de `/en/search?…`, DE'de `/de/suche?…`.

## 3. Önce / sonra

| Sorgu | Önce (`850be55`) | Sonra |
|---|---|---|
| Üzümlü'de 2 kişilik balayı villası arıyorum tarihlerim 20 25 haziran | Üzümlü için soru (Kalkan mı Fethiye mi). "20 25 haziran" anlaşılmadı, yalnız "25 Haziran" bulundu ve tarih sorusu çıktı. "tarihlerim" ve "20" anlaşılmayan olarak listelendi. | Doğrudan `/arama?villa-turleri=balayi-villalari&bolgeler=uzumlu&start=2027-06-20&end=2027-06-25&guests=2` |
| 20 haziranda giriş 25 haziranda çıkış | "Birden fazla tarih" sorusu çıktı; "giriş/çıkış" anlaşılmadı | 20–25 Haziran 2027 |
| 20th to 25th June · 20/25 haziran | Tek tarih sanıldı, tarih sorusu çıktı | 20–25 Haziran 2027 |
| check-in 20 June, check-out 25 June · Anreise 20. Juni Abreise 25. Juni | Desteklenmiyordu | 20–25 Haziran 2027 |
| Kalkan ısıtmalı kapalı havuz | Tip mi özellik mi sorusu | Özellik: Kapalı Havuzu Isıtmalı |
| Kalkan ısıtmalı kapalı havuzlu villa | Soru | Tip: Kapalı Havuzlu Isıtmalı Villalar |
| çocuk oyun alanı / çocuk oyun alanlı villa | Soru | Özellik / tip |
| çocuk oyun alanlı balayı villası | Soru | Tip: Balayı Villaları, özellik: Çocuk Oyun Alanı |
| muhafazakar balayı villası | "Birden fazla tip" sorusu | Balayı Villaları (villa kelimesine bağlı olan tip) |
| 2 yetişkin 1 çocuk 4 kişi | Kişi sayısı sorusu | 4 kişi (en büyük değer) |
| Ağustos ayında Kalkan | Tarih sorusu | Tarihsiz, Kalkan |
| 30 Şubat Kalkan | Geçersiz tarih uyarısı ve takvim | Tarih gönderilmez; Kalkan ile aranır |
| Kaş'ta 2 yatak odalı, denize yakın villa 4 kişi | Uyarı ve "Villaları göster" | Doğrudan: Kaş + 4 kişi. Desteklenmeyen kısımlar filtreye dönüşmez. |

## 4. Giderilen eksikler

### Ayrıştırıcı (`lib/ai-search/parse.ts`, `lexicon.ts`, `schema.ts`)

- **Ayırıcısız gün aralığı:** "20 25 haziran" ve "20/25 haziran" artık aralık. Güvenlik için ikinci gün birinciden büyük olmalı. "25 20 haziran" aralık sayılmaz.
- **Sıra eki:** "20th to 25th June" artık aralık.
- **İki ayrı tek tarih tek aralık olur:** "20 haziranda giriş 25 haziranda çıkış", "check-in … check-out …", "Anreise … Abreise …".
- **Tarih kelimeleri dolgu kelimesi oldu:**
  - TR: tarihlerim, tarihim, tarihimiz, tarihlerimiz, giriş, çıkış;
  - EN: check-in, check-out, arrival, departure;
  - DE: Anreise, Abreise, Ankunft.
  - Bu kelimeler artık "anlaşılamayan" listesine düşmüyor.
- **Bağlam ipuçları:**
  - çoklu tipte villa kelimesine en yakın tip (`head`);
  - tip ↔ özellik çakışmasında ifadenin bir villa kelimesine bağlı olup olmadığı (`attachedToVilla`).
- Mevcut kurallar ve ayrımlar (özel ≠ korunaklı ≠ muhafazakâr, zayıf adlar, "Merkez") aynı kaldı. Mevcut parser testlerinin tamamı değişmeden geçiyor.

### Otomatik çözümleme (yeni: `lib/ai-search/auto-resolve.ts`)

Soru yok. Seçim yalnız gerçek taksonomi kayıtları arasından yapılır, yeni filtre üretilmez.

**Aynı adlı alt bölge** (ör. Üzümlü, Kalkan ve Fethiye'de var):

1. Sorgudaki diğer bölgenin ana bölgesi seçimi belirler ("Fethiye Üzümlü" → Fethiye'deki kayıt).
2. Yoksa slug'ı adın kendisi olan canonical kayıt seçilir (`uzumlu`, `fethiye-uzumlu`'ya tercih edilir).
3. Hâlâ belirsizse adayların hepsi gönderilir. `/arama` bölgelerde OR uyguladığı için hiçbir aday kaybolmaz.

**Tip ↔ özellik çakışması:**

1. Sorguda başka bir tip zaten varsa özellik seçilir. Tipler AND ile birleştiği için ikinci tip sonucu sıfırlardı.
2. İfade bir villa kelimesine bağlıysa tip seçilir ("…lı villa", "villa with …", "Villa mit …").
3. Aksi hâlde özellik seçilir.

**Birden fazla tip:** villa kelimesine bağlı olan tip seçilir ("muhafazakâr balayı villası" → Balayı). Bulunamazsa son yazılan tip seçilir.

**Çakışan kişi sayısı:** en büyük değer seçilir, böylece kapasite kaybı olmaz.

**Tarih sorunu** (yalnız ay, tek tarih, geçersiz, geçmiş, göreli, yalnız gece sayısı, 60 geceden uzun, belirsiz gün/ay sırası):

- tarih gönderilmez;
- diğer kriterlerle aranır;
- takvim veya soru açılmaz.

### Arayüz (`HeroAiSearch.tsx`)

- Sade form, Villa Bul ve doğrudan `router.push` kaldı.
- Örnek aramalar tıklanınca doğrudan aranıyor.
- Teklif linki ve gizlilik notu yerinde.
- Kullanılmayan 67 sözlük anahtarı TR/EN/DE ve tiplerden temizlendi.
- AI chunk'ı 57 KB'tan 39 KB'a (gzip 14 KB) düştü. Chunk hâlâ yalnız sekmeye dokunulunca yükleniyor.

### Korunanlar (değişmedi)

- `HeroSearchModes` (premium "Yapay Zekâ ile Ara" sekmesi, animasyonlar);
- `HeroSearchPanel` (Tarihle Ara);
- `buildHeroSearchParams`, `build-ai-search-query.ts`;
- `/arama`, `/en/search`, `/de/suche`;
- fiyat, müsaitlik, rezervasyon, villa kartları;
- taksonomi endpoint'i.

Ek bağımlılık ve harici AI/API yok. Metin hiçbir isteğe girmiyor.

## 5. Desteklenen ifadeler (özet)

**Tarih aralığı** (yıl yoksa bugünden sonraki ilk uygun yıl; 6 Kasım 2026'da Haziran → 2027; "28 Aralık - 3 Ocak" → 2026-12-28 / 2027-01-03):

- TR: 20 25 haziran · 20-25 haziran · 20/25 haziran · haziran 20-25 · 20 haziran - 25 haziran · 20 haziran ile 25 haziran arası · 20 ve 25 haziran arası · 20 haziranda giriş 25 haziranda çıkış · giriş 20 haziran çıkış 25 haziran · 20.06.2027 - 25.06.2027
- EN: 20 June to 25 June · June 20-25 · from June 20 to June 25 · 20th to 25th June · check-in 20 June, check-out 25 June
- DE: 20. bis 25. Juni · vom 20. bis 25. Juni · 20.-25. Juni · Anreise 20. Juni, Abreise 25. Juni

**Kişi:**

- TR: 2 kişilik, 2 kişi, 2 yetişkin 1 çocuk;
- EN: for 2 people, 2 adults;
- DE: für 2 Personen;
- çakışmada en büyük değer.

**Bölge:**

- ana bölgeler;
- tek başına yazılan alt bölge adları (Üzümlü, Göcek, Ölüdeniz, Kalamar …);
- "Fethiye Üzümlü" gibi bağlamlı yazımlar;
- kesme ekleri (Üzümlü'de, Kaş'ta).

**Tip ve özellik:**

- canlıdaki tüm tip/özellik adları TR/EN/DE;
- eş anlamlılar (balayı / honeymoon / Flitterwochen / Hochzeitsreise, lüks / luxury / Luxus / Luxusvilla …).

## 6. Mevcut sistemde karşılığı olmayan kriterler

Bunlar filtreye dönüşmez, arama tanınan diğer kriterlerle sürer:

- yatak odası sayısı;
- bütçe / fiyat aralığı;
- denize veya plaja mesafe, "denize yakın";
- genel "havuzlu" (ayrı havuz filtresi yok);
- minimum konaklama süresi;
- özel havuz, ortak havuz, sonsuzluk havuzu;
- çocuğa uygun villa (ayrı kayıt yok);
- bahçe (canlıda yalnız "Geniş Bahçe" özelliği var, genel bahçe kavramı eşlenmiyor);
- şömine.

Bilerek otomatik uygulanmayanlar ("uydurma yok" ilkesi):

- **Yazım hatası düzeltmesi:** "Kalkn" → Kalkan yapılmaz.
- **Yaygın kelime olan alt bölge adları:** yalı, çiftlik, ordu, çalış, kasaba.
- **Tek başına "Merkez".**

Dikkat edilecek nokta: "Çocuk Oyun Alanı" gibi bazı özelliklerin canlıda EN/DE adı yok. Bunlar EN/DE metinde yalnız tip adı üzerinden eşleşir.

## 7. Değişen dosyalar

- `app/components/ui/hero/_components/HeroAiSearch.tsx` (sadeleştirildi: doğrudan arama)
- `lib/ai-search/auto-resolve.ts` (yeni)
- `lib/ai-search/parse.ts`
- `lib/ai-search/lexicon.ts`
- `lib/ai-search/schema.ts`
- `lib/i18n/dictionaries/types.ts`, `tr.ts`, `en.ts`, `de.ts` (kullanılmayan 67 anahtar kaldırıldı)
- `tests/unit/ai-search-auto-resolve.test.ts` (yeni, 51 test)
- `tests/unit/hero-ai-search-ui.test.tsx` (yeniden yazıldı, 15 test)
- `tests/unit/hero-ai-search-live-ui.test.tsx` (yeniden yazıldı, 10 test)

## 8. Test sonuçları

**Cihazda (çalışma kopyası):**

- 286 test dosyası: 5804 test geçti, 11 atlandı;
- TypeScript: 0 hata;
- ESLint: 0 hata, 194 uyarı (öncekiyle aynı; yeni dosyalarda uyarı yok);
- production build (webpack): başarılı.

**Tarayıcı E2E:**

- Bulutta production build ve geçici veritabanı kullanıldı; taksonomi canlı adlarla dolduruldu.
- TR/EN/DE, masaüstü (1366 px) ve iPhone 13: **28/28 PASS**.
- Her sorguda AI panelinde diyalog, özet, select veya takvim görünmediği ölçüldü.
- Villa Bul'dan sonuç URL'sine geçiş ~0,2–0,4 sn sürdü.
- Hiçbir şey anlaşılmayan sorgu sayfada kaldı; "Tarihle Ara'ya geç" çalıştı.
- Premium sekme ve Tarihle Ara varsayılanı doğrulandı.
- Geçici veritabanı silindi; m106 / m108clean şablonlarına dokunulmadı.
