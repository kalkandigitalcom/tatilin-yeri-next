/* ===============================================================
   🧪 AI ARAMA — OTOMATİK ÇÖZÜMLEME + DOĞRUDAN ARAMA URL'Sİ (canlı adlar)
   ===============================================================
   • DasVilla referans sorgusu ve TR/EN/DE karşılıkları.
   • Tarih kalıpları: "20 25 haziran", "20-25 haziran", "20/25 haziran",
     "20 haziranda giriş 25 haziranda çıkış", "20 June to 25 June",
     "20th to 25th June", "20. bis 25. Juni", "Anreise … Abreise …".
   • Yıl yoksa gelecekteki ilk uygun yıl (bugün 2026-11-06 → 2027).
   • Geçersiz / eksik / belirsiz tarih → URL'ye girmez, arama sürer.
   • Aynı adlı alt bölge, tip↔özellik, çoklu tip, çakışan kişi sayısı
     soru sorulmadan bağlamla çözülür; olmayan filtre üretilmez.
   =============================================================== */
import { describe, it, expect } from "vitest";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { autoResolve } from "@/lib/ai-search/auto-resolve";
import { ParseResultSchema } from "@/lib/ai-search/schema";
import { buildAiSearchQuery } from "@/app/components/ui/hero/_helpers/build-ai-search-query";
import type { Locale } from "@/lib/i18n/config";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";

const TODAY = "2026-11-06";
const vocab = buildVocabulary(LIVE_TAXONOMY);
const run = (q: string, locale: Locale = "tr") => {
  const parsed = ParseResultSchema.parse(parseNaturalQuery(q, vocab, { today: TODAY, locale }));
  const r = autoResolve(parsed, vocab);
  return { ...r, parsed, url: r.hasCriteria ? buildAiSearchQuery(r.criteria, vocab) : null };
};

describe("DasVilla referans sorgusu", () => {
  it("Üzümlü'de 2 kişilik balayı villası arıyorum tarihlerim 20 25 haziran", () => {
    const r = run("Üzümlü'de 2 kişilik balayı villası arıyorum tarihlerim 20 25 haziran");
    expect(r.criteria).toEqual({
      regionIds: ["L:uzumlu"],
      typeId: "T:balayi-villalari",
      featureIds: [],
      guests: 2,
      start: "2027-06-20",
      end: "2027-06-25",
    });
    expect(r.parsed.unknown).toEqual([]);
    expect(r.parsed.dateIssue).toBeNull();
    expect(r.url).toBe("villa-turleri=balayi-villalari&bolgeler=uzumlu&start=2027-06-20&end=2027-06-25&guests=2");
    expect(r.decisions).toEqual([
      { reason: "ambiguous_region", phrase: "Üzümlü'de", picked: ["L:uzumlu"], rule: "canonical" },
    ]);
  });

  it.each([
    ["Honeymoon villa in Uzumlu for 2 adults, June 20-25", "en"],
    ["honeymoon villa Üzümlü 2 people 20th to 25th June", "en"],
    ["Flitterwochen-Villa in Üzümlü für 2 Personen vom 20. bis 25. Juni", "de"],
    ["Hochzeitsreise Villa Üzümlü 2 Personen Anreise 20. Juni Abreise 25. Juni", "de"],
  ] as const)("%s → aynı kriterler", (q, locale) => {
    expect(run(q, locale).url).toBe(
      "villa-turleri=balayi-villalari&bolgeler=uzumlu&start=2027-06-20&end=2027-06-25&guests=2"
    );
  });
});

