/* ===============================================================
   🧪 AI ARAMA — DOĞAL DİL TEST KORPUSU (≥500 sorgu, TR / EN / DE)
   ===============================================================
   Satır biçimi:  grup | dil | sorgu | beklenti [| legacy]

   Beklenti belirteçleri (boşlukla ayrılır) GERÇEK canlı taksonomi
   kayıtlarına bağlıdır (tests/unit/ai-search-live-fixture.ts):
     R:<slug>        bölge          (L:<slug>)
     T:<slug>        villa tipi     (T:<slug>)
     F:<Ad>          özellik        (F:<Ad>; ad içindeki boşluk "_" yazılır)
     G:<n>           kişi sayısı
     D:<giriş>..<çıkış>  tarih aralığı (bugün = 2026-11-06)
     X:<n>           esnek tarih ±gün
     S:<sıralama>    price-asc | price-desc | capacity-asc | capacity-desc
     U:<kavram|kod>  desteklenmeyen olarak raporlanmalı (filtre OLMAMALI)
     N               en az bir olumsuz ifade raporlanmalı (filtre OLMAMALI)
     -               hiçbir filtre yok (boş durum korunur)

   Filtre karşılaştırması TAM eşitliktir: beklenmeyen her bölge / tip /
   özellik / kişi / tarih / sıralama "yanlış filtre" sayılır.
   "legacy" = önceki analiz raporundaki 111 sorgu (21 örnek + 90 ifade).
   =============================================================== */

