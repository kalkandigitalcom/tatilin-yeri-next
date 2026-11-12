/* ===============================================================
   📚 AI ARAMA (KURAL TABANLI) — TR / EN / DE SÖZLÜK (SAF VERİ)
   ===============================================================
   Bu dosya YALNIZ veri içerir; eşleştirme mantığı `parse.ts`'tedir.
   Girdiler doğal yazımla tutulur (okunabilirlik için) ve modül
   yüklenirken `normalizePhrase` ile eşleştirme kanonuna çevrilir.

   ⚠️ KAVRAM (concept) KURALI — UYDURMA EŞLEME YOK:
     Bir kavram (ör. "jakuzi") ancak CANLI taksonomide adı kavramın
     `db` listesindeki bir adla BİREBİR örtüşen bir villa özelliği /
     villa tipi varsa filtreye dönüşür. Karşılık yoksa kullanıcıya
     "sistemde bu filtre yok" diye gösterilir; başka bir filtreye
     ÇEVRİLMEZ. Özellikle:
       • "korunaklı havuz" (secluded_pool) ≠ "muhafazakâr" (conservative)
       • "denize yakın" (near_sea) ≠ "deniz manzarası" (sea_view)
       • "çocuk dostu" (child_friendly) ≠ "çocuk havuzu" (child_pool)
       • "özel havuz" (private_pool) ≠ "korunaklı havuz" (secluded_pool)
   =============================================================== */

import { normalizePhrase, normalizeToken } from "./tokenize";

/* ---------------- Kavramlar (özellik / villa tipi) ---------------- */

export type ConceptDef = {
  key: string;
  /** Canlı kayıt adı (villa kelimeleri atılmış çekirdek) bunlardan biriyle
   *  birebir aynıysa kavram o kayda bağlanır. */
  db: string[];
  /** Kullanıcı ifadeleri (TR / EN / DE). */
  phrases: string[];
};

