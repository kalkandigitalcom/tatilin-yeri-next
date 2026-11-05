/* ===============================================================
   Faz 6 Dalga 2 — bellek içi içerik deposu (yalnız test).
   Merkezi okuma ÇEKİRDEĞİ (createContentReadService) gerçek haliyle
   çalışır; yalnız depo sahte. Aynı veri eski (legacy) okuyuculara da
   verilerek eski ↔ yeni karşılaştırması yapılır.
   =============================================================== */
import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import type { ContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import type { PublicContentReader } from "@/lib/i18n/content/public-villa-content";

/** varlık → kimlik → dil → alanlar (+slug). */
export type ContentFixture = Partial<
  Record<ContentEntityKey, Record<string, Partial<Record<Locale, Record<string, string | null>>>>>
>;

/** Ana tablo ek yedekleri (yalnız page: pages.content → body), kimlik → değerler. */
export type SupplementFixture = Partial<Record<ContentEntityKey, Record<string, Record<string, string | null>>>>;

export function fixtureRepository(data: () => ContentFixture, supplements?: () => SupplementFixture): ContentRepository {
  return {
    ...(supplements
      ? {
          async fetchBaseSupplements(def: Parameters<NonNullable<ContentRepository["fetchBaseSupplements"]>>[0], ids: readonly string[]) {
            const out = new Map<string, Record<string, string | null>>();
            const byId = supplements()[def.key] ?? {};
            for (const id of ids) if (byId[id]) out.set(id, byId[id]);
            return out;
          },
        }
      : {}),
    async fetchRows(def, ids, locales) {
      const out = [];
      const byId = data()[def.key] ?? {};
      for (const id of ids) {
        for (const [locale, row] of Object.entries(byId[id] ?? {})) {
          if (!row || (locales && !locales.includes(locale as Locale))) continue;
          const { slug, ...values } = row;
          out.push({ parentId: id, locale: locale as Locale, values, ...(def.slugKind ? { slug: slug ?? null } : {}) });
        }
      }
      return out;
    },
    async coverage() {
      return { total: 0, filled: {} };
    },
    async findParentIdsBySlug() {
      return [];
    },
  };
}

export function fixtureReader(
  data: () => ContentFixture,
  ctx: () => { root: Locale; enabled: readonly Locale[] },
  supplements?: () => SupplementFixture
): PublicContentReader {
  const service = createContentReadService({ repository: fixtureRepository(data, supplements), getLocaleContext: () => ctx() });
  return {
    getContent: (e, id, l) => service.getContent(e, id, l),
    getContentMany: (e, ids, l) => service.getContentMany(e, ids, l),
  };
}
