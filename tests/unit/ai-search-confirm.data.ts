/* ===============================================================
   🧪 AI ARAMA — DÜZELTME SONRASI DOĞRULAMA SETİ (112 sorgu)
   ===============================================================
   Final bağımsız setteki (ai-search-blind.data.ts) hatalar düzeltildikten
   SONRA, parser çalıştırılmadan önce yazılıp sabitlendi. Düzeltmelerin
   yalnız görülen sorgulara değil, benzer YENİ ifadelere de genellenip
   genellenmediğini ölçer. Sonuca göre ayarlama YAPILMAZ.
   Biçim: ai-search-blind.data.ts ile aynı.
   =============================================================== */

export const CONFIRM = String.raw`
region|tr|Kaş'ın merkezine yakın sauna olan villa|R:kas F:Merkezi_Konum F:Sauna
region|tr|Fethiye merkeze yakın 4 kişilik villa|R:fethiye F:Merkezi_Konum G:4
region|tr|Kalkan merkezinde villa|R:kalkan-merkez
region|tr|Patara merkezde 2 kişilik|R:patara-merkez G:2
region|tr|Demre'de deniz manzaralı villa|R:demre T:deniz-manzarali-villalar
region|tr|Kalkan Bezirgan 6 kişi|R:bezirgan G:6
region|tr|Kaş Gökçeören villa|R:gokceoren
region|tr|Çavdır'da villa|R:cavdir
region|tr|Uğrar'da korunaklı villa|R:kas-ugrar F:Korunaklı_Havuz
region|tr|Seydikemer doğa manzaralı|R:seydikemer T:doga-manzarali
type|tr|ailemizle muhafazakar bir villa|T:muhafazakar-villalar
type|tr|köpeğimizi getirebileceğimiz villa|T:evcil-hayvan-izinli
type|tr|çiftimiz için romantik villa|T:balayi-villalari
type|tr|büyük grubumuz için geniş aile villası|T:genis-aileye-uygun-villalar
type|tr|yanyana villalar|T:birbirine-yakin-villalar
feature|tr|hamamlı ve saunalı villa Kaş|R:kas F:Hamam F:Sauna
feature|tr|bilardolu ve langırtlı villa|F:Bilardo F:Langırt
feature|tr|wifi'si olan villa|F:Wifi
feature|tr|jeneratörlü villa Kalkan|R:kalkan F:Jeneratör
feature|tr|mangallı bahçeli villa|F:Barbekü U:garden
feature|tr|büyük bahçesi olan villa|F:Geniş_Bahçe
pool|tr|kimsenin görmediği havuz|F:Korunaklı_Havuz
pool|tr|havuzu dışarıdan görünmesin|F:Korunaklı_Havuz
pool|tr|özel havuzlu muhafazakar villa|T:muhafazakar-villalar U:private_pool
pool|tr|çocuk havuzlu ve korunaklı villa|T:cocuk-havuzlu-villalar F:Korunaklı_Havuz
negation|tr|jakuzili olmasın|N
negation|tr|evcil hayvan istemiyoruz Kaş|R:kas N
negation|tr|sinema odası gerekmez|N
negation|tr|kalabalık değiliz, 2 kişi|G:2
dates|tr|1-5 Ağustos Kalkan esnek|R:kalkan D:2027-08-01..2027-08-05 X:3
dates|tr|15 Temmuz-22 Temmuz 4 kişi|D:2027-07-15..2027-07-22 G:4
dates|tr|3-10 Ocak Kaş|R:kas D:2027-01-03..2027-01-10
sort|tr|en ucuzdan pahalıya Kalkan villaları|R:kalkan S:price-asc
sort|tr|en büyük villalar Kaş|R:kas S:capacity-desc
typo|tr|Kalkanda jakuzli villa|R:kalkan F:Jakuzi
typo|tr|fethiyede saunali villa|R:fethiye F:Sauna
typo|tr|korunakli havuzlu villa|F:Korunaklı_Havuz
typo|tr|muhafazakar balayi villasi|T:muhafazakar-villalar T:balayi-villalari
conflict|tr|apart veya bungalov 2 kişi|G:2
short|tr|kalan villalar|-
short|tr|karşı tarafta|-
short|tr|devre mülk|-
short|tr|oda|-
unsupported|tr|3+1 villa|-
unsupported|tr|deniz kenarı 50 metre|U:sea_distance
unsupported|tr|klimalı jakuzili villa|F:Jakuzi U:air_conditioning
unsupported|tr|tekerlekli sandalye ile erişilebilir|U:accessibility
region|en|villa near the centre of Kas|R:kas F:Merkezi_Konum
region|en|Fethiye centre villa|R:fethiye-merkez
region|en|villa in Bezirgan for 6|R:bezirgan G:6
region|en|Kalkan Kalamar villa|R:kalkan-kalamar
type|en|villa for conservative families|T:muhafazakar-villalar
type|en|we have a dog, Kas villa|R:kas T:evcil-hayvan-izinli
type|en|romantic couples villa|T:balayi-villalari
type|en|villa for a large group of family|T:genis-aileye-uygun-villalar
feature|en|villa with sauna and turkish bath|F:Sauna F:Hamam
feature|en|villa with a pool table and table tennis|F:Bilardo F:Masa_Tenisi
feature|en|villa with BBQ area|F:Barbekü
feature|en|villa with a big garden|F:Geniş_Bahçe
feature|en|parking available|F:Açık_Otopark
pool|en|secluded pool villa in Kalkan for 4|R:kalkan F:Korunaklı_Havuz G:4
pool|en|private pool and jacuzzi|U:private_pool F:Jakuzi
pool|en|kids pool and playground|T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı
negation|en|no hot tub needed|N
negation|en|without pets, Fethiye|R:fethiye N
negation|en|we don't want a bungalow|N
dates|en|Aug 1-5 in Kalkan, flexible|R:kalkan D:2027-08-01..2027-08-05 X:3
dates|en|15 July to 22 July for 4|D:2027-07-15..2027-07-22 G:4
sort|en|lowest price villas in Kas|R:kas S:price-asc
sort|en|largest villas in Kalkan|R:kalkan S:capacity-desc
typo|en|jacuzi villa Kalkan|R:kalkan F:Jakuzi
typo|en|seclued pool|F:Korunaklı_Havuz
typo|en|Kalkann villa|R:kalkan
conflict|en|apartment or bungalow for 2|G:2
short|en|rest|-
short|en|center|-
short|en|room|-
unsupported|en|villa with air conditioning and wifi|F:Wifi U:air_conditioning
unsupported|en|5 bedrooms|U:bedrooms
unsupported|en|beachfront villa with jacuzzi|U:near_sea F:Jakuzi
region|de|Villa nahe dem Zentrum von Kaş|R:kas F:Merkezi_Konum
region|de|Villa in Fethiye Zentrum|R:fethiye-merkez
region|de|Villa in Bezirgan für 6 Personen|R:bezirgan G:6
region|de|Villa in Kalamar|R:kalkan-kalamar
type|de|Villa für konservative Familien|T:muhafazakar-villalar
type|de|wir haben einen Hund, Villa in Kaş|R:kas T:evcil-hayvan-izinli
type|de|romantische Villa für Paare|T:balayi-villalari
type|de|Villa für eine große Familie|T:genis-aileye-uygun-villalar
feature|de|Villa mit Sauna und Hamam|F:Sauna F:Hamam
feature|de|Villa mit Billard und Tischtennis|F:Bilardo F:Masa_Tenisi
feature|de|Villa mit Grillecke|F:Barbekü
feature|de|Villa mit großem Garten|F:Geniş_Bahçe
feature|de|Parkplatz vorhanden|F:Açık_Otopark
pool|de|sichtgeschützter Pool in Kalkan für 4 Personen|R:kalkan F:Korunaklı_Havuz G:4
pool|de|privater Pool und Whirlpool|U:private_pool F:Jakuzi
pool|de|Kinderpool und Spielplatz|T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı
negation|de|kein Whirlpool nötig|N
negation|de|ohne Haustiere, Fethiye|R:fethiye N
negation|de|wir wollen keinen Bungalow|N
dates|de|1.-5. August in Kalkan, flexibel|R:kalkan D:2027-08-01..2027-08-05 X:3
dates|de|15. Juli bis 22. Juli für 4 Personen|D:2027-07-15..2027-07-22 G:4
sort|de|billigste Villen in Kaş|R:kas S:price-asc
sort|de|größte Villen in Kalkan|R:kalkan S:capacity-desc
typo|de|Whirlpoool Villa|F:Jakuzi
typo|de|sichtgeschüzter Pool|F:Korunaklı_Havuz
typo|de|Kalkann Villa|R:kalkan
conflict|de|Ferienwohnung oder Bungalow für 2|G:2
short|de|Zimmer|-
short|de|Rest|-
unsupported|de|Villa mit Klimaanlage und WLAN|F:Wifi U:air_conditioning
unsupported|de|5 Schlafzimmer|U:bedrooms
unsupported|de|Villa direkt am Strand mit Whirlpool|U:near_sea F:Jakuzi
`;
