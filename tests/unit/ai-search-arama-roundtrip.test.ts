/* ===============================================================
   🧪 AI ARAMA URL'Sİ ↔ `/arama` ÇÖZÜMLEMESİ (gidiş-dönüş)
   ===============================================================
   Korpustaki her sorgu için üretilen URL, `/arama`'nın (AramaPageBody)
   parametre okuma kurallarının BİREBİR aynısıyla geri çözülür:
     • villa-turleri / bolgeler → `resolveTokens` (UUID geçerliyse id,
       değilse slug → id; bilinmeyen düşer)
     • ozellikler → YALNIZ UUID (villa_features'ta slug yok)
     • start / end → isValidYmd + start < end
     • guests → Number(...) || 0
     • flexible → clamp 0..3, yalnız tarih aralığıyla etkin
     • sort → parsePublicSort (izin listesi)
   Kimlikler gerçek sistemdeki gibi UUID'dir (fixture adları/slug'ları
   canlıdakiyle aynı). Beklenen: AI'nin seçtiği HER kriter `/arama`'da
   aynen uygulanır; hiçbiri düşmez, fazladan hiçbiri eklenmez.
   =============================================================== */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { autoResolve } from "@/lib/ai-search/auto-resolve";
import { ParseResultSchema, type TaxonomyResponse } from "@/lib/ai-search/schema";
import { buildAiSearchQuery } from "@/app/components/ui/hero/_helpers/build-ai-search-query";
import { isUuid } from "@/lib/slug";
import { isValidYmd } from "@/lib/availability.validator";
import { parsePublicSort } from "@/lib/pagination";
import type { Locale } from "@/lib/i18n/config";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";
import { CORPUS, HOLDOUT } from "./ai-search-corpus.data";

const uuid = (s: string) => {
  const h = createHash("sha1").update(s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const TAX: TaxonomyResponse = {
  ...LIVE_TAXONOMY,
  locations: LIVE_TAXONOMY.locations.map((l) => ({ ...l, id: uuid(l.id) })),
  types: LIVE_TAXONOMY.types.map((t) => ({ ...t, id: uuid(t.id) })),
  features: LIVE_TAXONOMY.features.map((f) => ({ ...f, id: uuid(f.id) })),
};
const vocab = buildVocabulary(TAX);

/** AramaPageBody içindeki `resolveTokens`'ın birebir kopyası. */
function resolveTokens(tokens: string[], options: Array<{ id: string; slug: string | null }>): string[] {
  const slugIdx = new Map<string, string>();
  const validIds = new Set<string>();
  for (const o of options) {
    validIds.add(o.id);
    if (o.slug) slugIdx.set(o.slug, o.id);
  }
  const out: string[] = [];
  for (const tok of tokens) {
    if (isUuid(tok)) {
      if (validIds.has(tok)) out.push(tok);
    } else {
      const id = slugIdx.get(tok);
      if (id) out.push(id);
    }
  }
  return out;
}

function aramaReads(qs: string) {
  const sp = new URLSearchParams(qs);
  const list = (k: string) => (sp.get(k) || "").split(",").filter(Boolean);
  const start = isValidYmd(sp.get("start")) ? sp.get("start") : null;
  const end = isValidYmd(sp.get("end")) ? sp.get("end") : null;
  const hasDateRange = !!(start && end && start < end);
  const flexDays = Math.min(3, Math.max(0, Math.trunc(Number(sp.get("flexible") || 0)) || 0));
  return {
    keys: [...sp.keys()],
    types: resolveTokens(list("villa-turleri"), TAX.types.map((t) => ({ id: t.id, slug: t.slug ?? null }))),
    regions: resolveTokens(list("bolgeler"), TAX.locations.map((l) => ({ id: l.id, slug: l.slug ?? null }))),
    features: Array.from(new Set(resolveTokens(list("ozellikler"), TAX.features.map((f) => ({ id: f.id, slug: null }))))),
    guests: Number(sp.get("guests") || 0) || 0,
    start: hasDateRange ? start : null,
    end: hasDateRange ? end : null,
    flexible: flexDays > 0 && hasDateRange ? flexDays : 0,
    sort: parsePublicSort(sp.get("sort") ?? undefined),
  };
}

const queries = [...CORPUS.split("\n"), ...HOLDOUT.split("\n")]
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const [, lang, q] = l.split("|");
    return { lang: lang as Locale, q };
  });

describe("AI URL'si /arama'da aynen uygulanır (UUID kimlikli canlı taksonomi)", () => {
  it(`${queries.length} sorgunun tamamında kriterler kayıpsız ve fazlasız gidip gelir`, () => {
    const problems: string[] = [];
    let withUrl = 0;
    for (const { lang, q } of queries) {
      const parsed = ParseResultSchema.parse(parseNaturalQuery(q, vocab, { today: "2026-11-06", locale: lang }));
      const { criteria: c, hasCriteria } = autoResolve(parsed, vocab);
      if (!hasCriteria) continue;
      withUrl++;
      const qs = buildAiSearchQuery(c, vocab);
      const a = aramaReads(qs);
      const typeIds = c.typeIds && c.typeIds.length ? c.typeIds : c.typeId ? [c.typeId] : [];
      const same = (x: string[], y: string[]) => x.length === y.length && x.every((v) => y.includes(v));
      if (!same(a.types, typeIds)) problems.push(`${q}: tip ${a.types} ≠ ${typeIds}`);
      if (!same(a.regions, c.regionIds)) problems.push(`${q}: bölge`);
      if (!same(a.features, c.featureIds)) problems.push(`${q}: özellik`);
      if (a.guests !== (c.guests ?? 0)) problems.push(`${q}: kişi`);
      if (a.start !== (c.start ?? null) || a.end !== (c.end ?? null)) problems.push(`${q}: tarih`);
      if (a.flexible !== (c.start ? c.flexible ?? 0 : 0)) problems.push(`${q}: esnek`);
      if (a.sort !== (c.sort ?? "smart")) problems.push(`${q}: sıralama`);
      /* Bilinmeyen parametre yok: yalnız /arama'nın okuduğu anahtarlar. */
      for (const k of a.keys)
        if (!["villa-turleri", "bolgeler", "ozellikler", "start", "end", "guests", "flexible", "sort"].includes(k))
          problems.push(`${q}: bilinmeyen parametre ${k}`);
      /* Tip/bölge Türkçe slug ile, özellik UUID ile yazılır. */
      for (const tok of new URLSearchParams(qs).get("ozellikler")?.split(",") ?? [])
        if (!isUuid(tok)) problems.push(`${q}: özellik UUID değil`);
    }
    expect(problems).toEqual([]);
    expect(withUrl).toBeGreaterThan(500);
  });

  it("flexible yalnız tarihle, sort yalnız izin listesinden yazılır", () => {
    const run = (q: string) => {
      const parsed = ParseResultSchema.parse(parseNaturalQuery(q, vocab, { today: "2026-11-06", locale: "tr" }));
      return buildAiSearchQuery(autoResolve(parsed, vocab).criteria, vocab);
    };
    expect(run("Kalkan esnek tarih")).toBe("bolgeler=kalkan");
    expect(run("Kalkan 10-17 Temmuz esnek")).toBe("bolgeler=kalkan&start=2027-07-10&end=2027-07-17&flexible=3");
    expect(run("Kalkan en ucuz")).toBe("bolgeler=kalkan&sort=price-asc");
    expect(run("en ucuz villalar")).toBe("sort=price-asc");
  });
});
