/* ===============================================================
   🧪 SESLİ ARAMA — "SESTEN GELMİŞ" METİN → MEVCUT PARSER → MEVCUT URL
   ===============================================================
   Konuşma tanıma çıktısı tipik olarak küçük harfli, kesme işaretsiz ve
   noktalamasızdır ("kalkanda", "kaşta"). Bu metinler PARSER'A DOKUNMADAN
   mevcut zincirden geçirilir: parseNaturalQuery → autoResolve →
   buildAiSearchQuery. Beklenen URL'ler canlı taksonomi adlarıyla.
   Bilinen sınır: yazıyla söylenen tarih ("dört on haziran") tarih
   olarak anlaşılmaz — ama yanlış tarih/filtre de ÜRETİLMEZ.
   =============================================================== */
import { describe, it, expect } from "vitest";

import { buildVocabulary } from "@/lib/ai-search/vocabulary";
import { parseNaturalQuery } from "@/lib/ai-search/parse";
import { autoResolve } from "@/lib/ai-search/auto-resolve";
import { ParseResultSchema } from "@/lib/ai-search/schema";
import { buildAiSearchQuery } from "@/app/components/ui/hero/_helpers/build-ai-search-query";
import type { Locale } from "@/lib/i18n/config";

import { LIVE_TAXONOMY } from "./ai-search-live-fixture";

const vocab = buildVocabulary(LIVE_TAXONOMY);
const url = (q: string, locale: Locale) => {
  const parsed = ParseResultSchema.parse(parseNaturalQuery(q, vocab, { today: "2026-11-06", locale }));
  const r = autoResolve(parsed, vocab);
  return r.hasCriteria ? decodeURIComponent(buildAiSearchQuery(r.criteria, vocab)).replace(/\+/g, " ") : null;
};

describe("konuşma tanıma biçimindeki TR / EN / DE metinler mevcut URL'ye dönüşür", () => {
  it.each([
    ["tr", "kalkanda 6 kişilik jakuzili villa", "bolgeler=kalkan&guests=6&ozellikler=F:Jakuzi"],
    ["tr", "altı kişilik villa kalkan", "bolgeler=kalkan&guests=6"],
    ["tr", "kaşta köpek kabul eden villa", "villa-turleri=evcil-hayvan-izinli&bolgeler=kas"],
    ["tr", "fethiyede iki kişilik balayı villası en ucuz", "villa-turleri=balayi-villalari&bolgeler=fethiye&guests=2&sort=price-asc"],
    ["tr", "kalkan merkeze yakın deniz manzaralı villa", "villa-turleri=deniz-manzarali-villalar&bolgeler=kalkan&ozellikler=F:Merkezi Konum"],
    ["tr", "4 10 haziran üzümlüde korunaklı villa", "bolgeler=uzumlu&start=2027-06-04&end=2027-06-10&ozellikler=F:Korunaklı Havuz"],
    ["tr", "4 ile 10 haziran arası üzümlü", "bolgeler=uzumlu&start=2027-06-04&end=2027-06-10"],
    ["en", "villa in kalkan for six people with a jacuzzi", "bolgeler=kalkan&guests=6&ozellikler=F:Jakuzi"],
    ["en", "secluded pool villa in kas from the 4th to the 10th of june", "bolgeler=kas&start=2027-06-04&end=2027-06-10&ozellikler=F:Korunaklı Havuz"],
    ["en", "villa in kalkan from june 4 to june 10", "bolgeler=kalkan&start=2027-06-04&end=2027-06-10"],
    ["en", "pet friendly villa in fethiye cheapest first", "villa-turleri=evcil-hayvan-izinli&bolgeler=fethiye&sort=price-asc"],
    ["de", "villa in kalkan für sechs personen mit whirlpool", "bolgeler=kalkan&guests=6&ozellikler=F:Jakuzi"],
    ["de", "sichtgeschützte villa in kaş mit kinderpool", "villa-turleri=cocuk-havuzlu-villalar&bolgeler=kas&ozellikler=F:Korunaklı Havuz"],
    ["de", "luxusvilla mit meerblick in kalkan", "villa-turleri=luks-villalar,deniz-manzarali-villalar&bolgeler=kalkan"],
    ["de", "vom 4. bis 10. juni in kalkan", "bolgeler=kalkan&start=2027-06-04&end=2027-06-10"],
  ] as const)("[%s] %s", (locale, q, expected) => {
    expect(url(q, locale)).toBe(expected);
  });

  it("bilinen sınır: yazıyla söylenen tarih anlaşılmaz ama yanlış tarih/filtre üretilmez", () => {
    expect(url("dört on haziran üzümlüde korunaklı villa", "tr")).toBe("bolgeler=uzumlu&ozellikler=F:Korunaklı Havuz");
  });
});
