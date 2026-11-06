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
   =============================================================== */

import type { FilterOption } from "@/app/components/ui/hero/_types/hero";
import type { Locale } from "@/lib/i18n/config";

import {
  GENERIC_PLACE_WORDS,
  LINK_WORDS,
  NORM,
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
export type AliasEntry = { tokens: string[]; target: AliasTarget; weak?: boolean };

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

export function localizedName(opt: VocabOption, locale: Locale): string {
  if (opt.kind === "region" || locale === "tr") return opt.name;
  const v = opt.nameByLocale[locale];
  return v && v.trim() ? v.trim() : opt.name;
}

export function buildVocabulary(tax: TaxonomyResponse): Vocabulary {
  const options: Record<string, VocabOption> = {};
  const aliases: AliasEntry[] = [];
  const pushAlias = (tokens: string[], target: AliasTarget, weak = false) => {
    if (tokens.length === 0) return;
    const dup = aliases.some(
      (a) =>
        a.tokens.join(" ") === tokens.join(" ") &&
        JSON.stringify(a.target) === JSON.stringify(target)
    );
    if (!dup) aliases.push(weak ? { tokens, target, weak } : { tokens, target });
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
        if (!numericOnly(core)) pushAlias(core, target);
        coresByKey[opt.key].push(core);
        /* "kiralık / for rent" atılmış varyant. Geriye yalnız sayı kalırsa
           ("2027 Kiralık Villalar" → "2027") sayı TEK BAŞINA eşleşmez (tarih
           yılıyla karışmasın); bir villa kelimesiyle birlikte aranır. */
        const noRent = core.filter((t) => !RENT_WORDS.has(t));
        if (noRent.length > 0 && numericOnly(noRent)) {
          pushAlias([...noRent, ANY_VILLA], target);
          pushAlias([ANY_VILLA, ...noRent], target);
        } else if (noRent.length > 0 && noRent.length < core.length) {
          pushAlias(noRent, target);
          coresByKey[opt.key].push(noRent);
        }
        /* Bağlaçsız varyant: "Villas with Children's Play Areas" →
           "children play areas" (sorguda "with" yazılmayabilir). */
        const noLink = noRent.filter((t) => !LINK_WORDS.has(t));
        if (noLink.length > 0 && noLink.length < noRent.length && !numericOnly(noLink)) {
          pushAlias(noLink, target);
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
