/* ===============================================================
   🧪 AI ARAMA — ≥500 SORGULUK KORPUS + METRİKLER
   ===============================================================
   Her sorgu: parseNaturalQuery → autoResolve → (URL'ye giden) kriterler.
   Beklentiler gerçek canlı taksonomi kayıtlarına bağlıdır.

   Ölçülenler (rapor için ayrı ayrı):
     • doğru filtre oranı (tam eşleşme), yanlış filtre oranı (≥1 fazla
       filtre), desteklenmeyen ifadeyi doğru raporlama oranı
     • tarih / bölge / tip / özellik / kişi / sıralama başarısı
       (öğe bazında precision + recall)
     • TR / EN / DE ve grup bazında başarı, çok kriterli başarı
   Sert kurallar: olumsuz, desteklenmeyen ve kısa/anlamsız sorgularda
   SIFIR yanlış filtre (yanlış pozitif) — yanlış filtre, eksik
   eşleşmeden daha zararlıdır.
   =============================================================== */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { autoResolve } from "@/lib/ai-search/auto-resolve";
import { ParseResultSchema } from "@/lib/ai-search/schema";
import type { Locale } from "@/lib/i18n/config";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";
import { CORPUS, HOLDOUT } from "./ai-search-corpus.data";

const TODAY = "2026-11-06";
const vocab = buildVocabulary(LIVE_TAXONOMY);

type Row = { group: string; lang: Locale; q: string; expect: string[]; legacy: boolean; line: number };

const parseRows = (text: string): Row[] => text.split("\n")
  .map((l, i) => ({ l: l.trim(), i }))
  .filter(({ l }) => l && !l.startsWith("#"))
  .map(({ l, i }) => {
    const [group, lang, q, exp, tag] = l.split("|");
    return {
      group,
      lang: lang as Locale,
      q,
      expect: exp.trim() === "-" ? [] : exp.trim().split(/\s+/).map((t) => (t.startsWith("F:") ? t.replace(/_/g, " ") : t)),
      legacy: tag === "legacy",
      line: i,
    };
  });
const rows = parseRows(CORPUS);
const holdoutRows = parseRows(HOLDOUT);

const KINDS = ["R", "T", "F", "G", "D", "X", "S"] as const;
type Kind = (typeof KINDS)[number];

function evaluate(r: Row) {
  const parsed = ParseResultSchema.parse(parseNaturalQuery(r.q, vocab, { today: TODAY, locale: r.lang }));
  const { criteria: c } = autoResolve(parsed, vocab);
  const got = new Set<string>();
  c.regionIds.forEach((id) => got.add(`R:${id.slice(2)}`));
  (c.typeIds && c.typeIds.length ? c.typeIds : c.typeId ? [c.typeId] : []).forEach((id) => got.add(`T:${id.slice(2)}`));
  c.featureIds.forEach((id) => got.add(`F:${id.slice(2)}`));
  if (c.guests != null) got.add(`G:${c.guests}`);
  if (c.start && c.end) got.add(`D:${c.start}..${c.end}`);
  if (c.flexible) got.add(`X:${c.flexible}`);
  if (c.sort) got.add(`S:${c.sort}`);
  const want = new Set(r.expect.filter((t) => KINDS.includes(t.split(":")[0] as Kind)));
  const wantU = r.expect.filter((t) => t.startsWith("U:")).map((t) => t.slice(2));
  const wantN = r.expect.includes("N");
  const uns = parsed.unsupported.map((u) => u.concept ?? u.code);
  const fp = [...got].filter((t) => !want.has(t));
  const fn = [...want].filter((t) => !got.has(t));
  const missingU = wantU.filter((u) => !uns.includes(u));
  const negOk = !wantN || parsed.negated.length > 0;
  const ok = fp.length === 0 && fn.length === 0 && missingU.length === 0 && negOk;
  return { r, got, want, fp, fn, missingU, negOk, ok, parsed };
}

let results = rows.map(evaluate);

