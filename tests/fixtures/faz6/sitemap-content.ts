/* ===============================================================
   Faz 6 Dalga 5 — sitemap'in merkezi okuyucusunun sahtesi (yalnız test).
   Tablo tabanlı merkezi sahte (gerçek alan kuralları + Faz 3 zinciri);
   dil bağlamı sitemap'e verilen AYARDAN (gerçek kural). `fail` verilen
   varlıklar okuma hatası gibi davranır (boş sonuç + failed işareti).
   vi.mock("@/lib/i18n/content/public-seo-content.server", () => sitemapReaderMock(() => data))
   =============================================================== */
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { contentCtx, contentTables, resolveContent, type Rows } from "./content-table-mock";

export type SitemapContentData = Partial<Record<string, Rows>>;

export function sitemapReaderMock(
  data: () => SitemapContentData,
  opts: { fail?: () => readonly string[]; spy?: (e: string, ids: readonly string[], l: string) => void } = {}
) {
  return {
    createSitemapContentReader(settings: unknown) {
      const failed = new Set<ContentEntityKey>();
      const ctx = contentLocaleContextFromSettings(settings as never);
      const getContentMany = async (e: string, ids: readonly string[], l: string) => {
        opts.spy?.(e, ids, l);
        if (opts.fail?.().includes(e)) {
          failed.add(e as ContentEntityKey);
          return new Map();
        }
        contentCtx.root = ctx.root;
        contentCtx.enabled = [...ctx.enabled];
        for (const k of Object.keys(contentTables)) delete contentTables[k];
        Object.assign(contentTables, data());
        return resolveContent(e, ids, l);
      };
      return {
        reader: {
          getContentMany,
          getContent: async (e: string, id: string, l: string) => (await getContentMany(e, [id], l)).get(id) ?? null,
        },
        failed,
      };
    },
  };
}
