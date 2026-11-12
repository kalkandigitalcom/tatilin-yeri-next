/* ===============================================================
   🗂️ AI ARAMA — CANLI TAKSONOMİDEN SÖZLÜK (SAF)
   ===============================================================
   Girdi: mevcut `GET /api/public/taxonomies` cevabı (bölgeler, villa
   tipleri, villa özellikleri; EN/DE adlarıyla). Bu dosya DB'ye veya
   ağa ERİŞMEZ; yalnız verilen satırlardan eşleştirme sözlüğü kurar.

   Sözlük girdileri:
     • option  — gerçek kayıt (bölge / tip / özellik). URL'ye giden
                 değer her zaman o kaydın `slug || id`'sidir
                 (`buildHeroSearchParams` ile birebir aynı zincir).
     • concept — TR/EN/DE eş anlamlı ifadeler. YALNIZ adı kavramın
                 `db` listesiyle birebir örtüşen kayıtlara bağlanır;
                 bağlanacak kayıt yoksa "sistemde yok" olarak raporlanır.
     • unsupported — filtresi olmayan istekler (bütçe, havuz vb.).

   v3 — OTOMATİK TÜRETİLEN ADLAR (elle kelime eklemeden):
     • ayırt edici alt ad: "Korunaklı Havuz" → "korunaklı",
       "Sinema Odası" → "sinema", "Açık Otopark" → "otopark".
       Yalnız TEK bir kayda işaret ediyorsa ve çok anlamlı bir kelime
       değilse üretilir (`partial`; aynı konumda tam ad varsa o kazanır).
     • bitişik yazım: "deniz manzaralı" ↔ "denizmanzaralı".
     • ayrı yazım: tek kelimelik bölge adları ("Kayaköy" ↔ "kaya köy").
     • çok anlamlı tek kelimelik çekirdek ("Private Villas" → "private")
       tek başına eşleşmez; yalnız villa kelimesiyle ("private villa").
     • bölge alternatif adları (ör. "Gelemiş" → Patara) yalnız slug'ı
       canlıda varsa bağlanır.
   =============================================================== */

import type { FilterOption } from "@/app/components/ui/hero/_types/hero";
import type { Locale } from "@/lib/i18n/config";

import {
  GENERIC_PLACE_WORDS,
  LINK_WORDS,
  NORM,
  NORM_V3,
  RENT_WORDS,
  VILLA_WORDS,
  WEAK_PLACE_WORDS,
  type UnsupportedCode,
} from "./lexicon";
import { normalizePhrase } from "./tokenize";
import type { TaxonomyResponse } from "./schema";

export type OptionKind = "region" | "type" | "feature";

export type VocabOption = {
  key: string; // `${kind}:${id}`
  kind: OptionKind;
  id: string;
  slug: string | null;
  /** Canonical (TR) ad. */
  name: string;
  nameByLocale: { en?: string; de?: string };
  /** Yalnız bölgeler. */
  groupName?: string | null;
  isGroupRoot?: boolean;
};

export type AliasTarget =
  | { kind: "option"; optionKey: string }
  | { kind: "concept"; concept: string }
  | { kind: "unsupported"; code: UnsupportedCode };

/** `weak`: tek başına otomatik seçilmez, yalnız öneri olur (ör. "yalı"). */
export type AliasEntry = {
  tokens: string[];
  target: AliasTarget;
  weak?: boolean;
  /** v3 — otomatik türetilmiş ayırt edici alt ad (aynı uzunlukta tam ad varsa o kazanır). */
  partial?: boolean;
};

/** Sözlükte "herhangi bir villa kelimesi" yer tutucusu ("2027 villaları"). */
export const ANY_VILLA = "*villa";

export type Vocabulary = {
  options: Record<string, VocabOption>;
  aliases: AliasEntry[];
  /** kavram → bağlı kayıt anahtarları (boşsa kavram sistemde yok). */
  conceptOptions: Record<string, string[]>;
  /** Hero ile aynı `FilterOption` listeleri (`buildHeroSearchParams` için). */
  regionOptions: FilterOption[];
  typeOptions: FilterOption[];
  featureOptions: FilterOption[];
};