export const CONCEPTS: readonly ConceptDef[] = [
  {
    key: "jacuzzi",
    db: ["jakuzi", "jakuzili", "jacuzzi"],
    phrases: [
      "jakuzi", "jakuzili", "jakuzzi", "jakuzzili", "jacuzzi", "jacuzzili",
      "hot tub", "jacuzzis", "whirlpool", "whirlpools", "whirlpool badewanne",
      "jakuzi'li",
      "jaküzi",
      "jakuzlu",
      "hottub",
      "whirlpools",
      "sprudelbad",
    ],
  },
  {
    key: "secluded_pool",
    db: ["korunaklı havuz", "korunaklı havuzlu"],
    phrases: [
      "komşulardan görünmeyen", "komşulardan görünmez", "mahremiyetli", "mahremiyetli havuz", "isn't overlooked", "is not overlooked", "nicht einsehen", "nicht einsehen kann",
      "korunaklı havuz", "korunaklı havuzlu", "korunaklı bir havuz",
      "secluded pool", "sheltered pool", "screened pool", "secluded swimming pool",
      "geschützter pool", "geschützten pool", "geschütztem pool", "geschuetzter pool",
      "sichtgeschützter pool", "sichtgeschützten pool", "sichtgeschütztem pool",
      "uneinsehbarer pool", "uneinsehbarem pool",
      "korunaklı",
      "korunaklı villa",
      "korunaklı villalar",
      "havuzu dışarıdan görünmeyen",
      "dışarıdan havuzu görünmeyen",
      "dışarıdan havuzu görünmez",
      "havuzu dışarıdan görünmez",
      "private and secluded",
      "private and secluded villa",
      "havuzu dışardan görünmeyen",
      "dışarıdan görünmeyen havuz",
      "dışarıdan görünmeyen havuzlu",
      "dışarıdan görünmeyen",
      "dışarıdan görünmez",
      "havuzu görünmeyen",
      "görünmeyen havuz",
      "görünmeyen havuzlu",
      "gizli havuz",
      "gizli havuzlu",
      "havuzu kimse görmüyor",
      "secluded",
      "secluded villa",
      "secluded pool villa",
      "not overlooked",
      "pool not overlooked",
      "hidden pool",
      "screened from view",
      "private and secluded pool",
      "sichtgeschützt",
      "sichtgeschützte",
      "sichtgeschützter",
      "sichtgeschützten",
      "sichtgeschütztem",
      "blickgeschützt",
      "blickgeschützte",
      "blickgeschützter",
      "blickgeschützten",
      "blickgeschütztem",
      "uneinsehbar",
      "uneinsehbare",
      "uneinsehbaren",
      "uneinsehbarer",
      "uneinsehbarem",
      "nicht einsehbar",
      "nicht einsehbarer pool",
      "blickdicht",
      "blickdichter pool",
    ],
  },
  {
    key: "private_pool",
    db: ["özel havuz", "özel havuzlu"],
    phrases: [
      "kendimize ait havuz", "bize ait havuz", "kendimize ait",
      "özel havuz", "özel havuzlu", "kendine ait havuz",
      "private pool", "private swimming pool", "own pool",
      "privater pool", "privatem pool", "privaten pool", "eigener pool",
      "eigenem pool", "eigenen pool", "privatpool",
    ],
  },
  {
    key: "shared_pool",
    db: ["ortak havuz", "ortak havuzlu"],
    phrases: [
      "ortak kullanımlı havuz", "havuzu ortak", "ortak kullanım havuz",
      "ortak havuz", "ortak havuzlu", "shared pool", "communal pool",
      "gemeinschaftspool", "gemeinsamer pool", "gemeinsamem pool",
    ],
  },
  {
    key: "indoor_pool",
    /* Canlıda kapalı havuz yalnız ısıtmalı olarak var: "Kapalı Havuzu
       Isıtmalı" (özellik) ve "Kapalı Havuzlu Isıtmalı Villalar" (tip). */
    db: ["kapalı havuz", "kapalı havuzlu", "kapalı havuzu ısıtmalı", "kapalı havuzlu ısıtmalı"],
    phrases: [
      "beheiztes hallenbad", "beheiztem hallenbad", "beheizten hallenbad", "beheiztem innenpool", "beheizten innenpool",
      "kapalı havuz", "kapalı havuzlu", "indoor pool", "indoor swimming pool",
      "innenpool", "hallenbad", "innen pool",
      "kapalı yüzme havuzu",
      "indoor-pool",
      "innenschwimmbad",
    ],
  },
  {
    key: "heated_pool",
    db: ["ısıtmalı havuz", "ısıtmalı havuzlu", "ısıtmalı", "kapalı havuzu ısıtmalı", "kapalı havuzlu ısıtmalı"],
    phrases: [
      "ısıtmalı havuz", "ısıtmalı havuzlu", "havuz ısıtma", "havuzu ısıtmalı", "ısıtmalı kapalı havuz",
      "heated pool", "heated swimming pool", "pool heating",
      "beheizter pool", "beheiztem pool", "beheizten pool", "beheizbarer pool",
      "poolheizung",
    ],
  },
  {
    key: "child_pool",
    db: ["çocuk havuzu", "çocuk havuzlu"],
    phrases: [
      "pool for the children",
      "çocuk havuzu", "çocuk havuzlu", "çocuklar için havuz",
      "children's pool", "childrens pool", "kids pool", "kid's pool", "kiddie pool",
      "child pool", "paddling pool", "kinderbecken", "kinderpool", "planschbecken",
      "çocuk havuzlu villa",
      "çocuklar için havuzlu",
      "kids' pool",
      "kiddy pool",
      "children pool",
      "kinderschwimmbecken",
      "pool für kinder",
      "pool for kids",
      "pool for the kids",
      "pool for children",
    ],
  },
  {
    key: "infinity_pool",
    db: ["sonsuzluk havuzu", "infinity havuz"],
    phrases: [
      "infinity edge pool", "infinity edge",
      "sonsuzluk havuzu", "sonsuzluk havuzlu", "infinity havuz", "infinity havuzlu",
      "infinity pool", "infinitypool",
    ],
  },
  {
    key: "sauna",
    db: ["sauna", "saunalı"],
    phrases: ["sauna", "saunalı", "saunas", "finnish sauna", "finnische sauna", "saunabereich"],
  },
  {
    key: "hammam",
    db: ["hamam", "türk hamamı"],
    phrases: [
      "hamam", "hamamlı", "türk hamamı", "turkish bath", "hammam", "türkisches bad",
      "türk hamamlı", "hamam keyfi", "türkisches dampfbad", "dampfbad",
    ],
  },
  {
    key: "sea_view",
    db: ["deniz manzarası", "deniz manzaralı"],
    phrases: [
      "deniz manzarası", "deniz manzaralı", "denize nazır", "deniz görür",
      "sea view", "sea views", "seaview", "ocean view", "view of the sea",
      "meerblick", "meeresblick", "blick aufs meer",
      "deniz gören",
      "denizi gören",
      "manzarası deniz",
      "sea-view",
      "sea facing",
      "meersicht",
      "mit meerblick",
      "meeresblick",
    ],
  },
  {
    key: "nature_view",
    db: ["doğa manzarası", "doğa manzaralı"],
    phrases: [
      "surrounded by nature", "nature villa", "nature villas",
      "doğa manzarası", "doğa manzaralı", "nature view", "nature views",
      "naturblick", "blick in die natur",
      "doğa içinde",
      "doğanın içinde",
      "yeşillikler içinde",
      "orman manzaralı",
      "dağ manzaralı",
      "naturblick",
      "mitten in der natur",
      "in nature",
    ],
  },
  {
    key: "near_sea",
    db: ["denize sıfır", "denize yakın", "sahile yakın", "plaja yakın", "denize sıfır konum"],
    phrases: [
      "plajına yakın", "plajlarına yakın", "sahiline yakın", "denizine yakın",
      "denize sıfır", "denize yakın", "denize çok yakın", "sahile yakın", "plaja yakın",
      "sahile sıfır", "plaja sıfır", "near the sea", "near the beach", "close to the sea",
      "close to the beach", "beachfront", "seafront", "by the sea", "by the beach",
      "strandnah", "strandnahe", "strandnahen", "am meer", "am strand", "nah am meer",
      "nahe am meer", "meernah", "direkt am meer", "in strandnähe",
      "denize yürüme mesafesi",
      "denize yürüme mesafesinde",
      "plaja yürüme mesafesi",
      "plaja yürüme mesafesinde",
      "sahile yürüme mesafesinde",
      "denize yakın konum",
      "denize kenarında",
      "deniz kenarı",
      "deniz kenarında",
      "walking distance to the beach",
      "walking distance to the sea",
      "beach nearby",
      "close to beach",
      "near beach",
      "near sea",
      "strandlage",
      "in strandnähe",
      "nähe strand",
      "nahe am strand",
      "fußläufig zum strand",
    ],
  },
  {
    key: "honeymoon",
    db: ["balayı"],
    phrases: [
      "just married", "hochzeitstag",
      "balayı", "balayına", "balayı için", "honeymoon", "honeymooners", "flitterwochen", "hochzeitsreise",
      "balayı villası",
      "balayı çiftleri",
      "yeni evli",
      "yeni evliler",
      "evlilik yıldönümü",
      "romantik",
      "romantik tatil",
      "romantik bir",
      "çiftler için",
      "çiftlere uygun",
      "sevgilimle",
      "eşimle",
      "romantic",
      "romantic getaway",
      "for couples",
      "couples getaway",
      "couple's",
      "newlyweds",
      "anniversary",
      "romantisch",
      "romantische",
      "romantischen",
      "für paare",
      "paarurlaub",
      "frisch verheiratet",
    ],
  },
  {
    key: "conservative",
    db: ["muhafazakar", "muhafazakâr"],
    phrases: [
      "muhafazakar", "muhafazakâr", "conservative", "konservativ", "konservative",
      "konservativen",
      "muhafazakar aile",
      "muhafazakar aileye uygun",
      "muhafazakar ailelere uygun",
      "muhafazakar ailelere",
      "muhafazakâr aileye uygun",
      "helal tatil",
      "helal konsept",
      "helal",
      "dindar aile",
      "halal",
      "halal holiday",
      "halal friendly",
      "muslim friendly",
      "muslim-friendly",
      "conservative family",
      "halal urlaub",
      "halal-freundlich",
      "muslimfreundlich",
      "für muslimische familien",
    ],
  },
  {
    key: "luxury",
    db: ["lüks"],
    phrases: [
      "fancy",
      "lüks", "luxury", "luxurious", "luxus", "luxuriös", "luxuriöse",
      "lüks villa",
      "lux",
      "ultra lüks",
      "premium",
      "high end",
      "high-end",
      "upscale",
      "exklusiv",
      "exklusive",
      "exclusive",
    ],
  },
  {
    key: "child_friendly",
    db: ["çocuk dostu", "çocuğa uygun", "aileye uygun"],
    phrases: [
      "bebekle", "bebeğimizle", "bebekle tatil",
      "çocuk dostu", "çocuğa uygun", "çocuklara uygun", "aileye uygun",
      "child friendly", "kid friendly", "kids friendly", "family friendly",
      "kinderfreundlich", "kinderfreundliche", "familienfreundlich", "familienfreundliche",
      "çocuklu aile",
      "çocuklu aileler",
      "çocuklu aileye uygun",
      "çocuklu ailelere uygun",
      "çocuklu ailelere",
      "çocuklarla",
      "çocuklarımızla",
      "çocuklarla birlikte",
      "bebekli aile",
      "bebekli aileye uygun",
      "with kids",
      "with children",
      "with our kids",
      "for families with kids",
      "for families with children",
      "mit kindern",
      "mit kleinkindern",
      "für familien mit kindern",
      "familien mit kindern",
    ],
  },
  {
    key: "pet_friendly",
    db: [
      "evcil hayvan", "evcil hayvan dostu", "evcil hayvan kabul edilir", "evcil hayvana uygun",
      "evcil hayvan izinli",
    ],
    phrases: [
      "köpek", "kedi", "köpeğim", "köpeğimiz", "köpüş", "köpüşüm", "köpüşümüz", "kedimiz", "allows dogs", "allows pets", "dogs are welcome", "pets are welcome", "our dog is coming", "unser hund", "hund kommt mit", "hundefreundlich", "hundefreundliche", "hundefreundlichen",
      "evcil hayvan", "evcil hayvanlı", "evcil hayvan kabul eden", "evcil hayvan kabul edilen",
      "evcil hayvan dostu", "evcil hayvana uygun", "evcil hayvana izin veren", "evcil hayvan izinli",
      "köpekli", "köpeğimle", "kedili",
      "pet friendly", "pets allowed", "pets welcome", "with pets", "with my dog", "dog friendly",
      "haustiere erlaubt", "haustierfreundlich", "haustierfreundliche", "haustierfreundlichen",
      "mit hund", "hunde erlaubt", "haustiere", "haustiere willkommen", "pets",
      "köpek kabul eden",
      "köpek kabul edilen",
      "kedi kabul eden",
      "evcil hayvanımızla",
      "evcil hayvanla",
      "köpeğimizle",
      "köpeğimiz var",
      "köpekle",
      "kediyle",
      "hayvan dostu",
      "evcil hayvanlara izin veren",
      "dog allowed",
      "dogs allowed",
      "dogs welcome",
      "pet-friendly",
      "pets ok",
      "pets are allowed",
      "with our dog",
      "bringing our dog",
      "bringing my dog",
      "bring my dog",
      "our dog",
      "my dog",
      "bring our dog",
      "hund erlaubt",
      "hunde willkommen",
      "mit haustier",
      "mit unserem hund",
      "mit hund erlaubt",
      "hund ist erlaubt",
      "haustier erlaubt",
    ],
  },
  {
    key: "play_area",
    db: ["çocuk oyun alanı", "çocuk oyun alanlı"],
    phrases: [
      "çocuk oyun alanı", "çocuk oyun alanlı", "oyun alanı", "oyun alanlı", "çocuk parkı",
      "children's play area", "childrens play area", "kids play area", "play area", "playground",
      "kinderspielplatz", "spielplatz",
      "oyun parkı",
      "oyun parklı",
      "çocuk oyun parkı",
      "çocuk bahçesi",
      "salıncak",
      "kaydırak",
      "kids playground",
      "children's playground",
      "play ground",
      "spielecke",
    ],
  },
  {
    key: "cinema",
    db: ["sinema odası", "sinema odalı"],
    phrases: [
      "sinema odası", "sinema odalı", "sinema salonu", "ev sineması", "sinemalı",
      "cinema room", "home cinema", "home theater", "home theatre", "movie room",
      "kinoraum", "heimkino",
      "sinema",
      "film odası",
      "projeksiyon odası",
      "kino",
      "private cinema",
      "movie theater",
    ],
  },
  {
    key: "garden",
    db: ["bahçe", "bahçeli"],
    phrases: ["bahçe", "bahçeli", "garden", "garten"],
  },
  {
    key: "bbq",
    db: ["mangal", "barbekü"],
    phrases: [
      "mangal", "mangallı", "barbekü", "barbecue", "bbq", "grill", "grillplatz",
      "barbekülü", "mangal alanı", "mangal yeri", "barbecue area", "grill area", "grillecke",
      "grillmöglichkeit", "grillen",
    ],
  },
  {
    key: "fireplace",
    db: ["şömine", "şömineli"],
    phrases: ["şömine", "şömineli", "fireplace", "kamin"],
  },
  {
    key: "gym",
    db: ["spor salonu", "fitness"],
    phrases: [
      "spor salonu", "fitness", "gym", "fitnessraum",
      "spor odası", "fitness salonu", "fitness odası", "fitness alanı", "fitness center", "fitness room",
      "fitnessstudio", "workout room",
    ],
  },

  {
    /* "Geniş Bahçe" — tek başına "bahçeli" bilerek bağlanmaz (K3). */
    key: "large_garden",
    db: ["geniş bahçe"],
    phrases: [
      "geniş bahçe", "geniş bahçeli", "bahçesi geniş", "büyük bahçe", "büyük bahçeli", "bahçesi büyük",
      "large garden", "big garden", "spacious garden", "großer garten", "großem garten", "großen garten",
      "geräumiger garten",
    ],
  },
  {
    key: "double_jacuzzi",
    db: ["çift jakuzi"],
    phrases: [
      "çift kişilik jakuzi", "çift kişilik jakuzili", "twin jacuzzi", "twin hot tub", "jacuzzi for two", "whirlpool für zwei","çift jakuzi", "çift jakuzili", "iki kişilik jakuzi", "double jacuzzi", "double hot tub", "doppel whirlpool", "doppelwhirlpool"],
  },
  {
    key: "parking",
    db: ["açık otopark", "otopark"],
    phrases: [
      "park edecek yer", "park edebileceğimiz yer", "araç park", "araba park",
      "otopark", "otoparklı", "açık otopark", "araç park yeri", "park yeri", "park alanı", "otopark alanı",
      "parking", "parking space", "parking lot", "car park", "free parking", "parkplatz", "parkplätze",
      "stellplatz", "parkmöglichkeit",
    ],
  },
  {
    key: "large_family",
    db: ["geniş aileye uygun", "geniş aile"],
    phrases: [
      "geniş aile", "geniş aileye uygun", "geniş ailelere uygun", "kalabalık aile", "kalabalık aileler",
      "büyük aile", "büyük aileler", "kalabalık aileye uygun", "large family", "large families",
      "big family", "big families", "extended family", "großfamilie", "großfamilien", "große familie",
      "große familien",
    ],
  },
  {
    key: "private_beach",
    db: ["özel plajlı", "özel plaj"],
    phrases: ["özel plaj", "özel plajlı", "kendi plajı olan", "private beach", "own beach", "privatstrand", "eigener strand", "eigenem strand"],
  },
  {
    key: "linens",
    db: ["havlu çarşaf", "havlu / çarşaf"],
    phrases: ["havlu", "havlular", "çarşaf", "çarşaflar", "havlu çarşaf", "nevresim", "towels", "bed linen", "bed linens", "linens", "handtücher", "bettwäsche"],
  },
  {
    key: "hair_dryer",
    db: ["saç kurutma makinesi"],
    phrases: ["saç kurutma", "saç kurutma makinesi", "fön makinesi", "fön", "hair dryer", "hairdryer", "haartrockner", "föhn", "fön"],
  },
  {
    key: "wifi",
    db: ["wifi"],
    phrases: ["wifi", "wi fi", "wi-fi", "wlan", "internet", "internetli", "kablosuz internet", "wireless", "wireless internet"],
  },
  {
    key: "generator",
    db: ["jeneratör"],
    phrases: ["jeneratör", "jeneratörlü", "generator", "stromgenerator", "notstromaggregat"],
  },
  {
    key: "table_tennis",
    db: ["masa tenisi"],
    phrases: ["masa tenisi", "pinpon", "ping pong", "pingpong", "table tennis", "tischtennis", "tischtennisplatte"],
  },
  {
    key: "foosball",
    db: ["langırt"],
    phrases: ["langırt", "langırtlı", "foosball", "table football", "table soccer", "kicker", "tischfußball", "tischkicker"],
  },
  {
    key: "billiards",
    db: ["bilardo"],
    phrases: [
      "pool table", "pool tables","bilardo", "bilardolu", "bilardo masası", "bilardo masalı", "billiards", "billiard", "billiard table", "snooker", "billard", "billardtisch"],
  },
  {
    key: "appliances",
    db: ["beyaz eşya"],
    phrases: ["beyaz eşya", "beyaz eşyalı", "household appliances", "appliances", "haushaltsgeräte"],
  },
  {
    key: "central_location",
    db: ["merkezi konum"],
    phrases: ["merkezi konum", "merkezi konumda", "merkezi yerde", "merkeze yakın", "çarşıya yakın", "central location", "centrally located", "close to the centre", "close to the center", "zentrale lage", "zentral gelegen", "zentrumsnah"],
  },
  {
    key: "nearby_villas",
    db: ["birbirine yakın"],
    phrases: [
      "yan yana", "yan yana iki villa", "next to each other", "nebeneinander","birbirine yakın", "birbirine yakın villalar", "yan yana villa", "yan yana villalar", "komşu villalar", "nearby villas", "villas next to each other", "adjacent villas", "nebeneinander liegende villen", "villen nebeneinander"],
  },
  {
    key: "bungalow",
    db: ["bungalov"],
    phrases: ["bungalov", "bungalow", "bungalows", "bungalovlar"],
  },
  {
    key: "apartment",
    db: ["apartlar", "apart"],
    phrases: ["apart", "apartlar", "apart daire", "apart otel", "daire", "apartment", "apartments", "ferienwohnung", "ferienwohnungen", "wohnung", "appartement"],
  },
  {
    key: "economy",
    db: ["ekonomik"],
    phrases: ["ekonomik", "ekonomik villa", "budget villa", "budget villas", "preiswerte villa", "preiswerte villen"],
  },
  {
    key: "quiet",
    db: [],
    phrases: ["sakin", "sessiz", "huzurlu", "sakin bir", "kafa dinlemelik", "quiet", "peaceful", "tranquil", "ruhig", "ruhige", "ruhigen", "abgeschieden"],
  },
  {
    key: "air_conditioning",
    db: [],
    phrases: [
      "ac", "a/c","klima", "klimalı", "air conditioning", "air-conditioned", "aircon", "klimaanlage", "klimatisiert"],
  },
  {
    key: "accessibility",
    db: [],
    phrases: [
      "disabled access", "disabled friendly","engelli", "engelli erişimi", "engelliye uygun", "tekerlekli sandalye", "wheelchair", "wheelchair accessible", "accessible", "barrierefrei", "rollstuhlgerecht"],
  },
  {
    key: "elevator",
    db: [],
    phrases: [
      "lift","asansör", "asansörlü", "elevator", "aufzug"],
  },
];

