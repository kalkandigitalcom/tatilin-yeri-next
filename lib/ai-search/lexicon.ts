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
    ],
  },
  {
    key: "secluded_pool",
    db: ["korunaklı havuz", "korunaklı havuzlu"],
    phrases: [
      "korunaklı havuz", "korunaklı havuzlu", "korunaklı bir havuz",
      "secluded pool", "sheltered pool", "screened pool", "secluded swimming pool",
      "geschützter pool", "geschützten pool", "geschütztem pool", "geschuetzter pool",
      "sichtgeschützter pool", "sichtgeschützten pool", "sichtgeschütztem pool",
      "uneinsehbarer pool", "uneinsehbarem pool",
    ],
  },
  {
    key: "private_pool",
    db: ["özel havuz", "özel havuzlu"],
    phrases: [
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
      "kapalı havuz", "kapalı havuzlu", "indoor pool", "indoor swimming pool",
      "innenpool", "hallenbad", "innen pool",
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
      "çocuk havuzu", "çocuk havuzlu", "çocuklar için havuz",
      "children's pool", "childrens pool", "kids pool", "kid's pool", "kiddie pool",
      "child pool", "paddling pool", "kinderbecken", "kinderpool", "planschbecken",
    ],
  },
  {
    key: "infinity_pool",
    db: ["sonsuzluk havuzu", "infinity havuz"],
    phrases: [
      "sonsuzluk havuzu", "sonsuzluk havuzlu", "infinity havuz", "infinity havuzlu",
      "infinity pool", "infinitypool",
    ],
  },
  {
    key: "sauna",
    db: ["sauna", "saunalı"],
    phrases: ["sauna", "saunalı", "saunas"],
  },
  {
    key: "hammam",
    db: ["hamam", "türk hamamı"],
    phrases: ["hamam", "hamamlı", "türk hamamı", "turkish bath", "hammam", "türkisches bad"],
  },
  {
    key: "sea_view",
    db: ["deniz manzarası", "deniz manzaralı"],
    phrases: [
      "deniz manzarası", "deniz manzaralı", "denize nazır", "deniz görür",
      "sea view", "sea views", "seaview", "ocean view", "view of the sea",
      "meerblick", "meeresblick", "blick aufs meer",
    ],
  },
  {
    key: "nature_view",
    db: ["doğa manzarası", "doğa manzaralı"],
    phrases: [
      "doğa manzarası", "doğa manzaralı", "nature view", "nature views",
      "naturblick", "blick in die natur",
    ],
  },
  {
    key: "near_sea",
    db: ["denize sıfır", "denize yakın", "sahile yakın", "plaja yakın", "denize sıfır konum"],
    phrases: [
      "denize sıfır", "denize yakın", "denize çok yakın", "sahile yakın", "plaja yakın",
      "sahile sıfır", "plaja sıfır", "near the sea", "near the beach", "close to the sea",
      "close to the beach", "beachfront", "seafront", "by the sea", "by the beach",
      "strandnah", "strandnahe", "strandnahen", "am meer", "am strand", "nah am meer",
      "nahe am meer", "meernah", "direkt am meer", "in strandnähe",
    ],
  },
  {
    key: "honeymoon",
    db: ["balayı"],
    phrases: ["balayı", "balayına", "balayı için", "honeymoon", "honeymooners", "flitterwochen", "hochzeitsreise"],
  },
  {
    key: "conservative",
    db: ["muhafazakar", "muhafazakâr"],
    phrases: [
      "muhafazakar", "muhafazakâr", "conservative", "konservativ", "konservative",
      "konservativen",
    ],
  },
  {
    key: "luxury",
    db: ["lüks"],
    phrases: ["lüks", "luxury", "luxurious", "luxus", "luxuriös", "luxuriöse"],
  },
  {
    key: "child_friendly",
    db: ["çocuk dostu", "çocuğa uygun", "aileye uygun"],
    phrases: [
      "çocuk dostu", "çocuğa uygun", "çocuklara uygun", "aileye uygun",
      "child friendly", "kid friendly", "kids friendly", "family friendly",
      "kinderfreundlich", "kinderfreundliche", "familienfreundlich", "familienfreundliche",
    ],
  },
  {
    key: "pet_friendly",
    db: [
      "evcil hayvan", "evcil hayvan dostu", "evcil hayvan kabul edilir", "evcil hayvana uygun",
      "evcil hayvan izinli",
    ],
    phrases: [
      "evcil hayvan", "evcil hayvanlı", "evcil hayvan kabul eden", "evcil hayvan kabul edilen",
      "evcil hayvan dostu", "evcil hayvana uygun", "evcil hayvana izin veren", "evcil hayvan izinli",
      "köpekli", "köpeğimle", "kedili",
      "pet friendly", "pets allowed", "pets welcome", "with pets", "with my dog", "dog friendly",
      "haustiere erlaubt", "haustierfreundlich", "haustierfreundliche", "haustierfreundlichen",
      "mit hund", "hunde erlaubt", "haustiere", "haustiere willkommen", "pets",
    ],
  },
  {
    key: "play_area",
    db: ["çocuk oyun alanı", "çocuk oyun alanlı"],
    phrases: [
      "çocuk oyun alanı", "çocuk oyun alanlı", "oyun alanı", "oyun alanlı", "çocuk parkı",
      "children's play area", "childrens play area", "kids play area", "play area", "playground",
      "kinderspielplatz", "spielplatz",
    ],
  },
  {
    key: "cinema",
    db: ["sinema odası", "sinema odalı"],
    phrases: [
      "sinema odası", "sinema odalı", "sinema salonu", "ev sineması", "sinemalı",
      "cinema room", "home cinema", "home theater", "home theatre", "movie room",
      "kinoraum", "heimkino",
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
    phrases: ["mangal", "mangallı", "barbekü", "barbecue", "bbq", "grill", "grillplatz"],
  },
  {
    key: "fireplace",
    db: ["şömine", "şömineli"],
    phrases: ["şömine", "şömineli", "fireplace", "kamin"],
  },
  {
    key: "gym",
    db: ["spor salonu", "fitness"],
    phrases: ["spor salonu", "fitness", "gym", "fitnessraum"],
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
export const DISTANCE_UNITS = ["m", "mt", "metre", "metrede", "meter", "metern", "km", "kilometre", "kilometer", "dk", "min", "dakika", "minutes", "minuten"];
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
  // EN
  "i", "im", "am", "a", "an", "the", "we", "are", "our", "my", "me", "us", "for", "with",
  "and", "or", "in", "at", "on", "to", "of", "from", "looking", "look", "search", "searching",
  "find", "need", "needs", "want", "wanted", "would", "like", "please", "hi", "hello", "villa",
  "villas", "house", "houses", "home", "holiday", "holidays", "vacation", "rental", "rentals",
  "rent", "stay", "between", "during", "is", "there", "any", "some", "available", "do", "you",
  "have", "can", "could", "get", "that", "which", "has", "should", "family", "friends", "it",
  "its", "nice", "good", "ideally", "preferably",
  // DE
  "ich", "wir", "suche", "suchen", "eine", "einen", "ein", "einer", "die", "der", "das", "den",
  "dem", "des", "mit", "und", "oder", "im", "fur", "fuer", "von", "vom", "bis", "zum", "zur",
  "villen", "ferien", "ferienhaus", "ferienvilla", "ferienvillen", "haus", "urlaub", "gibt", "es",
  "bitte", "hallo", "mochte", "mochten", "moechte", "brauchen", "brauche", "zwischen", "ist",
  "sind", "haben", "verfugbar", "mieten", "uns", "familie", "freunden", "fur", "eine", "schone",
  "schoene", "gerne", "idealerweise", "moglichst",
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