function rate(n: number, d: number) {
  return d === 0 ? 1 : n / d;
}
function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function metrics() {
  const out: Record<string, unknown> = {};
  const total = results.length;
  out.total = total;
  out.legacy = results.filter((x) => x.r.legacy).length;
  out.correct = results.filter((x) => x.ok).length;
  out.correctRate = rate(out.correct as number, total);
  out.wrongFilter = results.filter((x) => x.fp.length > 0).length;
  out.wrongFilterRate = rate(out.wrongFilter as number, total);
  const withU = results.filter((x) => x.r.expect.some((t) => t.startsWith("U:")));
  out.unsupportedCases = withU.length;
  out.unsupportedHandled = withU.filter((x) => x.missingU.length === 0 && x.fp.length === 0).length;
  out.unsupportedHandledRate = rate(out.unsupportedHandled as number, withU.length);
  const withN = results.filter((x) => x.r.expect.includes("N"));
  out.negationCases = withN.length;
  out.negationHandled = withN.filter((x) => x.negOk && x.fp.length === 0).length;

  // öğe bazında precision / recall
  const byKind: Record<string, { tp: number; fp: number; fn: number; precision: number; recall: number }> = {};
  for (const k of KINDS) {
    let tp = 0;
    let fpn = 0;
    let fnn = 0;
    for (const x of results) {
      for (const t of x.got) {
        if (!t.startsWith(k + ":")) continue;
        if (x.want.has(t)) tp++;
        else fpn++;
      }
      for (const t of x.want) if (t.startsWith(k + ":") && !x.got.has(t)) fnn++;
    }
    byKind[k] = { tp, fp: fpn, fn: fnn, precision: rate(tp, tp + fpn), recall: rate(tp, tp + fnn) };
  }
  out.byKind = byKind;
  let TP = 0;
  let FP = 0;
  let FN = 0;
  for (const k of KINDS) {
    TP += byKind[k].tp;
    FP += byKind[k].fp;
    FN += byKind[k].fn;
  }
  out.overall = { tp: TP, fp: FP, fn: FN, precision: rate(TP, TP + FP), recall: rate(TP, TP + FN) };

  const groupBy = (key: (x: (typeof results)[number]) => string) => {
    const g: Record<string, { n: number; ok: number; wrong: number; rate: number }> = {};
    for (const x of results) {
      const k = key(x);
      g[k] ??= { n: 0, ok: 0, wrong: 0, rate: 0 };
      g[k].n++;
      if (x.ok) g[k].ok++;
      if (x.fp.length) g[k].wrong++;
    }
    for (const k of Object.keys(g)) g[k].rate = rate(g[k].ok, g[k].n);
    return g;
  };
  out.byLang = groupBy((x) => x.r.lang);
  out.byGroup = groupBy((x) => x.r.group);
  // çok kriterli: beklentide ≥2 filtre öğesi
  const multi = results.filter((x) => x.want.size >= 2);
  out.multiCriteria = { n: multi.length, ok: multi.filter((x) => x.ok).length, rate: rate(multi.filter((x) => x.ok).length, multi.length) };
  out.failures = results
    .filter((x) => !x.ok)
    .map((x) => ({
      group: x.r.group,
      lang: x.r.lang,
      q: x.r.q,
      fp: x.fp,
      fn: x.fn,
      missingUnsupported: x.missingU,
      negationMissing: !x.negOk,
    }));
  return out;
}

const M = metrics();
results = holdoutRows.map(evaluate);
const H = metrics();
results = rows.map(evaluate);
if (process.env.AI_CORPUS_REPORT)
  writeFileSync(process.env.AI_CORPUS_REPORT, JSON.stringify({ ...M, holdout: H }, null, 2));

