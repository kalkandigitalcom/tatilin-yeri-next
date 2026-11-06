/* ===============================================================
   🧪 AI ARAMA (KURAL TABANLI) — AYRIŞTIRICI TESTLERİ
   ===============================================================
   Kapsam: TR/EN/DE örnekleri · bölge · kişi · villa tipi · özellik ·
   çoklu kriter · tarih aralığı · geçersiz / belirsiz tarih ·
   desteklenmeyen kriter · çoklu villa tipi · korunaklı havuz ≠
   muhafazakâr · boş / anlamsız sorgu · zod şeması · determinizm.
   =============================================================== */
import { describe, it, expect } from "vitest";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { ParseResultSchema, TaxonomyResponseSchema, type ParseResult } from "@/lib/ai-search/schema";
import type { Locale } from "@/lib/i18n/config";

import { TAXONOMY, TODAY } from "./ai-search-fixtures";

const vocab = buildVocabulary(TAXONOMY);
const parse = (q: string, locale: Locale = "tr", today = TODAY): ParseResult => {
  const r = parseNaturalQuery(q, vocab, { today, locale });
  // Her çıktı zod şemasına uymalı
  return ParseResultSchema.parse(r);
};
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("1) TR / EN / DE örnek sorgular (brief)", () => {
  it("TR — Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa", () => {
    const r = parse("Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa arıyorum.");
    expect(ids(r.regions)).toEqual(["loc-kalkan"]);
    expect(r.guests).toBe(6);
    expect(ids(r.features)).toEqual(["f-kor", "f-jak"]);
    expect(r.types).toEqual([]);
    expect(r.unsupported).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(r.choices).toEqual([]);
  });

  it("EN — private pool sistemde yoksa uydurulmaz; jacuzzi eşleşir", () => {
    const r = parse("I'm looking for a villa in Kalkan for 6 people with a private pool and jacuzzi.", "en");
    expect(ids(r.regions)).toEqual(["loc-kalkan"]);
    expect(r.guests).toBe(6);
    expect(ids(r.features)).toEqual(["f-jak"]);
    expect(r.features[0].label).toBe("Jacuzzi");
    expect(r.unsupported).toEqual([{ code: "not_in_system", phrase: "private pool", concept: "private_pool" }]);
    // "private pool" korunaklı havuza da muhafazakâr tipe de ÇEVRİLMEZ
    expect(ids(r.features)).not.toContain("f-kor");
    expect(r.types).toEqual([]);
  });

  it("DE — Whirlpool → Jakuzi; privater Pool raporlanır", () => {
    const r = parse("Ich suche eine Villa in Kalkan für 6 Personen mit privatem Pool und Whirlpool.", "de");
    expect(ids(r.regions)).toEqual(["loc-kalkan"]);
    expect(r.guests).toBe(6);
    expect(ids(r.features)).toEqual(["f-jak"]);
    expect(r.features[0].label).toBe("Whirlpool");
    expect(r.unsupported.map((u) => u.concept)).toEqual(["private_pool"]);
    expect(r.unknown).toEqual([]);
  });

  it("TR / EN / DE aynı canonical kayıtlara ulaşır", () => {
    const tr = parse("Kalkan 6 kişilik korunaklı havuz jakuzi deniz manzarası");
    const en = parse("Kalkan 6 guests secluded pool jacuzzi sea view", "en");
    const de = parse("Kalkan 6 Gäste geschützter Pool Whirlpool Meerblick", "de");
    for (const r of [tr, en, de]) {
      expect(ids(r.regions)).toEqual(["loc-kalkan"]);
      expect(r.guests).toBe(6);
      expect(ids(r.features).sort()).toEqual(["f-den", "f-jak", "f-kor"]);
    }
  });
});