describe("Tarih kalıpları (yıl yok → 2027)", () => {
  it.each([
    ["20 25 haziran", "tr"],
    ["20-25 haziran", "tr"],
    ["20/25 haziran", "tr"],
    ["20 – 25 Haziran", "tr"],
    ["haziran 20-25", "tr"],
    ["20 haziran - 25 haziran", "tr"],
    ["20 haziranda giriş 25 haziranda çıkış", "tr"],
    ["giriş 20 haziran çıkış 25 haziran", "tr"],
    ["20 haziran ile 25 haziran arası", "tr"],
    ["20 June to 25 June", "en"],
    ["20th to 25th June", "en"],
    ["from June 20 to June 25", "en"],
    ["check-in 20 June, check-out 25 June", "en"],
    ["20. bis 25. Juni", "de"],
    ["vom 20. bis 25. Juni", "de"],
    ["20.-25. Juni", "de"],
    ["Anreise 20. Juni, Abreise 25. Juni", "de"],
  ] as const)("%s", (q, locale) => {
    const r = run(`Kalkan ${q}`, locale);
    expect(r.criteria.start).toBe("2027-06-20");
    expect(r.criteria.end).toBe("2027-06-25");
    expect(r.parsed.unknown).toEqual([]);
  });

  it("ay sonrası yıl geçişi: 28 Aralık - 3 Ocak → 2026-12-28 / 2027-01-03", () => {
    const r = run("Kalkan 28 Aralık - 3 Ocak");
    expect([r.criteria.start, r.criteria.end]).toEqual(["2026-12-28", "2027-01-03"]);
  });

  it.each([
    ["30 Şubat Kalkan 4 kişi", "invalid_calendar"],
    ["30 Şubat - 3 Mart Kalkan 4 kişi", "invalid_calendar"],
    ["31 Nisan Kalkan 4 kişi", "invalid_calendar"],
    ["25 20 haziran Kalkan 4 kişi", "partial"],
    ["Ağustos'ta Kalkan 4 kişi", "month_only"],
    ["12 haziran Kalkan 4 kişi", "partial"],
    ["hafta sonu Kalkan 4 kişi", "relative"],
    ["7 gece Kalkan 4 kişi", "nights_only"],
    ["1 Ocak 2026 - 5 Ocak 2026 Kalkan 4 kişi", "past"],
  ])("%s → tarih gönderilmez (%s), diğer kriterlerle aranır", (q, code) => {
    const r = run(q);
    expect(r.parsed.dateIssue?.code).toBe(code);
    expect(r.criteria.start).toBeNull();
    expect(r.criteria.end).toBeNull();
    expect(r.url).toBe("bolgeler=kalkan&guests=4");
  });
});

describe("Otomatik çözümleme — soru yok, uydurma yok", () => {
  it("Üzümlü tek başına → canonical (slug = ad) kayıt", () => {
    expect(run("Üzümlü").criteria.regionIds).toEqual(["L:uzumlu"]);
  });
  it("Fethiye Üzümlü → Fethiye'deki kayıt (tam ad)", () => {
    expect(run("Fethiye Üzümlü").criteria.regionIds).toEqual(["L:fethiye-uzumlu"]);
  });
  it("Kalkan Üzümlü → Kalkan'daki kayıt", () => {
    expect(run("Kalkan Üzümlü").criteria.regionIds).toEqual(["L:uzumlu"]);
  });

  it.each([
    ["Kalkan ısıtmalı kapalı havuz", null, ["F:Kapalı Havuzu Isıtmalı"]],
    ["ısıtmalı havuz", null, ["F:Kapalı Havuzu Isıtmalı"]],
    ["Kalkan ısıtmalı kapalı havuzlu villa", "T:kapali-havuzlu-isitmali-villalar", []],
    ["çocuk oyun alanı", null, ["F:Çocuk Oyun Alanı"]],
    ["çocuk oyun alanlı villa", "T:cocuk-oyun-alanli-villalar", []],
    ["villa with a children's play area", "T:cocuk-oyun-alanli-villalar", []],
    ["çocuk oyun alanlı balayı villası", "T:balayi-villalari", ["F:Çocuk Oyun Alanı"]],
  ] as const)("%s", (q, typeId, features) => {
    const r = run(q, /villa with/.test(q) ? "en" : "tr");
    expect(r.criteria.typeId).toBe(typeId);
    expect(r.criteria.featureIds).toEqual(features);
  });

  it.each([
    ["muhafazakar balayı villası", "tr", "T:balayi-villalari"],
    ["balayı villası muhafazakar", "tr", "T:balayi-villalari"],
    ["lüks deniz manzaralı villa", "tr", "T:deniz-manzarali-villalar"],
    ["conservative honeymoon villa", "en", "T:balayi-villalari"],
    ["konservative Flitterwochen Villa", "de", "T:balayi-villalari"],
  ] as const)("çoklu tip: %s → tek tip (baş isim)", (q, locale, typeId) => {
    expect(run(q, locale).criteria.typeId).toBe(typeId);
  });

  it("çakışan kişi sayısı → en büyük", () => {
    expect(run("Kalkan 2 yetişkin 1 çocuk 4 kişi").criteria.guests).toBe(4);
  });

  it("desteklenmeyen kriterler filtreye dönüşmez, arama sürer", () => {
    const r = run("Kaş'ta 2 yatak odalı, denize yakın, 3000 euro altı villa 4 kişi");
    expect(r.criteria).toMatchObject({ regionIds: ["L:kas"], typeId: null, featureIds: [], guests: 4 });
    expect(r.parsed.unsupported.length).toBe(3);
    expect(r.url).toBe("bolgeler=kas&guests=4");
  });

  it("yazım hatası önerisi otomatik uygulanmaz (uydurma yok)", () => {
    const r = run("Kalkn 4 kişi");
    expect(r.criteria.regionIds).toEqual([]);
    expect(r.url).toBe("guests=4");
  });

  it("hiçbir şey tanınmazsa hasCriteria=false", () => {
    expect(run("asdf qwerty").hasCriteria).toBe(false);
    expect(run("30 Şubat").hasCriteria).toBe(false);
  });
});
