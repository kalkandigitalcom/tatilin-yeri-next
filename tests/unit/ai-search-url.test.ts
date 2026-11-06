/* ===============================================================
   🧪 AI ARAMA → MEVCUT `buildHeroSearchParams` ENTEGRASYONU
   ===============================================================
   • AI onayından çıkan URL, "Tarihle Ara" panelinin aynı girdilerle
     üreteceği URL ile BİREBİR aynıdır (ikinci URL kurucu yok).
   • `/arama`'nın token çözümleme kuralları (slug || UUID, virgül,
     YYYY-MM-DD) ile gidiş-dönüş kayıpsızdır.
   =============================================================== */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { buildHeroSearchParams } from "@/app/components/ui/hero/_helpers/build-search-params";
import { localeHref } from "@/lib/i18n/locale-href";
import {
  buildAiSearchHref,
  buildAiSearchQuery,
} from "@/app/components/ui/hero/_helpers/build-ai-search-query";

import { TAXONOMY, TODAY } from "./ai-search-fixtures";

const vocab = buildVocabulary(TAXONOMY);

/** `/arama` (AramaPageBody) çözümleme kurallarının test eşleniği. */
function arama(qs: string) {
  const sp = new URLSearchParams(qs);
  const resolveTokens = (raw: string | null, opts: { id: string; slug?: string | null }[]) =>
    (raw ? raw.split(",").filter(Boolean) : [])
      .map((tok) => opts.find((o) => o.id === tok)?.id ?? opts.find((o) => o.slug === tok)?.id)
      .filter((x): x is string => !!x);
  return {
    types: resolveTokens(sp.get("villa-turleri"), vocab.typeOptions),
    regions: resolveTokens(sp.get("bolgeler"), vocab.regionOptions),
    features: resolveTokens(sp.get("ozellikler"), vocab.featureOptions),
    start: sp.get("start"),
    end: sp.get("end"),
    guests: Number(sp.get("guests") || 0) || 0,
  };
}

describe("buildAiSearchQuery = buildHeroSearchParams (aynı fonksiyon, aynı çıktı)", () => {
  it("tüm kriterler", () => {
    const qs = buildAiSearchQuery(
      {
        regionIds: ["loc-kalkan", "loc-fethiye"],
        typeId: "type-muh",
        featureIds: ["f-kor", "f-jak"],
        guests: 6,
        start: "2027-08-02",
        end: "2027-08-08",
      },
      vocab
    );
    const hero = buildHeroSearchParams({
      categories: ["type-muh"],
      regions: ["loc-kalkan", "loc-fethiye"],
      startDate: new Date(2027, 7, 2),
      endDate: new Date(2027, 7, 8),
      guests: 6,
      categoryOptions: vocab.typeOptions,
      regionOptions: vocab.regionOptions,
      flexible: 0,
      features: ["f-kor", "f-jak"],
    });
    expect(qs).toBe(hero);
    expect(qs).toBe(
      "villa-turleri=muhafazakar-villalar&bolgeler=kalkan%2Cfethiye&start=2027-08-02&end=2027-08-08&guests=6&ozellikler=f-kor%2Cf-jak"
    );
  });

  it("villa tipi Türkçe teknik slug ile yazılır (EN/DE etiketinden bağımsız)", () => {
    const qs = buildAiSearchQuery(
      { regionIds: [], typeId: "type-bal", featureIds: [], guests: null, start: null, end: null },
      vocab
    );
    expect(qs).toBe("villa-turleri=balayi-villalari");
  });

  it("kişi yoksa `guests` yazılmaz; slug'sız bölge UUID ile yazılır", () => {
    const qs = buildAiSearchQuery(
      { regionIds: ["loc-nosl"], typeId: null, featureIds: [], guests: null, start: null, end: null },
      vocab
    );
    expect(qs).toBe("bolgeler=loc-nosl");
  });

  it("listede olmayan id'ler atılır", () => {
    const qs = buildAiSearchQuery(
      { regionIds: ["yok"], typeId: "yok", featureIds: ["yok"], guests: 2, start: null, end: null },
      vocab
    );
    expect(qs).toBe("guests=2");
  });

  it("zod: yarım tarih / ters tarih / kapsam dışı kişi reddedilir", () => {
    const base = { regionIds: [], typeId: null, featureIds: [], guests: null, start: null, end: null };
    expect(() => buildAiSearchQuery({ ...base, start: "2027-08-02" }, vocab)).toThrow();
    expect(() => buildAiSearchQuery({ ...base, start: "2027-08-08", end: "2027-08-02" }, vocab)).toThrow();
    expect(() => buildAiSearchQuery({ ...base, guests: 0 }, vocab)).toThrow();
    expect(() => buildAiSearchQuery({ ...base, start: "02.08.2027", end: "08.08.2027" }, vocab)).toThrow();
  });

  it("dil öneki localeHref ile (Tarihle Ara ile aynı hedef)", () => {
    const c = { regionIds: ["loc-kas"], typeId: null, featureIds: [], guests: 4, start: null, end: null };
    expect(buildAiSearchHref(c, vocab, "tr")).toBe("/arama?bolgeler=kas&guests=4");
    for (const loc of ["tr", "en", "de"] as const) {
      // HeroSearchPanel ile aynı çağrı: localeHref(`/arama?${query}`, locale)
      expect(buildAiSearchHref(c, vocab, loc)).toBe(localeHref("/arama?bolgeler=kas&guests=4", loc));
    }
  });
});