describe("2) Bölge eşleştirmesi", () => {
  it.each([
    ["Kaş'ta villa", "loc-kas"],
    ["kas villa", "loc-kas"],
    ["KAŞ", "loc-kas"],
    ["Kaşta villa", "loc-kas"],
    ["Fethiye'de", "loc-fethiye"],
    ["fethiyede", "loc-fethiye"],
    ["İslamlar", "loc-islamlar"],
    ["islamlarda", "loc-islamlar"],
    ["Ölüdeniz", "loc-oludeniz"],
    ["oludeniz", "loc-oludeniz"],
  ])("%s → %s", (q, id) => {
    expect(ids(parse(q).regions)).toEqual([id]);
  });

  it("çoklu bölge OR listesi olarak korunur (veya / ve / virgül)", () => {
    expect(ids(parse("Kalkan veya Fethiye").regions)).toEqual(["loc-kalkan", "loc-fethiye"]);
    expect(ids(parse("Kalkan, Kaş ve Fethiye").regions)).toEqual(["loc-kalkan", "loc-kas", "loc-fethiye"]);
    expect(ids(parse("Kalkan or Kas", "en").regions)).toEqual(["loc-kalkan", "loc-kas"]);
  });

  it("'kasım' (ay) Kaş bölgesine eşlenmez", () => {
    const r = parse("kasım ayında villa");
    expect(r.regions).toEqual([]);
    expect(r.dateIssue?.code).toBe("month_only");
  });

  it("aynı ada sahip iki grup kökü → otomatik seçilmez, seçim istenir", () => {
    const tax = TaxonomyResponseSchema.parse({
      ...TAXONOMY,
      locations: [
        ...TAXONOMY.locations,
        { id: "loc-kalkan-2", name: "Kalkan", slug: "kalkan-2", filter_group_name: "Kalkan" },
      ],
    });
    const r = parseNaturalQuery("Kalkan", buildVocabulary(tax), { today: TODAY, locale: "tr" });
    expect(r.regions).toEqual([]);
    expect(r.choices[0].reason).toBe("ambiguous_region");
  });

  it("yazım hatası otomatik uygulanmaz, öneri olarak döner", () => {
    const r = parse("Fethye 4 kişi");
    expect(r.regions).toEqual([]);
    expect(r.unknown).toEqual(["Fethye"]);
    expect(r.suggestions).toEqual([
      { phrase: "Fethye", option: { kind: "region", id: "loc-fethiye", label: "Fethiye" } },
    ]);
  });
});

describe("3) Kişi sayısı", () => {
  it.each([
    ["6 kişilik villa", "tr", 6],
    ["6 kişi", "tr", 6],
    ["6kişilik", "tr", 6],
    ["altı kişilik", "tr", 6],
    ["biz 4 kişiyiz", "tr", 4],
    ["for 8 people", "en", 8],
    ["for 8", "en", 8],
    ["8 guests", "en", 8],
    ["four adults", "en", 4],
    ["für 5 Personen", "de", 5],
    ["5 Gäste", "de", 5],
    ["zwei Erwachsene", "de", 2],
  ] as const)("%s → %i", (q, locale, n) => {
    expect(parse(q, locale).guests).toBe(n);
  });

  it("yetişkin + çocuk toplanır, kırılım tutulur", () => {
    const r = parse("2 yetişkin 2 çocuk");
    expect(r.guests).toBe(4);
    expect(r.guestBreakdown).toEqual({ adults: 2, children: 2 });
    expect(parse("4 adults and 2 kids", "en").guests).toBe(6);
    expect(parse("2 Erwachsene und 1 Kind", "de").guests).toBe(3);
  });

  it("çelişen kişi sayıları otomatik seçilmez", () => {
    const r = parse("6 kişilik ama 8 kişi de olabiliriz");
    expect(r.guests).toBeNull();
    expect(r.choices[0].reason).toBe("conflicting_guests");
    expect(r.choices[0].options.map((o) => o.id)).toEqual(["6", "8"]);
  });

  it("'for 5 nights' kişi sayısı değildir", () => {
    expect(parse("for 5 nights", "en").guests).toBeNull();
  });

  it("kapsam dışı kişi sayısı reddedilir ve anlaşılamayan olarak gösterilir", () => {
    const r = parse("80 kişilik villa");
    expect(r.guests).toBeNull();
    expect(r.unknown).toContain("80 kişilik");
  });
});