export const CORPUS = String.raw`
# ---------------------------------------------------------------- legacy (önceki rapor: 21 örnek sorgu)
multi|tr|4-10 Haziran Üzümlü'de korunaklı villa|R:uzumlu D:2027-06-04..2027-06-10 F:Korunaklı_Havuz|legacy
en|en|Secluded villa in Uzumlu, 4-10 June|R:uzumlu D:2027-06-04..2027-06-10 F:Korunaklı_Havuz|legacy
de|de|Sichtgeschützte Villa in Üzümlü vom 4. bis 10. Juni|R:uzumlu D:2027-06-04..2027-06-10 F:Korunaklı_Havuz|legacy
multi|tr|Kalkan'da özel havuzlu, denize yakın, 8 kişilik villa|R:kalkan G:8 U:private_pool U:near_sea|legacy
en|en|Villa in Kalkan with private pool, near the beach, for 8 people|R:kalkan G:8 U:private_pool U:near_sea|legacy
de|de|Villa in Kalkan mit Privatpool, strandnah, für 8 Personen|R:kalkan G:8 U:private_pool U:near_sea|legacy
multi|tr|Çocuk havuzlu, jakuzili, muhafazakâr villa|T:cocuk-havuzlu-villalar T:muhafazakar-villalar F:Jakuzi|legacy
en|en|Villa with children's pool, jacuzzi, conservative|T:cocuk-havuzlu-villalar T:muhafazakar-villalar F:Jakuzi|legacy
de|de|Konservative Villa mit Kinderpool und Whirlpool|T:cocuk-havuzlu-villalar T:muhafazakar-villalar F:Jakuzi|legacy
multi|tr|Fethiye'de deniz manzaralı, saunalı, 5 yatak odalı villa|R:fethiye T:deniz-manzarali-villalar F:Sauna U:bedrooms|legacy
en|en|Sea view villa in Fethiye with sauna and 5 bedrooms|R:fethiye T:deniz-manzarali-villalar F:Sauna U:bedrooms|legacy
de|de|Villa mit Meerblick in Fethiye, Sauna, 5 Schlafzimmer|R:fethiye T:deniz-manzarali-villalar F:Sauna U:bedrooms|legacy
multi|tr|Kaş'ta evcil hayvan kabul eden, kapalı havuzlu, 6 kişilik villa|R:kas T:evcil-hayvan-izinli F:Kapalı_Havuzu_Isıtmalı G:6|legacy
en|en|Pet friendly villa in Kas with indoor pool for 6 people|R:kas T:evcil-hayvan-izinli F:Kapalı_Havuzu_Isıtmalı G:6|legacy
de|de|Haustierfreundliche Villa in Kaş mit Innenpool für 6 Personen|R:kas T:evcil-hayvan-izinli F:Kapalı_Havuzu_Isıtmalı G:6|legacy
multi|tr|Üzümlü'de doğa manzaralı, çocuklu aileye uygun, korunaklı ve jakuzili villa|R:uzumlu T:doga-manzarali F:Korunaklı_Havuz F:Jakuzi U:child_friendly|legacy
en|en|Nature view, family friendly, secluded villa with jacuzzi in Uzumlu|R:uzumlu T:doga-manzarali F:Korunaklı_Havuz F:Jakuzi U:child_friendly|legacy
de|de|Familienfreundliche Villa mit Naturblick, sichtgeschützt, mit Whirlpool in Üzümlü|R:uzumlu T:doga-manzarali F:Korunaklı_Havuz F:Jakuzi U:child_friendly|legacy
multi|tr|4-10 Haziran Üzümlü'de 6 kişilik, korunaklı, özel havuzlu ve jakuzili villa|R:uzumlu D:2027-06-04..2027-06-10 G:6 F:Korunaklı_Havuz F:Jakuzi U:private_pool|legacy
en|en|4-10 June Uzumlu, 6 people, secluded, private pool and jacuzzi|R:uzumlu D:2027-06-04..2027-06-10 G:6 F:Korunaklı_Havuz F:Jakuzi U:private_pool|legacy
de|de|4.-10. Juni Üzümlü, 6 Personen, sichtgeschützt, Privatpool und Whirlpool|R:uzumlu D:2027-06-04..2027-06-10 G:6 F:Korunaklı_Havuz F:Jakuzi U:private_pool|legacy
# ---------------------------------------------------------------- legacy (önceki rapor: 90 tekil ifade)
pool|tr|korunaklı havuz|F:Korunaklı_Havuz|legacy
pool|en|secluded pool|F:Korunaklı_Havuz|legacy
pool|de|sichtgeschützter Pool|F:Korunaklı_Havuz|legacy
pool|de|blickgeschützter Pool|F:Korunaklı_Havuz|legacy
pool|tr|özel havuz|U:private_pool|legacy
pool|en|private pool|U:private_pool|legacy
pool|de|Privatpool|U:private_pool|legacy
pool|tr|çocuk havuzu|T:cocuk-havuzlu-villalar|legacy
pool|en|children's pool|T:cocuk-havuzlu-villalar|legacy
pool|en|kids pool|T:cocuk-havuzlu-villalar|legacy
pool|de|Kinderpool|T:cocuk-havuzlu-villalar|legacy
unsupported|tr|denize yakın|U:near_sea|legacy
unsupported|en|near the beach|U:near_sea|legacy
unsupported|de|strandnah|U:near_sea|legacy
feature|tr|jakuzi|F:Jakuzi|legacy
feature|tr|jakuzzi|F:Jakuzi|legacy
feature|tr|çift jakuzi|F:Çift_Jakuzi|legacy
feature|tr|sinema odalı|F:Sinema_Odası|legacy
feature|tr|bilardo masalı|F:Bilardo|legacy
feature|tr|masa tenisi|F:Masa_Tenisi|legacy
feature|tr|langırt|F:Langırt|legacy
feature|en|table tennis|F:Masa_Tenisi|legacy
feature|de|Tischtennis|F:Masa_Tenisi|legacy
feature|tr|jeneratörlü|F:Jeneratör|legacy
feature|tr|wifi|F:Wifi|legacy
feature|en|wi-fi|F:Wifi|legacy
feature|de|WLAN|F:Wifi|legacy
feature|tr|geniş bahçeli|F:Geniş_Bahçe|legacy
unsupported|tr|bahçeli|U:garden|legacy
feature|tr|barbekülü|F:Barbekü|legacy
feature|tr|mangal|F:Barbekü|legacy
feature|de|Grill|F:Barbekü|legacy
feature|tr|hamamlı|F:Hamam|legacy
feature|en|turkish bath|F:Hamam|legacy
feature|tr|spor salonu|F:Spor_Salonu|legacy
feature|en|gym|F:Spor_Salonu|legacy
feature|tr|özel plajlı|F:Özel_Plajlı_Villa|legacy
feature|tr|merkezi konumda|F:Merkezi_Konum|legacy
feature|tr|otoparklı|F:Açık_Otopark|legacy
feature|tr|saç kurutma makinesi|F:Saç_Kurutma_Makinesi|legacy
feature|tr|havlu çarşaf dahil|F:Havlu_/_Çarşaf|legacy
feature|tr|beyaz eşya|F:Beyaz_Eşya|legacy
type|tr|ekonomik villa|T:ekonomik-villalar|legacy
unsupported|tr|uygun fiyatlı villa|U:budget|legacy
type|tr|geniş aileye uygun|T:genis-aileye-uygun-villalar|legacy
type|tr|kalabalık aile|T:genis-aileye-uygun-villalar|legacy
type|tr|birbirine yakın villalar|T:birbirine-yakin-villalar|legacy
type|tr|bungalov|T:bungalov|legacy
type|tr|apart|T:apartlar|legacy
type|tr|2027 villaları|T:2027-kiralik-villalar|legacy
type|tr|lüks|T:luks-villalar|legacy
type|tr|balayı|T:balayi-villalari|legacy
type|tr|muhafazakar|T:muhafazakar-villalar|legacy
type|tr|muhafazakâr|T:muhafazakar-villalar|legacy
pool|tr|korunaklı villa|F:Korunaklı_Havuz|legacy
typo|tr|saunali|F:Sauna|legacy
typo|tr|jakuzli|F:Jakuzi|legacy
typo|tr|denız manzaralı|T:deniz-manzarali-villalar|legacy
typo|tr|cocuk havuzlu|T:cocuk-havuzlu-villalar|legacy
type|tr|evcil hayvan|T:evcil-hayvan-izinli|legacy
type|tr|köpek kabul eden|T:evcil-hayvan-izinli|legacy
feature|tr|çocuk oyun alanı|F:Çocuk_Oyun_Alanı|legacy
feature|tr|oyun parkı|F:Çocuk_Oyun_Alanı|legacy
feature|tr|ısıtmalı havuz|F:Kapalı_Havuzu_Isıtmalı|legacy
feature|tr|kapalı havuz|F:Kapalı_Havuzu_Isıtmalı|legacy
feature|de|beheizter Pool|F:Kapalı_Havuzu_Isıtmalı|legacy
feature|en|heated pool|F:Kapalı_Havuzu_Isıtmalı|legacy
subregion|tr|Kalamar|R:kalkan-kalamar|legacy
subregion|tr|Kalamar Koyu|R:kalkan-kalamar|legacy
subregion|tr|Ölüdeniz|R:oludeniz|legacy
subregion|tr|Oludeniz|R:oludeniz|legacy
subregion|tr|Hisarönü|R:fethiye-hisaronu|legacy
subregion|tr|Fethiye merkez|R:fethiye-merkez|legacy
subregion|tr|Kaş merkez|R:kas-merkez|legacy
region|tr|Patara|R:patara|legacy
subregion|tr|Gelemiş|R:patara|legacy
subregion|tr|Islamlar|R:islamlar|legacy
subregion|tr|Çukurbağ yarımadası|R:kas-cukurbag-yarimadasi|legacy
typo|tr|Kalkn|R:kalkan|legacy
typo|tr|Fethye|R:fethiye|legacy
unsupported|tr|3 yatak odalı|U:bedrooms|legacy
unsupported|tr|plaja 500 metre|U:sea_distance|legacy
unsupported|tr|minimum 3 gece|U:min_stay|legacy
unsupported|tr|sonsuzluk havuzu|U:infinity_pool|legacy
unsupported|tr|ortak havuz|U:shared_pool|legacy
unsupported|tr|klimalı|U:air_conditioning|legacy
unsupported|tr|asansörlü|U:elevator|legacy
unsupported|tr|engelli erişimi|U:accessibility|legacy
type|tr|deniz manzarası|T:deniz-manzarali-villalar|legacy
unsupported|tr|denize sıfır|U:near_sea|legacy

# ---------------------------------------------------------------- görevdeki 10 örnek sorgu
multi|tr|4-10 Haziran Üzümlü'de korunaklı villa|R:uzumlu D:2027-06-04..2027-06-10 F:Korunaklı_Havuz
multi|tr|Kalkan'da 6 kişilik özel havuzlu ve jakuzili villa|R:kalkan G:6 F:Jakuzi U:private_pool
multi|tr|Denize yakın çocuk havuzlu muhafazakâr villa|T:cocuk-havuzlu-villalar T:muhafazakar-villalar U:near_sea
multi|tr|Fethiye'de 5 yatak odalı deniz manzaralı villa|R:fethiye T:deniz-manzarali-villalar U:bedrooms
multi|tr|Kaş'ta köpek kabul eden villa|R:kas T:evcil-hayvan-izinli
multi|tr|Üzümlü'de dışarıdan havuzu görünmeyen, aileye uygun villa|R:uzumlu F:Korunaklı_Havuz U:child_friendly
multi|de|Kinderpool und Whirlpool in Kalkan|R:kalkan T:cocuk-havuzlu-villalar F:Jakuzi
multi|en|Secluded pool villa near the beach|F:Korunaklı_Havuz U:near_sea
multi|de|Villa mit privatem Pool für 8 Personen|G:8 U:private_pool
multi|tr|Balayı için jakuzili, sakin bir villa|T:balayi-villalari F:Jakuzi U:quiet

# ---------------------------------------------------------------- 1) bölgeler
region|tr|Kalkan|R:kalkan
region|tr|Kalkan'da villa|R:kalkan
region|tr|Kalkan'daki villalar|R:kalkan
region|tr|kalkanda villa arıyorum|R:kalkan
region|tr|Kaş|R:kas
region|tr|Kaş'ta villa|R:kas
region|tr|kasta kiralık villa|R:kas
region|tr|Kaş bölgesinde villa|R:kas
region|tr|Fethiye|R:fethiye
region|tr|Fethiye'de tatil|R:fethiye
region|tr|fethiyede villa bakıyorum|R:fethiye
region|tr|Bodrum villa|R:bodrum
region|tr|Bodrum'da villa|R:bodrum
region|tr|Demre'de villa|R:demre
region|tr|Dalaman villa|R:dalaman
region|tr|Patara'da kiralık villa|R:patara
region|tr|Kalkan veya Kaş|R:kalkan R:kas
region|tr|Kalkan ve Kaş arası villa|R:kalkan R:kas
region|tr|Kaş ya da Fethiye olur|R:kas R:fethiye
region|tr|Kalkan, Kaş, Fethiye|R:kalkan R:kas R:fethiye
region|en|villa in Kalkan|R:kalkan
region|en|villas in Kas|R:kas
region|en|Fethiye villa rental|R:fethiye
region|en|something in Bodrum|R:bodrum
region|en|Kalkan or Kas|R:kalkan R:kas
region|en|holiday home near Demre|R:demre
region|de|Villa in Kalkan|R:kalkan
region|de|Ferienvilla in Kaş|R:kas
region|de|Ferienhaus in Fethiye|R:fethiye
region|de|Villen in Bodrum|R:bodrum
region|de|Kalkan oder Kaş|R:kalkan R:kas
region|de|Urlaub in Patara|R:patara

# ---------------------------------------------------------------- 2) alt bölgeler
subregion|tr|Üzümlü|R:uzumlu
subregion|tr|Üzümlü'de villa|R:uzumlu
subregion|tr|uzumlu villa|R:uzumlu
subregion|tr|Kalkan Üzümlü|R:uzumlu
subregion|tr|Fethiye Üzümlü|R:fethiye-uzumlu
subregion|tr|Kalkan Kalamar|R:kalkan-kalamar
subregion|tr|Kalamar koyunda villa|R:kalkan-kalamar
subregion|tr|Ölüdeniz'de villa|R:oludeniz
subregion|tr|Ölü Deniz villa|R:oludeniz
subregion|tr|Kayaköy|R:kayakoy
subregion|tr|Kaya köyü|R:kayakoy
subregion|tr|Göcek'te villa|R:gocek
subregion|tr|Ovacık villa|R:ovacik
subregion|tr|Hisarönü'nde villa|R:fethiye-hisaronu
subregion|tr|Faralya|R:fethiye-faralya
subregion|tr|Çalış plajı|R:fethiye-calis
subregion|tr|Bezirgan'da villa|R:bezirgan
subregion|tr|Sarıbelen villa|R:saribelen
subregion|tr|Kördere|R:kordere
subregion|tr|Kızıltaş'ta villa|R:kiziltas
subregion|tr|Yeşilköy villa|R:yesilkoy
subregion|tr|İslamlar'da villa|R:islamlar
subregion|tr|Çukurbağ|R:cukurbag
subregion|tr|Kaş yarımadası|R:kas-cukurbag-yarimadasi
subregion|tr|Gökçeören villa|R:gokceoren
subregion|tr|Kınık|R:kas-kinik
subregion|tr|Gelemiş köyü|R:patara
subregion|tr|Akbel|R:akbel
subregion|tr|Ulugöl|R:ulugol
subregion|tr|Çayköy villa|R:caykoy
subregion|tr|Kalkan Merkez|R:kalkan-merkez
subregion|tr|Kaş merkezde villa|R:kas-merkez
subregion|tr|İkizce villa|R:ikizce
subregion|tr|Kömürlük|R:komurluk
subregion|tr|Seydikemer|R:seydikemer
subregion|tr|Saklıkent|R:fethiye-saklikent
subregion|tr|Karadere|R:fethiye-karadere
subregion|tr|Eşen|R:fethiye-esen
subregion|en|villa in Oludeniz|R:oludeniz
subregion|en|Blue Lagoon villa|R:oludeniz
subregion|en|villa near Kalamar Bay|R:kalkan-kalamar
subregion|en|Uzumlu villa|R:uzumlu
subregion|en|Kayakoy|R:kayakoy
subregion|en|Gocek villas|R:gocek
subregion|en|Hisaronu|R:fethiye-hisaronu
subregion|en|Kas peninsula|R:kas-cukurbag-yarimadasi
subregion|de|Villa in Ölüdeniz|R:oludeniz
subregion|de|Ferienvilla in Göcek|R:gocek
subregion|de|Villa in Kayaköy|R:kayakoy
subregion|de|Üzümlü Ferienhaus|R:uzumlu
subregion|de|Villa in Islamlar|R:islamlar

# ---------------------------------------------------------------- 3) villa tipleri
type|tr|muhafazakar villa|T:muhafazakar-villalar
type|tr|muhafazakâr villalar|T:muhafazakar-villalar
type|tr|muhafazakar aileye uygun villa|T:muhafazakar-villalar
type|tr|Muhafazakâr aileye uygun villa|T:muhafazakar-villalar
type|tr|helal konseptli villa|T:muhafazakar-villalar
type|tr|lüks villa|T:luks-villalar
type|tr|lüks villalar|T:luks-villalar
type|tr|ultra lüks villa|T:luks-villalar
type|tr|deniz manzaralı villa|T:deniz-manzarali-villalar
type|tr|deniz gören villa|T:deniz-manzarali-villalar
type|tr|balayı villası|T:balayi-villalari
type|tr|balayı villaları|T:balayi-villalari
type|tr|çocuk havuzlu villa|T:cocuk-havuzlu-villalar
type|tr|evcil hayvan izinli villa|T:evcil-hayvan-izinli
type|tr|evcil hayvan dostu villa|T:evcil-hayvan-izinli
type|tr|doğa manzaralı villa|T:doga-manzarali
type|tr|doğa içinde villa|T:doga-manzarali
type|tr|ekonomik villalar|T:ekonomik-villalar
type|tr|geniş aileye uygun villa|T:genis-aileye-uygun-villalar
type|tr|büyük aile için villa|T:genis-aileye-uygun-villalar
type|tr|birbirine yakın iki villa|T:birbirine-yakin-villalar
type|tr|yan yana villalar|T:birbirine-yakin-villalar
type|tr|bungalov evler|T:bungalov
type|tr|apart daire|T:apartlar
type|tr|2027 kiralık villalar|T:2027-kiralik-villalar
type|tr|kapalı havuzlu ısıtmalı villa|T:kapali-havuzlu-isitmali-villalar
type|tr|çocuk oyun alanlı villa|T:cocuk-oyun-alanli-villalar
type|en|luxury villa|T:luks-villalar
type|en|luxury villas|T:luks-villalar
type|en|sea view villa|T:deniz-manzarali-villalar
type|en|honeymoon villa|T:balayi-villalari
type|en|honeymoon villas|T:balayi-villalari
type|en|pet-friendly villas|T:evcil-hayvan-izinli
type|en|nature view villa|T:doga-manzarali
type|en|budget villas|T:ekonomik-villalar
type|en|villas for large families|T:genis-aileye-uygun-villalar
type|en|large family villa|T:genis-aileye-uygun-villalar
type|en|bungalows|T:bungalov
type|en|apartments|T:apartlar
type|en|conservative villa|T:muhafazakar-villalar
# v3.1: "private villa" = müstakil villa (genel anlam); canlı EN adı "Private Villas" olsa da muhafazakâr tipine DARALTMAZ.
type|en|private villa|-
type|en|halal friendly villa|T:muhafazakar-villalar
type|en|villas with kids' pools|T:cocuk-havuzlu-villalar
type|en|nearby villas|T:birbirine-yakin-villalar
type|de|Luxusvilla|T:luks-villalar
type|de|Luxusvillen|T:luks-villalar
type|de|Villa mit Meerblick|T:deniz-manzarali-villalar
type|de|Hochzeitsreise-Villa|T:balayi-villalari
type|de|Flitterwochen Villa|T:balayi-villalari
type|de|haustierfreundliche Villa|T:evcil-hayvan-izinli
type|de|Villa mit Naturblick|T:doga-manzarali
type|de|preiswerte Villen|T:ekonomik-villalar
type|de|Villa für große Familien|T:genis-aileye-uygun-villalar
type|de|Großfamilie|T:genis-aileye-uygun-villalar
type|de|Bungalow|T:bungalov
type|de|Ferienwohnung|T:apartlar
type|de|Villa für konservative Gäste|T:muhafazakar-villalar
type|de|muslimfreundliche Villa|T:muhafazakar-villalar
type|de|Villen mit Kinderspielplatz|T:cocuk-oyun-alanli-villalar

# ---------------------------------------------------------------- 4) özellikler
feature|tr|jakuzili villa|F:Jakuzi
feature|tr|jakuzi'li villa|F:Jakuzi
feature|tr|saunalı villa|F:Sauna
feature|tr|sauna|F:Sauna
feature|tr|hamamlı villa|F:Hamam
feature|tr|türk hamamlı villa|F:Hamam
feature|tr|sinema odası olan villa|F:Sinema_Odası
feature|tr|ev sineması|F:Sinema_Odası
feature|tr|barbekü|F:Barbekü
feature|tr|mangal alanı olan villa|F:Barbekü
feature|tr|langırtlı villa|F:Langırt
feature|tr|bilardo|F:Bilardo
feature|tr|pinpon masası|F:Masa_Tenisi
feature|tr|spor salonlu villa|F:Spor_Salonu
feature|tr|fitness odası|F:Spor_Salonu
feature|tr|çift jakuzili villa|F:Çift_Jakuzi
feature|tr|havlu ve çarşaf|F:Havlu_/_Çarşaf
feature|tr|jeneratör|F:Jeneratör
feature|tr|ısıtmalı kapalı havuz|F:Kapalı_Havuzu_Isıtmalı
feature|tr|geniş bahçe|F:Geniş_Bahçe
feature|tr|beyaz eşyalı|F:Beyaz_Eşya
feature|tr|merkezi konum|F:Merkezi_Konum
feature|tr|açık otopark|F:Açık_Otopark
feature|tr|otopark|F:Açık_Otopark
feature|tr|özel plajlı villa|F:Özel_Plajlı_Villa
feature|tr|wifi olan villa|F:Wifi
feature|tr|internetli villa|F:Wifi
feature|tr|saç kurutma makinesi olan|F:Saç_Kurutma_Makinesi
# v3.1: "X olan villa" = "villa with X" → villaya bağlı; tip↔özellik kuralı gereği tip (bkz. "Villa mit Spielplatz", "çocuk oyun alanlı villa").
feature|tr|çocuk oyun alanı olan villa|T:cocuk-oyun-alanli-villalar
feature|tr|salıncak ve kaydırak|F:Çocuk_Oyun_Alanı
feature|en|villa with jacuzzi|F:Jakuzi
feature|en|hot tub|F:Jakuzi
feature|en|villa with sauna|F:Sauna
feature|en|cinema room|F:Sinema_Odası
feature|en|home cinema|F:Sinema_Odası
feature|en|BBQ|F:Barbekü
feature|en|table football|F:Langırt
feature|en|billiards table|F:Bilardo
feature|en|fitness room|F:Spor_Salonu
feature|en|double jacuzzi|F:Çift_Jakuzi
feature|en|towels and bed linen|F:Havlu_/_Çarşaf
feature|en|generator|F:Jeneratör
feature|en|heated indoor pool|F:Kapalı_Havuzu_Isıtmalı
feature|en|spacious garden|F:Geniş_Bahçe
feature|en|household appliances|F:Beyaz_Eşya
feature|en|central location|F:Merkezi_Konum
feature|en|free parking|F:Açık_Otopark
feature|en|private beach|F:Özel_Plajlı_Villa
feature|en|hair dryer|F:Saç_Kurutma_Makinesi
feature|en|playground|F:Çocuk_Oyun_Alanı
feature|de|Villa mit Whirlpool|F:Jakuzi
feature|de|Sauna|F:Sauna
feature|de|türkisches Bad|F:Hamam
feature|de|Heimkino|F:Sinema_Odası
feature|de|Grillplatz|F:Barbekü
feature|de|Tischfußball|F:Langırt
feature|de|Billard|F:Bilardo
feature|de|Fitnessraum|F:Spor_Salonu
feature|de|Doppel-Whirlpool|F:Çift_Jakuzi
feature|de|Handtücher und Bettwäsche|F:Havlu_/_Çarşaf
feature|de|Generator|F:Jeneratör
feature|de|beheizter Innenpool|F:Kapalı_Havuzu_Isıtmalı
feature|de|geräumiger Garten|F:Geniş_Bahçe
feature|de|Haushaltsgeräte|F:Beyaz_Eşya
feature|de|zentrale Lage|F:Merkezi_Konum
feature|de|Parkplatz|F:Açık_Otopark
feature|de|Privatstrand|F:Özel_Plajlı_Villa
feature|de|Haartrockner|F:Saç_Kurutma_Makinesi
feature|de|Kinderspielplatz|F:Çocuk_Oyun_Alanı

# ---------------------------------------------------------------- 5) havuz ve mahremiyet
pool|tr|Korunaklı villa|F:Korunaklı_Havuz
pool|tr|Korunaklı havuzlu villa|F:Korunaklı_Havuz
pool|tr|Havuzu dışarıdan görünmeyen villa|F:Korunaklı_Havuz
pool|tr|dışarıdan görünmeyen havuzlu villa|F:Korunaklı_Havuz
pool|tr|havuzu kimse görmüyor olsun|F:Korunaklı_Havuz
pool|tr|gizli havuzlu villa|F:Korunaklı_Havuz
pool|tr|korunaklı|F:Korunaklı_Havuz
pool|tr|korunaklı villalar|F:Korunaklı_Havuz
pool|tr|özel havuzlu villa|U:private_pool
pool|tr|kendine ait havuzu olan villa|U:private_pool
pool|tr|havuzlu villa|U:pool
pool|tr|ortak havuzlu villa|U:shared_pool
pool|tr|sonsuzluk havuzlu villa|U:infinity_pool
pool|tr|çocuk havuzlu|T:cocuk-havuzlu-villalar
pool|tr|çocuklar için havuzlu villa|T:cocuk-havuzlu-villalar
pool|tr|kapalı havuzlu villa|T:kapali-havuzlu-isitmali-villalar
pool|tr|ısıtmalı havuzlu villa|T:kapali-havuzlu-isitmali-villalar
pool|tr|özel ve korunaklı havuzlu villa|F:Korunaklı_Havuz U:private_pool
pool|tr|muhafazakar korunaklı havuzlu villa|T:muhafazakar-villalar F:Korunaklı_Havuz
pool|en|Secluded pool villa|F:Korunaklı_Havuz
pool|en|Private and secluded villa|F:Korunaklı_Havuz
pool|en|pool not overlooked|F:Korunaklı_Havuz
pool|en|villa with a hidden pool|F:Korunaklı_Havuz
pool|en|secluded villa|F:Korunaklı_Havuz
pool|en|sheltered pool|F:Korunaklı_Havuz
pool|en|villa with private pool|U:private_pool
pool|en|own pool|U:private_pool
pool|en|villa with pool|U:pool
pool|en|shared pool|U:shared_pool
pool|en|infinity pool|U:infinity_pool
pool|en|indoor pool|F:Kapalı_Havuzu_Isıtmalı
pool|en|kiddie pool|T:cocuk-havuzlu-villalar
pool|de|Sichtgeschützte Villa|F:Korunaklı_Havuz
pool|de|Villa mit uneinsehbarem Pool|F:Korunaklı_Havuz
pool|de|blickdichter Pool|F:Korunaklı_Havuz
pool|de|Pool nicht einsehbar|F:Korunaklı_Havuz
pool|de|Villa mit privatem Pool|U:private_pool
pool|de|eigener Pool|U:private_pool
pool|de|Gemeinschaftspool|U:shared_pool
pool|de|Infinity-Pool|U:infinity_pool
pool|de|Hallenbad|F:Kapalı_Havuzu_Isıtmalı
pool|de|Planschbecken|T:cocuk-havuzlu-villalar

# ---------------------------------------------------------------- 6) aile ve çocuk
family|tr|çocuklu aile için villa|U:child_friendly
family|tr|aileye uygun villa|U:child_friendly
family|tr|çocuk dostu villa|U:child_friendly
family|tr|bebekli aileye uygun villa|U:child_friendly
family|tr|kalabalık aileye uygun villa|T:genis-aileye-uygun-villalar
family|tr|geniş aile için Kalkan'da villa|R:kalkan T:genis-aileye-uygun-villalar
family|tr|2 yetişkin 2 çocuk|G:4
family|tr|2 yetişkin 2 çocuk çocuk havuzlu|G:4 T:cocuk-havuzlu-villalar
family|tr|çocuklarla Kaş'ta çocuk oyun alanlı villa|R:kas T:cocuk-oyun-alanli-villalar U:child_friendly
family|tr|çocuk havuzu ve oyun alanı olan villa|T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı
family|tr|4 yetişkin 3 çocuk Fethiye|R:fethiye G:7
family|tr|çocuklu aileler için korunaklı havuzlu villa|F:Korunaklı_Havuz U:child_friendly
family|en|family friendly villa|U:child_friendly
family|en|villa for families with kids|U:child_friendly
family|en|villa with kids pool for 2 adults and 2 kids|T:cocuk-havuzlu-villalar G:4
family|en|large family villa in Kas|R:kas T:genis-aileye-uygun-villalar
family|en|villa with playground and kids pool|T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı
family|en|big family, 10 people|T:genis-aileye-uygun-villalar G:10
family|de|familienfreundliche Villa|U:child_friendly
family|de|Villa mit Kinderpool für Familien mit Kindern|T:cocuk-havuzlu-villalar U:child_friendly
family|de|Großfamilie 12 Personen Kalkan|R:kalkan T:genis-aileye-uygun-villalar G:12
family|de|2 Erwachsene und 2 Kinder|G:4
family|de|Villa mit Spielplatz|T:cocuk-oyun-alanli-villalar

# ---------------------------------------------------------------- 7) balayı ve romantik
honeymoon|tr|balayı için villa|T:balayi-villalari
honeymoon|tr|balayına villa|T:balayi-villalari
honeymoon|tr|romantik villa|T:balayi-villalari
honeymoon|tr|romantik bir tatil için Kaş|R:kas T:balayi-villalari
honeymoon|tr|çiftler için villa|T:balayi-villalari
honeymoon|tr|eşimle baş başa kalacağımız jakuzili villa|T:balayi-villalari F:Jakuzi
honeymoon|tr|yeni evliler için villa|T:balayi-villalari
honeymoon|tr|evlilik yıldönümü için villa|T:balayi-villalari
honeymoon|tr|balayı villası 2 kişi|T:balayi-villalari G:2
honeymoon|tr|balayı için korunaklı havuzlu villa|T:balayi-villalari F:Korunaklı_Havuz
honeymoon|tr|Balayı için jakuzili, sakin bir villa|T:balayi-villalari F:Jakuzi U:quiet
honeymoon|tr|balayı ve özel havuzlu|T:balayi-villalari U:private_pool
honeymoon|tr|muhafazakar balayı villası|T:muhafazakar-villalar T:balayi-villalari
honeymoon|en|honeymoon villa with jacuzzi|T:balayi-villalari F:Jakuzi
honeymoon|en|romantic villa for couples|T:balayi-villalari
honeymoon|en|romantic getaway in Kalkan|R:kalkan T:balayi-villalari
honeymoon|en|villa for newlyweds|T:balayi-villalari
honeymoon|en|anniversary trip villa|T:balayi-villalari
honeymoon|en|honeymoon villa with secluded pool|T:balayi-villalari F:Korunaklı_Havuz
honeymoon|en|conservative honeymoon villa|T:muhafazakar-villalar T:balayi-villalari
honeymoon|de|romantische Villa|T:balayi-villalari
honeymoon|de|Villa für Paare|T:balayi-villalari
honeymoon|de|Flitterwochen in Kaş mit Whirlpool|R:kas T:balayi-villalari F:Jakuzi
honeymoon|de|Hochzeitsreise Villa sichtgeschützt|T:balayi-villalari F:Korunaklı_Havuz
honeymoon|de|konservative Flitterwochen Villa|T:muhafazakar-villalar T:balayi-villalari

# ---------------------------------------------------------------- 8) tarihler
dates|tr|20-25 Haziran|D:2027-06-20..2027-06-25
dates|tr|20 25 haziran Kalkan|R:kalkan D:2027-06-20..2027-06-25
dates|tr|20 haziran - 27 haziran|D:2027-06-20..2027-06-27
dates|tr|1-8 Temmuz Kaş|R:kas D:2027-07-01..2027-07-08
dates|tr|15 ağustos 22 ağustos arası|D:2027-08-15..2027-08-22
dates|tr|30 Haziran - 5 Temmuz|D:2027-06-30..2027-07-05
dates|tr|12-19 Mayıs Fethiye 4 kişi|R:fethiye D:2027-05-12..2027-05-19 G:4
dates|tr|20 haziranda giriş 25 haziranda çıkış|D:2027-06-20..2027-06-25
dates|tr|10-17 Temmuz ±3 gün esnek|D:2027-07-10..2027-07-17 X:3
dates|tr|10-17 Temmuz esnek tarihli|D:2027-07-10..2027-07-17 X:3
dates|tr|5-12 Eylül tarihleri esnek|D:2027-09-05..2027-09-12 X:3
dates|tr|Ağustos ayında Kalkan|R:kalkan
dates|tr|yazın Kaş'ta villa|R:kas
dates|tr|esnek tarih Kalkan|R:kalkan
dates|tr|20.06.2027 - 27.06.2027|D:2027-06-20..2027-06-27
dates|tr|2027-07-03 ile 2027-07-10 arası|D:2027-07-03..2027-07-10
dates|en|20-25 June|D:2027-06-20..2027-06-25
dates|en|June 20 to June 25|D:2027-06-20..2027-06-25
dates|en|from 1st to 8th July in Kas|R:kas D:2027-07-01..2027-07-08
dates|en|20 June to 25 June, flexible dates|D:2027-06-20..2027-06-25 X:3
dates|en|August 10-17 plus or minus 3 days|D:2027-08-10..2027-08-17 X:3
dates|en|sometime in August|-
dates|en|next weekend in Kalkan|R:kalkan
dates|de|20. bis 25. Juni|D:2027-06-20..2027-06-25
dates|de|vom 1. bis 8. Juli in Kaş|R:kas D:2027-07-01..2027-07-08
dates|de|Anreise 20. Juni Abreise 25. Juni|D:2027-06-20..2027-06-25
dates|de|10.-17. August flexibel|D:2027-08-10..2027-08-17 X:3
dates|de|im Sommer in Kalkan|R:kalkan

# ---------------------------------------------------------------- 9) kişi sayısı
guests|tr|6 kişilik villa|G:6
guests|tr|6 kişi|G:6
guests|tr|altı kişilik|G:6
guests|tr|10 kişiyiz Kalkan|R:kalkan G:10
guests|tr|8 kişilik bir grup için Kaş|R:kas G:8
guests|tr|2 yetişkin 1 çocuk 1 bebek|G:4
guests|tr|3 aile 12 kişi|G:12
guests|tr|iki kişilik villa|G:2
guests|tr|4 kişi Fethiye|R:fethiye G:4
guests|en|villa for 6|G:6
guests|en|for 8 people|G:8
guests|en|4 adults 2 kids|G:6
guests|en|two guests|G:2
guests|en|ten people in Kalkan|R:kalkan G:10
guests|de|für 6 Personen|G:6
guests|de|4 Erwachsene und 1 Kind|G:5
guests|de|zwei Personen in Kaş|R:kas G:2
guests|de|8 Gäste|G:8

# ---------------------------------------------------------------- 10) çok kriterli
multi|tr|Kalkan'da 4 kişilik jakuzili ve saunalı villa 10-17 Temmuz|R:kalkan G:4 F:Jakuzi F:Sauna D:2027-07-10..2027-07-17
multi|tr|Kaş'ta deniz manzaralı, korunaklı havuzlu, 6 kişilik villa|R:kas T:deniz-manzarali-villalar F:Korunaklı_Havuz G:6
multi|tr|Fethiye Ölüdeniz'de lüks villa 8 kişi|R:oludeniz T:luks-villalar G:8
multi|tr|Üzümlü'de doğa manzaralı jakuzili villa 2 kişi|R:uzumlu T:doga-manzarali F:Jakuzi G:2
multi|tr|Kalkan veya Kaş, çocuk havuzlu, 2 yetişkin 2 çocuk, 1-8 Ağustos|R:kalkan R:kas T:cocuk-havuzlu-villalar G:4 D:2027-08-01..2027-08-08
multi|tr|bungalov jakuzili|T:bungalov F:Jakuzi
multi|tr|jakuzili bungalov Kaş|R:kas T:bungalov F:Jakuzi
multi|tr|korunaklı ve jakuzili villa|F:Korunaklı_Havuz F:Jakuzi
multi|tr|çocuk havuzlu muhafazakar villa|T:cocuk-havuzlu-villalar T:muhafazakar-villalar
multi|tr|lüks deniz manzaralı villa|T:luks-villalar T:deniz-manzarali-villalar
multi|tr|evcil hayvan kabul eden ve sauna olan villa Fethiye|R:fethiye T:evcil-hayvan-izinli F:Sauna
multi|tr|bilardo, masa tenisi ve langırt olan villa|F:Bilardo F:Masa_Tenisi F:Langırt
multi|tr|sinema odası, spor salonu, hamam ve sauna|F:Sinema_Odası F:Spor_Salonu F:Hamam F:Sauna
multi|tr|Kalkan'da en ucuz 4 kişilik villa|R:kalkan G:4 S:price-asc
multi|tr|Kaş'ta en geniş villalar|R:kas S:capacity-desc
multi|tr|bungalov veya apart|-
multi|tr|jakuzili bungalov veya apart balayı için|T:balayi-villalari F:Jakuzi
multi|tr|lüks ama ekonomik villa|-
multi|en|Luxury sea view villa in Kalkan for 6 with jacuzzi|R:kalkan T:luks-villalar T:deniz-manzarali-villalar G:6 F:Jakuzi
multi|en|pet friendly villa with sauna in Fethiye for 4 people, 1-8 July|R:fethiye T:evcil-hayvan-izinli F:Sauna G:4 D:2027-07-01..2027-07-08
multi|en|secluded pool and jacuzzi villa in Kas|R:kas F:Korunaklı_Havuz F:Jakuzi
multi|en|honeymoon bungalow with jacuzzi|T:balayi-villalari T:bungalov F:Jakuzi
multi|en|cheapest villas in Kalkan for 4|R:kalkan G:4 S:price-asc
multi|en|largest villa in Fethiye|R:fethiye S:capacity-desc
multi|en|villa in Oludeniz with private beach and wifi|R:oludeniz F:Özel_Plajlı_Villa F:Wifi
multi|de|Luxusvilla mit Meerblick in Kalkan für 8 Personen|R:kalkan T:luks-villalar T:deniz-manzarali-villalar G:8
multi|de|Villa mit Kinderpool, Whirlpool und Sauna in Kaş|R:kas T:cocuk-havuzlu-villalar F:Jakuzi F:Sauna
multi|de|Ferienvilla in Kalkan mit Kinderpool und Sauna, günstigste zuerst|R:kalkan T:cocuk-havuzlu-villalar F:Sauna S:price-asc
multi|de|sichtgeschützte Villa mit Whirlpool für 2 Personen, 4.-10. Juni|F:Korunaklı_Havuz F:Jakuzi G:2 D:2027-06-04..2027-06-10
multi|de|Villa in Göcek mit Grill und Tischtennis|R:gocek F:Barbekü F:Masa_Tenisi

# ---------------------------------------------------------------- 11) konuşma dili
colloquial|tr|merhaba, kalkanda jakuzisi olan bi villa lazım|R:kalkan F:Jakuzi
colloquial|tr|kaşta 6 kişi kalabileceğimiz bi yer var mı|R:kas G:6
colloquial|tr|ya bize balayı için romantik bi villa bulsanıza|T:balayi-villalari
colloquial|tr|köpeğimizle gidiyoruz, Kaş'ta kalacak villa|R:kas T:evcil-hayvan-izinli
colloquial|tr|havuzu dışarıdan görünmesin, muhafazakar aileyiz|T:muhafazakar-villalar F:Korunaklı_Havuz
colloquial|tr|deniz manzarası olsun, jakuzi de olursa süper|T:deniz-manzarali-villalar F:Jakuzi
colloquial|tr|çocuklar için havuzu olsun yeter|T:cocuk-havuzlu-villalar
colloquial|tr|fethiye taraflarında saunalı bişey|R:fethiye F:Sauna
colloquial|tr|acaba kalkan civarında lüks villa önerir misiniz|R:kalkan T:luks-villalar
colloquial|tr|ailecek 8 kişiyiz, otoparkı olan villa|G:8 F:Açık_Otopark
colloquial|tr|bize uygun villa var mı kaşta|R:kas
colloquial|tr|tatile gideceğiz, sinema odası olan villa tavsiye|F:Sinema_Odası
colloquial|en|hey, looking for a place in Kalkan with a hot tub|R:kalkan F:Jakuzi
colloquial|en|we are 6 friends coming to Kas, any villa?|R:kas G:6
colloquial|en|need something romantic for our honeymoon|T:balayi-villalari
colloquial|en|bringing our dog, want a villa in Fethiye|R:fethiye T:evcil-hayvan-izinli
colloquial|en|somewhere quiet with a sea view please|T:deniz-manzarali-villalar U:quiet
colloquial|en|can you suggest a villa with a pool for kids|T:cocuk-havuzlu-villalar
colloquial|de|hallo, wir suchen was in Kalkan mit Whirlpool|R:kalkan F:Jakuzi
colloquial|de|wir sind 6 Leute und wollen nach Kaş|R:kas G:6
colloquial|de|mit unserem Hund in Fethiye|R:fethiye T:evcil-hayvan-izinli
colloquial|de|was Romantisches für die Flitterwochen|T:balayi-villalari

# ---------------------------------------------------------------- 12) yazım hataları
typo|tr|jakuzli villa|F:Jakuzi
typo|tr|jakuz villa|F:Jakuzi
typo|tr|jakkuzi|F:Jakuzi
typo|tr|saunlı villa|F:Sauna
typo|tr|Kalkn'da villa|R:kalkan
typo|tr|Fethye villa|R:fethiye
typo|tr|Fetiye'de villa|R:fethiye
typo|tr|Kalakn|R:kalkan
typo|tr|muhafazakr villa|T:muhafazakar-villalar
typo|tr|muhafazkar|T:muhafazakar-villalar
typo|tr|balaayı villası|T:balayi-villalari
typo|tr|korunakli havuz|F:Korunaklı_Havuz
typo|tr|korunakı havuzlu villa|F:Korunaklı_Havuz
typo|tr|deniz manzarli villa|T:deniz-manzarali-villalar
typo|tr|ölüdenz|R:oludeniz
typo|tr|Uzumlude villa|R:uzumlu
typo|tr|bilardolu villa|F:Bilardo
typo|tr|jenaratör|F:Jeneratör
typo|tr|hisaronu|R:fethiye-hisaronu
typo|tr|gocek|R:gocek
typo|tr|islamlarda villa|R:islamlar
typo|tr|saribelen|R:saribelen
typo|en|jaccuzi|F:Jakuzi
typo|en|jacuzi villa|F:Jakuzi
typo|en|honeymon villa|T:balayi-villalari
typo|en|luxary villa|T:luks-villalar
typo|en|secluded pol|F:Korunaklı_Havuz
typo|en|Fethiyee|R:fethiye
typo|de|Whirpool|F:Jakuzi
typo|de|Luxusvila|T:luks-villalar
typo|de|Kinderpol|T:cocuk-havuzlu-villalar
typo|de|Sichtgeschützt Villa|F:Korunaklı_Havuz

# ---------------------------------------------------------------- 13) kısa / eksik
short|tr|kalkan|R:kalkan
short|tr|kaş|R:kas
short|tr|jakuzi|F:Jakuzi
short|tr|balayı|T:balayi-villalari
short|tr|lüks|T:luks-villalar
short|tr|6 kişi|G:6
short|tr|haziran|-
short|tr|villa|-
short|tr|deniz|-
short|tr|havuz|U:pool
short|tr|sauna kalkan|R:kalkan F:Sauna
short|tr|korunaklı kaş|R:kas F:Korunaklı_Havuz
short|en|kalkan|R:kalkan
short|en|jacuzzi|F:Jakuzi
short|en|honeymoon|T:balayi-villalari
short|en|villa|-
short|en|pool|U:pool
short|en|sea view|T:deniz-manzarali-villalar
short|de|Kaş|R:kas
short|de|Whirlpool|F:Jakuzi
short|de|Meerblick|T:deniz-manzarali-villalar
short|de|Villa|-
short|tr|asdf qwerty|-
short|tr|xyz|-
short|tr|eden|-
short|tr|ve|-

# ---------------------------------------------------------------- 14) TR doğal cümleler
tr|tr|Kalkan'da 6 kişilik özel havuzlu ve jakuzili villa|R:kalkan G:6 F:Jakuzi U:private_pool
tr|tr|Kaş'ta evcil hayvanımızla kalabileceğimiz deniz manzaralı villa arıyoruz|R:kas T:evcil-hayvan-izinli T:deniz-manzarali-villalar
tr|tr|Fethiye'de 10 kişilik geniş bahçeli ve barbeküsü olan villa|R:fethiye G:10 F:Geniş_Bahçe F:Barbekü
tr|tr|Üzümlü'de balayı için korunaklı ve jakuzili bir villa istiyoruz|R:uzumlu T:balayi-villalari F:Korunaklı_Havuz F:Jakuzi
tr|tr|Ölüdeniz'de 1-8 Temmuz arası 4 kişilik villa|R:oludeniz D:2027-07-01..2027-07-08 G:4
tr|tr|Göcek'te özel plajlı lüks villa|R:gocek T:luks-villalar F:Özel_Plajlı_Villa
tr|tr|Patara'ya yakın doğa manzaralı sakin bir villa|R:patara T:doga-manzarali U:quiet
tr|tr|Kalkan merkezde jeneratörlü wifi olan villa|R:kalkan-merkez F:Jeneratör F:Wifi
tr|tr|Islamlar'da kapalı havuzlu ısıtmalı villa kış tatili için|R:islamlar T:kapali-havuzlu-isitmali-villalar
tr|tr|Kaş'ta çocuk oyun alanı ve çocuk havuzu olan villa 2 yetişkin 3 çocuk|R:kas F:Çocuk_Oyun_Alanı T:cocuk-havuzlu-villalar G:5
tr|tr|Bezirgan'da doğa içinde saunalı villa|R:bezirgan T:doga-manzarali F:Sauna
tr|tr|Kalkan'da muhafazakar, havuzu dışarıdan görünmeyen villa 15-22 Ağustos|R:kalkan T:muhafazakar-villalar F:Korunaklı_Havuz D:2027-08-15..2027-08-22
tr|tr|Kayaköy'de 3 kişilik ekonomik villa|R:kayakoy T:ekonomik-villalar G:3
tr|tr|Kaş'ta birbirine yakın iki villa 16 kişi|R:kas T:birbirine-yakin-villalar G:16
tr|tr|Hisarönü'nde masa tenisi ve bilardo olan villa|R:fethiye-hisaronu F:Masa_Tenisi F:Bilardo
tr|tr|Kalkan'da deniz manzaralı villalar en ucuzdan|R:kalkan T:deniz-manzarali-villalar S:price-asc
tr|tr|Fethiye'de hamamlı ve spor salonlu lüks villa|R:fethiye F:Hamam F:Spor_Salonu T:luks-villalar
tr|tr|Kalkan Kalamar'da korunaklı havuzlu balayı villası|R:kalkan-kalamar F:Korunaklı_Havuz T:balayi-villalari
tr|tr|Çukurbağ yarımadasında deniz manzaralı villa 4 kişi|R:kas-cukurbag-yarimadasi T:deniz-manzarali-villalar G:4
tr|tr|Kalkan'da beyaz eşyalı apart 2 kişi|R:kalkan F:Beyaz_Eşya T:apartlar G:2
tr|tr|Kaş'ta havlu çarşaf dahil saç kurutma makinesi olan villa|R:kas F:Havlu_/_Çarşaf F:Saç_Kurutma_Makinesi
tr|tr|Göcek'te çift jakuzili villa balayı|R:gocek F:Çift_Jakuzi T:balayi-villalari
tr|tr|Kalkan'da otoparkı olan merkezi konumda villa|R:kalkan F:Açık_Otopark F:Merkezi_Konum
tr|tr|5-12 Eylül Kaş'ta 2 kişilik romantik villa|R:kas D:2027-09-05..2027-09-12 G:2 T:balayi-villalari
tr|tr|Fethiye Üzümlü'de 6 kişilik villa|R:fethiye-uzumlu G:6

# ---------------------------------------------------------------- 15) EN doğal cümleler
en|en|Looking for a luxury villa in Kalkan with a jacuzzi for 4 people|R:kalkan T:luks-villalar F:Jakuzi G:4
en|en|We need a pet friendly villa in Kas from 10 to 17 July|R:kas T:evcil-hayvan-izinli D:2027-07-10..2027-07-17
en|en|Secluded honeymoon villa with jacuzzi in Uzumlu|R:uzumlu F:Korunaklı_Havuz T:balayi-villalari F:Jakuzi
en|en|Villa in Fethiye with sea views, sauna and a gym for 8|R:fethiye T:deniz-manzarali-villalar F:Sauna F:Spor_Salonu G:8
en|en|Family villa in Oludeniz with kids pool and playground, 2 adults 2 children|R:oludeniz T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı G:4
en|en|Budget villa in Kayakoy for 3|R:kayakoy T:ekonomik-villalar G:3
en|en|Conservative family villa with a pool not overlooked in Kalkan|R:kalkan T:muhafazakar-villalar F:Korunaklı_Havuz
en|en|Villa with heated indoor pool in Islamlar for winter|R:islamlar T:kapali-havuzlu-isitmali-villalar
en|en|Nature view villa near Bezirgan with fireplace|R:bezirgan T:doga-manzarali U:fireplace
en|en|Villa in Gocek with private beach and BBQ|R:gocek F:Özel_Plajlı_Villa F:Barbekü
en|en|Two nearby villas in Kas for 14 people|R:kas T:birbirine-yakin-villalar G:14
en|en|Romantic sea view villa in Kalkan for 2, 5-12 September|R:kalkan T:balayi-villalari T:deniz-manzarali-villalar G:2 D:2027-09-05..2027-09-12
en|en|Villa with billiards, table tennis and table football|F:Bilardo F:Masa_Tenisi F:Langırt
en|en|Kalkan villa with wifi and parking|R:kalkan F:Wifi F:Açık_Otopark
en|en|Villa with cinema room and hammam in Fethiye|R:fethiye F:Sinema_Odası F:Hamam
en|en|Large family villa in Kalkan, 12 guests, cheapest first|R:kalkan T:genis-aileye-uygun-villalar G:12 S:price-asc
en|en|Apartment in Kas for 2 with household appliances|R:kas T:apartlar G:2 F:Beyaz_Eşya
en|en|Villa in Kalamar Bay with double jacuzzi|R:kalkan-kalamar F:Çift_Jakuzi
en|en|Halal friendly villa in Kas with secluded pool for 6|R:kas T:muhafazakar-villalar F:Korunaklı_Havuz G:6
en|en|Villa with towels and linens provided and a hair dryer|F:Havlu_/_Çarşaf F:Saç_Kurutma_Makinesi
en|en|Villa in Patara with generator and spacious garden|R:patara F:Jeneratör F:Geniş_Bahçe
en|en|central location villa in Kas for 4|R:kas F:Merkezi_Konum G:4

# ---------------------------------------------------------------- 16) DE doğal cümleler
de|de|Wir suchen eine Luxusvilla in Kalkan mit Whirlpool für 4 Personen|R:kalkan T:luks-villalar F:Jakuzi G:4
de|de|Haustierfreundliche Villa in Kaş vom 10. bis 17. Juli|R:kas T:evcil-hayvan-izinli D:2027-07-10..2027-07-17
de|de|Sichtgeschützte Villa für die Flitterwochen in Üzümlü|R:uzumlu F:Korunaklı_Havuz T:balayi-villalari
de|de|Villa mit Meerblick in Fethiye mit Sauna und Fitnessraum für 8 Personen|R:fethiye T:deniz-manzarali-villalar F:Sauna F:Spor_Salonu G:8
de|de|Familienvilla in Ölüdeniz mit Kinderpool und Spielplatz, 2 Erwachsene 2 Kinder|R:oludeniz T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı G:4
de|de|Preiswerte Villa in Kayaköy für 3 Personen|R:kayakoy T:ekonomik-villalar G:3
de|de|Villa für konservative Familien mit uneinsehbarem Pool in Kalkan|R:kalkan T:muhafazakar-villalar F:Korunaklı_Havuz
de|de|Villa mit beheiztem Innenpool in Islamlar|R:islamlar T:kapali-havuzlu-isitmali-villalar
de|de|Villa mit Naturblick bei Bezirgan mit Kamin|R:bezirgan T:doga-manzarali U:fireplace
de|de|Villa in Göcek mit Privatstrand und Grill|R:gocek F:Özel_Plajlı_Villa F:Barbekü
de|de|Romantische Villa mit Meerblick in Kalkan für 2 Personen|R:kalkan T:balayi-villalari T:deniz-manzarali-villalar G:2
de|de|Villa mit Billard, Tischtennis und Tischfußball|F:Bilardo F:Masa_Tenisi F:Langırt
de|de|Villa in Kalkan mit WLAN und Parkplatz|R:kalkan F:Wifi F:Açık_Otopark
de|de|Villa mit Heimkino und türkischem Bad in Fethiye|R:fethiye F:Sinema_Odası F:Hamam
de|de|Villa für große Familien in Kalkan, 12 Gäste, günstigste zuerst|R:kalkan T:genis-aileye-uygun-villalar G:12 S:price-asc
de|de|Ferienwohnung in Kaş für 2 Personen|R:kas T:apartlar G:2
de|de|Villa in Kalamar mit Doppel-Whirlpool|R:kalkan-kalamar F:Çift_Jakuzi
de|de|Muslimfreundliche Villa in Kaş mit sichtgeschütztem Pool für 6 Personen|R:kas T:muhafazakar-villalar F:Korunaklı_Havuz G:6
de|de|Villa mit Handtüchern und Haartrockner|F:Havlu_/_Çarşaf F:Saç_Kurutma_Makinesi
de|de|Villa in zentraler Lage in Kaş für 4 Personen|R:kas F:Merkezi_Konum G:4
de|de|Villa mit Hund erlaubt in Kaş|R:kas T:evcil-hayvan-izinli
de|de|Villen mit Kinderpool in Kalkan, größte zuerst|R:kalkan T:cocuk-havuzlu-villalar S:capacity-desc

# ---------------------------------------------------------------- 17) olumsuzluk
negation|tr|jakuzisiz villa Kalkan|R:kalkan N
negation|tr|jakuzi olmasın, Kaş|R:kas N
negation|tr|evcil hayvan kabul etmeyen villa|N
negation|tr|evcil hayvan kabul etmeyen villa Fethiye 4 kişi|R:fethiye G:4 N
negation|tr|saunası olmayan villa|N
negation|tr|havuzsuz villa|N
negation|tr|lüks olmayan villa Kalkan|R:kalkan N
negation|tr|jakuzi istemiyoruz, Kalkan 4 kişi|R:kalkan G:4 N
negation|tr|balayı villası değil, aile villası Kaş|R:kas N
negation|tr|köpek kabul eden villa|T:evcil-hayvan-izinli
negation|tr|sessiz ve sakin bir villa|U:quiet
negation|tr|çocuk havuzu şart değil, Kalkan|R:kalkan N
negation|en|villa without jacuzzi in Kas|R:kas N
negation|en|no pets, villa in Kalkan|R:kalkan N
negation|en|not a bungalow, Fethiye villa|R:fethiye N
negation|en|villa with no sauna|N
negation|en|pool not overlooked, Kalkan|R:kalkan F:Korunaklı_Havuz
negation|en|non luxury villa|N
negation|de|Villa ohne Whirlpool in Kaş|R:kas N
negation|de|keine Haustiere, Villa in Kalkan|R:kalkan N
negation|de|Villa ohne Sauna|N
negation|de|Pool nicht einsehbar, Kalkan|R:kalkan F:Korunaklı_Havuz
negation|de|kein Bungalow, Villa in Fethiye|R:fethiye N

# ---------------------------------------------------------------- 18) desteklenmeyen / sistemde olmayan
unsupported|tr|klimalı villa Kalkan|R:kalkan U:air_conditioning
unsupported|tr|asansörlü villa|U:elevator
unsupported|tr|engelli erişimi olan villa Kaş|R:kas U:accessibility
unsupported|tr|tekerlekli sandalyeye uygun|U:accessibility
unsupported|tr|3 yatak odalı villa Fethiye|R:fethiye U:bedrooms
unsupported|tr|denize 200 metre villa|U:sea_distance
unsupported|tr|plaja yürüme mesafesinde villa|U:near_sea
unsupported|tr|deniz kenarında villa|U:near_sea
unsupported|tr|gecelik 5000 TL altı villa|U:budget
unsupported|tr|ucuz villa Kaş|R:kas U:budget
unsupported|tr|minimum 3 gece konaklama|U:min_stay
unsupported|tr|özel havuzlu villa Kalkan|R:kalkan U:private_pool
unsupported|tr|sakin villa|U:quiet
unsupported|tr|huzurlu bir villa Kaş|R:kas U:quiet
unsupported|tr|bahçeli villa|U:garden
unsupported|tr|şömineli villa|U:fireplace
unsupported|tr|sonsuzluk havuzlu villa Kalkan|R:kalkan U:infinity_pool
unsupported|tr|ortak havuzlu villa Kaş|R:kas U:shared_pool
unsupported|tr|çocuklu aileye uygun villa Kalkan|R:kalkan U:child_friendly
unsupported|en|air-conditioned villa in Kalkan|R:kalkan U:air_conditioning
unsupported|en|wheelchair accessible villa|U:accessibility
unsupported|en|villa with elevator|U:elevator
unsupported|en|4 bedroom villa in Kas|R:kas U:bedrooms
unsupported|en|villa within 300m of the beach|U:sea_distance
unsupported|en|cheap villa in Fethiye|R:fethiye U:budget
unsupported|en|under 300 euro per night|U:budget
unsupported|en|villa with private pool in Kalkan|R:kalkan U:private_pool
unsupported|en|quiet villa|U:quiet
unsupported|en|villa with garden|U:garden
unsupported|en|villa with fireplace|U:fireplace
unsupported|en|beachfront villa|U:near_sea
unsupported|de|klimatisierte Villa|U:air_conditioning
unsupported|de|barrierefreie Villa|U:accessibility
unsupported|de|Villa mit Aufzug|U:elevator
unsupported|de|3 Schlafzimmer in Kaş|R:kas U:bedrooms
unsupported|de|günstige Villa in Fethiye|R:fethiye U:budget
unsupported|de|Villa mit privatem Pool in Kalkan|R:kalkan U:private_pool
unsupported|de|ruhige Villa|U:quiet
unsupported|de|Villa mit Garten|U:garden
unsupported|de|Villa mit Kamin|U:fireplace
unsupported|de|Villa direkt am Meer|U:near_sea
unsupported|de|Mindestaufenthalt 3 Nächte|U:min_stay
`;