/* ------------- Kesin desteklenmeyen (filtresi olmayan) ------------- */

export type UnsupportedCode =
  | "bedrooms"
  | "budget"
  | "sea_distance"
  | "pool"
  | "min_stay"
  | "not_in_system";

/** Sayı gerektirmeyen, doğrudan "desteklenmiyor" ifadeleri. */
export const UNSUPPORTED_PHRASES: ReadonlyArray<{ code: UnsupportedCode; phrases: string[] }> = [
  {
    code: "budget",
    phrases: [
      "bütçe", "bütçeli", "bütçeme uygun", "ucuz", "ucuza", "ekonomik", "uygun fiyatlı",
      "uygun fiyat", "fiyatı uygun", "hesaplı", "indirimli",
      "cheap", "budget", "affordable", "inexpensive", "low price", "low cost",
      "günstig", "günstige", "billig", "preiswert", "preiswerte", "budget",
    ],
  },
  {
    code: "min_stay",
    phrases: [
      "minimum konaklama", "en az konaklama", "minimum stay", "min stay",
      "mindestaufenthalt", "mindestaufenthalts",
    ],
  },
  {
    code: "pool",
    phrases: [
      "havuz", "havuzlu", "havuzu", "pool", "pools", "swimming pool", "schwimmbad",
      "swimmingpool",
    ],
  },
  {
    code: "bedrooms",
    phrases: ["yatak odası", "yatak odalı", "bedroom", "bedrooms", "schlafzimmer"],
  },
];