describe("4) Villa tipi", () => {
  it("tek tip — TR / EN / DE ad", () => {
    expect(ids(parse("muhafazakar villa").types)).toEqual(["type-muh"]);
    expect(ids(parse("muhafazakâr").types)).toEqual(["type-muh"]);
    expect(ids(parse("Muhafazakar Villalar").types)).toEqual(["type-muh"]);
    expect(ids(parse("conservative villa", "en").types)).toEqual(["type-muh"]);
    expect(ids(parse("konservative Villa", "de").types)).toEqual(["type-muh"]);
    expect(ids(parse("honeymoon", "en").types)).toEqual(["type-bal"]);
    expect(ids(parse("balayı villası").types)).toEqual(["type-bal"]);
  });

  it("etiket arayüz diline göre, id değişmez", () => {
    expect(parse("muhafazakar", "en").types[0]).toEqual({ kind: "type", id: "type-muh", label: "Conservative Villas" });
    expect(parse("muhafazakar", "de").types[0].label).toBe("Konservative Villen");
    expect(parse("muhafazakar", "tr").types[0].label).toBe("Muhafazakar Villalar");
  });

  it("birden fazla tip → AND nedeniyle otomatik gönderilmez, seçim istenir", () => {
    const r = parse("muhafazakar balayı villası");
    expect(r.types).toEqual([]);
    expect(r.choices).toHaveLength(1);
    expect(r.choices[0].reason).toBe("multiple_types");
    expect(r.choices[0].options.map((o) => o.id)).toEqual(["type-muh", "type-bal"]);
    expect(r.nothingParsed).toBe(false);
  });
});

describe("5) Özellik eşleştirmesi", () => {
  it.each([
    ["jakuzi", "f-jak"],
    ["jakuzili", "f-jak"],
    ["Jacuzzi", "f-jak"],
    ["hot tub", "f-jak"],
    ["Whirlpool", "f-jak"],
    ["korunaklı havuz", "f-kor"],
    ["korunakli havuzlu", "f-kor"],
    ["secluded pool", "f-kor"],
    ["geschützter Pool", "f-kor"],
    ["geschuetzter Pool", "f-kor"],
    ["deniz manzarası", "f-den"],
    ["deniz manzaralı", "f-den"],
    ["DENİZ MANZARALI", "f-den"],
    ["sea view", "f-den"],
    ["Meerblick", "f-den"],
    ["kapalı havuz", "f-kap"],
    ["indoor pool", "f-kap"],
    ["saunalı", "f-sau"],
  ])("%s → %s", (q, id) => {
    expect(ids(parse(q).features)).toEqual([id]);
  });

  it("tip ve özellik aynı ifadeye uyuyorsa otomatik seçilmez", () => {
    const tax = TaxonomyResponseSchema.parse({
      ...TAXONOMY,
      types: [
        ...TAXONOMY.types,
        { id: "type-den", name: "Deniz Manzaralı Villalar", slug: "deniz-manzarali-villalar", name_by_locale: {} },
      ],
    });
    const r = parseNaturalQuery("deniz manzaralı villa", buildVocabulary(tax), { today: TODAY, locale: "tr" });
    expect(r.features).toEqual([]);
    expect(r.types).toEqual([]);
    expect(r.choices[0].reason).toBe("ambiguous_match");
    expect(r.choices[0].options.map((o) => `${o.kind}:${o.id}`).sort()).toEqual(["feature:f-den", "type:type-den"]);
  });

  it("'denize yakın' deniz manzarasına ÇEVRİLMEZ", () => {
    const r = parse("denize yakın villa");
    expect(r.features).toEqual([]);
    expect(r.unsupported).toEqual([{ code: "not_in_system", phrase: "denize yakın", concept: "near_sea" }]);
  });

  it("'çocuk dostu' çocuk havuzuna ÇEVRİLMEZ", () => {
    const tax = TaxonomyResponseSchema.parse({
      ...TAXONOMY,
      features: [...TAXONOMY.features, { id: "f-coc", name: "Çocuk Havuzu" }],
    });
    const v = buildVocabulary(tax);
    const a = parseNaturalQuery("çocuk dostu villa", v, { today: TODAY, locale: "tr" });
    expect(a.features).toEqual([]);
    expect(a.unsupported[0].concept).toBe("child_friendly");
    const b = parseNaturalQuery("çocuk havuzlu villa", v, { today: TODAY, locale: "tr" });
    expect(ids(b.features)).toEqual(["f-coc"]);
  });
});

