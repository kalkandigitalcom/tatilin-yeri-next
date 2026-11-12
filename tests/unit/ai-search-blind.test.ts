/* ===============================================================
   🧪 AI ARAMA — FİNAL BAĞIMSIZ (KÖR) TEST SETİ
   ===============================================================
   `ai-search-blind.data.ts` parser çalıştırılmadan önce yazılıp
   sabitlendi; sorgular ve beklentiler sonuçlara göre değiştirilmez.
   Hata türleri AYRI raporlanır:
     • yanlış filtre (fazladan bölge/tip/özellik/kişi/tarih/sıralama)
     • eksik filtre
     • yanlış bölge eşleşmesi
     • desteklenmeyen özelliğin filtreye dönüşmesi
     • olumsuz ifadenin filtreye dönüşmesi
   Sert kurallar: olumsuz / desteklenmeyen / kısa / çelişkili gruplarda
   SIFIR yanlış filtre; "Kalkan merkeze yakın" → Kalkan + Merkezi Konum.
   =============================================================== */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { autoResolve } from "@/lib/ai-search/auto-resolve";
import { ParseResultSchema } from "@/lib/ai-search/schema";
import type { Locale } from "@/lib/i18n/config";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";
import { BLIND } from "./ai-search-blind.data";
import { CONFIRM } from "./ai-search-confirm.data";

const TODAY = "2026-11-06";
const vocab = buildVocabulary(LIVE_TAXONOMY);
const KINDS = ["R", "T", "F", "G", "D", "X", "S"] as const;

type Row = { group: string; lang: Locale; q: string; expect: string[] };
const toRows = (text: string): Row[] => text.split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [group, lang, q, exp] = l.split("|");
    return {
      group,
      lang: lang as Locale,
      q,
      expect: exp.trim() === "-" ? [] : exp.trim().split(/\s+/).map((t) => (t.startsWith("F:") ? t.replace(/_/g, " ") : t)),
    };
  });
const rows = toRows(BLIND);
const confirmRows = toRows(CONFIRM);

const evaluate = (r: Row) => {
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
  const want = new Set(r.expect.filter((t) => (KINDS as readonly string[]).includes(t.split(":")[0])));
  const wantU = r.expect.filter((t) => t.startsWith("U:")).map((t) => t.slice(2));
  const wantN = r.expect.includes("N");
  const uns = parsed.unsupported.map((u) => u.concept ?? u.code);
  const fp = [...got].filter((t) => !want.has(t));
  const fn = [...want].filter((t) => !got.has(t));
  const missingU = wantU.filter((u) => !uns.includes(u));
  const negOk = !wantN || parsed.negated.length > 0;
  return { r, got, want, fp, fn, missingU, wantU, wantN, negOk, ok: !fp.length && !fn.length && !missingU.length && negOk };
};
const results = rows.map(evaluate);
const confirmResults = confirmRows.map(evaluate);

const rate = (n: number, d: number) => (d === 0 ? 1 : n / d);
function summary(xs: typeof results) {
  let tp = 0;
  let fpn = 0;
  let fnn = 0;
  for (const x of xs) {
    tp += [...x.got].filter((t) => x.want.has(t)).length;
    fpn += x.fp.length;
    fnn += x.fn.length;
  }
  return {
    n: xs.length,
    ok: xs.filter((x) => x.ok).length,
    rate: rate(xs.filter((x) => x.ok).length, xs.length),
    tp,
    fp: fpn,
    fn: fnn,
    precision: rate(tp, tp + fpn),
    recall: rate(tp, tp + fnn),
  };
}

const errors = {
  /** ≥1 fazladan filtre üreten sorgu */
  wrongFilter: results.filter((x) => x.fp.length).map((x) => `${x.r.lang} | ${x.r.q} → +${x.fp.join(", ")}`),
  /** ≥1 beklenen filtreyi kaçıran sorgu */
  missingFilter: results.filter((x) => x.fn.length).map((x) => `${x.r.lang} | ${x.r.q} → −${x.fn.join(", ")}`),
  /** yanlış bölge (fazladan bölge) */
  wrongRegion: results.filter((x) => x.fp.some((t) => t.startsWith("R:"))).map((x) => `${x.r.lang} | ${x.r.q} → +${x.fp.filter((t) => t.startsWith("R:")).join(", ")}`),
  /** desteklenmeyen kriter içeren sorguda tip/özellik yanlış pozitifi */
  unsupportedAsFilter: results
    .filter((x) => x.wantU.length && x.fp.some((t) => t.startsWith("T:") || t.startsWith("F:")))
    .map((x) => `${x.r.lang} | ${x.r.q} → +${x.fp.join(", ")}`),
  /** desteklenmeyen kriter raporlanmadı */
  unsupportedNotReported: results.filter((x) => x.missingU.length).map((x) => `${x.r.lang} | ${x.r.q} → ${x.missingU.join(", ")}`),
  /** olumsuz ifade filtreye dönüştü / raporlanmadı */
  negationLeak: results.filter((x) => x.wantN && x.fp.length).map((x) => `${x.r.lang} | ${x.r.q} → +${x.fp.join(", ")}`),
  negationNotReported: results.filter((x) => !x.negOk).map((x) => `${x.r.lang} | ${x.r.q}`),
};