/* ------------------------- Tarih sözlüğü ------------------------- */

/** Ay adları (normalize). Uzun adlar TR ekleriyle de eşleşir. */
export const MONTHS: ReadonlyArray<{ m: number; names: string[]; short?: string[] }> = [
  { m: 1, names: ["ocak", "january", "januar", "janner"], short: ["jan"] },
  { m: 2, names: ["şubat", "february", "februar"], short: ["feb"] },
  { m: 3, names: ["mart", "march", "märz", "maerz"], short: ["mar", "mrz"] },
  { m: 4, names: ["nisan", "april"], short: ["apr"] },
  { m: 5, names: ["mayıs", "may", "mai"] },
  { m: 6, names: ["haziran", "june", "juni"], short: ["jun"] },
  { m: 7, names: ["temmuz", "july", "juli"], short: ["jul"] },
  { m: 8, names: ["ağustos", "august"], short: ["aug"] },
  { m: 9, names: ["eylül", "september"], short: ["sep", "sept"] },
  { m: 10, names: ["ekim", "october", "oktober"], short: ["oct", "okt"] },
  { m: 11, names: ["kasım", "november"], short: ["nov"] },
  { m: 12, names: ["aralık", "december", "dezember"], short: ["dec", "dez"] },
];

/** Tarih aralığı ayırıcı kelimeler (iki tarih arasında). */
export const RANGE_WORDS = ["to", "till", "until", "through", "thru", "bis", "ile", "and", "und", "ve"];