describe("6) Korunaklı havuz ≠ muhafazakâr villa", () => {
  it("korunaklı havuz yalnız özelliğe gider, muhafazakâr tipe gitmez", () => {
    const r = parse("korunaklı havuzlu villa");
    expect(ids(r.features)).toEqual(["f-kor"]);
    expect(r.types).toEqual([]);
  });

  it("muhafazakâr yalnız tipe gider, korunaklı havuz özelliğine gitmez", () => {
    const r = parse("muhafazakâr villa");
    expect(ids(r.types)).toEqual(["type-muh"]);
    expect(r.features).toEqual([]);
  });

  it("ikisi birlikte yazılınca ikisi ayrı ayrı bulunur", () => {
    const r = parse("muhafazakâr, korunaklı havuzlu villa");
    expect(ids(r.types)).toEqual(["type-muh"]);
    expect(ids(r.features)).toEqual(["f-kor"]);
  });

  it("canlıda 'Korunaklı Havuz' özelliği yoksa ifade muhafazakâr tipe KAYMAZ, raporlanır", () => {
    const tax = TaxonomyResponseSchema.parse({
      ...TAXONOMY,
      features: TAXONOMY.features.filter((f) => f.id !== "f-kor"),
    });
    const r = parseNaturalQuery("korunaklı havuzlu villa", buildVocabulary(tax), { today: TODAY, locale: "tr" });
    expect(r.types).toEqual([]);
    expect(r.features).toEqual([]);
    expect(r.unsupported).toEqual([{ code: "not_in_system", phrase: "korunaklı havuzlu", concept: "secluded_pool" }]);
  });

  it("'Korunaklı Villalar' tipi olsa bile 'korunaklı havuz' özelliği tercih edilir (uzun eşleşme)", () => {
    const tax = TaxonomyResponseSchema.parse({
      ...TAXONOMY,
      types: [...TAXONOMY.types, { id: "type-kor", name: "Korunaklı Villalar", slug: "korunakli-villalar" }],
    });
    const r = parseNaturalQuery("korunaklı havuzlu villa", buildVocabulary(tax), { today: TODAY, locale: "tr" });
    expect(ids(r.features)).toEqual(["f-kor"]);
    expect(r.types).toEqual([]);
  });
});

describe("7) Tarih aralığı", () => {
  it.each([
    ["2 Ağustos - 8 Ağustos", "tr", "2027-08-02", "2027-08-08"],
    ["2-8 Ağustos", "tr", "2027-08-02", "2027-08-08"],
    ["2–8 Ağustos 2027", "tr", "2027-08-02", "2027-08-08"],
    ["2 Ağustos'tan 8 Ağustos'a", "tr", "2027-08-02", "2027-08-08"],
    ["12-18 Haziran 2027 arasında", "tr", "2027-06-12", "2027-06-18"],
    ["28 Temmuz - 3 Ağustos", "tr", "2027-07-28", "2027-08-03"],
    ["02.08.2027 - 09.08.2027", "tr", "2027-08-02", "2027-08-09"],
    ["2027-08-02 - 2027-08-09", "tr", "2027-08-02", "2027-08-09"],
    ["August 2-8", "en", "2027-08-02", "2027-08-08"],
    ["Aug 2nd to Aug 8th, 2027", "en", "2027-08-02", "2027-08-08"],
    ["July 28 to August 3", "en", "2027-07-28", "2027-08-03"],
    ["2 to 8 August", "en", "2027-08-02", "2027-08-08"],
    ["vom 2. bis 8. August", "de", "2027-08-02", "2027-08-08"],
    ["2.–8. August 2027", "de", "2027-08-02", "2027-08-08"],
    ["12.06. - 18.06.", "de", "2027-06-12", "2027-06-18"],
    ["2 Ağustos'tan itibaren 5 gece", "tr", "2027-08-02", "2027-08-07"],
    ["August 2 for 7 nights", "en", "2027-08-02", "2027-08-09"],
  ] as const)("%s → %s / %s", (q, locale, s, e) => {
    const r = parse(q, locale);
    expect(r.dateIssue).toBeNull();
    expect([r.start, r.end]).toEqual([s, e]);
  });

  it("yıl yoksa bugünden sonraki ilk uygun yıl seçilir", () => {
    expect(parse("20-25 Kasım").start).toBe("2026-11-20");
    expect(parse("1-5 Kasım").start).toBe("2027-11-01");
  });

  it("yıl dönümü: 28 Aralık - 3 Ocak", () => {
    const r = parse("28 Aralık - 3 Ocak");
    expect([r.start, r.end]).toEqual(["2026-12-28", "2027-01-03"]);
  });

  it("tarihle birlikte diğer kriterler de bulunur", () => {
    const r = parse("12-18 Haziran 2027 arasında Kalkan veya Fethiye'de 2 kişilik muhafazakâr villa arıyorum.");
    expect([r.start, r.end]).toEqual(["2027-06-12", "2027-06-18"]);
    expect(ids(r.regions)).toEqual(["loc-kalkan", "loc-fethiye"]);
    expect(r.guests).toBe(2);
    expect(ids(r.types)).toEqual(["type-muh"]);
    expect(r.unknown).toEqual([]);
  });
});

