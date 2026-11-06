/* ===============================================================
   🧪 AI ARAMA — CANLI TAKSONOMİ ADLARIYLA UYUM (TR / EN / DE)
   ===============================================================
   Fixture: canlı `/api/public/taxonomies` cevabındaki gerçek adlar.
   Kapsam:
     1) Alt bölge kısa adları ("Ölüdeniz", "Göcek", "Kalamar" …) tek
        başına doğru kayda ve canonical slug'a gider; aynı ad iki ana
        bölgede varsa seçim istenir; genel/yaygın kelimeler otomatik
        seçilmez; yanlış "Dalaman" önerisi yok.
     2) Canlıdaki filtreler: kapalı / ısıtmalı havuz, evcil hayvan.
     3) "2027 Kiralık Villalar", "Villas with Children's Play Areas",
        "Sinema Odası".
     4) Özel havuz ≠ korunaklı havuz ≠ muhafazakâr villa.
   =============================================================== */
import { describe, it, expect } from "vitest";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { ParseResultSchema, type ParseResult } from "@/lib/ai-search/schema";
import { buildAiSearchQuery } from "@/app/components/ui/hero/_helpers/build-ai-search-query";
import type { Locale } from "@/lib/i18n/config";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";

const TODAY = "2026-11-06";
const vocab = buildVocabulary(LIVE_TAXONOMY);
const parse = (q: string, locale: Locale = "tr"): ParseResult =>
  ParseResultSchema.parse(parseNaturalQuery(q, vocab, { today: TODAY, locale }));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const choiceIds = (r: ParseResult) => r.choices.flatMap((c) => c.options.map((o) => o.id)).sort();
const urlOf = (r: ParseResult) =>
  buildAiSearchQuery(
    {
      regionIds: ids(r.regions),
      typeId: r.types[0]?.id ?? null,
      featureIds: ids(r.features),
      guests: r.guests,
      start: r.start,
      end: r.end,
    },
    vocab
  );

const ALL_IDS = new Set([
  ...LIVE_TAXONOMY.locations.map((l) => l.id),
  ...LIVE_TAXONOMY.types.map((t) => t.id),
  ...LIVE_TAXONOMY.features.map((f) => f.id),
]);