describe("Doğal dil → onay → /arama gidiş-dönüşü kayıpsız", () => {
  it.each([
    ["Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa arıyorum.", "tr"],
    ["I'm looking for a villa in Kalkan for 6 people with a secluded pool and jacuzzi.", "en"],
    ["Ich suche eine Villa in Kalkan für 6 Personen mit geschütztem Pool und Whirlpool.", "de"],
    ["12-18 Haziran 2027 Kalkan veya Fethiye'de 2 kişilik muhafazakâr villa", "tr"],
  ] as const)("%s", (q, locale) => {
    const r = parseNaturalQuery(q, vocab, { today: TODAY, locale });
    const qs = buildAiSearchQuery(
      {
        regionIds: r.regions.map((o) => o.id),
        typeId: r.types[0]?.id ?? null,
        featureIds: r.features.map((o) => o.id),
        guests: r.guests,
        start: r.start,
        end: r.end,
      },
      vocab
    );
    const back = arama(qs);
    expect(back.regions).toEqual(r.regions.map((o) => o.id));
    expect(back.types).toEqual(r.types.map((o) => o.id));
    expect(back.features).toEqual(r.features.map((o) => o.id));
    expect(back.guests).toBe(r.guests ?? 0);
    expect([back.start, back.end]).toEqual([r.start, r.end]);
  });

  it("TR/EN/DE brief örnekleri aynı canonical parametreleri üretir", () => {
    const out = (
      [
        ["Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa arıyorum.", "tr"],
        ["I'm looking for a villa in Kalkan for 6 people with a secluded pool and jacuzzi.", "en"],
        ["Ich suche eine Villa in Kalkan für 6 Personen mit geschütztem Pool und Whirlpool.", "de"],
      ] as const
    ).map(([q, locale]) => {
      const r = parseNaturalQuery(q, vocab, { today: TODAY, locale });
      return buildAiSearchQuery(
        {
          regionIds: r.regions.map((o) => o.id),
          typeId: null,
          featureIds: r.features.map((o) => o.id),
          guests: r.guests,
          start: null,
          end: null,
        },
        vocab
      );
    });
    expect(new Set(out).size).toBe(1);
    expect(out[0]).toBe("bolgeler=kalkan&guests=6&ozellikler=f-kor%2Cf-jak");
  });
});

describe("Mevcut sistem kilitleri (kaynak)", () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("AI yolu yeni bir URL kurucu yazmaz; mevcut buildHeroSearchParams'ı çağırır", () => {
    const s = src("app/components/ui/hero/_helpers/build-ai-search-query.ts");
    expect(s).toContain('import { buildHeroSearchParams } from "./build-search-params";');
    expect(s).not.toMatch(/new URLSearchParams|\.set\("(villa-turleri|bolgeler|start|end|guests|ozellikler)"/);
  });

  it("Tarihle Ara paneli Hero'da aynı prop ile render edilir ve kendi akışını korur", () => {
    const hero = src("app/components/ui/Hero.tsx");
    expect(hero).toContain("<HeroSearchPanel locale={locale} />");
    const panel = src("app/components/ui/hero/_components/HeroSearchPanel.tsx");
    expect(panel).toContain("router.push(localeHref(`/arama?${query}`, locale));");
    expect(panel).not.toContain("HeroSearchModes");
    expect(panel).not.toContain("ai-search");
  });

  it("harici AI/model servisi yok; tek ağ çağrısı mevcut taksonomi uç noktası", () => {
    const files = [
      "lib/ai-search/tokenize.ts",
      "lib/ai-search/lexicon.ts",
      "lib/ai-search/vocabulary.ts",
      "lib/ai-search/parse.ts",
      "lib/ai-search/schema.ts",
      "app/components/ui/hero/_components/HeroAiSearch.tsx",
      "app/components/ui/hero/_components/HeroSearchModes.tsx",
      "app/components/ui/hero/_helpers/build-ai-search-query.ts",
    ];
    for (const f of files) {
      const s = src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(s, f).not.toMatch(/anthropic|openai|gemini|generativelanguage|groq|ollama|huggingface|mistral|api_key|apiKey|process\.env/i);
      const fetches = s.match(/fetch\(([^)]*)\)/g) ?? [];
      for (const call of fetches) expect(call, f).toContain('"/api/public/taxonomies"');
    }
    const lib = files.slice(0, 5).map(src).join("\n");
    expect(lib).not.toMatch(/fetch\(|@\/lib\/db|from "pg"/);
  });
});