const byLang = Object.fromEntries((["tr", "en", "de"] as const).map((l) => [l, summary(results.filter((x) => x.r.lang === l))]));
const groups = Array.from(new Set(rows.map((r) => r.group)));
const byGroup = Object.fromEntries(groups.map((g) => [g, summary(results.filter((x) => x.r.group === g))]));
const confirmByLang = Object.fromEntries(
  (["tr", "en", "de"] as const).map((l) => [l, summary(confirmResults.filter((x) => x.r.lang === l))])
);
const CONFIRM_REPORT = {
  total: summary(confirmResults),
  byLang: confirmByLang,
  failures: confirmResults.filter((x) => !x.ok).map((x) => ({ lang: x.r.lang, q: x.r.q, fp: x.fp, fn: x.fn, missingU: x.missingU, negOk: x.negOk })),
};
const REPORT = { confirm: CONFIRM_REPORT, total: summary(results), byLang, byGroup, errors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, { count: v.length, items: v }])) };
if (process.env.AI_BLIND_REPORT) writeFileSync(process.env.AI_BLIND_REPORT, JSON.stringify(REPORT, null, 2));

describe("AI arama — final bağımsız test seti", () => {
  it("en az 300 sorgu; TR / EN / DE her biri ≥100", () => {
    expect(rows.length).toBeGreaterThanOrEqual(300);
    for (const l of ["tr", "en", "de"]) expect(rows.filter((r) => r.lang === l).length).toBeGreaterThanOrEqual(100);
  });

  it("beklentiler yalnız gerçek taksonomi kayıtlarına bağlı", () => {
    const ids = new Set([
      ...LIVE_TAXONOMY.locations.map((l) => `R:${l.id.slice(2)}`),
      ...LIVE_TAXONOMY.types.map((t) => t.id),
      ...LIVE_TAXONOMY.features.map((f) => f.id),
    ]);
    for (const r of rows) for (const t of r.expect) if (/^[RTF]:/.test(t)) expect(ids.has(t), `${r.q}: ${t}`).toBe(true);
  });

  it("'Kalkan merkeze yakın' → Kalkan + Merkezi Konum (Kalkan / Merkez bölgesi DEĞİL)", () => {
    const x = results.find((y) => y.r.q === "Kalkan merkeze yakın")!;
    expect([...x.got].sort()).toEqual(["F:Merkezi Konum", "R:kalkan"]);
  });

  it("olumsuz / desteklenmeyen / kısa / çelişkili gruplarda sıfır yanlış filtre", () => {
    const bad = results.filter((x) => ["negation", "unsupported", "short", "conflict"].includes(x.r.group) && x.fp.length);
    expect(bad.map((x) => `${x.r.q} → ${x.fp.join(",")}`)).toEqual([]);
  });

  it("desteklenmeyen kriter hiçbir zaman filtreye dönüşmez; olumsuz ifade filtreye dönüşmez", () => {
    expect(errors.unsupportedAsFilter).toEqual([]);
    expect(errors.negationLeak).toEqual([]);
  });

  it("genel precision ≥ %99, recall ≥ %95, tam doğru ≥ %92; her dil ≥ %90", () => {
    const t = REPORT.total;
    expect(t.precision).toBeGreaterThanOrEqual(0.99);
    expect(t.recall).toBeGreaterThanOrEqual(0.95);
    expect(t.rate).toBeGreaterThanOrEqual(0.92);
    for (const l of ["tr", "en", "de"]) expect(byLang[l].rate, l).toBeGreaterThanOrEqual(0.9);
  });
});

describe("AI arama — düzeltme sonrası doğrulama seti (ayarlanmamış)", () => {
  it("≥100 sorgu; yanlış filtre yok: olumsuz / desteklenmeyen / kısa / çelişkili", () => {
    expect(confirmRows.length).toBeGreaterThanOrEqual(100);
    const bad = confirmResults.filter((x) => ["negation", "unsupported", "short", "conflict"].includes(x.r.group) && x.fp.length);
    expect(bad.map((x) => `${x.r.q} → ${x.fp.join(",")}`)).toEqual([]);
  });
  it("precision ≥ %97, tam doğru ≥ %85", () => {
    expect(CONFIRM_REPORT.total.precision).toBeGreaterThanOrEqual(0.97);
    expect(CONFIRM_REPORT.total.rate).toBeGreaterThanOrEqual(0.85);
  });
});