/* ---------------- Eşleştirme yardımcıları (saf) ---------------- */

/** Bir kelimenin sonuna gelebilen TR / EN / DE çekim ekleri. */
const SUFFIXES = new Set([
  // TR (normalize: ı→i, ü→u, ö→o)
  "li", "lu", "lik", "luk", "si", "su", "i", "u", "a", "e", "ya", "ye", "na", "ne",
  "da", "de", "ta", "te", "dan", "den", "tan", "ten", "in", "un", "nin", "nun",
  "la", "le", "lar", "ler", "lari", "leri", "larda", "lerde", "daki", "deki", "taki",
  "teki", "ki", "yla", "yle", "sinda", "sinde", "sindan", "sinden", "ni", "nu", "yi", "yu",
  "lerin", "larin", "imiz", "umuz",
  // çoğul iyelik ("ailemiz", "balayımız", "jakuzilerimiz", "kedimizi")
  "miz", "mizi", "mize", "mizle", "muz", "muzu", "muza", "muzla",
  "imizi", "imize", "imizle", "umuzu", "umuza", "umuzla", "lerimiz", "larimiz", "lerimizi", "larimizi",
  // iyelik + bulunma ("yarımadasında", "koyunda")
  "nda", "nde", "ndan", "nden", "ndaki", "ndeki",
  // EN / DE
  "s", "es", "n", "en", "em", "er", "ern",
]);
/** 4 harften kısa adlar (ör. "kas" = Kaş) yalnız yer ekleriyle eşleşir. */
const SHORT_SUFFIXES = new Set(["da", "de", "ta", "te", "dan", "den", "tan", "ten", "daki", "deki", "taki", "teki", "a", "e", "ya", "ye", "s"]);
const STEM_SUFFIXES = ["lari", "leri", "lik", "luk", "lar", "ler", "li", "lu", "si", "su"];

function stem(w: string): string {
  for (const s of STEM_SUFFIXES) {
    if (w.length - s.length >= 5 && w.endsWith(s)) return w.slice(0, -s.length);
  }
  return w;
}

/** Sorgu token'ı (`q`) sözlük token'ıyla (`a`) eşleşiyor mu? */
export function tokenMatches(q: string, a: string): boolean {
  if (q === a) return true;
  if (a === ANY_VILLA) return VILLA_WORDS.has(q) || q.startsWith("villa") || q.startsWith("villen");
  /* EN çoğul sözlükte, tekil sorguda: "area" ↔ "areas". Yalnız -s/-es:
     TR'de -n/-in ekleri ("kişi" ↔ "kışın") yanlış eşleşme üretir. */
  if (a.length > q.length && q.length >= 4 && a.startsWith(q) && ["s", "es"].includes(a.slice(q.length)))
    return true;
  if (q.length > a.length && q.startsWith(a)) {
    const rest = q.slice(a.length);
    if (a.length >= 4 ? SUFFIXES.has(rest) : SHORT_SUFFIXES.has(rest)) return true;
  }
  if (a.length >= 5 && q.length >= 5 && stem(q) === stem(a)) return true;
  return false;
}

function phraseEquals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => tokenMatches(t, b[i]) || tokenMatches(b[i], t));
}

/** Tip/özellik adından "villa" gibi genel kelimeleri atar. */
export function coreTokens(tokens: string[]): string[] {
  const core = tokens.filter((t) => !VILLA_WORDS.has(t));
  return core.length > 0 ? core : tokens;
}

/* ---------------------------- Kurulum ---------------------------- */

const PRIVACY_WORDS = new Set(["private", "privat", "privater", "privaten", "privatem", "ozel", "own", "eigener", "eigene"]);

export function localizedName(opt: VocabOption, locale: Locale): string {
  if (opt.kind === "region" || locale === "tr") return opt.name;
  const v = opt.nameByLocale[locale];
  return v && v.trim() ? v.trim() : opt.name;
}