/** Tarih ifadesinin önünde/arkasında görülebilen dolgu kelimeleri. */
export const DATE_FILLERS = [
  "of", "the", "from", "between", "vom", "von", "zwischen", "am", "den", "on",
  "arasi", "arasinda", "arasindaki", "tarihleri", "tarihlerinde", "tarihinde",
  "tarihleri", "itibaren", "baslayarak", "kadar", "ayinda", "ayi", "ayindaki",
  "th", "st", "nd", "rd",
  // giriş/çıkış kelimeleri ve "tarihlerim" türleri (tarih aralığının parçası)
  "tarihlerim", "tarihlerimiz", "tarihim", "tarihimiz", "tarihler",
  "giris", "girisi", "giriste", "cikis", "cikisi", "cikista",
  "check", "checkin", "checkout", "out", "arrival", "departure",
  "anreise", "abreise", "ankunft",
];

/** Göreli/belirsiz tarih ifadeleri — tarih UYDURULMAZ, netleştirme istenir. */
export const RELATIVE_DATE_PHRASES = [
  "yarın", "bugün", "haftaya", "hafta sonu", "haftasonu", "gelecek hafta", "önümüzdeki hafta",
  "gelecek ay", "önümüzdeki ay", "bu yaz", "yazın", "bu kış", "kışın", "bayram", "bayramda",
  "yılbaşı", "yılbaşında", "sömestr", "tatilde",
  "tomorrow", "today", "next week", "this weekend", "next weekend", "weekend", "next month",
  "this summer", "summer", "christmas", "easter", "new year", "new years",
  "morgen", "heute", "nächste woche", "nächsten woche", "wochenende", "nächsten monat",
  "nächster monat", "diesen sommer", "im sommer", "sommer", "ostern", "weihnachten", "silvester",
];

/** Gece birimi. */
export const NIGHT_UNITS = [
  "gece", "gecelik", "night", "nights", "nacht", "nachte", "naechte", "ubernachtung",
  "ubernachtungen",
];

/* ------------------------- Kişi sözlüğü ------------------------- */

export type GuestRole = "total" | "adults" | "children" | "infants";

export const GUEST_UNITS: ReadonlyArray<{ role: GuestRole; words: string[] }> = [
  {
    role: "total",
    words: [
      "kişi", "kişilik", "kişiye", "kişiyiz", "kişiler", "kişilikvilla", "misafir", "misafirli",
      "misafirlik", "people", "person", "persons", "guest", "guests", "pax",
      "personen", "gast", "gäste", "leute",
      "friends", "arkadaş", "arkadaşız", "freunde",
    ],
  },
  { role: "adults", words: ["yetişkin", "yetişkinler", "adult", "adults", "erwachsene", "erwachsener", "erwachsenen"] },
  { role: "children", words: ["çocuk", "çocuklu", "çocuklar", "child", "children", "kid", "kids", "kind", "kinder", "kindern"] },
  { role: "infants", words: ["bebek", "bebekli", "baby", "babies", "babys", "infant", "infants", "kleinkind", "kleinkinder"] },
];

/** "for 6" / "für 6" — birimsiz kişi kalıbı. */
export const FOR_WORDS = ["for", "fur", "fuer"];

/** Sayı kelimeleri (yalnız birim/gece komşuluğunda sayı sayılır). */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  onbir: 11, oniki: 12, onuc: 13, ondort: 14, onbes: 15, onalti: 16, yirmi: 20,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, twenty: 20,
  ein: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, funf: 5, fuenf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwolf: 12, zwoelf: 12,
  dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, zwanzig: 20,
  cift: 2, couple: 2, paar: 2,
};

/** "çift / couple / Paar" tek başına kişi sayısı DEĞİLDİR (yalnız "bir çift"
 *  gibi açık kalıpta değerlendirilmez; belirsiz kabul edilir). */
export const AMBIGUOUS_NUMBER_WORDS = new Set(["cift", "couple", "paar"]);

/* ------------------- Para / mesafe / oda birimleri ------------------- */

export const CURRENCY_WORDS = [
  "tl", "try", "lira", "euro", "eur", "usd", "dolar", "dollar", "dollars", "gbp", "sterlin",
  "pound", "pounds", "franken", "chf",
];
export const BUDGET_QUALIFIERS = [
  "alti", "altinda", "altina", "ustu", "max", "maks", "maksimum", "maximum", "en", "fazla",
  "kadar", "under", "below", "up", "to", "unter", "bis", "hochstens", "maximal", "gecelik",
  "per", "night", "pro", "nacht", "toplam", "total",
];
export const DISTANCE_UNITS = ["m", "mt", "metre", "metrede", "meter", "meters", "metres", "metern", "km", "kilometre", "kilometer", "dk", "min", "dakika", "minutes", "minuten"];
export const ROOM_UNITS = ["yatak", "odali", "odasi", "oda", "bedroom", "bedrooms", "br", "schlafzimmer", "zimmer", "zimmern"];

/* ---------------------------- Dolgu ---------------------------- */

