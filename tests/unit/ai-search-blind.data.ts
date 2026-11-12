/* ===============================================================
   🧪 AI ARAMA — FİNAL BAĞIMSIZ (KÖR) TEST SETİ
   ===============================================================
   • Sözlük/parser geliştirilirken KULLANILMAMIŞ yeni sorgular.
   • Parser çalıştırılmadan ÖNCE yazıldı ve sabitlendi (md5 raporda).
     Sonuçlara göre sorgu veya beklenti DEĞİŞTİRİLMEZ; hatalar parser'da
     düzeltilir.
   • Biçim ve belirteçler `ai-search-corpus.data.ts` ile aynıdır:
       grup | dil | sorgu | beklenti
       R:<bölge-slug> T:<tip-slug> F:<Özellik_Adı> G:<kişi>
       D:<giriş>..<çıkış> X:<±gün> S:<sıralama>
       U:<desteklenmeyen kavram/kod>  N (olumsuz ifade)  - (filtre yok)
   • Beklentiler mevcut ürün kurallarına göredir (uygulama raporu §4–§6):
       – özel havuz ≠ korunaklı havuz ≠ muhafazakâr
       – ana bölge + alt bölge birlikte → yalnız alt bölge
       – "…lı villa"/"villa with …" ile hem tip hem özellik olan ad → tip
       – desteklenmeyen kriter ve olumsuz ifade filtreye DÖNÜŞMEZ
       – çoklu nitelik tipi → hepsi; Bungalov+Apart / Lüks+Ekonomik → hiçbiri
   • Bugün = 2026-11-06 (yıl yazılmazsa gelecekteki ilk tarih).
   =============================================================== */