export function buildVocabulary(tax: TaxonomyResponse): Vocabulary {
  const options: Record<string, VocabOption> = {};
  const aliases: AliasEntry[] = [];
  const seen = new Set<string>();
  const pushAlias = (tokens: string[], target: AliasTarget, weak = false, partial = false) => {
    if (tokens.length === 0) return;
    const sig = `${tokens.join(" ")}|${JSON.stringify(target)}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    const e: AliasEntry = { tokens, target };
    if (weak) e.weak = true;
    if (partial) e.partial = true;
    aliases.push(e);
  };

  /* Bölgeler — adlar çevrilmez (özel isim). Grup kökü: name === filter_group_name. */
  for (const l of tax.locations) {
    const group = (l.filter_group_name ?? "").trim();
    const opt: VocabOption = {
      key: `region:${l.id}`,
      kind: "region",
      id: l.id,
      slug: l.slug?.trim() ? l.slug.trim() : null,
      name: l.name.trim(),
      nameByLocale: {},
      groupName: group || null,
      isGroupRoot: !!group && l.name.trim() === group,
    };
    options[opt.key] = opt;
    pushAlias(normalizePhrase(opt.name), { kind: "option", optionKey: opt.key });
    /* Alt bölge: canlıda "Fethiye / Ölüdeniz" biçiminde. Kısa ad
       ("Ölüdeniz") tek başına da bu kayda (canonical slug'ına) gider.
       Genel adlar ("Merkez") eklenmez; yaygın kelime olan adlar
       ("Yalı", "Çiftlik") yalnız öneri üretir. Aynı kısa ad birden fazla
       ana bölgede varsa ("Üzümlü") eşleşme seçim olarak sorulur. */
    const slash = opt.name.lastIndexOf("/");
    if (slash > 0) {
      const short = normalizePhrase(opt.name.slice(slash + 1));
      const joined = short.join(" ");
      if (short.length > 0 && !(short.length === 1 && GENERIC_PLACE_WORDS.has(joined))) {
        pushAlias(short, { kind: "option", optionKey: opt.key }, WEAK_PLACE_WORDS.has(joined));
      }
      /* "X / Merkez" alt bölgesi: EN/DE ve TR çekimli söylenişleri
         ("Kalkan centre", "Kalkan town centre", "centre of Kalkan",
         "Zentrum von Kalkan", "Kalkan merkezi"). Ana bölge adı kaydın
         kendi adından alınır; sabit bölge yazılmaz. */
      if (short.length === 1 && GENERIC_PLACE_WORDS.has(joined)) {
        const root = normalizePhrase(opt.name.slice(0, slash));
        const t: AliasTarget = { kind: "option", optionKey: opt.key };
        if (root.length > 0) {
          for (const w of ["merkezi", "centre", "center", "zentrum", "stadtzentrum", "ortszentrum"]) {
            pushAlias([...root, w], t);
            pushAlias([...root, "town", w], t);
          }
          for (const [w, link] of [["centre", "of"], ["center", "of"], ["zentrum", "von"]] as const) {
            pushAlias([w, link, ...root], t);
            pushAlias(["town", w, link, ...root], t);
          }
        }
      }
    }
  }

  /* Tipler + özellikler — TR adı + EN/DE çevirileri + "villa"sız çekirdek. */
  const named: Array<{ kind: "type" | "feature"; rows: TaxonomyResponse["types"] | TaxonomyResponse["features"] }> = [
    { kind: "type", rows: tax.types },
    { kind: "feature", rows: tax.features },
  ];
  const coresByKey: Record<string, string[][]> = {};
  for (const { kind, rows } of named) {
    for (const r of rows) {
      const opt: VocabOption = {
        key: `${kind}:${r.id}`,
        kind,
        id: r.id,
        slug: "slug" in r && typeof r.slug === "string" && r.slug.trim() ? r.slug.trim() : null,
        name: r.name.trim(),
        nameByLocale: {
          en: r.name_by_locale?.en?.trim() || undefined,
          de: r.name_by_locale?.de?.trim() || undefined,
        },
      };
      options[opt.key] = opt;
      const names = [opt.name, opt.nameByLocale.en, opt.nameByLocale.de].filter(
        (n): n is string => typeof n === "string" && n.length > 0
      );
      coresByKey[opt.key] = [];
      for (const n of names) {
        const toks = normalizePhrase(n);
        /* Yalnız çekirdek ("Muhafazakar Villalar" → "muhafazakar") eklenir:
           "villa" gibi genel kelimeler en-uzun-eşleşme yarışını
           çarpıtmasın (sorgudaki "villa" zaten dolgu kelimesidir). */
        const core = coreTokens(toks);
        const target: AliasTarget = { kind: "option", optionKey: opt.key };
        const numericOnly = (xs: string[]) => xs.every((t) => /^\d+$/.test(t));
        /* Çok anlamlı tek kelimelik çekirdek ("Private Villas" → "private")
           tek başına eşleşmez; villa kelimesiyle birlikte aranır. */
        const ambiguousSingle = (xs: string[]) => xs.length === 1 && NORM_V3.ambiguousCore.has(xs[0]);
        /* "Private Villas" (Muhafazakar Villalar'ın canlıdaki EN adı):
           İngilizcede "private villa" her müstakil villa için kullanılır
           (sitenin kendi metni: "Private Villa Advisor"). Bu ad tipe
           bağlanırsa sıradan bir sorgu yanlışlıkla muhafazakâr tipine
           daralır → "özel/private/privat" tek çekirdekli adlardan alias
           ÜRETİLMEZ (yanlış pozitif önlemi; veri düzeltmesi raporda). */
        const privacyOnly = (xs: string[]) => xs.length === 1 && PRIVACY_WORDS.has(xs[0]);
        if (privacyOnly(core)) {
          // bilerek boş
        } else if (ambiguousSingle(core)) {
          pushAlias([core[0], ANY_VILLA], target);
        } else if (!numericOnly(core)) pushAlias(core, target);
        coresByKey[opt.key].push(core);
        /* "kiralık / for rent" atılmış varyant. Geriye yalnız sayı kalırsa
           ("2027 Kiralık Villalar" → "2027") sayı TEK BAŞINA eşleşmez (tarih
           yılıyla karışmasın); bir villa kelimesiyle birlikte aranır. */
        const noRent = core.filter((t) => !RENT_WORDS.has(t));
        if (noRent.length > 0 && numericOnly(noRent)) {
          pushAlias([...noRent, ANY_VILLA], target);
          pushAlias([ANY_VILLA, ...noRent], target);
        } else if (noRent.length > 0 && noRent.length < core.length) {
          if (ambiguousSingle(noRent)) pushAlias([noRent[0], ANY_VILLA], target);
          else pushAlias(noRent, target);
          coresByKey[opt.key].push(noRent);
        }
        /* Bağlaçsız varyant: "Villas with Children's Play Areas" →
           "children play areas" (sorguda "with" yazılmayabilir). */
        const noLink = noRent.filter((t) => !LINK_WORDS.has(t));
        if (noLink.length > 0 && noLink.length < noRent.length && !numericOnly(noLink)) {
          if (ambiguousSingle(noLink)) pushAlias([noLink[0], ANY_VILLA], target);
          else pushAlias(noLink, target);
          coresByKey[opt.key].push(noLink);
        }
      }
    }
  }

  /* Kavramlar — yalnız birebir örtüşen kayıtlara bağlanır. */
  const conceptOptions: Record<string, string[]> = {};
  for (const c of NORM.concepts) {
    const linked: string[] = [];
    for (const [key, cores] of Object.entries(coresByKey)) {
      if (cores.some((core) => c.db.some((db) => phraseEquals(core, db)))) linked.push(key);
    }
    conceptOptions[c.key] = linked;
    for (const p of c.phrases) pushAlias(p, { kind: "concept", concept: c.key });
  }

  for (const u of NORM.unsupported) {
    for (const p of u.phrases) pushAlias(p, { kind: "unsupported", code: u.code });
  }

  /* ---------------- v3: bölge alternatif adları ---------------- */
  const regionBySlug = new Map<string, VocabOption>();
  for (const o of Object.values(options)) if (o.kind === "region" && o.slug) regionBySlug.set(o.slug, o);
  for (const ra of NORM_V3.regionAliases) {
    const o = regionBySlug.get(ra.slug);
    if (!o) continue; // canlıda yoksa bağlanmaz (uydurma yok)
    for (const p of ra.phrases) pushAlias(p, { kind: "option", optionKey: o.key });
  }

  /* ---------------- v3: ayırt edici alt ad (otomatik) ----------------
     Tip/özellik adının çekirdeğinden genel baş kelimeler ("havuz", "odası",
     "pool", "area"…) ve anlamı daraltmayan sıfatlar ("açık") atılır. Kalan
     kısım YALNIZ tek bir kayda işaret ediyorsa, başka bir kaydın adıyla
     çakışmıyorsa ve çok anlamlı tek kelime değilse eklenir. */
  const partialTargets = new Map<string, { tokens: string[]; keys: Set<string> }>();
  for (const [key, cores] of Object.entries(coresByKey)) {
    for (const core of cores) {
      let rest = core.filter((t) => !NORM_V3.genericHeads.has(t) && !LINK_WORDS.has(t) && !RENT_WORDS.has(t));
      while (rest.length > 1 && NORM_V3.droppableModifiers.has(rest[0])) rest = rest.slice(1);
      if (rest.length === 0 || rest.length >= core.length) continue;
      if (rest.every((t) => /^\d+$/.test(t))) continue;
      if (rest.join("").length < 4) continue;
      if (rest.length === 1 && (NORM_V3.ambiguousCore.has(rest[0]) || NORM.stopwords.has(rest[0]))) continue;
      const sig = rest.join(" ");
      const cur = partialTargets.get(sig) ?? { tokens: rest, keys: new Set<string>() };
      cur.keys.add(key);
      partialTargets.set(sig, cur);
    }
  }
  const optionAliasSigs = new Map<string, Set<string>>();
  for (const a of aliases) {
    if (a.target.kind !== "option") continue;
    const sig = a.tokens.join(" ");
    const set = optionAliasSigs.get(sig) ?? new Set<string>();
    set.add(a.target.optionKey);
    optionAliasSigs.set(sig, set);
  }
  for (const [sig, { tokens, keys }] of partialTargets) {
    if (keys.size !== 1) continue;
    const key = Array.from(keys)[0];
    const other = optionAliasSigs.get(sig);
    if (other && Array.from(other).some((k) => k !== key)) continue;
    pushAlias(tokens, { kind: "option", optionKey: key }, false, true);
  }

  /* ---------------- v3: ayrı yazılan bölge adları ----------------
     Tek kelimelik bölge adı ("kayakoy", "saribelen") iki parçaya bölünmüş
     yazımla da eşleşir ("kaya köy"). Parçalar en az 3 harf. */
  for (const o of Object.values(options)) {
    if (o.kind !== "region") continue;
    const short = normalizePhrase(o.name.slice(o.name.lastIndexOf("/") + 1));
    if (short.length !== 1) continue;
    const w = short[0];
    if (w.length < 7 || WEAK_PLACE_WORDS.has(w) || GENERIC_PLACE_WORDS.has(w)) continue;
    for (let k = 3; k <= w.length - 3; k++) {
      pushAlias([w.slice(0, k), w.slice(k)], { kind: "option", optionKey: o.key });
    }
  }

  /* ---------------- v3: bitişik yazım ----------------
     Çok kelimeli her ad / ifade bitişik yazılmış hâliyle de eşleşir
     ("denizmanzaralı", "masatenisi", "wifi"). */
  for (const a of [...aliases]) {
    if (a.tokens.length < 2 || a.tokens.some((t) => t === ANY_VILLA || /^\d+$/.test(t))) continue;
    const joined = a.tokens.join("");
    if (joined.length < 6) continue;
    pushAlias([joined], a.target, !!a.weak, !!a.partial);
  }

  aliases.sort((a, b) => b.tokens.length - a.tokens.length);

  const all = Object.values(options);
  const toFilter = (o: VocabOption): FilterOption => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    filter_group_name: o.groupName ?? null,
  });

  return {
    options,
    aliases,
    conceptOptions,
    regionOptions: all.filter((o) => o.kind === "region").map(toFilter),
    typeOptions: all.filter((o) => o.kind === "type").map(toFilter),
    featureOptions: all.filter((o) => o.kind === "feature").map(toFilter),
  };
}