describe("1) Alt bölge adları tek başına", () => {
  it.each([
    ["Ölüdeniz", "L:oludeniz", "oludeniz"],
    ["Ölüdeniz'de villa", "L:oludeniz", "oludeniz"],
    ["oludeniz", "L:oludeniz", "oludeniz"],
    ["Göcek", "L:gocek", "gocek"],
    ["Göcek'te", "L:gocek", "gocek"],
    ["Hisarönü", "L:fethiye-hisaronu", "fethiye-hisaronu"],
    ["Kayaköy", "L:kayakoy", "kayakoy"],
    ["İslamlar", "L:islamlar", "islamlar"],
    ["islamlarda", "L:islamlar", "islamlar"],
    ["Kalamar", "L:kalkan-kalamar", "kalkan-kalamar"],
    ["Bezirgan", "L:bezirgan", "bezirgan"],
    ["Sarıbelen", "L:saribelen", "saribelen"],
    ["Çukurbağ", "L:cukurbag", "cukurbag"],
    ["Çukurbağ Yarımadası", "L:kas-cukurbag-yarimadasi", "kas-cukurbag-yarimadasi"],
    ["Faralya", "L:fethiye-faralya", "fethiye-faralya"],
    ["Palamut", "L:palamut", "palamut"],
  ])("%s → %s (bolgeler=%s)", (q, id, slug) => {
    const r = parse(q);
    expect(ids(r.regions)).toEqual([id]);
    expect(r.unknown).toEqual([]);
    expect(urlOf(r)).toBe(`bolgeler=${slug}`);
  });

  it("etiket ana bölgeyi gösterir", () => {
    expect(parse("Ölüdeniz").regions[0].label).toBe("Fethiye / Ölüdeniz");
    expect(parse("Kalamar").regions[0].label).toBe("Kalkan / Kalamar");
  });

  it("EN / DE cümlelerinde de tanınır", () => {
    const en = parse("Villa in Oludeniz for 4 people", "en");
    expect(ids(en.regions)).toEqual(["L:oludeniz"]);
    expect(en.guests).toBe(4);
    const de = parse("Villa in Göcek für 6 Personen", "de");
    expect(ids(de.regions)).toEqual(["L:gocek"]);
    expect(de.guests).toBe(6);
  });

  it("ana bölgeler eskisi gibi grup köküne gider", () => {
    expect(ids(parse("Kalkan").regions)).toEqual(["L:kalkan"]);
    expect(ids(parse("Kaş'ta").regions)).toEqual(["L:kas"]);
    expect(ids(parse("Fethiye").regions)).toEqual(["L:fethiye"]);
    expect(ids(parse("Patara").regions)).toEqual(["L:patara"]);
  });

  it("aynı ad iki ana bölgede varsa (Üzümlü) seçim istenir; tam ad doğrudan gider", () => {
    const r = parse("Üzümlü");
    expect(r.regions).toEqual([]);
    expect(r.choices[0].reason).toBe("ambiguous_region");
    expect(choiceIds(r)).toEqual(["L:fethiye-uzumlu", "L:uzumlu"]);
    expect(ids(parse("Kalkan Üzümlü").regions)).toEqual(["L:uzumlu"]);
    expect(ids(parse("Fethiye Üzümlü").regions)).toEqual(["L:fethiye-uzumlu"]);
  });

  it("'Merkez' tek başına hiçbir bölgeye gitmez; 'Kaş merkez' gider", () => {
    const r = parse("Merkez");
    expect(r.regions).toEqual([]);
    expect(r.suggestions).toEqual([]);
    expect(ids(parse("Kaş merkez").regions)).toEqual(["L:kas-merkez"]);
  });

  it("yaygın kelime olan adlar (Yalı, Çiftlik) otomatik seçilmez, öneri olur", () => {
    const yali = parse("Yalı");
    expect(yali.regions).toEqual([]);
    expect(yali.suggestions.map((s) => s.option.id)).toEqual(["L:yali"]);
    const ciftlik = parse("çiftlik evi");
    expect(ciftlik.regions).toEqual([]);
    expect(ciftlik.suggestions.map((s) => s.option.id)).toEqual(["L:fethiye-ciftlik"]);
    expect(ids(parse("Patara Yalı").regions)).toEqual(["L:yali"]);
  });

  it("yanlış 'Dalaman' önerisi yok; gerçek yazım hatası önerisi sürer", () => {
    const kalamar = parse("Kalamar");
    expect(kalamar.suggestions).toEqual([]);
    const typo = parse("Kalamr");
    expect(typo.suggestions.map((s) => s.option.id)).not.toContain("L:dalaman");
    expect(parse("Fethye").suggestions.map((s) => s.option.id)).toEqual(["L:fethiye"]);
    expect(parse("Fethye").regions).toEqual([]);
  });

  it("canlıdaki 67 bölgenin kısa adlarından 'Merkez' ve yaygın kelimeler dışındakiler tanınır", () => {
    const missing: string[] = [];
    for (const l of LIVE_TAXONOMY.locations) {
      const short = l.name.includes("/") ? l.name.split("/")[1].trim() : l.name;
      if (["Merkez", "Yalı", "Çiftlik", "Kasaba", "Ordu", "Çalış"].includes(short)) continue;
      const r = parse(short);
      const ok = ids(r.regions).includes(l.id) || choiceIds(r).includes(l.id);
      if (!ok) missing.push(l.name);
    }
    expect(missing).toEqual([]);
  });
});