export const STOPWORDS = [
  // TR
  "ve", "veya", "ya", "da", "de", "ile", "icin", "bir", "bu", "su", "o", "olan", "olsun",
  "olarak", "gibi", "cok", "en", "daha", "mi", "mu", "misiniz", "musunuz", "var", "varmi",
  "ariyorum", "ariyoruz", "istiyorum", "istiyoruz", "isterim", "isteriz", "lazim", "bakiyorum",
  "bakiyoruz", "bul", "bulun", "bulur", "bulabilir", "rica", "lutfen", "merhaba", "selam",
  "tatil", "tatili", "tatilimiz", "tatilim", "tatilimizi", "villa", "villalar", "villasi",
  "villayi", "villalari", "villada", "villalarda", "villaya", "ev", "evi", "kiralik",
  "kiralamak", "kirala", "kiralama", "konaklama", "icinde", "olabilir", "bana", "bize", "nerede",
  "uygun", "ayinda", "ayi", "ay", "tarih", "tarihler", "tarihinde", "arasi", "arasinda",
  "itibaren", "kadar", "biz", "ben", "aile", "ailemle", "ailece", "arkadas", "arkadaslarla",
  "arkadaslarimla", "ile", "birlikte", "beraber", "gun", "gunluk", "tarihleri", "sahip",
  "sahibi", "olsa", "iyi", "guzel", "olmasi", "olmali", "tercihen", "mumkunse",
  "eden", "kabul", "edilen", "veren", "isteyen", "arayan", "dahil", "koyu", "koy", "bolgesi",
  "bolgesinde", "bolgede", "civari", "civarinda", "taraflari", "taraflarinda", "mevkii", "yerde",
  "bir", "seyler", "sey", "tarz", "tarzi", "tarzinda", "turu", "tipi", "tip", "mekan", "yer",
  "yeri", "konaklayacagimiz", "kalacagimiz", "kalabilecegimiz", "gidiyoruz", "gidecegiz", "geliyoruz",
  "herhangi", "acaba", "mi", "ne", "nasil", "bakar", "misin", "musun", "oneri", "onerir", "onerin",
  "tavsiye", "lutfen", "selamlar", "iyi", "gunler", "sizden", "rica", "ediyorum", "ederim", "olur",
  "olurdu", "harika", "super", "muhtesem", "keyifli", "keyif", "icin", "icinde", "hem", "ayrica",
  // EN
  "i", "im", "am", "a", "an", "the", "we", "are", "our", "my", "me", "us", "for", "with",
  "and", "or", "in", "at", "on", "to", "of", "from", "looking", "look", "search", "searching",
  "find", "need", "needs", "want", "wanted", "would", "like", "please", "hi", "hello", "villa",
  "villas", "house", "houses", "home", "holiday", "holidays", "vacation", "rental", "rentals",
  "rent", "stay", "between", "during", "is", "there", "any", "some", "available", "do", "you",
  "have", "can", "could", "get", "that", "which", "has", "should", "family", "friends", "it",
  "its", "nice", "good", "ideally", "preferably",
  "area", "around", "somewhere", "place", "something", "great", "lovely", "beautiful", "perfect",
  "trip", "getaway", "break", "will", "be", "going", "go", "come", "coming", "us", "suggest",
  "recommend", "options", "option", "type", "also", "both", "too", "really", "very", "near", "close",
  // DE
  "ich", "wir", "suche", "suchen", "eine", "einen", "ein", "einer", "die", "der", "das", "den",
  "dem", "des", "mit", "und", "oder", "im", "fur", "fuer", "von", "vom", "bis", "zum", "zur",
  "villen", "ferien", "ferienhaus", "ferienvilla", "ferienvillen", "haus", "urlaub", "gibt", "es",
  "bitte", "hallo", "mochte", "mochten", "moechte", "brauchen", "brauche", "zwischen", "ist",
  "sind", "haben", "verfugbar", "mieten", "uns", "familie", "freunden", "fur", "eine", "schone",
  "schoene", "gerne", "idealerweise", "moglichst",
  "gegend", "umgebung", "region", "nahe", "nähe", "in", "schön", "schöne", "schönen", "tolle", "tollen",
  "perfekte", "wunderschöne", "zuerst", "auch", "sowie", "dazu", "sehr", "welche", "empfehlen", "gesucht",
];

/** Rakama bitişik TR çekim ekleri ("8'e", "5'ten", "2.si"). */
export const NUMBER_SUFFIX_FRAGMENTS = [
  "e", "a", "ye", "ya", "de", "da", "te", "ta", "den", "dan", "ten", "tan", "inci", "nci",
  "unci", "uncu", "inde", "unde", "si", "su", "i", "u", "nin", "nun", "lik", "luk",
];

/* -------------------- Normalize edilmiş görünümler -------------------- */

const uniq = <T,>(xs: T[]): T[] => Array.from(new Set(xs));

export const NORM = {
  stopwords: new Set(STOPWORDS.map(normalizeToken)),
  numberSuffixFragments: new Set(NUMBER_SUFFIX_FRAGMENTS),
  rangeWords: new Set(RANGE_WORDS.map(normalizeToken)),
  dateFillers: new Set(DATE_FILLERS.map(normalizeToken)),
  nightUnits: new Set(NIGHT_UNITS.map(normalizeToken)),
  forWords: new Set(FOR_WORDS.map(normalizeToken)),
  currencyWords: new Set(CURRENCY_WORDS.map(normalizeToken)),
  budgetQualifiers: new Set(BUDGET_QUALIFIERS.map(normalizeToken)),
  distanceUnits: new Set(DISTANCE_UNITS.map(normalizeToken)),
  roomUnits: new Set(ROOM_UNITS.map(normalizeToken)),
  relativeDates: uniq(RELATIVE_DATE_PHRASES.map(normalizePhrase)).filter((p) => p.length > 0),
  months: MONTHS.map((mo) => ({
    m: mo.m,
    names: uniq(mo.names.map(normalizeToken)),
    short: uniq((mo.short ?? []).map(normalizeToken)),
  })),
  guestUnits: GUEST_UNITS.map((g) => ({ role: g.role, words: new Set(g.words.map(normalizeToken)) })),
  concepts: CONCEPTS.map((c) => ({
    key: c.key,
    db: c.db.map(normalizePhrase),
    phrases: c.phrases.map(normalizePhrase).filter((p) => p.length > 0),
  })),
  unsupported: UNSUPPORTED_PHRASES.map((u) => ({
    code: u.code,
    phrases: u.phrases.map(normalizePhrase).filter((p) => p.length > 0),
  })),
};

