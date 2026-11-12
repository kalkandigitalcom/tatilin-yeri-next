/* ===============================================================
   🧠 AI ARAMA (KURAL TABANLI) — DOĞAL DİL → MEVCUT FİLTRELER (SAF)
   ===============================================================
   `parseNaturalQuery(metin, sözlük, { today, locale })`

   Harici model / API / DB YOK. Deterministik ve saf: aynı girdi →
   aynı çıktı. Çıktı yalnız mevcut `/arama` filtrelerine karşılık
   gelen alanları içerir (bölge, villa tipi, villa özellikleri, kişi,
   tarih); geri kalan her şey kullanıcıya AÇIKÇA raporlanır:
     • unsupported — sistemde filtresi olmayan istekler
     • unknown     — anlaşılamayan kelimeler (sessizce atılmaz)
     • choices     — emin olunamayan eşleşmeler (otomatik SEÇİLMEZ)
     • dateIssue   — eksik / geçersiz / belirsiz tarih (tarih UYDURULMAZ)

   İşlem sırası (her adım tükettiği token'ları işaretler):
     1) minimum konaklama, bütçe, mesafe, yatak odası (sayılı kalıplar)
     2) tarih (aralık / tek tarih / gece sayısı / göreli / yalnız ay)
     3) kişi sayısı
     4) taksonomi + kavram + desteklenmeyen ifade (en uzun eşleşme)
     5) kalan kelimeler → bilinmeyen (+ yazım önerisi, otomatik değil)
   =============================================================== */

import type { Locale } from "@/lib/i18n/config";

import {
  AMBIGUOUS_NUMBER_WORDS,
  GENERIC_PLACE_WORDS,
  NORM,
  NORM_V3,
  NUMBER_WORDS,
  VILLA_WORDS,
  type GuestRole,
  type UnsupportedCode,
} from "./lexicon";
import { normalizePhrase, tokenize, type Token } from "./tokenize";
import {
  ANY_VILLA,
  localizedName,
  tokenMatches,
  type AliasEntry,
  type Vocabulary,
  type VocabOption,
} from "./vocabulary";
import type { OptionRef, ParseChoice, ParseResult } from "./schema";

export type ParseOptions = {
  /** Europe/Istanbul bugünü, "YYYY-MM-DD". */
  today: string;
  /** Arayüz dili (etiketler + "/" tarih biçimi yorumu). */
  locale: Locale;
};

export const MAX_QUERY_LENGTH = 300;
export const MAX_NIGHTS = 60;
export const MAX_GUESTS = 50;

type DateParts = { d: number; m: number; y: number | null };
type DateExpr = {
  start: DateParts;
  end: DateParts | null;
  nights: number | null;
  phrase: string;
  ambiguousFormat: boolean;
};

const MONTH_SUFFIXES = new Set([
  "ta", "te", "da", "de", "tan", "ten", "dan", "den", "a", "e", "ya", "ye", "in", "un",
  "nin", "nun", "taki", "teki", "daki", "deki", "s",
]);

const DIST_CONTEXT = new Set([
  "denize", "deniz", "plaja", "plaj", "sahile", "sahil", "beach", "sea", "meer", "strand",
  "zum", "to", "the", "from", "mesafe", "mesafede", "mesafesinde", "uzaklikta", "away",
  "entfernt", "yurume", "walking", "distance", "entfernung", "vom", "max", "en", "fazla",
  "within", "innerhalb", "icinde", "kadar",
]);