describe("8) Geçersiz tarih", () => {
  it.each([
    ["30 Şubat - 3 Mart 2027", "invalid_calendar"],
    ["31 Nisan - 2 Mayıs", "invalid_calendar"],
    ["29 Şubat 2027 - 3 Mart 2027", "invalid_calendar"],
    ["31.06.2027 - 05.07.2027", "invalid_calendar"],
    ["8-2 Ağustos 2027", "end_before_start"],
    ["1-5 Ekim 2026", "past"],
    ["1 Haziran - 30 Ağustos 2027", "too_long"],
  ])("%s → %s", (q, code) => {
    const r = parse(q);
    expect(r.start).toBeNull();
    expect(r.end).toBeNull();
    expect(r.dateIssue?.code).toBe(code);
  });

  it("29 Şubat artık yılda geçerlidir", () => {
    expect(parse("29 Şubat 2028 - 3 Mart 2028").start).toBe("2028-02-29");
  });
});

describe("9) Belirsiz tarih — gün UYDURULMAZ", () => {
  it.each([
    ["Ağustos ayında 4 kişilik villa", "tr", "month_only"],
    ["in August", "en", "month_only"],
    ["im August", "de", "month_only"],
    ["2 Ağustos'ta giriş", "tr", "partial"],
    ["hafta sonu Kalkan", "tr", "relative"],
    ["next weekend", "en", "relative"],
    ["nächste Woche", "de", "relative"],
    ["5 gece kalmak istiyoruz", "tr", "nights_only"],
    ["7 nights", "en", "nights_only"],
    ["02/08/2027 - 09/08/2027", "en", "ambiguous_format"],
    ["2-5 Temmuz veya 10-15 Ağustos", "tr", "multiple"],
  ] as const)("%s → %s", (q, locale, code) => {
    const r = parse(q, locale);
    expect(r.start).toBeNull();
    expect(r.end).toBeNull();
    expect(r.dateIssue?.code).toBe(code);
  });

  it("'/' biçimi TR/DE'de gün/ay olarak okunur", () => {
    expect(parse("02/08/2027 - 09/08/2027", "tr").start).toBe("2027-08-02");
  });

  it("'may' fiili tarih sayılmaz", () => {
    expect(parse("we may need a villa", "en").dateIssue).toBeNull();
  });
});