describe("2) Canlıdaki havuz ve evcil hayvan filtreleri", () => {
  const INDOOR = ["F:Kapalı Havuzu Isıtmalı", "T:kapali-havuzlu-isitmali-villalar"];

  it.each([
    ["kapalı havuzlu", "tr"],
    ["kapalı havuz", "tr"],
    ["ısıtmalı havuz", "tr"],
    ["ısıtmalı havuzlu villa", "tr"],
    ["indoor pool", "en"],
    ["heated pool", "en"],
    ["beheizter Pool", "de"],
    ["Innenpool", "de"],
  ] as const)("%s → canlıdaki özellik/tip arasında seçim (uydurma yok)", (q, locale) => {
    const r = parse(q, locale);
    expect(r.unsupported).toEqual([]);
    expect(r.choices[0].reason).toBe("ambiguous_match");
    expect(choiceIds(r)).toEqual(INDOOR.slice().sort());
  });

  it.each([
    ["kapalı havuzu ısıtmalı", "tr", "feature", "F:Kapalı Havuzu Isıtmalı"],
    ["Heated Indoor Pool", "en", "feature", "F:Kapalı Havuzu Isıtmalı"],
    ["beheizter Innenpool", "de", "feature", "F:Kapalı Havuzu Isıtmalı"],
    ["kapalı havuzlu ısıtmalı villa", "tr", "type", "T:kapali-havuzlu-isitmali-villalar"],
    ["villas with heated indoor pools", "en", "type", "T:kapali-havuzlu-isitmali-villalar"],
  ] as const)("tam ad doğrudan eşleşir: %s", (q, locale, kind, id) => {
    const r = parse(q, locale);
    expect(ids(kind === "type" ? r.types : r.features)).toEqual([id]);
    expect(r.choices).toEqual([]);
  });

  it.each([
    ["evcil hayvan kabul eden villa", "tr"],
    ["evcil hayvanlı", "tr"],
    ["evcil hayvan izinli", "tr"],
    ["köpeğimle gelebileceğim", "tr"],
    ["pet friendly villa", "en"],
    ["pets allowed", "en"],
    ["haustierfreundlich", "de"],
    ["Haustiere erlaubt", "de"],
    ["mit Hund", "de"],
  ] as const)("%s → Evcil Hayvan İzinli tipi", (q, locale) => {
    const r = parse(q, locale);
    expect(ids(r.types)).toEqual(["T:evcil-hayvan-izinli"]);
    expect(r.unsupported).toEqual([]);
    expect(urlOf(r)).toBe("villa-turleri=evcil-hayvan-izinli");
  });

  it("seçenekler yalnız canlıdaki kayıtlardan gelir", () => {
    for (const q of ["kapalı havuzlu", "ısıtmalı havuz", "evcil hayvan", "jakuzi", "Kinderspielplatz"]) {
      const r = parse(q);
      for (const id of [...ids(r.regions), ...ids(r.types), ...ids(r.features), ...choiceIds(r)]) {
        expect(ALL_IDS.has(id)).toBe(true);
      }
    }
  });
});

