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
     • guests 0 → parametre yazılmaz · flexible yalnız tarihle
     • birden fazla villa tipi → `villa-turleri=a,b` (`/arama`'da AND)
     • sıralama → `sort` (yalnız `/arama` izin listesindeki değerler)
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

  const typeIds = c.typeIds && c.typeIds.length > 0 ? c.typeIds : c.typeId ? [c.typeId] : [];
  const qs = buildHeroSearchParams({
    categories: known(typeIds, lists.typeOptions),
    regions: known(c.regionIds, lists.regionOptions),
    startDate: c.start ? parseLocalDate(c.start) : null,
    endDate: c.end ? parseLocalDate(c.end) : null,
    guests: c.guests ?? 0,
    categoryOptions: lists.typeOptions,
    regionOptions: lists.regionOptions,
    /* Esnek tarih yalnız tarih aralığıyla anlamlı (`/arama` da öyle uygular). */
    flexible: c.start && c.end && c.flexible ? c.flexible : 0,
    features: known(c.featureIds, lists.featureOptions),
  });
  /* Sıralama `buildHeroSearchParams`'ın kapsamında değil; `/arama` ve
     FilterSidebar'ın kullandığı `sort` parametresi SONA eklenir. Değer
     zod enum'u ile `/arama` izin listesine (lib/pagination) sınırlıdır;
     filtre parametrelerine dokunulmaz. */
  if (!c.sort) return qs;
  return `${qs}${qs ? "&" : ""}sort=${encodeURIComponent(c.sort)}`;
}

/** Tarihle Ara ile aynı hedef: `localeHref('/arama?' + query, locale)`. */
export function buildAiSearchHref(
  criteria: ConfirmedCriteria,
  lists: AiSearchOptionLists,
  locale: Locale
): string {
  return localeHref(`/arama?${buildAiSearchQuery(criteria, lists)}`, locale);
}
