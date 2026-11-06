import { parseLocalDate } from "@/lib/date-format";
import { localeHref } from "@/lib/i18n/locale-href";
import type { Locale } from "@/lib/i18n/config";
import {
  ConfirmedCriteriaSchema,
  type ConfirmedCriteria,
} from "@/lib/ai-search/schema";

import { buildHeroSearchParams } from "./build-search-params";

import type { FilterOption } from "../_types/hero";

/* ===============================================================
   🔗 AI ARAMA → MEVCUT `/arama` URL'Sİ (SAF)
   ===============================================================
   İkinci bir URL kurucu YOKTUR: onaylanan kriterler, "Tarihle Ara"
   panelinin `handleSearch`'ü ile AYNI fonksiyona
   (`buildHeroSearchParams`) aynı şekilde verilir:
     • categories/regions → `slug || id` zinciri (Türkçe teknik slug)
     • tarih → yerel `Date` (`parseLocalDate`) → `formatHeroDate`
     • guests 0 → parametre yazılmaz · flexible 0 → yazılmaz
   Villa tipi TEK seçimdir (`/arama` tiplerde AND uygular).
   Zod: kriterler son kez doğrulanır; listede olmayan id atılır.
   =============================================================== */

export type AiSearchOptionLists = {
  regionOptions: FilterOption[];
  typeOptions: FilterOption[];
  featureOptions: FilterOption[];
};

export function buildAiSearchQuery(
  criteria: ConfirmedCriteria,
  lists: AiSearchOptionLists
): string {
  const c = ConfirmedCriteriaSchema.parse(criteria);
  const known = (ids: string[], opts: FilterOption[]) =>
    Array.from(new Set(ids)).filter((id) => opts.some((o) => o.id === id));

  return buildHeroSearchParams({
    categories:
      c.typeId && lists.typeOptions.some((o) => o.id === c.typeId) ? [c.typeId] : [],
    regions: known(c.regionIds, lists.regionOptions),
    startDate: c.start ? parseLocalDate(c.start) : null,
    endDate: c.end ? parseLocalDate(c.end) : null,
    guests: c.guests ?? 0,
    categoryOptions: lists.typeOptions,
    regionOptions: lists.regionOptions,
    flexible: 0,
    features: known(c.featureIds, lists.featureOptions),
  });
}

/** Tarihle Ara ile aynı hedef: `localeHref('/arama?' + query, locale)`. */
export function buildAiSearchHref(
  criteria: ConfirmedCriteria,
  lists: AiSearchOptionLists,
  locale: Locale
): string {
  return localeHref(`/arama?${buildAiSearchQuery(criteria, lists)}`, locale);
}