/** Villa tipi adlarında "çekirdek" anlamı taşımayan genel kelimeler. */
export const VILLA_WORDS = new Set(
  [
    "villa", "villalar", "villaları", "villası", "villalari", "villasi", "villas", "villen",
    "ferienvillen", "ferienvilla", "evler", "evleri", "houses", "homes", "villen",
  ].map(normalizeToken)
);

/* -------------------- Bölge / ad yardımcı listeleri -------------------- */

/** "Kalkan / Merkez" gibi alt bölgelerin genel kısa adları — tek başına
 *  hiçbir bölgeye bağlanmaz (tam ad "Kalkan Merkez" yine tanınır). */
export const GENERIC_PLACE_WORDS = new Set(
  ["merkez", "center", "centre", "zentrum"].map(normalizeToken)
);

/** Alt bölge adı aynı zamanda yaygın bir kelimeyse ("yalı", "çiftlik",
 *  "palamut"…) tek başına OTOMATİK seçilmez; yalnız öneri olarak sunulur. */
export const WEAK_PLACE_WORDS = new Set(
  ["yalı", "çiftlik", "kasaba", "ordu", "çalış"].map(normalizeToken)
);

/** Tip adlarındaki "kiralık / for rent" gibi anlam taşımayan kelimeler. */
export const RENT_WORDS = new Set(
  ["kiralık", "kiralik", "rent", "rental", "rentals", "for", "zu", "vermieten", "miete", "mieten"].map(normalizeToken)
);

/** Kayıt adlarındaki bağlaçlar ("Villas with …", "Villen für …"); sorguda
 *  çoğu zaman yazılmaz, bu yüzden bağlaçsız bir varyant da eklenir. */
export const LINK_WORDS = new Set(
  ["with", "mit", "for", "für", "fuer", "the", "of", "and", "und", "a", "an", "in", "im", "zu", "to", "ile", "ve"].map(normalizeToken)
);

/* ===================================================================
   v3 — olumsuzluk · sıralama · esnek tarih · yazım koruması · alt ad
   =================================================================== */

/** Bir kriterin ÖNÜNDE gelince onu olumsuzlayan kelimeler
 *  ("no jacuzzi", "ohne Whirlpool", "kein Pool"). */
export const NEGATION_PREFIX = [
  "no", "not", "without", "non", "ohne", "kein", "keine", "keinen", "keinem", "keiner",
];
/** Bir kriterin ARKASINDA gelince onu olumsuzlayan / "zorunlu değil" yapan
 *  kelimeler ("jakuzi olmasın", "havuz istemiyorum", "pool not needed"). */
export const NEGATION_SUFFIX = [
  "olmasın", "olmayan", "olmayacak", "istemiyorum", "istemiyoruz", "istemeyiz", "istemem",
  "değil", "hariç", "yok", "gerekmez", "gerekmiyor", "etmeyen", "edilmeyen", "vermeyen",
  "not", "nicht", "unnecessary", "egal",
];
/** Kriter ile olumsuz kelime arasında atlanabilecek köprü kelimeler
 *  ("evcil hayvan KABUL etmeyen", "jakuzi ŞART değil", "pool IS not needed"). */
export const NEGATION_BRIDGE = [
  "kabul", "izin", "şart", "gerek", "önemli", "is", "are", "really", "brauchen", "nötig", "notwendig",
  "erforderlich", "wichtig",
];
/** Kelime sonundaki "-sız/-siz/-suz/-süz" (normalize: siz/suz) → olumsuz. */
export const NEGATION_TOKEN_SUFFIXES = ["siz", "suz"];

/** Sıralama ifadeleri → `/arama` izin listesi (lib/pagination ALLOWED_PUBLIC_SORTS). */
export const SORT_PHRASES: ReadonlyArray<{
  sort: "price-asc" | "price-desc" | "capacity-asc" | "capacity-desc";
  phrases: string[];
}> = [
  {
    sort: "price-asc",
    phrases: [
      "en ucuz", "en ucuzu", "en ucuzlar", "en ucuzundan", "en uygun fiyatlı", "en uygun fiyatlılar",
      "fiyatı en düşük", "en düşük fiyatlı", "ucuzdan pahalıya", "fiyata göre artan", "fiyata göre sırala",
      "cheapest", "lowest price", "lowest prices", "price low to high", "sort by price", "least expensive",
      "günstigste", "günstigsten", "billigste", "billigsten", "preis aufsteigend", "nach preis sortiert",
    ],
  },
  {
    sort: "price-desc",
    phrases: [
      "en pahalı", "en pahalısı", "en pahalılar", "pahalıdan ucuza", "fiyata göre azalan", "fiyatı en yüksek",
      "most expensive", "highest price", "price high to low", "teuerste", "teuersten", "preis absteigend",
    ],
  },
  {
    sort: "capacity-desc",
    phrases: [
      "en geniş", "en büyük", "en kalabalık", "en çok kişilik", "kapasitesi en yüksek", "en fazla kişilik",
      "largest", "biggest", "highest capacity", "größte", "größten", "meiste personen",
    ],
  },
  {
    sort: "capacity-asc",
    phrases: ["en küçük", "en az kişilik", "smallest", "lowest capacity", "kleinste", "kleinsten"],
  },
];

/** Esnek tarih ifadeleri → `flexible=3` (arayüzdeki ±3 gün seçeneği). */
export const FLEXIBLE_PHRASES = [
  "esnek", "esnek tarih", "esnek tarihler", "tarihler esnek", "tarihlerim esnek", "tarih esnek",
  "tarihlerde esneklik", "birkaç gün oynayabilir", "bir kaç gün oynayabilir", "günler oynayabilir",
  "artı eksi 3 gün", "artı eksi üç gün", "3 gün esnek", "üç gün esnek", "esnek olabilir",
  "flexible", "flexible dates", "dates are flexible", "dates flexible", "plus minus 3 days",
  "give or take a few days", "flexibel", "flexible daten", "flexibles datum", "daten flexibel",
  "termine flexibel", "plus minus 3 tage",
  "plus or minus 3 days", "plus or minus three days", "3 days either way", "few days either way",
  "plus minus drei tage", "3 tage früher oder später",
];

/** Yazım düzeltmesinde ASLA bir kayda çevrilmeyecek yaygın kelimeler
 *  ("eden" → Eşen olmasın). Stopword / birim / ay listeleriyle birlikte kullanılır. */