describe("AI arama korpusu — kapsam", () => {
  it("en az 500 sorgu, 18 grup, TR/EN/DE, önceki 111 sorgu dahil", () => {
    expect(rows.length).toBeGreaterThanOrEqual(500);
    const groups = new Set(rows.map((r) => r.group));
    for (const g of [
      "region", "subregion", "type", "feature", "pool", "family", "honeymoon", "dates", "guests",
      "multi", "colloquial", "typo", "short", "tr", "en", "de", "negation", "unsupported",
    ])
      expect(groups.has(g), g).toBe(true);
    expect(rows.filter((r) => r.legacy).length).toBe(111);
    for (const l of ["tr", "en", "de"]) expect(rows.filter((r) => r.lang === l).length).toBeGreaterThanOrEqual(100);
  });

  it("beklentiler yalnız gerçek taksonomi kayıtlarına bağlı", () => {
    const loc = new Set(LIVE_TAXONOMY.locations.map((l) => l.id));
    const typ = new Set(LIVE_TAXONOMY.types.map((t) => t.id));
    const fea = new Set(LIVE_TAXONOMY.features.map((f) => f.id));
    for (const r of rows)
      for (const t of r.expect) {
        if (t.startsWith("R:")) expect(loc.has(`L:${t.slice(2)}`), `${r.q}: ${t}`).toBe(true);
        if (t.startsWith("T:")) expect(typ.has(t), `${r.q}: ${t}`).toBe(true);
        if (t.startsWith("F:")) expect(fea.has(t), `${r.q}: ${t}`).toBe(true);
      }
  });
});

describe("AI arama — kör (holdout) set", () => {
  /* Sözlük bu sete göre ayarlanmadı: eşik bilerek düşük tutulur, asıl
     amaç yanlış filtrenin (yanlış pozitif) düşük kalmasıdır. */
  it("kör sette precision ≥ %97 ve tam doğru oranı ≥ %80", () => {
    expect(holdoutRows.length).toBeGreaterThanOrEqual(60);
    const o = H.overall as { precision: number };
    expect(o.precision).toBeGreaterThanOrEqual(0.97);
    expect(H.correctRate as number).toBeGreaterThanOrEqual(0.8);
  });
});

describe("AI arama korpusu — doğruluk", () => {
  it("yanlış pozitif yok: olumsuz / desteklenmeyen / kısa sorgularda sıfır yanlış filtre", () => {
    const bad = results.filter((x) => ["negation", "unsupported", "short"].includes(x.r.group) && x.fp.length > 0);
    expect(bad.map((x) => `${x.r.q} → ${x.fp.join(",")}`)).toEqual([]);
  });

  it("desteklenmeyen kriterler filtreye dönüşmeden raporlanır", () => {
    expect(M.unsupportedHandledRate as number).toBe(1);
  });

  it("olumsuz ifadeler filtreye dönüşmeden raporlanır", () => {
    expect(M.negationHandled).toBe(M.negationCases);
  });

  it("genel precision ≥ %99, recall ≥ %97, tam doğru oranı ≥ %97", () => {
    const o = M.overall as { precision: number; recall: number };
    expect(o.precision).toBeGreaterThanOrEqual(0.99);
    expect(o.recall).toBeGreaterThanOrEqual(0.97);
    expect(M.correctRate as number).toBeGreaterThanOrEqual(0.97);
  });

  it("TR / EN / DE her biri ≥ %95 tam doğru", () => {
    const by = M.byLang as Record<string, { rate: number }>;
    for (const l of ["tr", "en", "de"]) expect(by[l].rate, `${l} ${pct(by[l].rate)}`).toBeGreaterThanOrEqual(0.95);
  });

  it("görevdeki örnek sorgular birebir doğru", () => {
    const examples = [
      "4-10 Haziran Üzümlü'de korunaklı villa",
      "Kalkan'da 6 kişilik özel havuzlu ve jakuzili villa",
      "Denize yakın çocuk havuzlu muhafazakâr villa",
      "Fethiye'de 5 yatak odalı deniz manzaralı villa",
      "Kaş'ta köpek kabul eden villa",
      "Üzümlü'de dışarıdan havuzu görünmeyen, aileye uygun villa",
      "Kinderpool und Whirlpool in Kalkan",
      "Secluded pool villa near the beach",
      "Villa mit privatem Pool für 8 Personen",
      "Balayı için jakuzili, sakin bir villa",
      "Korunaklı villa",
      "Korunaklı havuzlu villa",
      "Havuzu dışarıdan görünmeyen villa",
      "Muhafazakâr aileye uygun villa",
      "Secluded pool villa",
      "Private and secluded villa",
      "Sichtgeschützte Villa",
      "Villa mit uneinsehbarem Pool",
    ];
    const bad = results.filter((x) => examples.includes(x.r.q) && !x.ok).map((x) => x.r.q);
    expect(bad).toEqual([]);
  });
});