/* ---------------------------------------------------------------
   KÖR (HOLDOUT) SET — 66 yeni sorgu. Sözlük/parser ayarları korpusun
   üstteki kısmına göre yapıldıktan SONRA yazıldı ve sonucuna göre
   sözlük AYARLANMADI. Genelleme başarısını dürüstçe ölçmek içindir;
   ayrı raporlanır.
   --------------------------------------------------------------- */
export const HOLDOUT = String.raw`
multi|tr|Temmuz'un ilk haftası Kaş'ta 5 kişilik villa|R:kas G:5
multi|tr|kalkan merkeze yakın jakuzili ve korunaklı bir yer|R:kalkan F:Jakuzi F:Korunaklı_Havuz F:Merkezi_Konum
multi|tr|Patara'da 2 kişilik doğa manzaralı balayı evi|R:patara G:2 T:doga-manzarali T:balayi-villalari
multi|tr|Ölüdeniz civarı, 9 kişi, bilardolu|R:oludeniz G:9 F:Bilardo
multi|tr|Göcek veya Fethiye merkezde lüks villa|R:gocek R:fethiye-merkez T:luks-villalar
multi|tr|kaş'ta evcil hayvanlı tatil için bahçesi geniş villa|R:kas T:evcil-hayvan-izinli F:Geniş_Bahçe
multi|tr|3-9 Ağustos Kalkan 7 kişi saunalı|R:kalkan D:2027-08-03..2027-08-09 G:7 F:Sauna
multi|tr|Üzümlü'de 4 yetişkin için korunaklı havuzlu muhafazakar villa|R:uzumlu G:4 F:Korunaklı_Havuz T:muhafazakar-villalar
multi|tr|kışın kapalı havuzlu villa İslamlar|R:islamlar T:kapali-havuzlu-isitmali-villalar
multi|tr|Kalkan'da masa tenisi olan çocuklu aileye uygun villa|R:kalkan F:Masa_Tenisi U:child_friendly
multi|tr|Kaş Çukurbağ'da deniz manzaralı 4 kişilik villa en ucuz|R:cukurbag T:deniz-manzarali-villalar G:4 S:price-asc
multi|tr|hamamı ve saunası olan villa|F:Hamam F:Sauna
multi|tr|jakuzisi olan ama havuzu ortak olmayan villa|F:Jakuzi N
multi|tr|bungalovda 2 kişi balayı|T:bungalov G:2 T:balayi-villalari
multi|tr|apart 3 kişi Kaş merkez|T:apartlar G:3 R:kas-merkez
multi|tr|sahile yakın ekonomik villa Fethiye|R:fethiye T:ekonomik-villalar U:near_sea
multi|tr|Kalkan'da 12 kişilik geniş aile villası barbekülü|R:kalkan G:12 T:genis-aileye-uygun-villalar F:Barbekü
multi|tr|klimalı ve wifi olan villa|F:Wifi U:air_conditioning
multi|tr|Faralya'da doğa içinde sakin villa|R:fethiye-faralya T:doga-manzarali U:quiet
multi|tr|Hisarönü'nde çocuk havuzlu ve oyun alanlı villa 2+2|R:fethiye-hisaronu T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı G:4
multi|tr|18-25 haziran tarihleri arası kalkanda muhafazakar villa 6 kişi|R:kalkan D:2027-06-18..2027-06-25 T:muhafazakar-villalar G:6
multi|tr|sinema odalı lüks villa Kalkan|F:Sinema_Odası T:luks-villalar R:kalkan
multi|tr|özel plajı olan villa Göcek|F:Özel_Plajlı_Villa R:gocek
multi|tr|jeneratörü olan villa kaş|F:Jeneratör R:kas
multi|tr|havuzu dışardan görünmeyen balayı villası|F:Korunaklı_Havuz T:balayi-villalari
multi|tr|köpeğimle kalabileceğim villa Kalkan|T:evcil-hayvan-izinli R:kalkan
multi|tr|langırt ve bilardo olsun, 10 kişiyiz|F:Langırt F:Bilardo G:10
multi|tr|kalkan üzümlü 4 kişi 1-7 eylül|R:uzumlu G:4 D:2027-09-01..2027-09-07
multi|tr|kaş'ta 3 yatak odalı, denize sıfır villa|R:kas U:bedrooms U:near_sea
multi|tr|en pahalı villalar Kalkan|R:kalkan S:price-desc
multi|en|villa in Kas with hot tub and sea views for six|R:kas F:Jakuzi T:deniz-manzarali-villalar G:6
multi|en|quiet honeymoon villa in Patara|R:patara T:balayi-villalari U:quiet
multi|en|kid friendly villa with a children's pool in Kalkan, 2 adults 3 kids|R:kalkan T:cocuk-havuzlu-villalar G:5 U:child_friendly
multi|en|dog friendly villa near Fethiye with BBQ|R:fethiye T:evcil-hayvan-izinli F:Barbekü
multi|en|villa with a sauna and a turkish bath in Kalkan|F:Sauna F:Hamam R:kalkan
multi|en|cheap apartment in Kas|R:kas T:apartlar U:budget
multi|en|luxury villa with private beach in Gocek for 10 guests|T:luks-villalar F:Özel_Plajlı_Villa R:gocek G:10
multi|en|villa with secluded pool, no jacuzzi needed, Kalkan|F:Korunaklı_Havuz R:kalkan N
multi|en|July 4-11, Kalkan, 4 adults|D:2027-07-04..2027-07-11 R:kalkan G:4
multi|en|bungalow for two in Faralya|T:bungalov G:2 R:fethiye-faralya
multi|en|villa with wifi, parking and generator|F:Wifi F:Açık_Otopark F:Jeneratör
multi|en|nature view villa with heated pool|T:doga-manzarali F:Kapalı_Havuzu_Isıtmalı
multi|en|villa with elevator and air conditioning in Kas|R:kas U:elevator U:air_conditioning
multi|en|biggest villas in Kalkan|R:kalkan S:capacity-desc
multi|en|halal villa with private pool not overlooked|T:muhafazakar-villalar F:Korunaklı_Havuz
multi|en|villa for 3 families, 14 people, Kalkan|G:14 R:kalkan
multi|en|villa with table tennis near Kalamar|F:Masa_Tenisi R:kalkan-kalamar
multi|en|pet friendly bungalow|T:evcil-hayvan-izinli T:bungalov
multi|en|villa with garden and pool|U:garden U:pool
multi|en|villa in Ovacik with a gym|R:ovacik F:Spor_Salonu
multi|de|Villa in Kaş mit Whirlpool und Meerblick für sechs Personen|R:kas F:Jakuzi T:deniz-manzarali-villalar G:6
multi|de|ruhige Hochzeitsreise-Villa in Patara|R:patara T:balayi-villalari U:quiet
multi|de|kinderfreundliche Villa mit Kinderpool in Kalkan, 2 Erwachsene 3 Kinder|R:kalkan T:cocuk-havuzlu-villalar G:5 U:child_friendly
multi|de|hundefreundliche Villa bei Fethiye mit Grill|R:fethiye T:evcil-hayvan-izinli F:Barbekü
multi|de|Villa mit Sauna und Hamam in Kalkan|F:Sauna F:Hamam R:kalkan
multi|de|günstige Ferienwohnung in Kaş|R:kas T:apartlar U:budget
multi|de|Luxusvilla mit Privatstrand in Göcek für 10 Gäste|T:luks-villalar F:Özel_Plajlı_Villa R:gocek G:10
multi|de|4. bis 11. Juli, Kalkan, 4 Erwachsene|D:2027-07-04..2027-07-11 R:kalkan G:4
multi|de|Bungalow für zwei in Faralya|T:bungalov G:2 R:fethiye-faralya
multi|de|Villa mit WLAN, Parkplatz und Generator|F:Wifi F:Açık_Otopark F:Jeneratör
multi|de|Villa mit Aufzug und Klimaanlage in Kaş|R:kas U:elevator U:air_conditioning
multi|de|größte Villen in Kalkan|R:kalkan S:capacity-desc
multi|de|Villa ohne Haustiere in Kalkan|R:kalkan N
multi|de|Villa mit Tischtennis bei Kalamar|F:Masa_Tenisi R:kalkan-kalamar
multi|de|Villa in Ovacık mit Fitnessraum|R:ovacik F:Spor_Salonu
multi|de|Villa mit Garten und Pool|U:garden U:pool
`;