describe("10) Desteklenmeyen kriterler filtreye dönüşmez, raporlanır", () => {
  it("yatak odası, bütçe, mesafe, minimum konaklama", () => {
    const r = parse("denize 500 metre, 3 yatak odalı, gecesi 10.000 TL altı, en az 5 gece");
    expect(r.unsupported.map((u) => u.code).sort()).toEqual(["bedrooms", "budget", "min_stay", "sea_distance"]);
    expect(r.regions).toEqual([]);
    expect(r.features).toEqual([]);
    expect(r.types).toEqual([]);
    expect(r.guests).toBeNull();
    expect(r.start).toBeNull();
    expect(r.unknown).toEqual([]);
  });

  it("EN / DE karşılıkları", () => {
    const en = parse("3 bedrooms, under 500 euro per night, 200 m to the beach, cheap", "en");
    expect(new Set(en.unsupported.map((u) => u.code))).toEqual(new Set(["bedrooms", "budget", "sea_distance"]));
    const de = parse("3 Schlafzimmer, bis 400 Euro, günstig, Mindestaufenthalt", "de");
    expect(new Set(de.unsupported.map((u) => u.code))).toEqual(new Set(["bedrooms", "budget", "min_stay"]));
  });

  it("yalnız 'havuzlu' — ayrı havuz filtresi yok", () => {
    const r = parse("havuzlu villa");
    expect(r.unsupported).toEqual([{ code: "pool", phrase: "havuzlu" }]);
    expect(r.features).toEqual([]);
  });

  it("sistemde karşılığı olmayan kavramlar (evcil hayvan, ısıtmalı havuz)", () => {
    const r = parse("evcil hayvan kabul eden ısıtmalı havuzlu villa");
    expect(r.unsupported.map((u) => u.concept).sort()).toEqual(["heated_pool", "pet_friendly"]);
    expect(r.features).toEqual([]);
  });
});

describe("11) Boş veya anlamsız sorgu", () => {
  it.each(["", "   ", "villa", "asdf qwerty", "merhaba nasılsın"])("%j → nothingParsed", (q) => {
    const r = parse(q);
    expect(r.nothingParsed).toBe(true);
    expect(r.regions).toEqual([]);
    expect(r.guests).toBeNull();
  });

  it("anlaşılamayan kelimeler sessizce atılmaz", () => {
    expect(parse("asdf qwerty").unknown).toEqual(["asdf", "qwerty"]);
    expect(parse("Kalkan sessiz sakin").unknown).toEqual(["sessiz", "sakin"]);
  });

  it("uzun metin 300 karakterde kesilir, hata vermez", () => {
    expect(() => parse("Kalkan ".repeat(200))).not.toThrow();
  });
});

describe("12) Determinizm ve canlı veriyle uyum", () => {
  it("aynı girdi → aynı çıktı", () => {
    const q = "2-8 Ağustos Kalkan'da 6 kişilik jakuzili muhafazakâr villa";
    expect(parse(q)).toEqual(parse(q));
  });

  it("kayıt canlıda yoksa kavram eşleşmez (sözlük sabit değil, taksonomiden kurulur)", () => {
    const tax = TaxonomyResponseSchema.parse({ ...TAXONOMY, features: [] });
    const r = parseNaturalQuery("jakuzili villa", buildVocabulary(tax), { today: TODAY, locale: "tr" });
    expect(r.features).toEqual([]);
    expect(r.unsupported[0]).toMatchObject({ code: "not_in_system", concept: "jacuzzi" });
  });

  it("taksonomide yeni bir özellik adı doğrudan tanınır (sözlüğe eklemeden)", () => {
    const tax = TaxonomyResponseSchema.parse({
      ...TAXONOMY,
      features: [...TAXONOMY.features, { id: "f-tenis", name: "Tenis Kortu", name_by_locale: { en: "Tennis Court" } }],
    });
    const v = buildVocabulary(tax);
    expect(parseNaturalQuery("tenis kortu", v, { today: TODAY, locale: "tr" }).features[0].id).toBe("f-tenis");
    expect(parseNaturalQuery("tennis court", v, { today: TODAY, locale: "en" }).features[0].id).toBe("f-tenis");
  });

  it("taksonomi cevabı zod ile doğrulanır; bozuk şekil reddedilir", () => {
    expect(() => TaxonomyResponseSchema.parse({ ok: true, locations: [{ id: 1 }], types: [], features: [] })).toThrow();
    expect(() => TaxonomyResponseSchema.parse({ ok: false })).toThrow();
  });
});