export const COMMON_WORDS = [
  // TR
  "kalan", "kalanlar", "karsi", "karsiya", "devre", "devren",
  "eden", "etmek", "kabul", "edilen", "veren", "isteyen", "arayan", "olan", "olsun", "deniz", "denize",
  "plaj", "plaja", "sahil", "sahile", "havuz", "havuzu", "havuzlu", "manzara", "manzarali", "aile", "ailemiz",
  "cocuk", "cocuklar", "cocuklu", "bebek", "kopek", "kedi", "hayvan", "evcil", "sakin", "sessiz", "guzel",
  "temiz", "yeni", "eski", "buyuk", "kucuk", "genis", "yakin", "uzak", "merkez", "merkezi", "koy", "koyu",
  "orman", "dag", "doga", "bahce", "teras", "balkon", "mutfak", "salon", "oda", "odali", "yatak", "banyo",
  "tatil", "hafta", "gece", "gunduz", "sabah", "aksam", "yaz", "kis", "bahar", "sonbahar", "gunes",
  "ozel", "ortak", "acik", "kapali", "isitmali", "korunakli", "gizli", "romantik", "luks", "ucuz",
  "fiyat", "fiyatli", "ucret", "para", "lira", "euro", "dolar", "kisi", "kisilik", "misafir",
  "istiyorum", "istiyoruz", "ariyorum", "ariyoruz", "lazim", "gerek", "olabilir", "mumkun",
  "kalacak", "kalmak", "gidecegiz", "gelecegiz", "geliyoruz", "ayrica", "sadece", "mutlaka", "sakin",
  "kalabalik", "arkadas", "arkadaslar", "esim", "esimle", "sevgilim", "konum", "konumda", "yerde",
  // EN
  "beach", "seaside", "pool", "private", "shared", "family", "kids", "children", "child", "baby",
  "garden", "terrace", "kitchen", "room", "rooms", "bedroom", "bedrooms", "people", "person", "guests",
  "quiet", "peaceful", "nice", "great", "best", "cheap", "price", "prices", "week", "weeks", "night",
  "nights", "close", "near", "nearby", "center", "centre", "view", "views", "secluded", "romantic",
  "summer", "winter", "spring", "autumn", "stay", "staying", "travel", "trip", "dogs", "cats", "party",
  // DE
  "strand", "garten", "terrasse", "kinder", "familie", "ruhig", "ruhige", "preis", "woche", "wochen",
  "nacht", "nachte", "nahe", "zentrum", "blick", "privat", "eigener", "hund", "hunde", "katze",
  "urlaub", "reise", "sommer", "winter", "personen", "schlafzimmer", "zimmer", "kalte",
];

/** Kayıt adlarında "baş isim" görevi gören genel kelimeler; ayırt edici alt
 *  ad ("Korunaklı Havuz" → "korunaklı") türetilirken atılır. */
export const GENERIC_HEADS = [
  "havuz", "havuzu", "havuzlu", "pool", "pools", "alan", "alanı", "alanlı", "area", "areas",
  "oda", "odası", "odalı", "room", "rooms", "raum", "salon", "salonu", "salonlu", "makinesi",
  "makineli",
];
/** Atılabilecek (anlamı daraltmayan) sıfatlar: "Açık Otopark" → "otopark".
 *  "Geniş Bahçe" gibi anlamı DARALTAN sıfatlar BİLİNÇLİ OLARAK yoktur. */
export const DROPPABLE_MODIFIERS = ["açık"];
/** Tek başına ayırt edici sayılmayan (çok anlamlı / genel) kelimeler.
 *  Örn. "Private Villas" → "private" TEK BAŞINA muhafazakâr tipe gitmez
 *  ("private pool" ≠ muhafazakâr); tam ad "private villa" yine tanınır. */
export const AMBIGUOUS_CORE_WORDS = [
  "private", "privat", "privater", "özel", "own", "eigener", "kids", "kid", "children", "child",
  "çocuk", "kinder", "family", "families", "aile", "familie", "familien", "deniz", "sea", "meer",
  "doğa", "nature", "natur", "heated", "ısıtmalı", "beheizter", "kapalı", "indoor", "innen",
  "large", "big", "große", "geniş", "büyük", "nearby", "yakın", "double", "çift", "doppel",
  "spor", "sport", "fitness", "beyaz", "white", "budget",
];

/** Bölge alternatif adları — yalnız slug'ı CANLI taksonomide varsa bağlanır. */
export const REGION_ALIASES: ReadonlyArray<{ slug: string; phrases: string[] }> = [
  { slug: "patara", phrases: ["gelemiş", "gelemiş köyü"] },
  { slug: "kalkan-kalamar", phrases: ["kalamar koyu", "kalamar bay"] },
  { slug: "fethiye-calis", phrases: ["çalış plajı", "çalış beach"] },
  { slug: "oludeniz", phrases: ["ölü deniz", "blue lagoon", "mavi lagün"] },
  { slug: "kayakoy", phrases: ["kaya köy", "kaya köyü", "kaya village"] },
  { slug: "kas-cukurbag-yarimadasi", phrases: ["kaş yarımadası", "kas peninsula"] },
];

export const NORM_V3 = {
  negationPrefix: new Set(NEGATION_PREFIX.map(normalizeToken)),
  negationSuffix: new Set(NEGATION_SUFFIX.map(normalizeToken)),
  negationBridge: new Set(NEGATION_BRIDGE.map(normalizeToken)),
  negationTokenSuffixes: NEGATION_TOKEN_SUFFIXES,
  sort: SORT_PHRASES.map((s) => ({ sort: s.sort, phrases: s.phrases.map(normalizePhrase).filter((p) => p.length > 0) })),
  flexible: FLEXIBLE_PHRASES.map(normalizePhrase).filter((p) => p.length > 0),
  commonWords: new Set(COMMON_WORDS.map(normalizeToken)),
  genericHeads: new Set(GENERIC_HEADS.map(normalizeToken)),
  droppableModifiers: new Set(DROPPABLE_MODIFIERS.map(normalizeToken)),
  ambiguousCore: new Set(AMBIGUOUS_CORE_WORDS.map(normalizeToken)),
  regionAliases: REGION_ALIASES.map((r) => ({ slug: r.slug, phrases: r.phrases.map(normalizePhrase).filter((p) => p.length > 0) })),
};