export const BLIND = String.raw`
# ---------------------------------------------------------------- TR — bölge / alt bölge
region|tr|Kalkan'da kiralık yazlık|R:kalkan
region|tr|Kaş tarafında bir villa|R:kas
region|tr|Fethiye'de bir ev|R:fethiye
region|tr|Demre civarı villa|R:demre
region|tr|Dalaman'a yakın villa|R:dalaman
region|tr|Bodrum'da yazlık villa|R:bodrum
region|tr|Patara plajına yakın villa|R:patara U:near_sea
region|tr|Kalkan mı Kaş mı fark etmez|R:kalkan R:kas
subregion|tr|Kalkan merkeze yakın|R:kalkan F:Merkezi_Konum
subregion|tr|Kalkan merkeze yakın villa|R:kalkan F:Merkezi_Konum
subregion|tr|Kaş merkeze yakın jakuzili villa|R:kas F:Merkezi_Konum F:Jakuzi
subregion|tr|merkeze yakın villa Fethiye|R:fethiye F:Merkezi_Konum
subregion|tr|Kalkan merkezde villa|R:kalkan-merkez
subregion|tr|Kaş merkezdeki villalar|R:kas-merkez
subregion|tr|Üzümlü köyünde villa|R:uzumlu
subregion|tr|Bezirgan yaylasında villa|R:bezirgan
subregion|tr|Kalamar'da denize yakın villa|R:kalkan-kalamar U:near_sea
subregion|tr|Ölüdeniz'e yakın villa|R:oludeniz
subregion|tr|Kayaköy civarında taş ev|R:kayakoy
subregion|tr|Göcek koylarına yakın villa|R:gocek
subregion|tr|Sarıbelen'de havuzlu villa|R:saribelen U:pool
subregion|tr|İslamlar köyü|R:islamlar
subregion|tr|Çukurbağ yarımadası deniz manzaralı|R:kas-cukurbag-yarimadasi T:deniz-manzarali-villalar
subregion|tr|Akbel'de villa 4 kişi|R:akbel G:4
subregion|tr|Kördere'de jakuzili|R:kordere F:Jakuzi
subregion|tr|Hisarönü Ovacık arası villa|R:fethiye-hisaronu R:ovacik
subregion|tr|Faralya'da doğa manzaralı|R:fethiye-faralya T:doga-manzarali
subregion|tr|Gelemiş'te kalacak yer|R:patara
subregion|tr|Yeşilköy Kalkan|R:yesilkoy
subregion|tr|Kızıltaş'ta 6 kişilik|R:kiziltas G:6
# ---------------------------------------------------------------- TR — tipler
type|tr|muhafazakar aile için villa|T:muhafazakar-villalar
type|tr|tesettürlü aileye uygun muhafazakar villa|T:muhafazakar-villalar
type|tr|lüks bir villa istiyoruz|T:luks-villalar
type|tr|deniz manzarası olan villa|T:deniz-manzarali-villalar
type|tr|balayı çifti için villa|T:balayi-villalari
type|tr|evcil hayvanımla gelebileceğim villa|T:evcil-hayvan-izinli
type|tr|kedimizi de getireceğiz|T:evcil-hayvan-izinli
type|tr|doğanın içinde bir villa|T:doga-manzarali
type|tr|ekonomik fiyatlı villalar|T:ekonomik-villalar
type|tr|geniş ailemiz için villa|T:genis-aileye-uygun-villalar
type|tr|yan yana iki villa lazım|T:birbirine-yakin-villalar
type|tr|bungalov tarzı konaklama|T:bungalov
type|tr|apart daireler|T:apartlar
type|tr|ısıtmalı kapalı havuzlu villa|T:kapali-havuzlu-isitmali-villalar
type|tr|çocuk havuzlu villalar|T:cocuk-havuzlu-villalar
# ---------------------------------------------------------------- TR — özellikler
feature|tr|jakuzisi olan villa|F:Jakuzi
feature|tr|saunası olan villa|F:Sauna
feature|tr|hamamı olan villa|F:Hamam
feature|tr|sinema odası bulunan villa|F:Sinema_Odası
feature|tr|mangalı olan villa|F:Barbekü
feature|tr|bilardo masası olan villa|F:Bilardo
feature|tr|masa tenisi masası|F:Masa_Tenisi
feature|tr|langırt masası olan|F:Langırt
feature|tr|spor aletleri olan fitness salonu|F:Spor_Salonu
feature|tr|çift kişilik jakuzi|F:Çift_Jakuzi
feature|tr|havlu ve nevresim dahil|F:Havlu_/_Çarşaf
feature|tr|elektrik kesintisine karşı jeneratör|F:Jeneratör
feature|tr|bahçesi geniş villa|F:Geniş_Bahçe
feature|tr|beyaz eşyası tam villa|F:Beyaz_Eşya
feature|tr|merkezi konumda bir villa|F:Merkezi_Konum
feature|tr|arabamızı park edecek yer olsun|F:Açık_Otopark
feature|tr|özel plajı olan villa|F:Özel_Plajlı_Villa
feature|tr|internet bağlantısı olan villa|F:Wifi
feature|tr|fön makinesi olan villa|F:Saç_Kurutma_Makinesi
feature|tr|çocuklar için oyun alanı|F:Çocuk_Oyun_Alanı
# ---------------------------------------------------------------- TR — havuz / mahremiyet
pool|tr|havuzu komşulardan görünmeyen villa|F:Korunaklı_Havuz
pool|tr|mahremiyetli havuz|F:Korunaklı_Havuz
pool|tr|kapalı devre korunaklı havuz|F:Korunaklı_Havuz
pool|tr|korunaklı havuzlu muhafazakar villa Kalkan|R:kalkan F:Korunaklı_Havuz T:muhafazakar-villalar
pool|tr|özel havuzu olan villa|U:private_pool
pool|tr|kendimize ait havuz|U:private_pool
pool|tr|ortak kullanımlı havuz|U:shared_pool
pool|tr|havuzlu bir yer|U:pool
pool|tr|kapalı havuzu olan villa|T:kapali-havuzlu-isitmali-villalar
pool|tr|ısıtmalı havuz Kaş|R:kas F:Kapalı_Havuzu_Isıtmalı
pool|tr|çocuk havuzu olan|T:cocuk-havuzlu-villalar
pool|tr|özel havuzlu ve korunaklı villa|U:private_pool F:Korunaklı_Havuz
# ---------------------------------------------------------------- TR — aile / balayı
family|tr|çocuklu ailemiz için uygun villa|U:child_friendly
family|tr|bebekle tatile uygun villa|U:child_friendly
family|tr|3 yetişkin 2 çocuk Kalkan|R:kalkan G:5
family|tr|2 yetişkin ve 1 bebek|G:3
family|tr|kalabalık ailemiz için 14 kişilik villa|T:genis-aileye-uygun-villalar G:14
family|tr|çocuk havuzu ve çocuk oyun alanı|T:cocuk-havuzlu-villalar F:Çocuk_Oyun_Alanı
honeymoon|tr|balayımız için Kaş'ta villa|R:kas T:balayi-villalari
honeymoon|tr|sevgilimle romantik hafta sonu|T:balayi-villalari
honeymoon|tr|yeni evli çift için jakuzili villa|T:balayi-villalari F:Jakuzi
honeymoon|tr|romantik ve korunaklı villa|T:balayi-villalari F:Korunaklı_Havuz
honeymoon|tr|eşimle yıldönümü tatili|T:balayi-villalari
# ---------------------------------------------------------------- TR — tarih / kişi / esnek / sıralama
dates|tr|7-14 Temmuz|D:2027-07-07..2027-07-14
dates|tr|7 temmuz 14 temmuz Kalkan|R:kalkan D:2027-07-07..2027-07-14
dates|tr|20-27 Aralık Kaş|R:kas D:2026-12-20..2026-12-27
dates|tr|28 Haziran'dan 3 Temmuz'a kadar|D:2027-06-28..2027-07-03
dates|tr|giriş 10 Ağustos çıkış 17 Ağustos|D:2027-08-10..2027-08-17
dates|tr|12-19 Eylül tarihleri arasında esnek|D:2027-09-12..2027-09-19 X:3
dates|tr|5-10 Haziran artı eksi 3 gün|D:2027-06-05..2027-06-10 X:3
dates|tr|Temmuz ortası Kaş|R:kas
dates|tr|bayramda Kalkan|R:kalkan
guests|tr|beş kişilik villa|G:5
guests|tr|8 kişiyiz|G:8
guests|tr|4 yetişkin 4 çocuk|G:8
guests|tr|12 kişilik grup Fethiye|R:fethiye G:12
guests|tr|iki çift dört kişi|G:4
sort|tr|en uygun fiyatlı villalar Kaş|R:kas S:price-asc
sort|tr|fiyatı en düşük villalar|S:price-asc
sort|tr|en pahalı lüks villalar|T:luks-villalar S:price-desc
sort|tr|en kalabalık gruplar için en büyük villa|S:capacity-desc
sort|tr|ucuz villa Kalkan|R:kalkan U:budget
# ---------------------------------------------------------------- TR — çoklu kriter
multi|tr|Kalkan'da 4-11 Temmuz 6 kişi jakuzili ve korunaklı havuzlu villa|R:kalkan D:2027-07-04..2027-07-11 G:6 F:Jakuzi F:Korunaklı_Havuz
multi|tr|Kaş'ta deniz manzaralı lüks villa 8 kişi en ucuz|R:kas T:deniz-manzarali-villalar T:luks-villalar G:8 S:price-asc
multi|tr|Fethiye Ölüdeniz'de çocuk havuzlu 2 yetişkin 2 çocuk|R:oludeniz T:cocuk-havuzlu-villalar G:4
multi|tr|Üzümlü'de muhafazakar, korunaklı ve saunalı villa 10 kişi|R:uzumlu T:muhafazakar-villalar F:Korunaklı_Havuz F:Sauna G:10
multi|tr|Göcek'te özel plajlı ve barbeküsü olan villa|R:gocek F:Özel_Plajlı_Villa F:Barbekü
multi|tr|Kalkan'da evcil hayvan dostu, wifi ve otoparkı olan villa|R:kalkan T:evcil-hayvan-izinli F:Wifi F:Açık_Otopark
multi|tr|İslamlar'da doğa manzaralı, şömineli ve jakuzili villa|R:islamlar T:doga-manzarali F:Jakuzi U:fireplace
multi|tr|Patara'da balayı için deniz manzaralı villa 2 kişi|R:patara T:balayi-villalari T:deniz-manzarali-villalar G:2
multi|tr|Kaş'ta bilardo, sinema odası ve spor salonu olan lüks villa|R:kas F:Bilardo F:Sinema_Odası F:Spor_Salonu T:luks-villalar
multi|tr|Kalkan merkeze yakın 4 kişilik deniz manzaralı villa|R:kalkan F:Merkezi_Konum G:4 T:deniz-manzarali-villalar
# ---------------------------------------------------------------- TR — konuşma dili
colloquial|tr|ya bi villa lazım kaşta jakuzisi olsun|R:kas F:Jakuzi
colloquial|tr|kalkanda havuzu görünmeyen bi yer arıyoz|R:kalkan F:Korunaklı_Havuz
colloquial|tr|6 kişi gidicez fethiyeye uygun villa var mı|R:fethiye G:6
colloquial|tr|köpüşümüzü de getirmek istiyoruz Kalkan|R:kalkan T:evcil-hayvan-izinli
colloquial|tr|hocam balayına gidiyoruz deniz gören bir yer|T:balayi-villalari T:deniz-manzarali-villalar
colloquial|tr|abi en ucuzundan bi villa kaş|R:kas S:price-asc
colloquial|tr|saunası filan olsun kalkan|R:kalkan F:Sauna
colloquial|tr|lüks olsun ama denize sıfır olsun|T:luks-villalar U:near_sea
# ---------------------------------------------------------------- TR — yazım / ek / bileşik
typo|tr|jakuzzili villa kalkan|R:kalkan F:Jakuzi
typo|tr|sauanalı villa|F:Sauna
typo|tr|muhafazakâr vila|T:muhafazakar-villalar
typo|tr|korunakl havuz|F:Korunaklı_Havuz
typo|tr|Fethiyede villa|R:fethiye
typo|tr|Kaşda villa|R:kas
typo|tr|Kalkandaki villalar|R:kalkan
typo|tr|Ölüdenizde villa|R:oludeniz
typo|tr|Gocekte villa|R:gocek
typo|tr|balayi villasi|T:balayi-villalari
typo|tr|deniz manzarali villa|T:deniz-manzarali-villalar
typo|tr|cocuk havuzlu villa|T:cocuk-havuzlu-villalar
typo|tr|bilardolu sinemalı villa|F:Bilardo F:Sinema_Odası
typo|tr|jakuzilerimiz olsun|F:Jakuzi
typo|tr|Kalkanlı villa|R:kalkan
typo|tr|Fetiyede deniz manzaralı|R:fethiye T:deniz-manzarali-villalar
# ---------------------------------------------------------------- TR — olumsuz / çelişkili
negation|tr|jakuzi istemiyorum Kalkan|R:kalkan N
negation|tr|saunasız villa Kaş|R:kas N
negation|tr|evcil hayvansız villa|N
negation|tr|lüks olmasın, ekonomik olsun|T:ekonomik-villalar N
negation|tr|deniz manzarası şart değil Fethiye|R:fethiye N
negation|tr|balayı villası olmayan|N
negation|tr|bungalov değil villa|N
negation|tr|kalkan olmasın kaş olsun|R:kas N
negation|tr|havuzu ortak olmayan villa|N
conflict|tr|bungalov ya da apart Kaş|R:kas
conflict|tr|lüks ve ekonomik villa|-
conflict|tr|hem bungalov hem apart jakuzili|F:Jakuzi
conflict|tr|6 kişi 8 kişi Kalkan|R:kalkan G:8
# ---------------------------------------------------------------- TR — desteklenmeyen
unsupported|tr|4 yatak odalı villa|U:bedrooms
unsupported|tr|denize 100 metre mesafede|U:sea_distance
unsupported|tr|klima olan villa|U:air_conditioning
unsupported|tr|asansörü olan villa|U:elevator
unsupported|tr|engelli dostu villa|U:accessibility
unsupported|tr|bütçemiz gecelik 4000 TL|U:budget
unsupported|tr|en az 5 gece|U:min_stay
unsupported|tr|bahçeli villa Kaş|R:kas U:garden
unsupported|tr|sessiz bir villa|U:quiet
unsupported|tr|sonsuzluk havuzu olan villa|U:infinity_pool
# ---------------------------------------------------------------- TR — kısa / anlamsız
short|tr|tatil|-
short|tr|ev|-
short|tr|villa arıyorum|-
short|tr|merhaba|-
short|tr|eden|-
short|tr|kalan|-
short|tr|kaş|R:kas
short|tr|sauna|F:Sauna
short|tr|korunaklı havuz|F:Korunaklı_Havuz
short|tr|8|-

# ---------------------------------------------------------------- EN — regions
region|en|villa rental in Kalkan Turkey|R:kalkan
region|en|a villa around Kas|R:kas
region|en|holiday villa Fethiye area|R:fethiye
region|en|Bodrum villa with pool|R:bodrum U:pool
region|en|Kalkan, Kas or Fethiye|R:kalkan R:kas R:fethiye
subregion|en|villa close to Kalkan town centre|R:kalkan F:Merkezi_Konum
subregion|en|villa in Kalkan centre|R:kalkan-merkez
subregion|en|Uzumlu village villa|R:uzumlu
subregion|en|Kayakoy ghost village villa|R:kayakoy
subregion|en|villa in Islamlar mountains|R:islamlar
subregion|en|Kalamar bay villa with sea view|R:kalkan-kalamar T:deniz-manzarali-villalar
subregion|en|villa in Hisaronu for 6|R:fethiye-hisaronu G:6
subregion|en|Faralya villa|R:fethiye-faralya
subregion|en|Ovacik holiday home|R:ovacik
subregion|en|Gelemis near Patara|R:patara
subregion|en|Bezirgan plateau villa|R:bezirgan
# ---------------------------------------------------------------- EN — types
type|en|conservative family villa|T:muhafazakar-villalar
type|en|muslim friendly villa|T:muhafazakar-villalar
type|en|luxurious villa|T:luks-villalar
type|en|villa with views of the sea|T:deniz-manzarali-villalar
type|en|villa for a honeymoon couple|T:balayi-villalari
type|en|villa that allows dogs|T:evcil-hayvan-izinli
type|en|villa surrounded by nature|T:doga-manzarali
type|en|affordable budget villa|T:ekonomik-villalar
type|en|villa for a big family|T:genis-aileye-uygun-villalar
type|en|two villas next to each other|T:birbirine-yakin-villalar
type|en|bungalow stay|T:bungalov
type|en|holiday apartment|T:apartlar
type|en|villa with a heated indoor pool|T:kapali-havuzlu-isitmali-villalar
type|en|villa with a children's pool|T:cocuk-havuzlu-villalar
# ---------------------------------------------------------------- EN — features
feature|en|villa with a whirlpool|F:Jakuzi
feature|en|villa with steam room hammam|F:Hamam
feature|en|villa with movie room|F:Sinema_Odası
feature|en|barbecue grill|F:Barbekü
feature|en|pool table|F:Bilardo
feature|en|ping pong table|F:Masa_Tenisi
feature|en|foosball table|F:Langırt
feature|en|home gym|F:Spor_Salonu
feature|en|twin jacuzzi|F:Çift_Jakuzi
feature|en|linen and towels included|F:Havlu_/_Çarşaf
feature|en|backup generator|F:Jeneratör
feature|en|large garden|F:Geniş_Bahçe
feature|en|fully equipped with appliances|F:Beyaz_Eşya
feature|en|centrally located villa|F:Merkezi_Konum
feature|en|villa with parking space|F:Açık_Otopark
feature|en|villa with its own beach|F:Özel_Plajlı_Villa
feature|en|free wifi|F:Wifi
feature|en|kids play area|F:Çocuk_Oyun_Alanı
feature|en|sauna villa|F:Sauna
# ---------------------------------------------------------------- EN — pool / privacy
pool|en|villa with a private secluded pool|F:Korunaklı_Havuz U:private_pool
pool|en|pool that is not overlooked by neighbours|F:Korunaklı_Havuz
pool|en|totally private pool area not overlooked|F:Korunaklı_Havuz
pool|en|secluded swimming pool|F:Korunaklı_Havuz
pool|en|conservative villa with secluded pool|T:muhafazakar-villalar F:Korunaklı_Havuz
pool|en|private swimming pool villa|U:private_pool
pool|en|communal pool villa|U:shared_pool
pool|en|infinity edge pool|U:infinity_pool
pool|en|indoor heated pool|F:Kapalı_Havuzu_Isıtmalı
pool|en|pool for the children|T:cocuk-havuzlu-villalar
# ---------------------------------------------------------------- EN — family / honeymoon
family|en|child friendly villa in Kas|R:kas U:child_friendly
family|en|2 adults 2 children Kalkan|R:kalkan G:4
family|en|3 adults and a baby|G:4
family|en|extended family of 16|T:genis-aileye-uygun-villalar G:16
honeymoon|en|romantic honeymoon villa in Kas|R:kas T:balayi-villalari
honeymoon|en|couples retreat with jacuzzi|T:balayi-villalari F:Jakuzi
honeymoon|en|anniversary villa with sea view|T:balayi-villalari T:deniz-manzarali-villalar
honeymoon|en|just married, looking for a secluded villa|T:balayi-villalari F:Korunaklı_Havuz
# ---------------------------------------------------------------- EN — dates / guests / sort
dates|en|7-14 July|D:2027-07-07..2027-07-14
dates|en|from July 7 to July 14 in Kalkan|R:kalkan D:2027-07-07..2027-07-14
dates|en|20 to 27 December|D:2026-12-20..2026-12-27
dates|en|check in 10 August check out 17 August|D:2027-08-10..2027-08-17
dates|en|12-19 September, dates flexible|D:2027-09-12..2027-09-19 X:3
dates|en|mid July in Kas|R:kas
guests|en|for five people|G:5
guests|en|we are 8 adults|G:8
guests|en|party of 12 in Fethiye|R:fethiye G:12
guests|en|sleeps 10|G:10
sort|en|cheapest villas in Kas|R:kas S:price-asc
sort|en|most expensive villas|S:price-desc
sort|en|biggest villa available|S:capacity-desc
sort|en|cheap villa Kalkan|R:kalkan U:budget
# ---------------------------------------------------------------- EN — multi
multi|en|Kalkan 4-11 July, 6 guests, jacuzzi and secluded pool|R:kalkan D:2027-07-04..2027-07-11 G:6 F:Jakuzi F:Korunaklı_Havuz
multi|en|luxury sea view villa in Kas for 8, cheapest first|R:kas T:luks-villalar T:deniz-manzarali-villalar G:8 S:price-asc
multi|en|villa in Oludeniz with kids pool for 2 adults 2 kids|R:oludeniz T:cocuk-havuzlu-villalar G:4
multi|en|Uzumlu conservative villa with secluded pool and sauna for 10|R:uzumlu T:muhafazakar-villalar F:Korunaklı_Havuz F:Sauna G:10
multi|en|Gocek villa with private beach and barbecue|R:gocek F:Özel_Plajlı_Villa F:Barbekü
multi|en|pet friendly Kalkan villa with wifi and parking|R:kalkan T:evcil-hayvan-izinli F:Wifi F:Açık_Otopark
multi|en|nature villa in Islamlar with fireplace and hot tub|R:islamlar T:doga-manzarali F:Jakuzi U:fireplace
multi|en|honeymoon sea view villa in Patara for 2|R:patara T:balayi-villalari T:deniz-manzarali-villalar G:2
multi|en|luxury villa in Kas with billiards, cinema room and gym|R:kas T:luks-villalar F:Bilardo F:Sinema_Odası F:Spor_Salonu
multi|en|villa near Kalkan centre for 4 with sea view|R:kalkan F:Merkezi_Konum G:4 T:deniz-manzarali-villalar
# ---------------------------------------------------------------- EN — colloquial / typo / compound
colloquial|en|hi! need a place in Kas w/ jacuzzi|R:kas F:Jakuzi
colloquial|en|any villas in Kalkan where the pool isn't overlooked?|R:kalkan F:Korunaklı_Havuz
colloquial|en|6 of us heading to Fethiye, got anything?|R:fethiye G:6
colloquial|en|our dog is coming too, Kalkan|R:kalkan T:evcil-hayvan-izinli
colloquial|en|something fancy with a sea view|T:luks-villalar T:deniz-manzarali-villalar
typo|en|jacuzzy villa|F:Jakuzi
typo|en|secluted pool|F:Korunaklı_Havuz
typo|en|luxery villa Kalkan|R:kalkan T:luks-villalar
typo|en|honneymoon villa|T:balayi-villalari
typo|en|Fethie villa|R:fethiye
typo|en|Kalkan seaview villa|R:kalkan T:deniz-manzarali-villalar
typo|en|hottub villa|F:Jakuzi
typo|en|kidspool|T:cocuk-havuzlu-villalar
# ---------------------------------------------------------------- EN — negation / conflict / unsupported / short
negation|en|no jacuzzi please, Kalkan|R:kalkan N
negation|en|villa without a sauna in Kas|R:kas N
negation|en|not pet friendly|N
negation|en|we don't need a sea view, Fethiye|R:fethiye N
negation|en|no bungalows|N
conflict|en|bungalow or apartment in Kas|R:kas
conflict|en|luxury but budget villa|-
unsupported|en|3 bedroom villa|U:bedrooms
unsupported|en|villa 200 meters from the beach|U:sea_distance
unsupported|en|villa with AC|U:air_conditioning
unsupported|en|disabled access villa|U:accessibility
unsupported|en|villa with a lift|U:elevator
unsupported|en|minimum stay 7 nights|U:min_stay
unsupported|en|quiet and peaceful villa in Kas|R:kas U:quiet
unsupported|en|villa with a fireplace in Kalkan|R:kalkan U:fireplace
unsupported|en|garden villa|U:garden
short|en|hello|-
short|en|holiday|-
short|en|looking for a villa|-
short|en|Kas|R:kas
short|en|sauna|F:Sauna
short|en|private|-

# ---------------------------------------------------------------- DE — Regionen
region|de|Ferienvilla in Kalkan Türkei|R:kalkan
region|de|Villa in der Nähe von Kaş|R:kas
region|de|Ferienhaus bei Fethiye|R:fethiye
region|de|Villa in Bodrum mit Pool|R:bodrum U:pool
region|de|Kalkan, Kaş oder Fethiye|R:kalkan R:kas R:fethiye
subregion|de|Villa nahe Kalkan Zentrum|R:kalkan F:Merkezi_Konum
subregion|de|Villa im Zentrum von Kalkan|R:kalkan-merkez
subregion|de|Villa im Dorf Üzümlü|R:uzumlu
subregion|de|Villa in Kayaköy|R:kayakoy
subregion|de|Ferienhaus in Islamlar|R:islamlar
subregion|de|Villa an der Kalamar Bucht mit Meerblick|R:kalkan-kalamar T:deniz-manzarali-villalar
subregion|de|Villa in Hisarönü für 6 Personen|R:fethiye-hisaronu G:6
subregion|de|Villa in Ölüdeniz|R:oludeniz
subregion|de|Villa in Göcek|R:gocek
# ---------------------------------------------------------------- DE — Typen
type|de|Villa für muslimische Familien|T:muhafazakar-villalar
type|de|konservative Villa|T:muhafazakar-villalar
type|de|luxuriöse Villa|T:luks-villalar
type|de|Villa mit Blick aufs Meer|T:deniz-manzarali-villalar
type|de|Villa für die Hochzeitsreise|T:balayi-villalari
type|de|Villa mit Haustier erlaubt|T:evcil-hayvan-izinli
type|de|Villa mitten in der Natur|T:doga-manzarali
type|de|günstige Budget Villa|T:ekonomik-villalar U:budget
type|de|Villa für Großfamilien|T:genis-aileye-uygun-villalar
type|de|zwei Villen nebeneinander|T:birbirine-yakin-villalar
type|de|Bungalow Urlaub|T:bungalov
type|de|Ferienwohnungen|T:apartlar
type|de|Villa mit beheiztem Hallenbad|T:kapali-havuzlu-isitmali-villalar
type|de|Villa mit Kinderbecken|T:cocuk-havuzlu-villalar
# ---------------------------------------------------------------- DE — Ausstattung
feature|de|Villa mit Jacuzzi|F:Jakuzi
feature|de|Villa mit Sauna und Dampfbad|F:Sauna F:Hamam
feature|de|Kinoraum|F:Sinema_Odası
feature|de|Villa mit Grillplatz|F:Barbekü
feature|de|Billardtisch|F:Bilardo
feature|de|Tischtennisplatte|F:Masa_Tenisi
feature|de|Kicker|F:Langırt
feature|de|Fitnessstudio|F:Spor_Salonu
feature|de|Doppelwhirlpool|F:Çift_Jakuzi
feature|de|Bettwäsche und Handtücher inklusive|F:Havlu_/_Çarşaf
feature|de|Notstromaggregat|F:Jeneratör
feature|de|großer Garten|F:Geniş_Bahçe
feature|de|Haushaltsgeräte vorhanden|F:Beyaz_Eşya
feature|de|zentral gelegene Villa|F:Merkezi_Konum
feature|de|Villa mit Stellplatz|F:Açık_Otopark
feature|de|Villa mit eigenem Strand|F:Özel_Plajlı_Villa
feature|de|Villa mit WLAN|F:Wifi
feature|de|Haartrockner vorhanden|F:Saç_Kurutma_Makinesi
feature|de|Spielplatz für Kinder|F:Çocuk_Oyun_Alanı
# ---------------------------------------------------------------- DE — Pool / Privatsphäre
pool|de|Villa mit sichtgeschütztem Pool|F:Korunaklı_Havuz
pool|de|Pool nicht einsehbar von Nachbarn|F:Korunaklı_Havuz
pool|de|blickgeschützte Villa in Kalkan|R:kalkan F:Korunaklı_Havuz
pool|de|konservative Villa mit uneinsehbarem Pool|T:muhafazakar-villalar F:Korunaklı_Havuz
pool|de|Villa mit Privatpool|U:private_pool
pool|de|Villa mit Gemeinschaftspool|U:shared_pool
pool|de|Villa mit Infinitypool|U:infinity_pool
pool|de|beheizter Innenpool|F:Kapalı_Havuzu_Isıtmalı
pool|de|Kinderpool|T:cocuk-havuzlu-villalar
# ---------------------------------------------------------------- DE — Familie / Flitterwochen
family|de|kinderfreundliche Villa in Kaş|R:kas U:child_friendly
family|de|2 Erwachsene 2 Kinder Kalkan|R:kalkan G:4
family|de|3 Erwachsene und ein Baby|G:4
family|de|Großfamilie mit 16 Personen|T:genis-aileye-uygun-villalar G:16
honeymoon|de|romantische Flitterwochen in Kaş|R:kas T:balayi-villalari
honeymoon|de|Villa für Paare mit Whirlpool|T:balayi-villalari F:Jakuzi
honeymoon|de|Hochzeitstag Villa mit Meerblick|T:balayi-villalari T:deniz-manzarali-villalar
# ---------------------------------------------------------------- DE — Datum / Personen / Sortierung
dates|de|7. bis 14. Juli|D:2027-07-07..2027-07-14
dates|de|vom 7. Juli bis 14. Juli in Kalkan|R:kalkan D:2027-07-07..2027-07-14
dates|de|20. bis 27. Dezember|D:2026-12-20..2026-12-27
dates|de|Anreise 10. August, Abreise 17. August|D:2027-08-10..2027-08-17
dates|de|12.-19. September, Termine flexibel|D:2027-09-12..2027-09-19 X:3
dates|de|Mitte Juli in Kaş|R:kas
guests|de|für fünf Personen|G:5
guests|de|wir sind 8 Erwachsene|G:8
guests|de|Gruppe von 12 Personen in Fethiye|R:fethiye G:12
sort|de|günstigste Villen in Kaş|R:kas S:price-asc
sort|de|teuerste Villen|S:price-desc
sort|de|größte Villa|S:capacity-desc
sort|de|günstige Villa Kalkan|R:kalkan U:budget
# ---------------------------------------------------------------- DE — Mehrfach
multi|de|Kalkan 4.-11. Juli, 6 Personen, Whirlpool und sichtgeschützter Pool|R:kalkan D:2027-07-04..2027-07-11 G:6 F:Jakuzi F:Korunaklı_Havuz
multi|de|Luxusvilla mit Meerblick in Kaş für 8 Personen, günstigste zuerst|R:kas T:luks-villalar T:deniz-manzarali-villalar G:8 S:price-asc
multi|de|Villa in Ölüdeniz mit Kinderpool für 2 Erwachsene 2 Kinder|R:oludeniz T:cocuk-havuzlu-villalar G:4
multi|de|Konservative Villa in Üzümlü mit sichtgeschütztem Pool und Sauna für 10 Personen|R:uzumlu T:muhafazakar-villalar F:Korunaklı_Havuz F:Sauna G:10
multi|de|Villa in Göcek mit Privatstrand und Grill|R:gocek F:Özel_Plajlı_Villa F:Barbekü
multi|de|haustierfreundliche Villa in Kalkan mit WLAN und Parkplatz|R:kalkan T:evcil-hayvan-izinli F:Wifi F:Açık_Otopark
multi|de|Villa mit Naturblick in Islamlar mit Kamin und Whirlpool|R:islamlar T:doga-manzarali F:Jakuzi U:fireplace
multi|de|Luxusvilla in Kaş mit Billard, Kinoraum und Fitnessraum|R:kas T:luks-villalar F:Bilardo F:Sinema_Odası F:Spor_Salonu
# ---------------------------------------------------------------- DE — Umgangssprache / Tippfehler / Komposita
colloquial|de|Hallo, wir brauchen was in Kaş mit Whirlpool|R:kas F:Jakuzi
colloquial|de|gibt es in Kalkan Villen, wo man den Pool nicht einsehen kann?|R:kalkan F:Korunaklı_Havuz
colloquial|de|unser Hund kommt mit, Kalkan|R:kalkan T:evcil-hayvan-izinli
typo|de|Whirlpol|F:Jakuzi
typo|de|Luxus Villa Kalkan|R:kalkan T:luks-villalar
typo|de|Meerblik|T:deniz-manzarali-villalar
typo|de|Saunavilla|F:Sauna
typo|de|Kinderpoolvilla|T:cocuk-havuzlu-villalar
typo|de|Whirlpoolvilla in Kaş|R:kas F:Jakuzi
typo|de|Fethiyé|R:fethiye
typo|de|hundefreundliche Villa|T:evcil-hayvan-izinli
# ---------------------------------------------------------------- DE — Negation / Konflikt / nicht unterstützt / kurz
negation|de|kein Whirlpool, Kalkan|R:kalkan N
negation|de|Villa ohne Haustiere in Kaş|R:kas N
negation|de|keine Sauna nötig|N
negation|de|ohne Meerblick, Fethiye|R:fethiye N
negation|de|keine Bungalows|N
conflict|de|Bungalow oder Ferienwohnung in Kaş|R:kas
conflict|de|Luxusvilla aber preiswert|T:luks-villalar U:budget
unsupported|de|Villa mit 3 Schlafzimmern|U:bedrooms
unsupported|de|200 Meter zum Strand|U:sea_distance
unsupported|de|Villa mit Klimaanlage|U:air_conditioning
unsupported|de|rollstuhlgerechte Villa|U:accessibility
unsupported|de|Villa mit Lift|U:elevator
unsupported|de|Mindestaufenthalt 7 Nächte|U:min_stay
unsupported|de|ruhige Villa in Kaş|R:kas U:quiet
unsupported|de|Villa mit Kamin in Kalkan|R:kalkan U:fireplace
short|de|Hallo|-
short|de|Urlaub|-
short|de|Kaş|R:kas
short|de|Sauna|F:Sauna
`;