describe("3) Küçük eksikler", () => {
  it.each([
    ["2027 kiralık villalar", "tr"],
    ["2027 villaları", "tr"],
    ["2027 Kiralık Villalar", "tr"],
    ["2027 villas for rent", "en"],
    ["2027 villas", "en"],
    ["Ferienvillen 2027", "de"],
  ] as const)("%s → 2027 Kiralık Villalar", (q, locale) => {
    const r = parse(q, locale);
    expect(ids(r.types)).toEqual(["T:2027-kiralik-villalar"]);
    expect(urlOf(r)).toBe("villa-turleri=2027-kiralik-villalar");
  });

  it("tarihteki 2027 villa tipine dönüşmez", () => {
    const r = parse("2-8 Ağustos 2027 Kalkan");
    expect(r.types).toEqual([]);
    expect([r.start, r.end]).toEqual(["2027-08-02", "2027-08-08"]);
    expect(parse("Ağustos 2027").types).toEqual([]);
  });

  it("Villas with Children's Play Areas (EN adı) ve varyantları", () => {
    expect(ids(parse("Villas with Children's Play Areas", "en").types)).toEqual(["T:cocuk-oyun-alanli-villalar"]);
    expect(ids(parse("villas with childrens play areas", "en").types)).toEqual(["T:cocuk-oyun-alanli-villalar"]);
    const r = parse("villa with a children's play area", "en");
    expect(choiceIds(r)).toEqual(["F:Çocuk Oyun Alanı", "T:cocuk-oyun-alanli-villalar"]);
    expect(choiceIds(parse("çocuk oyun alanı"))).toEqual(["F:Çocuk Oyun Alanı", "T:cocuk-oyun-alanli-villalar"]);
    expect(choiceIds(parse("Kinderspielplatz", "de"))).toEqual(["F:Çocuk Oyun Alanı", "T:cocuk-oyun-alanli-villalar"]);
  });

  it.each([
    ["sinema odalı", "tr"],
    ["sinema odası", "tr"],
    ["ev sineması olan villa", "tr"],
    ["cinema room", "en"],
    ["home cinema", "en"],
    ["Kinoraum", "de"],
    ["Heimkino", "de"],
  ] as const)("%s → Sinema Odası", (q, locale) => {
    const r = parse(q, locale);
    expect(ids(r.features)).toEqual(["F:Sinema Odası"]);
    expect(r.unsupported).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("canlıdaki tüm tip ve özellik adları (TR/EN/DE) kendi kaydına ulaşır", () => {
    const failed: string[] = [];
    for (const [kind, rows] of [["type", LIVE_TAXONOMY.types], ["feature", LIVE_TAXONOMY.features]] as const) {
      for (const row of rows) {
        for (const [locale, name] of [["tr", row.name], ["en", row.name_by_locale?.en], ["de", row.name_by_locale?.de]] as const) {
          if (!name) continue;
          const r = parse(name, locale);
          const ok = ids(kind === "type" ? r.types : r.features).includes(row.id) || choiceIds(r).includes(row.id);
          if (!ok) failed.push(`${kind}/${locale}: ${name}`);
        }
      }
    }
    expect(failed).toEqual([]);
  });
});

describe("4) Özel havuz ≠ korunaklı havuz ≠ muhafazakâr villa (canlı adlarla)", () => {
  it.each([
    ["private pool", "en", "private pool"],
    ["privater Pool", "de", "privater Pool"],
    ["privatem Pool", "de", "privatem Pool"],
    ["özel havuzlu villa", "tr", "özel havuzlu"],
  ] as const)("%s → filtre yok olarak raporlanır", (q, locale, phrase) => {
    const r = parse(q, locale);
    expect(r.unsupported).toEqual([{ code: "not_in_system", phrase, concept: "private_pool" }]);
    expect(r.types).toEqual([]);
    expect(r.features).toEqual([]);
    expect(r.choices).toEqual([]);
  });

  it.each([
    ["korunaklı havuzlu", "tr"],
    ["secluded pool", "en"],
    ["Blickgeschützter Pool", "de"],
    ["geschützter Pool", "de"],
  ] as const)("%s → yalnız Korunaklı Havuz özelliği", (q, locale) => {
    const r = parse(q, locale);
    expect(ids(r.features)).toEqual(["F:Korunaklı Havuz"]);
    expect(r.types).toEqual([]);
  });

  it.each([
    ["muhafazakâr villa", "tr"],
    ["conservative villa", "en"],
    ["konservative Villa", "de"],
  ] as const)("%s → yalnız Muhafazakar Villalar tipi", (q, locale) => {
    const r = parse(q, locale);
    expect(ids(r.types)).toEqual(["T:muhafazakar-villalar"]);
    expect(r.features).toEqual([]);
  });

  it("brief örnekleri canlı adlarla değişmeden çözülür", () => {
    const tr = parse("Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa arıyorum.");
    expect(ids(tr.regions)).toEqual(["L:kalkan"]);
    expect(tr.guests).toBe(6);
    expect(ids(tr.features)).toEqual(["F:Korunaklı Havuz", "F:Jakuzi"]);
    expect(tr.types).toEqual([]);
    const en = parse("I'm looking for a villa in Kalkan for 6 people with a private pool and jacuzzi.", "en");
    expect(ids(en.features)).toEqual(["F:Jakuzi"]);
    expect(en.unsupported.map((u) => u.concept)).toEqual(["private_pool"]);
    const de = parse("Ich suche eine Villa in Kalkan für 6 Personen mit privatem Pool und Whirlpool.", "de");
    expect(ids(de.features)).toEqual(["F:Jakuzi"]);
    expect(de.unsupported.map((u) => u.concept)).toEqual(["private_pool"]);
  });
});