/* ---------------------- küçük saf yardımcılar ---------------------- */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toYmd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function nightsBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Damerau–Levenshtein (bitişik harf yer değiştirme = 1 işlem). */
function damerau(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Sözlükteki bütün alias kelimeleri (yazım düzeltmesi ve "-sız" ayrımı için). */
const aliasTokenCache = new WeakMap<Vocabulary, Set<string>>();
function aliasTokens(vocab: Vocabulary): Set<string> {
  let set = aliasTokenCache.get(vocab);
  if (!set) {
    set = new Set<string>();
    for (const a of vocab.aliases) for (const t of a.tokens) set.add(t);
    aliasTokenCache.set(vocab, set);
  }
  return set;
}

/** Yazım düzeltmesine ASLA aday olmayan kelimeler (stopword, birim, ay,
 *  yaygın kelime…). "eden" → Eşen gibi yanlış düzeltmeleri engeller. */
const PROTECTED_WORDS: Set<string> = (() => {
  const s = new Set<string>([
    ...NORM.stopwords, ...NORM.dateFillers, ...NORM.nightUnits, ...NORM.currencyWords,
    ...NORM.distanceUnits, ...NORM.roomUnits, ...NORM.rangeWords, ...NORM_V3.commonWords,
    ...NORM_V3.negationPrefix, ...NORM_V3.negationSuffix, ...NORM_V3.negationBridge,
    ...Object.keys(NUMBER_WORDS),
  ]);
  for (const g of NORM.guestUnits) for (const w of g.words) s.add(w);
  for (const mo of NORM.months) for (const w of [...mo.names, ...mo.short]) s.add(w);
  return s;
})();

/* =================================================================== */

export function parseNaturalQuery(
  input: string,
  vocab: Vocabulary,
  opts: ParseOptions
): ParseResult {
  const text = String(input ?? "").slice(0, MAX_QUERY_LENGTH);
  /* v3 — "-sız/-siz/-suz/-süz" eki: "jakuzisiz", "havuzsuz" → kök + olumsuz.
     Kelimenin kendisi sözlükte varsa ("sessiz") dokunulmaz. */
  const knownTokens = aliasTokens(vocab);
  const toks: Array<Token & { neg?: boolean }> = tokenize(text).map((t) => {
    if (t.kind !== "word" || t.norm.length < 6 || knownTokens.has(t.norm) || PROTECTED_WORDS.has(t.norm)) return t;
    for (const suf of NORM_V3.negationTokenSuffixes) {
      if (t.norm.endsWith(suf)) {
        const base = t.norm.slice(0, -suf.length);
        if (base.length >= 3) return { ...t, norm: base, neg: true };
      }
    }
    return t;
  });
  const used: boolean[] = toks.map(() => false);
  const n = toks.length;

  const free = (i: number) => i >= 0 && i < n && !used[i];
  const consume = (from: number, to: number) => {
    for (let k = from; k < to; k++) used[k] = true;
  };
  const phraseOf = (from: number, to: number) =>
    toks
      .slice(from, to)
      .map((t) => t.raw)
      .filter((r) => r.length > 0)
      .join(" ")
      .replace(/\s+([-–—])\s+/g, "$1")
      .trim();
  const isWord = (i: number, set: Set<string>) =>
    free(i) && toks[i].kind === "word" && set.has(toks[i].norm);

  const unsupported: ParseResult["unsupported"] = [];
  /** Ayrıştırılıp REDDEDİLEN ifadeler (ör. kapsam dışı kişi sayısı). */
  const unknownExtra: string[] = [];
  const addUnsupported = (code: UnsupportedCode, phrase: string, concept?: string) => {
    if (!unsupported.some((u) => u.code === code && u.phrase === phrase))
      unsupported.push(concept ? { code, phrase, concept } : { code, phrase });
  };

  /** Rakam ya da (yalnız bağlamda) sayı kelimesi. */
  const numberAt = (i: number): number | null => {
    if (!free(i)) return null;
    const t = toks[i];
    if (t.kind === "num" && typeof t.value === "number" && (t.digits ?? 9) <= 3) return t.value;
    if (t.kind === "word" && t.norm in NUMBER_WORDS && !AMBIGUOUS_NUMBER_WORDS.has(t.norm))
      return NUMBER_WORDS[t.norm];
    return null;
  };

  /* ------------------------------------------------------------------
     0) v3 — sıralama ve esnek tarih ifadeleri ("en ucuz", "flexible dates")
     ------------------------------------------------------------------ */
  const wordFits = (i: number, w: string) =>
    free(i) && (toks[i].kind === "word" ? tokenMatches(toks[i].norm, w) : toks[i].norm === w);
  const phraseAt = (i: number, p: string[]) => p.every((w, k) => wordFits(i + k, w));
  let sort: ParseResult["sort"] = null;
  let flexible: number | null = null;
  for (let i = 0; i < n; i++) {
    if (!free(i)) continue;
    let done = false;
    for (const sp of NORM_V3.sort) {
      const p = [...sp.phrases].sort((a, b) => b.length - a.length).find((ph) => phraseAt(i, ph));
      if (p) {
        sort = sp.sort;
        consume(i, i + p.length);
        done = true;
        break;
      }
    }
    if (done) continue;
    const fp = [...NORM_V3.flexible].sort((a, b) => b.length - a.length).find((ph) => phraseAt(i, ph));
    if (fp) {
      flexible = 3;
      consume(i, i + fp.length);
    }
  }

  /* ------------------------------------------------------------------
     1) Sayılı desteklenmeyen kalıplar
     ------------------------------------------------------------------ */

  // 1a) Minimum konaklama: "en az 5 gece", "minimum 5 nights", "mindestens 5 Nächte"
  for (let i = 0; i < n; i++) {
    let j = -1;
    if (isWord(i, new Set(["minimum", "min", "mindestens", "minimal"]))) j = i + 1;
    else if (isWord(i, new Set(["en"])) && isWord(i + 1, new Set(["az"]))) j = i + 2;
    if (j < 0) continue;
    if (numberAt(j) !== null && isWord(j + 1, NORM.nightUnits)) {
      addUnsupported("min_stay", phraseOf(i, j + 2));
      consume(i, j + 2);
    }
  }

  // 1b) Bütçe: sayı + para birimi (+ "altı / under / unter" vb.)
  for (let i = 0; i < n; i++) {
    if (!free(i) || toks[i].kind !== "num") continue;
    const isCur = (k: number) =>
      free(k) && (toks[k].kind === "currency" || (toks[k].kind === "word" && NORM.currencyWords.has(toks[k].norm)));
    let from = -1;
    let to = -1;
    if (isCur(i + 1)) {
      from = i;
      to = i + 2;
    } else if (isCur(i - 1)) {
      from = i - 1;
      to = i + 1;
    }
    if (from < 0) continue;
    while (from - 1 >= 0 && free(from - 1) && toks[from - 1].kind === "word" &&
      (NORM.budgetQualifiers.has(toks[from - 1].norm) || NORM.nightUnits.has(toks[from - 1].norm) ||
        toks[from - 1].norm.startsWith("gece") || toks[from - 1].norm.startsWith("fiyat")) && i - (from - 1) <= 3)
      from--;
    while (to < n && free(to) && toks[to].kind === "word" &&
      (NORM.budgetQualifiers.has(toks[to].norm) || NORM.nightUnits.has(toks[to].norm)) && to - i <= 4)
      to++;
    addUnsupported("budget", phraseOf(from, to));
    consume(from, to);
  }

  // 1c) Mesafe: "denize 500 m", "200 meters to the beach", "5 dk yürüme"
  for (let i = 0; i < n; i++) {
    if (numberAt(i) === null || !isWord(i + 1, NORM.distanceUnits)) continue;
    let from = i;
    let to = i + 2;
    while (from - 1 >= 0 && isWord(from - 1, DIST_CONTEXT) && i - (from - 1) <= 3) from--;
    while (to < n && isWord(to, DIST_CONTEXT) && to - i <= 5) to++;
    addUnsupported("sea_distance", phraseOf(from, to));
    consume(from, to);
  }

  // 1d) Yatak odası: "3 yatak odalı", "3 bedrooms", "3 Schlafzimmer", "3 odalı"
  for (let i = 0; i < n; i++) {
    if (numberAt(i) === null || !isWord(i + 1, NORM.roomUnits)) continue;
    let to = i + 2;
    while (to < n && isWord(to, NORM.roomUnits) && to - i <= 3) to++;
    addUnsupported("bedrooms", phraseOf(i, to));
    consume(i, to);
  }

  /* ------------------------------------------------------------------
     2) Tarih
     ------------------------------------------------------------------ */

  const todayY = Number(opts.today.slice(0, 4));

  const dayAt = (i: number): number | null => {
    if (!free(i)) return null;
    const t = toks[i];
    if (t.kind !== "num" || (t.digits ?? 9) > 2) return null;
    return t.value! >= 1 && t.value! <= 31 ? t.value! : null;
  };
  const yearAt = (i: number): number | null => {
    if (!free(i)) return null;
    const t = toks[i];
    return t.kind === "num" && t.digits === 4 && t.value! >= 2000 && t.value! <= 2100 ? t.value! : null;
  };
  const monthAt = (i: number, allowShort = true): number | null => {
    if (!free(i) || toks[i].kind !== "word") return null;
    const w = toks[i].norm;
    for (const mo of NORM.months) {
      for (const name of mo.names) {
        if (w === name) return mo.m;
        if (name.length >= 4 && w.startsWith(name) && MONTH_SUFFIXES.has(w.slice(name.length))) return mo.m;
      }
      if (allowShort && mo.short.includes(w)) return mo.m;
    }
    return null;
  };
  const skipFillers = (i: number): number => {
    let k = i;
    while (isWord(k, NORM.dateFillers)) k++;
    return k;
  };
  const isRangeSep = (i: number) =>
    free(i) && (toks[i].kind === "dash" || (toks[i].kind === "word" && NORM.rangeWords.has(toks[i].norm)));

  /** "2 Ağustos [2027]" — gün + ay (+ yıl). */
  const dmAt = (i: number): { p: DateParts; next: number } | null => {
    const d = dayAt(i);
    if (d === null) return null;
    const k = skipFillers(i + 1);
    const m = monthAt(k);
    if (m === null) return null;
    const y = yearAt(k + 1);
    return { p: { d, m, y }, next: y !== null ? k + 2 : k + 1 };
  };
  /** "August 2[nd] [2027]" — ay + gün (+ yıl). */
  const EN_FILLERS = new Set(["the", "of", "th", "st", "nd", "rd"]);
  const unitWordAt = (i: number) =>
    free(i) &&
    toks[i].kind === "word" &&
    (NORM.nightUnits.has(toks[i].norm) ||
      NORM.currencyWords.has(toks[i].norm) ||
      NORM.distanceUnits.has(toks[i].norm) ||
      NORM.roomUnits.has(toks[i].norm) ||
      NORM.guestUnits.some((g) => Array.from(g.words).some((u) => tokenMatches(toks[i].norm, u))));
  const mdAt = (i: number): { p: DateParts; next: number } | null => {
    const m = monthAt(i);
    if (m === null) return null;
    let k = i + 1;
    while (isWord(k, EN_FILLERS)) k++;
    const d = dayAt(k);
    if (d === null || unitWordAt(k + 1)) return null;
    const k2 = skipFillers(k + 1);
    const y = yearAt(k2);
    return { p: { d, m, y }, next: y !== null ? k2 + 1 : skipFillers(k + 1) };
  };

  const exprs: DateExpr[] = [];
  const pushExpr = (from: number, to: number, e: Omit<DateExpr, "phrase" | "nights">) => {
    // Tek tarihten sonra "5 gece" → bitiş = başlangıç + 5
    let nights: number | null = null;
    let end = to;
    if (!e.end) {
      const k = skipFillers(to);
      const kk = isWord(k, NORM.forWords) ? k + 1 : k;
      const nn = numberAt(kk);
      if (nn !== null && isWord(kk + 1, NORM.nightUnits)) {
        nights = nn;
        end = kk + 2;
      }
    }
    exprs.push({ ...e, nights, phrase: phraseOf(from, end) });
    consume(from, end);
  };

  for (let i = 0; i < n; i++) {
    if (!free(i)) continue;
    const t = toks[i];

    // a) Sayısal tarih(ler): 02.08.2027 - 08.08.2027 · 2027-08-02
    if (t.kind === "date" && t.date) {
      const a = t.date;
      let k = i + 1;
      if (isRangeSep(k)) k++;
      const b = free(k) && toks[k].kind === "date" ? toks[k].date! : null;
      const amb = (x: typeof a) => x.sep === "/" && opts.locale === "en" && x.d <= 12 && x.m <= 12 && x.d !== x.m;
      pushExpr(i, b ? k + 1 : i + 1, {
        start: { d: a.d, m: a.m, y: a.y },
        end: b ? { d: b.d, m: b.m, y: b.y } : null,
        ambiguousFormat: amb(a) || (b ? amb(b) : false),
      });
      continue;
    }

    // c) "2-8 Ağustos [2027]" · "2. bis 8. August" · "between 2 and 8 August"
    //    · "20 25 Haziran" / "20/25 Haziran" (ayırıcısız: ikinci gün büyük olmalı)
    //    · "20th to 25th June"
    const d1 = dayAt(i);
    if (d1 !== null) {
      let k = skipFillers(i + 1);
      const hasSep = isRangeSep(k);
      if (hasSep) k = skipFillers(k + 1);
      const d2 = dayAt(k);
      if (d2 !== null && (hasSep || d2 > d1)) {
        const km = skipFillers(k + 1);
        const m = monthAt(km);
        if (m !== null) {
          const y = yearAt(km + 1);
          pushExpr(i, y !== null ? km + 2 : km + 1, {
            start: { d: d1, m, y },
            end: { d: d2, m, y },
            ambiguousFormat: false,
          });
          continue;
        }
      }
    }

    // b) "2 Ağustos - 8 Ağustos" · "28 Temmuz'dan 3 Ağustos'a" · "2 August to 8 August"
    const g1 = dmAt(i);
    if (g1) {
      let k = skipFillers(g1.next);
      if (isRangeSep(k)) k = skipFillers(k + 1);
      const g2 = dmAt(k);
      if (g2) {
        pushExpr(i, g2.next, { start: g1.p, end: g2.p, ambiguousFormat: false });
      } else {
        pushExpr(i, g1.next, { start: g1.p, end: null, ambiguousFormat: false });
      }
      continue;
    }

    // d) "August 2 - 8[, 2027]" · "July 28 to August 3"
    const h1 = mdAt(i);
    if (h1) {
      let k = h1.next;
      if (isRangeSep(k)) {
        k = skipFillers(k + 1);
        const h2 = mdAt(k);
        if (h2) {
          pushExpr(i, h2.next, { start: h1.p, end: h2.p, ambiguousFormat: false });
          continue;
        }
        const d2 = dayAt(k);
        if (d2 !== null) {
          const k2 = skipFillers(k + 1);
          const y = yearAt(k2);
          pushExpr(i, y !== null ? k2 + 1 : k + 1, {
            start: { ...h1.p, y: h1.p.y ?? y },
            end: { d: d2, m: h1.p.m, y: y ?? h1.p.y },
            ambiguousFormat: false,
          });
          continue;
        }
      }
      pushExpr(i, h1.next, { start: h1.p, end: null, ambiguousFormat: false });
      continue;
    }
  }

  /* İki ayrı tek tarih → giriş/çıkış aralığı
     ("20 Haziran'da giriş, 25 Haziran'da çıkış" · "check-in 20 June, check-out 25 June"). */
  if (
    exprs.length === 2 &&
    exprs.every((e) => !e.end && e.nights === null && !e.ambiguousFormat)
  ) {
    const [a, b] = exprs;
    exprs.splice(0, 2, {
      start: a.start,
      end: b.start,
      nights: null,
      ambiguousFormat: false,
      phrase: `${a.phrase} · ${b.phrase}`,
    });
  }

  // Göreli ifadeler ("hafta sonu", "next week", "im Sommer")
  let dateIssue: ParseResult["dateIssue"] = null;
  const relativeHits: string[] = [];
  for (let i = 0; i < n; i++) {
    for (const p of NORM.relativeDates) {
      if (p.every((w, k) => free(i + k) && toks[i + k].kind === "word" && tokenMatches(toks[i + k].norm, w))) {
        relativeHits.push(phraseOf(i, i + p.length));
        consume(i, i + p.length);
        break;
      }
    }
  }
  // Yalnız ay ("Ağustos ayında", "in August", "im August")
  const monthOnly: string[] = [];
  for (let i = 0; i < n; i++) {
    const m = monthAt(i, false);
    if (m === null) continue;
    const y = yearAt(i + 1);
    const w = toks[i].norm;
    if ((w === "may" || w === "mai") && y === null) continue; // "may" fiili vb.
    const to = y !== null ? i + 2 : i + 1;
    monthOnly.push(phraseOf(i, to));
    consume(i, to);
  }
  // Yalnız gece sayısı ("5 gece", "7 nights")
  const nightsOnly: string[] = [];
  for (let i = 0; i < n; i++) {
    if (numberAt(i) !== null && isWord(i + 1, NORM.nightUnits)) {
      nightsOnly.push(phraseOf(i, i + 2));
      consume(i, i + 2);
    }
  }

  let start: string | null = null;
  let end: string | null = null;

  const resolveYear = (p: DateParts): number => {
    if (p.y !== null) return p.y;
    const y = todayY;
    return toYmd(y, p.m, p.d) < opts.today ? y + 1 : y;
  };

  if (exprs.length > 1) {
    dateIssue = { code: "multiple", phrase: exprs.map((e) => e.phrase).join(" · ") };
  } else if (exprs.length === 1) {
    const e = exprs[0];
    if (e.ambiguousFormat) {
      dateIssue = { code: "ambiguous_format", phrase: e.phrase };
    } else if (
      !isRealDate(e.start.y ?? 2028, e.start.m, e.start.d) ||
      (e.end && !isRealDate(e.end.y ?? 2028, e.end.m, e.end.d))
    ) {
      /* "30 Şubat" gibi takvimde olmayan gün, eksik ifade olsa bile
         önce geçersiz tarih olarak raporlanır (yıl yoksa artık yıl
         2028 ile denetlenir: "29 Şubat" tek başına geçerli sayılır). */
      dateIssue = { code: "invalid_calendar", phrase: e.phrase };
    } else if (!e.end && e.nights === null) {
      dateIssue = { code: "partial", phrase: e.phrase };
    } else {
      const sp = e.start;
      const ep = e.end;
      let sy: number;
      if (sp.y !== null) sy = sp.y;
      else if (ep && ep.y !== null) sy = ep.m < sp.m ? ep.y - 1 : ep.y;
      else sy = resolveYear(sp);
      const ey = ep ? (ep.y !== null ? ep.y : ep.m < sp.m ? sy + 1 : sy) : sy;
      if (!isRealDate(sy, sp.m, sp.d) || (ep && !isRealDate(ey, ep.m, ep.d))) {
        dateIssue = { code: "invalid_calendar", phrase: e.phrase };
      } else {
        const s = toYmd(sy, sp.m, sp.d);
        const en = ep ? toYmd(ey, ep.m, ep.d) : addDays(s, e.nights ?? 0);
        if (en <= s) dateIssue = { code: "end_before_start", phrase: e.phrase };
        else if (s < opts.today) dateIssue = { code: "past", phrase: e.phrase };
        else if (nightsBetween(s, en) > MAX_NIGHTS) dateIssue = { code: "too_long", phrase: e.phrase };
        else {
          start = s;
          end = en;
        }
      }
    }
  }
  if (!start && !dateIssue) {
    if (relativeHits.length) dateIssue = { code: "relative", phrase: relativeHits.join(" · ") };
    else if (monthOnly.length) dateIssue = { code: "month_only", phrase: monthOnly.join(" · ") };
    else if (nightsOnly.length) dateIssue = { code: "nights_only", phrase: nightsOnly.join(" · ") };
  }

  /* ------------------------------------------------------------------
     3) Kişi sayısı
     ------------------------------------------------------------------ */

  type GuestHit = { role: GuestRole; value: number; phrase: string };
  const guestHits: GuestHit[] = [];
  const roleOf = (i: number): GuestRole | null => {
    if (!free(i) || toks[i].kind !== "word") return null;
    const w = toks[i].norm;
    for (const g of NORM.guestUnits) {
      for (const unit of g.words) if (tokenMatches(w, unit)) return g.role;
    }
    return null;
  };
  for (let i = 0; i < n; i++) {
    const v = numberAt(i);
    if (v === null) continue;
    const role = roleOf(i + 1);
    if (role) {
      // "2 çocuk havuzu" → kişi değil, özellik ifadesi
      const next = toks[i + 2];
      if (role === "children" && next && next.kind === "word" && tokenMatches(next.norm, "havuz")) continue;
      guestHits.push({ role, value: v, phrase: phraseOf(i, i + 2) });
      consume(i, i + 2);
    }
  }
  const ARTICLE_ONE = new Set(["ein", "eine", "einen", "einer", "einem", "one", "bir"]);
  // "for 6" · "für 6" (birimsiz)
  for (let i = 0; i < n; i++) {
    if (!isWord(i, NORM.forWords)) continue;
    /* "für eine große Familie", "for one week": artikel/belirsiz "bir"
       birimsiz kişi sayısı değildir (birimli "für eine Person" yukarıda). */
    if (isWord(i + 1, ARTICLE_ONE)) continue;
    const v = numberAt(i + 1);
    if (v === null || v > 30) continue;
    const after = toks[i + 2];
    const blocked =
      after && free(i + 2) &&
      ((after.kind === "word" &&
        (NORM.nightUnits.has(after.norm) || monthAt(i + 2) !== null || NORM.currencyWords.has(after.norm) ||
          NORM.distanceUnits.has(after.norm) || NORM.roomUnits.has(after.norm) ||
          ["days", "day", "tage", "tag", "weeks", "week", "wochen", "woche"].includes(after.norm))) ||
        after.kind === "currency");
    if (blocked) continue;
    guestHits.push({ role: "total", value: v, phrase: phraseOf(i, i + 2) });
    consume(i, i + 2);
  }

  /* v3.1 — birimsiz EN kalıpları: "party of 12", "family of 16",
     "group of 8", "sleeps 10", "6 of us"; artikel = 1: "a baby",
     "an infant", "a child". */
  {
    const GROUP_WORDS = new Set(["party", "family", "group", "gruppe"]);
    const OF = new Set(["of", "von"]);
    const SLEEPS = new Set(["sleeps", "sleeping"]);
    const US = new Set(["us"]);
    const ARTICLE = new Set(["a", "an"]);
    for (let i = 0; i < n; i++) {
      if (isWord(i, GROUP_WORDS) && isWord(i + 1, OF)) {
        const v = numberAt(i + 2);
        if (v !== null && v <= 30 && !roleOf(i + 3)) {
          guestHits.push({ role: "total", value: v, phrase: phraseOf(i, i + 3) });
          consume(i + 1, i + 3);
          continue;
        }
      }
      if (isWord(i, SLEEPS)) {
        const v = numberAt(i + 1);
        if (v !== null && v <= 30) {
          guestHits.push({ role: "total", value: v, phrase: phraseOf(i, i + 2) });
          consume(i, i + 2);
          continue;
        }
      }
      const v = numberAt(i);
      if (v !== null && v <= 30 && isWord(i + 1, OF) && isWord(i + 2, US)) {
        guestHits.push({ role: "total", value: v, phrase: phraseOf(i, i + 3) });
        consume(i, i + 3);
        continue;
      }
      if (isWord(i, ARTICLE)) {
        const role = roleOf(i + 1);
        if (role === "children" || role === "infants") {
          const next = toks[i + 2];
          if (next && next.kind === "word" && /^(pool|havuz|friendly|play|freundlich)/.test(next.norm)) continue; // "a kids pool", "a kid friendly villa"
          guestHits.push({ role, value: 1, phrase: phraseOf(i, i + 2) });
          consume(i, i + 2);
        }
      }
    }
  }

  let guests: number | null = null;
  let guestBreakdown: ParseResult["guestBreakdown"] = null;
  const choices: ParseChoice[] = [];
  {
    const totals = Array.from(new Set(guestHits.filter((g) => g.role === "total").map((g) => g.value)));
    const parts = guestHits.filter((g) => g.role !== "total");
    const sum = (r: GuestRole) => parts.filter((p) => p.role === r).reduce((a, b) => a + b.value, 0);
    const partsSum = parts.reduce((a, b) => a + b.value, 0);
    const candidates = new Set<number>(totals);
    if (parts.length) candidates.add(partsSum);
    const valid = Array.from(candidates).filter((v) => v >= 1 && v <= MAX_GUESTS);
    if (valid.length === 1) {
      guests = valid[0];
      if (parts.length && (totals.length === 0 || totals[0] === partsSum)) {
        guestBreakdown = {
          ...(sum("adults") ? { adults: sum("adults") } : {}),
          ...(sum("children") ? { children: sum("children") } : {}),
          ...(sum("infants") ? { infants: sum("infants") } : {}),
        };
      }
    } else if (valid.length > 1) {
      choices.push({
        key: "guests",
        reason: "conflicting_guests",
        phrase: guestHits.map((g) => g.phrase).join(" · "),
        options: valid.map((v) => ({ kind: "guests" as const, id: String(v), label: String(v), value: v })),
      });
    }
    for (const g of guestHits) {
      if (g.value < 1 || g.value > MAX_GUESTS) unknownExtra.push(g.phrase);
    }
  }

  /* ------------------------------------------------------------------
     4) Taksonomi / kavram / desteklenmeyen ifadeler (en uzun eşleşme)
     ------------------------------------------------------------------ */

  const regions: OptionRef[] = [];
  const types: OptionRef[] = [];
  const features: OptionRef[] = [];
  const ref = (o: VocabOption): OptionRef => ({ kind: o.kind, id: o.id, label: localizedName(o, opts.locale) });
  const addRef = (o: VocabOption) => {
    const list = o.kind === "region" ? regions : o.kind === "type" ? types : features;
    if (!list.some((r) => r.id === o.id)) list.push(ref(o));
  };

  /* Zayıf eşleşmeler ("yalı", "çiftlik" gibi yaygın kelime olan alt
     bölge adları) otomatik seçilmez; öneri + anlaşılamayan olarak döner. */
  const weakSuggestions: ParseResult["suggestions"] = [];
  const weakUnknown: string[] = [];
  const negated: ParseResult["negated"] = [];
  const corrections: ParseResult["corrections"] = [];
  /** Sözlükte rakam olan token (ör. "2027 Kiralık Villalar") rakamla eşleşir. */
  const tokenFits = (t: Token, aliasTok: string) =>
    t.kind === "word"
      ? tokenMatches(t.norm, aliasTok)
      : t.kind === "num" && /^\d+$/.test(aliasTok) && t.norm === aliasTok;
  /** v3 — güvenli yazım toleransı: yalnız ≥5 harfli, korunmayan kelimeler;
   *  ilk harf aynı; ≤7 harfte 1, ≥8 harfte 2 işlem (Damerau). Ek kökü de
   *  denenir ("jakuzli" ↔ "jakuzi"). Kayıt kelimesi de ≥5 harf olmalı. */
  const fuzzyFits = (t: Token, aliasTok: string, compoundHead = false) => {
    if (tokenFits(t, aliasTok)) return true;
    /* Bileşik kelimenin ön parçası ("Whirpool" → "whir"+"pool") 4 harf
       olabilir; kuyruk ("pool") birebir eşleşmek zorundadır. */
    if (t.kind !== "word" || aliasTok.length < 5 || t.norm.length < (compoundHead ? 4 : 5)) return false;
    if (PROTECTED_WORDS.has(t.norm) || knownTokens.has(t.norm)) return false;
    if (t.norm[0] !== aliasTok[0]) return false;
    const max = Math.max(t.norm.length, aliasTok.length) >= 8 ? 2 : 1;
    if (damerau(t.norm, aliasTok) <= max) return true;
    for (const suf of ["li", "lu", "si", "su", "da", "de", "ta", "te", "nda", "nde"]) {
      if (t.norm.endsWith(suf) && t.norm.length - suf.length >= 4 && damerau(t.norm.slice(0, -suf.length), aliasTok) <= 1)
        return true;
    }
    return false;
  };

  /* Bağlam ipuçları (otomatik çözümleme): villa kelimesine uzaklık. */
  const isVillaTok = (j: number) =>
    j >= 0 && j < n && toks[j].kind === "word" && (VILLA_WORDS.has(toks[j].norm) || /^(villa|villen)/.test(toks[j].norm));
  const LINK = new Set(["with", "mit", "ile", "olan", "a", "an", "the", "einem", "einer", "eine", "ein"]);
  /** Eşleşmenin bittiği yerden sonraki ilk villa kelimesine kadar kaç token var (yoksa ∞). */
  const villaGapAfter = (end: number) => {
    for (let j = end; j < Math.min(n, end + 3); j++) if (isVillaTok(j)) return j - end;
    return Infinity;
  };
  /** "kapalı havuzu OLAN villa", "… BULUNAN villa": ilgi sözcüğü atlanır. */
  const REL = new Set(["olan", "bulunan", "sahip", "li", "lu"]);
  const attachedAt = (from: number, to: number) => {
    if (isVillaTok(to)) return true;
    if (to < n && toks[to].kind === "word" && REL.has(toks[to].norm) && isVillaTok(to + 1)) return true;
    let k = from - 1;
    let gaps = 0;
    while (k >= 0 && toks[k].kind === "word" && LINK.has(toks[k].norm) && gaps < 2) {
      k--;
      gaps++;
    }
    return gaps > 0 && isVillaTok(k);
  };
  const typeEnds = new Map<string, number>();

  /** i konumundaki en uzun sözlük eşleşmesi (fuzzy: yazım toleranslı). */
  const matchAt = (i: number, fuzzy: boolean): { best: number; hits: AliasEntry[]; fuzzyUsed: boolean } => {
    let best = 0;
    const hits: AliasEntry[] = [];
    let fuzzyUsed = false;
    for (const a of vocab.aliases) {
      const len = a.tokens.length;
      if (len < best) break;
      if (i + len > n) continue;
      /* Hız: yazım toleranslı aramada ilk harf zaten aynı olmak zorunda. */
      if (fuzzy && a.tokens[0] !== ANY_VILLA && toks[i].kind === "word" && a.tokens[0][0] !== toks[i].norm[0]) continue;
      let ok = true;
      let exactCount = 0;
      let usedFuzzy = false;
      for (let k = 0; k < len; k++) {
        const t = toks[i + k];
        if (!free(i + k) || (k > 0 && t.breakBefore)) {
          ok = false;
          break;
        }
        if (tokenFits(t, a.tokens[k])) {
          exactCount++;
          continue;
        }
        const compoundHead = k + 1 < len && i + k + 1 < n && toks[i + k + 1].raw === "" && toks[i + k + 1].kind === "word";
        if (fuzzy && !a.weak && fuzzyFits(t, a.tokens[k], compoundHead)) {
          usedFuzzy = true;
          continue;
        }
        ok = false;
        break;
      }
      if (!ok) continue;
      /* Çok kelimeli adda en az bir kelime birebir olmalı (yalnız yazım
         toleransıyla kurulan eşleşme kabul edilmez). */
      if (fuzzy && usedFuzzy && len > 1 && exactCount === 0) continue;
      if (len > best) {
        best = len;
        hits.length = 0;
        fuzzyUsed = false;
      }
      hits.push(a);
      if (usedFuzzy) fuzzyUsed = true;
    }
    return { best, hits, fuzzyUsed };
  };

  /** v3 — eşleşme olumsuzlanmış mı? ("no pets", "jakuzi olmasın",
   *  "evcil hayvan kabul etmeyen", "jakuzisiz", "ohne Pool"). */
  const negationSpan = (from: number, to: number): { negated: boolean; extraTo: number; extraFrom: number } => {
    for (let k = from; k < to; k++) if (toks[k].neg) return { negated: true, extraTo: to, extraFrom: from };
    // önde: "no", "without", "ohne", "kein(e)" (+ bir artikel)
    let p = from - 1;
    if (p >= 0 && toks[p].kind === "word" && ["a", "an", "any", "the"].includes(toks[p].norm)) p--;
    if (p >= 0 && toks[p].kind === "word" && NORM_V3.negationPrefix.has(toks[p].norm) && free(p))
      return { negated: true, extraTo: to, extraFrom: p };
    /* "don't need a sea view", "do not want a jacuzzi", "no need for …",
       "brauchen keinen …" önde ihtiyaç fiiliyle. */
    if (p >= 0 && toks[p].kind === "word" && ["need", "want", "require", "needed", "for"].includes(toks[p].norm)) {
      let q2 = p - 1;
      if (q2 >= 0 && toks[q2].kind === "word" && toks[q2].norm === "need") q2--; // "no need for"
      if (q2 >= 0 && toks[q2].kind === "word" && (NORM_V3.negationPrefix.has(toks[q2].norm) || ["dont", "don", "doesnt", "doesn"].includes(toks[q2].norm)) && free(q2))
        return { negated: true, extraTo: to, extraFrom: q2 };
    }
    // arkada: köprü kelimeler atlanır, sonra olumsuz kelime
    let q = to;
    let bridges = 0;
    while (q < n && bridges < 2 && toks[q].kind === "word" && NORM_V3.negationBridge.has(toks[q].norm) && free(q)) {
      q++;
      bridges++;
    }
    if (q < n && free(q) && toks[q].kind === "word" && NORM_V3.negationSuffix.has(toks[q].norm)) {
      // "not overlooked" gibi başka bir sözlük ifadesinin başlangıcıysa olumsuzluk değildir
      if (matchAt(q, false).best === 0) {
        let end = q + 1;
        // "şart değil", "olmasa da olur" gibi kalıpların kuyruğu
        while (end < n && end < q + 3 && toks[end].kind === "word" && (NORM_V3.negationSuffix.has(toks[end].norm) || NORM_V3.negationBridge.has(toks[end].norm))) end++;
        return { negated: true, extraTo: end, extraFrom: from };
      }
    }
    return { negated: false, extraTo: to, extraFrom: from };
  };

  const PROX_BEFORE = new Set(["near", "close", "nearby", "nahe", "nah", "naehe", "bei", "beim"]);
  const PROX_SKIP = new Set(["to", "the", "of", "by", "am", "an", "dem", "der", "zum", "zur", "town"]);
  const PROX_AFTER = new Set(["yakin", "yakininda", "yakinda", "yakinlarinda", "civari", "civarinda", "near", "nearby", "nahe"]);
  const isCentreRegion = (o: VocabOption) => {
    const slash = o.name.lastIndexOf("/");
    if (slash < 0) return false;
    const short = normalizePhrase(o.name.slice(slash + 1));
    return short.length === 1 && GENERIC_PLACE_WORDS.has(short[0]);
  };

  const handleHit = (i: number, best: number, hits: AliasEntry[], viaFuzzy: boolean) => {
    const phrase = phraseOf(i, i + best);
    /* Olumsuz ifade: filtreye DÖNÜŞMEZ (sistemde "hariç tut" filtresi yok). */
    const neg = negationSpan(i, i + best);
    if (neg.negated) {
      const labels = new Set<string>();
      for (const h of hits) {
        if (h.target.kind === "option") {
          const o = vocab.options[h.target.optionKey];
          if (o) labels.add(localizedName(o, opts.locale));
        } else if (h.target.kind === "concept") {
          for (const k of vocab.conceptOptions[h.target.concept] ?? []) {
            const o = vocab.options[k];
            if (o) labels.add(localizedName(o, opts.locale));
          }
        }
      }
      negated.push({ phrase: phraseOf(neg.extraFrom, neg.extraTo), labels: Array.from(labels) });
      consume(neg.extraFrom, neg.extraTo);
      return;
    }
    if (hits.every((h) => h.weak)) {
      for (const h of hits) {
        const o = h.target.kind === "option" ? vocab.options[h.target.optionKey] : undefined;
        if (o && !weakSuggestions.some((x) => x.option.id === o.id)) weakSuggestions.push({ phrase, option: ref(o) });
      }
      if (!weakUnknown.includes(phrase)) weakUnknown.push(phrase);
      consume(i, i + best);
      return;
    }
    /* Aynı uzunlukta: birebir > ek/çoğul toleranslı; tam ad > türetilmiş alt ad. */
    const nonWeak = hits.filter((h) => !h.weak);
    const exact = nonWeak.filter((h) => h.tokens.every((a, k) => toks[i + k].norm === a));
    /* Birebir yazım ekli yazımı eler — ama yalnız AYNI türde. Aynı ifade
       hem tipe hem özelliğe çıkıyorsa ("heated indoor pool" = özellik adı,
       "Villas with Heated Indoor Pools" = tip adı) karşı türdeki aday
       — ifade bir villa kelimesine bağlıysa — korunur; seçim tip↔özellik
       kuralına bırakılır. Tek başına tam özellik adı ("Heated Indoor
       Pool") yine doğrudan özelliğe gider. */
    const kindOf = (h: AliasEntry) =>
      h.target.kind === "option" ? vocab.options[h.target.optionKey]?.kind ?? null : null;
    const exactKinds = new Set(exact.map(kindOf));
    const villaAttached = attachedAt(i, i + best);
    let strongHits =
      exact.length > 0 && villaAttached
        ? [
            ...exact,
            ...nonWeak.filter((h) => {
              const k = kindOf(h);
              return !exact.includes(h) && (k === "type" || k === "feature") && !exactKinds.has(k) &&
                (exactKinds.has("type") || exactKinds.has("feature"));
            }),
          ]
        : exact.length > 0
          ? exact
          : nonWeak;
    const full = strongHits.filter((h) => !h.partial);
    if (full.length > 0) strongHits = full;
    const optionKeys = new Set<string>();
    const missingConcepts: string[] = [];
    const codes: UnsupportedCode[] = [];
    for (const h of strongHits) {
      if (h.target.kind === "option") optionKeys.add(h.target.optionKey);
      else if (h.target.kind === "concept") {
        const linked = vocab.conceptOptions[h.target.concept] ?? [];
        if (linked.length) linked.forEach((k) => optionKeys.add(k));
        else missingConcepts.push(h.target.concept);
      } else codes.push(h.target.code);
    }

    /* Yazım düzeltmesi YALNIZ tek ve kesin bir karşılık varsa uygulanır. */
    if (viaFuzzy) {
      const found = Array.from(optionKeys).map((k) => vocab.options[k]).filter(Boolean);
      const regs = found.filter((o) => o.kind === "region");
      const single =
        found.length === 1 ||
        (found.length > 1 && regs.length === found.length && regs.filter((o) => o.isGroupRoot).length === 1);
      if (!single || missingConcepts.length || codes.length) return; // belirsiz → dokunma (bilinmeyen kalır)
      const target = found.length === 1 ? found[0] : regs.find((o) => o.isGroupRoot)!;
      /* Bölgeye yazım düzeltmesi daha sıkı: yaygın kelimeler ("kalan",
         "karşı", "devre") bölge adına bir harf uzaktır. Yalnız özel ad
         belirtisi varsa uygulanır: büyük harf, kesme işaretli ek, ≥7 harf
         ya da hemen ardından villa kelimesi. */
      if (target.kind === "region") {
        const t0 = toks[i];
        const properNoun =
          /^\p{Lu}/u.test(t0.raw) || !!t0.suffix || t0.norm.length >= 7 || isVillaTok(i + best);
        if (!properNoun) return;
      }
      addRef(target);
      if (target.kind === "type" && !typeEnds.has(target.id)) typeEnds.set(target.id, i + best);
      corrections.push({ from: phrase, to: localizedName(target, opts.locale) });
      consume(i, i + best);
      return;
    }

    /* "Kalkan merkeze yakın", "near Kalkan centre", "nahe Kalkan Zentrum":
       "X / Merkez" alt bölgesi YAKINLIK ifadesiyle geçiyorsa kullanıcı
       merkezde değil merkeze yakın arıyor → ana bölge + "Merkezi Konum"
       özelliği (kayıt varsa). "Kalkan merkezde" ise alt bölge kalır. */
    if (optionKeys.size === 1) {
      const o = vocab.options[Array.from(optionKeys)[0]];
      const centre = o?.kind === "region" && !o.isGroupRoot && isCentreRegion(o);
      const central = (vocab.conceptOptions["central_location"] ?? []).map((k) => vocab.options[k]).filter(Boolean);
      if (centre && central.length) {
        let from = i;
        let to = i + best;
        let prox = false;
        let k = i - 1;
        while (k >= 0 && toks[k].kind === "word" && PROX_SKIP.has(toks[k].norm) && free(k)) k--;
        if (k >= 0 && toks[k].kind === "word" && PROX_BEFORE.has(toks[k].norm) && free(k)) {
          prox = true;
          from = k;
        }
        if (to < n && toks[to].kind === "word" && PROX_AFTER.has(toks[to].norm) && free(to)) {
          prox = true;
          to += 1;
        }
        if (prox) {
          const root = Object.values(vocab.options).find(
            (r) => r.kind === "region" && r.isGroupRoot && (r.groupName ?? "").trim() === (o.groupName ?? "").trim()
          );
          if (root) addRef(root);
          for (const c of central) addRef(c);
          consume(from, to);
          return;
        }
      }
    }

    if (optionKeys.size > 0) {
      const found = Array.from(optionKeys).map((k) => vocab.options[k]).filter(Boolean);
      const regs = found.filter((o) => o.kind === "region");
      const others = found.filter((o) => o.kind !== "region");
      if (others.length === 0) {
        if (regs.length === 1) addRef(regs[0]);
        else {
          const roots = regs.filter((o) => o.isGroupRoot);
          if (roots.length === 1) addRef(roots[0]);
          else
            choices.push({ key: `c${choices.length}`, reason: "ambiguous_region", phrase, options: regs.map(ref) });
        }
      } else if (found.length === 1) {
        addRef(found[0]);
        if (found[0].kind === "type" && !typeEnds.has(found[0].id)) typeEnds.set(found[0].id, i + best);
      } else {
        choices.push({
          key: `c${choices.length}`,
          reason: "ambiguous_match",
          phrase,
          options: found.map(ref),
          attachedToVilla: attachedAt(i, i + best),
        });
      }
    } else if (missingConcepts.length) {
      addUnsupported("not_in_system", phrase, missingConcepts[0]);
    } else if (codes.length) {
      addUnsupported(codes[0], phrase);
    }
    consume(i, i + best);
  };

  /** Eşleşme gerçek bir kayda bağlanıyor mu (desteklenmeyen/bağsız kavram değil)? */
  const linked = (hits: AliasEntry[]) =>
    hits.some(
      (h) =>
        !h.weak &&
        (h.target.kind === "option" ||
          (h.target.kind === "concept" && (vocab.conceptOptions[h.target.concept] ?? []).length > 0))
    );

  // Geçiş 1 — birebir / ek toleranslı eşleşmeler
  for (let i = 0; i < n; i++) {
    if (!free(i) || (toks[i].kind !== "word" && toks[i].kind !== "num")) continue;
    const { best, hits } = matchAt(i, false);
    if (best === 0) continue;
    /* Çakışma: bağsız/desteklenmeyen bir eşleşme, içinden başlayıp daha
       ileri uzanan GERÇEK bir kayıt eşleşmesini yutmasın ("with
       children's pool" → "children's pool" = Çocuk Havuzlu). */
    /* Bileşik kelimenin kuyruğu ("Whirpool" → "pool") tek başına
       desteklenmeyen sayılmadan önce yazım düzeltmesine şans verilir
       (Geçiş 3'te yine değerlendirilir). */
    if (toks[i].raw === "" && !linked(hits)) continue;
    if (!linked(hits)) {
      let yielded = false;
      for (let j = i + 1; j < i + best && !yielded; j++) {
        const m2 = matchAt(j, false);
        if (m2.best > 0 && j + m2.best > i + best && linked(m2.hits)) yielded = true;
      }
      if (yielded) continue;
    }
    handleHit(i, best, hits, false);
  }

  /* "özel ve korunaklı havuzlu", "private and heated pool": eksiltili
     sıralamada baştaki "özel/private" de havuza aittir → private_pool
     (desteklenmiyor) olarak raporlanır; filtreye dönüşmez. */
  const PRIVATE_WORDS = new Set(["ozel", "private", "privat", "privaten", "privatem", "privater", "eigener", "eigenem", "eigenen"]);
  const COORD = new Set(["ve", "and", "und", "ile"]);
  for (let i = 0; i + 2 < n; i++) {
    if (!free(i) || toks[i].kind !== "word" || !PRIVATE_WORDS.has(toks[i].norm)) continue;
    /* "private and secluded pool" (bağlaçlı) ya da "private secluded pool"
       (bitişik; ardındaki havuz ifadesi zaten eşleşmiş) */
    const coord = toks[i + 1].kind === "word" && COORD.has(toks[i + 1].norm);
    if (!coord && free(i + 1)) continue;
    let poolAhead = false;
    for (let k = i + 1; k < Math.min(n, i + 6); k++) {
      if (toks[k].breakBefore) break;
      if (toks[k].kind === "word" && /^(havuz|pool)/.test(toks[k].norm)) poolAhead = true;
    }
    if (!poolAhead) continue;
    addUnsupported("not_in_system", toks[i].raw, "private_pool");
    consume(i, coord ? i + 2 : i + 1);
  }
  // Geçiş 2 — kalan kelimelerde güvenli yazım düzeltmesi
  for (let i = 0; i < n; i++) {
    if (!free(i) || toks[i].kind !== "word") continue;
    const { best, hits, fuzzyUsed } = matchAt(i, true);
    if (best === 0 || !fuzzyUsed) continue;
    handleHit(i, best, hits, true);
  }
  // Geçiş 3 — düzeltmeden sonra kalan birebir eşleşmeler (bileşik kuyrukları)
  for (let i = 0; i < n; i++) {
    if (!free(i) || (toks[i].kind !== "word" && toks[i].kind !== "num")) continue;
    const { best, hits } = matchAt(i, false);
    if (best > 0) handleHit(i, best, hits, false);
  }

  // Villa tipleri `/arama`'da AND çalışır → birden fazla tip otomatik gönderilmez.
  if (types.length > 1) {
    let head: string | undefined;
    let bestGap = Infinity;
    for (const t of types) {
      const g = villaGapAfter(typeEnds.get(t.id) ?? n);
      if (g < bestGap) {
        bestGap = g;
        head = t.id;
      }
    }
    choices.push({
      key: "types",
      reason: "multiple_types",
      phrase: types.map((t) => t.label).join(" · "),
      options: [...types],
      ...(head ? { head } : {}),
    });
    types.length = 0;
  }

  /* ------------------------------------------------------------------
     5) Kalanlar → bilinmeyen (+ öneri; OTOMATİK UYGULANMAZ)
     ------------------------------------------------------------------ */

  const unknown: string[] = [...unknownExtra, ...weakUnknown];
  const suggestions: ParseResult["suggestions"] = [...weakSuggestions];
  const singleAliases = vocab.aliases.filter((a) => a.tokens.length === 1);
  for (let i = 0; i < n; i++) {
    if (!free(i)) continue;
    const t = toks[i];
    if (t.kind === "dash") continue;
    if (t.kind === "word") {
      if (NORM.stopwords.has(t.norm) || NORM.dateFillers.has(t.norm)) continue;
      if (NORM.numberSuffixFragments.has(t.norm) && toks[i - 1]?.kind === "num") continue;
      if (t.norm.length < 2) continue;
    }
    if (t.raw.length === 0) continue;
    if (!unknown.includes(t.raw)) unknown.push(t.raw);

    if (t.kind === "word" && t.norm.length >= 5 && !PROTECTED_WORDS.has(t.norm)) {
      /* Yanlış öneriyi önlemek için: ilk harf aynı olmalı; 8+ harfte en çok
         2, daha kısa kelimelerde en çok 1 harf farkı ("Fethye" → Fethiye;
         "Kalamar" → Dalaman ÖNERİLMEZ). */
      const max = t.norm.length >= 8 ? 2 : 1;
      let bestD = max + 1;
      let bestOpts: VocabOption[] = [];
      for (const a of singleAliases) {
        const keys =
          a.target.kind === "option"
            ? [a.target.optionKey]
            : a.target.kind === "concept"
              ? vocab.conceptOptions[a.target.concept] ?? []
              : [];
        if (keys.length !== 1) continue;
        if (a.tokens[0][0] !== t.norm[0]) continue;
        const d = levenshtein(t.norm, a.tokens[0]);
        if (d === 0 || d > max) continue;
        const o = vocab.options[keys[0]];
        if (!o) continue;
        if (d < bestD) {
          bestD = d;
          bestOpts = [o];
        } else if (d === bestD && !bestOpts.some((x) => x.key === o.key)) bestOpts.push(o);
      }
      for (const o of bestOpts.slice(0, 2)) {
        if (!suggestions.some((s) => s.option.id === o.id && s.option.kind === o.kind))
          suggestions.push({ phrase: t.raw, option: ref(o) });
      }
    }
  }

  const nothingParsed =
    regions.length === 0 &&
    types.length === 0 &&
    features.length === 0 &&
    guests === null &&
    start === null &&
    sort === null &&
    choices.length === 0;

  return {
    regions,
    types,
    features,
    guests,
    guestBreakdown,
    start,
    end,
    dateIssue,
    choices,
    unsupported,
    unknown,
    suggestions,
    nothingParsed,
    negated,
    corrections,
    flexible: start !== null ? flexible : null,
    sort,
  };
}

