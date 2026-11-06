/* Ortak test verisi — `/api/public/taxonomies` cevabı biçiminde,
   canlı adlarla aynı yazımda (repo içindeki örneklerden alındı). */
import type { TaxonomyResponse } from "@/lib/ai-search/schema";

export const TODAY = "2026-11-06";

export const TAXONOMY: TaxonomyResponse = {
  ok: true,
  locations: [
    { id: "loc-kalkan", name: "Kalkan", slug: "kalkan", filter_group_name: "Kalkan" },
    { id: "loc-islamlar", name: "İslamlar", slug: "islamlar", filter_group_name: "Kalkan" },
    { id: "loc-kas", name: "Kaş", slug: "kas", filter_group_name: "Kaş" },
    { id: "loc-fethiye", name: "Fethiye", slug: "fethiye", filter_group_name: "Fethiye" },
    { id: "loc-oludeniz", name: "Ölüdeniz", slug: "oludeniz", filter_group_name: "Fethiye" },
    { id: "loc-nosl", name: "Gelemiş", slug: null, filter_group_name: "Kalkan" },
  ],
  types: [
    {
      id: "type-muh",
      name: "Muhafazakar Villalar",
      slug: "muhafazakar-villalar",
      name_by_locale: { en: "Conservative Villas", de: "Konservative Villen" },
    },
    {
      id: "type-bal",
      name: "Balayı Villaları",
      slug: "balayi-villalari",
      name_by_locale: { en: "Honeymoon Villas", de: "Flitterwochen-Villen" },
    },
    { id: "type-luks", name: "Lüks Villalar", slug: "luks-villalar", name_by_locale: {} },
  ],
  features: [
    { id: "f-jak", name: "Jakuzi", name_by_locale: { en: "Jacuzzi", de: "Whirlpool" } },
    { id: "f-kor", name: "Korunaklı Havuz", name_by_locale: { en: "Secluded Pool", de: "Geschützter Pool" } },
    { id: "f-kap", name: "Kapalı Havuz", name_by_locale: {} },
    { id: "f-sau", name: "Sauna", name_by_locale: {} },
    { id: "f-den", name: "Deniz Manzarası", name_by_locale: { en: "Sea View", de: "Meerblick" } },
  ],
};
