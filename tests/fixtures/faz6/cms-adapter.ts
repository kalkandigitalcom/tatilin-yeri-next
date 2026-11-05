/* ===============================================================
   Faz 6 Dalga 3 — eski CMS route testlerini TEK modüle taşıma adaptörü
   (yalnız test). Merkezi servis tablo tabanlı sahtedir:
     • TR satırı = o an okunan `pages` kaydının AYNASI (migration 107):
       title, excerpt, body, seo alanları, sections; gövde NULL ise `pages.content`
       (Faz 3.1 ek yedeği — gerçek depoda aynı kural).
     • EN/DE satırları = testin verdiği çeviri satırı (`setTranslationRow`).
   Modül yolu (`app/p/[slug]` / `en|de/p/[slug]` `locale-page`) → yeni
   `CmsPageRoutePage` (dil yoldan okunur). Bu dosya yalnız testlerde.
   =============================================================== */
import { contentTables } from "./content-table-mock";

type Row = Record<string, unknown>;
const transRows: Record<string, Row> = {};
let pageSource: () => unknown = () => null;

export function registerPageSource(fn: () => unknown) {
  pageSource = fn;
}
/** Eski `getTranslationMock.mockResolvedValue(row)` karşılığı (null → çeviri yok). */
export function setTranslationRow(row: Row | null | undefined) {
  for (const k of Object.keys(transRows)) delete transRows[k];
  if (row && typeof row.locale === "string") transRows[row.locale] = row;
}
export function resetTranslations() {
  setTranslationRow(null);
}

const pick = (r: Row) => ({
  title: r.title ?? null,
  excerpt: r.excerpt ?? null,
  body: r.body ?? null,
  seo_title: r.seo_title ?? null,
  seo_description: r.seo_description ?? null,
  sections: r.sections ?? null,
});

export async function syncPageContent() {
  const page = (await pageSource()) as Row | null | undefined;
  if (!page) {
    contentTables.page = {};
    return;
  }
  const tr = { ...pick(page), body: (page.body ?? page.content ?? null) as unknown };
  contentTables.page = { [String(page.id)]: { tr, ...Object.fromEntries(Object.entries(transRows).map(([l, r]) => [l, pick(r)])) } };
}

export function localeOfModulePath(modulePath: string): "tr" | "en" | "de" {
  return modulePath.includes("/en/") ? "en" : modulePath.includes("/de/") ? "de" : "tr";
}

/** Eski modülün `default` export'u yerine: ({ params }) → yeni tek modül. */
export function cmsPageFor(modulePath: string) {
  const locale = localeOfModulePath(modulePath);
  return async ({ params }: { params: Promise<{ slug: string }> }) => {
    const { CmsPageRoutePage } = await import("@/app/(public)/_routes/cms-page");
    return CmsPageRoutePage({ locale, params: await params, searchParams: Promise.resolve({}) });
  };
}
