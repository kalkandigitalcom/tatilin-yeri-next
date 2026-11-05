import "server-only";

import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import { isRealArrayColumn } from "@/lib/db/pg-array-columns";
import { sanitizeHtml } from "@/lib/html-sanitize";
import {
  adminCreateContent,
  adminSaveContent,
  adminSaveContentMany,
  getAdminContent,
  getAdminLocaleLayout,
  getSlugSeparationCapability,
  getTechnicalKey,
} from "@/lib/i18n/content/content-admin.server";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import {
  loadTranslationRows,
  saveTranslationRow,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🌐 VİLLA — Faz 5 dalga 2 merkezi içerik yazma
   ===============================================================
   Çevrilebilir (dil başına): description, badge, seo_title,
   seo_description + dil URL slug'ı. Villa ADI (`title`) özel isimdir,
   çevrilmez (Phase 10F) → teknik alan.
   Teknik (ana tablo, içerikle aynı transaction): ad, kapasite, konum,
   harita, havuz, depozito/temizlik alanları, SEO noindex, konaklama
   düzeni … (buildVillaCorePayload'ın içerik DIŞI anahtarları).
   `villa.slug` TEKNİK ANAHTARDIR: yalnız oluşturmada ad'dan üretilir;
   ad değişince DEĞİŞMEZ (dil URL slug'ları çeviri satırlarında).
   Fiyatlar, mesafeler, tip/özellik/kural/dahil ilişkileri, galeri,
   rezervasyon ve takvim BU YARDIMCIYA GİRMEZ — çağıran servis eskisi
   gibi ayrı yazar (fiyat/rezervasyon koduna dokunulmadı).
   =============================================================== */

export const VILLA_CONTENT_FIELDS = ["description", "badge", "seo_title", "seo_description"] as const;
const CONTENT_SET = new Set<string>(VILLA_CONTENT_FIELDS);
/** Ana tabloda üretilen / yaşam döngüsü servislerinin yönettiği kolonlar. */
const NEVER_TECHNICAL = new Set([
  "id",
  "slug",
  "created_at",
  "search_title",
  "real_title_search",
]);

type Actor = AuthorizedAdminCaller;

export type VillaWriteError = Error & { status?: number; code?: string };

function fail(message: string, code?: string): never {
  const e = new Error(message) as VillaWriteError;
  e.code = code;
  throw e;
}

export function splitVillaCore(core: Record<string, unknown>): {
  content: Record<string, unknown>;
  technical: Record<string, unknown>;
} {
  const content: Record<string, unknown> = {};
  const technical: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(core)) {
    if (v === undefined || NEVER_TECHNICAL.has(k)) continue;
    if (CONTENT_SET.has(k)) content[k] = v;
    else technical[k] = v;
  }
  return { content, technical };
}

function jsonColumnsOf(values: Record<string, unknown>): string[] {
  return Object.entries(values)
    .filter(([k, v]) =>
      v !== null && typeof v === "object" && !(v instanceof Date) && (!Array.isArray(v) || !isRealArrayColumn("villa", k))
    )
    .map(([k]) => k);
}

/** createContent için: içerik DIŞI jsonb değerleri metne çevrilir (PG
 *  kolon tipine göre jsonb'a dönüştürür). */
function technicalForInsert(values: Record<string, unknown>): Record<string, unknown> {
  const out = { ...values };
  for (const k of jsonColumnsOf(out)) out[k] = JSON.stringify(out[k]);
  return out;
}

/** Yeni villa: ana tablo + ana dil içeriği TEK transaction. */
export async function createVillaCoreCentral(
  actor: Actor,
  core: Record<string, unknown>,
  handle: string
): Promise<string> {
  const layout = await getAdminLocaleLayout();
  const { content, technical } = splitVillaCore(core);
  if (layout.root !== "tr") content.slug = handle;
  const r = await adminCreateContent(actor, {
    entity: "villa",
    technical: technicalForInsert({ ...technical, slug: handle }),
    locales: [{ locale: layout.root, patch: content }],
    title: typeof core.title === "string" ? core.title : null,
    route: "/maki-admin/villas",
  });
  if (!r.ok) fail(r.code === "conflict" ? "Bu villa adresi (slug) zaten kullanılıyor" : r.error || "Villa oluşturulamadı", r.code);
  return r.id;
}

/** Villa güncelleme: ana dil içeriği + teknik alanlar TEK transaction.
 *  Teknik anahtar YAZILMAZ. */
export async function updateVillaCoreCentral(
  actor: Actor,
  id: string,
  core: Record<string, unknown>
): Promise<void> {
  const layout = await getAdminLocaleLayout();
  const { content, technical } = splitVillaCore(core);
  const r = await adminSaveContentMany(actor, {
    entity: "villa",
    entityId: id,
    action: "content.update",
    title: typeof core.title === "string" ? core.title : null,
    route: "/maki-admin/villas",
    items: Object.keys(content).length ? [{ entity: "villa", parentId: id, locale: layout.root, patch: content }] : [],
    technical: Object.keys(technical).length
      ? [{ entity: "villa", parentId: id, values: technical, jsonColumns: jsonColumnsOf(technical) }]
      : [],
  });
  if (!r.ok) fail(r.error || "Villa güncellenemedi", r.code);
}

/** Kopyalama: kaynak villanın TÜM dillerdeki içeriği (slug HARİÇ) yeni
 *  villaya, ana tablo (teknik) alanlarıyla aynı transaction'da. */
export async function cloneVillaCoreCentral(
  actor: Actor,
  sourceId: string,
  core: Record<string, unknown>,
  handle: string
): Promise<string> {
  const layout = await getAdminLocaleLayout();
  const source = await getAdminContent("villa", sourceId);
  const { technical } = splitVillaCore(core);
  const locales: Array<{ locale: Locale; patch: Record<string, unknown> }> = [];
  for (const l of ["tr", "en", "de"] as Locale[]) {
    const row = source[l];
    if (!row) continue;
    const patch: Record<string, unknown> = {};
    for (const f of VILLA_CONTENT_FIELDS) if (row[f] !== undefined) patch[f] = row[f];
    if (l === layout.root && l !== "tr") patch.slug = handle;
    locales.push({ locale: l, patch });
  }
  if (!locales.some((x) => x.locale === layout.root)) {
    locales.push({ locale: layout.root, patch: layout.root !== "tr" ? { slug: handle } : {} });
  }
  const r = await adminCreateContent(actor, {
    entity: "villa",
    technical: technicalForInsert({ ...technical, slug: handle }),
    locales,
    title: typeof core.title === "string" ? core.title : null,
    route: "/maki-admin/villas",
  });
  if (!r.ok) fail(r.error || "Yeni villa oluşturulamadı", r.code);
  return r.id;
}

/** Düzenleme formu: içerik alanları ANA DİLİN değeriyle; `slug` = ana dil
 *  URL slug'ı (yoksa teknik anahtar). */
export async function overlayVillaRoot(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const id = String(row.id ?? "");
  const layout = await getAdminLocaleLayout();
  const [all, slugSeparated] = await Promise.all([getAdminContent("villa", id), getSlugSeparationCapability()]);
  const root = all[layout.root];
  const out: Record<string, unknown> = { ...row, technical_key: row.slug ?? null, root_locale: layout.root, slug_separated: slugSeparated };
  if (root || layout.root !== "tr") {
    for (const f of VILLA_CONTENT_FIELDS) {
      const v = root?.[f];
      out[f] = v ?? (f === "description" || f === "badge" ? "" : null);
    }
    out.slug = (root?.slug as string | null | undefined) ?? row.slug ?? "";
  }
  return out;
}

/* ---------------- Çeviri kartı ---------------- */

const LIMITS = { description: 5000, badge: 60, seo_title: 120, seo_description: 300 } as const;
const LABELS = { description: "Açıklama", badge: "Rozet", seo_title: "SEO başlık", seo_description: "SEO açıklama" } as const;
const str = (v: unknown): string | null => {
  const t = (typeof v === "string" ? v : v == null ? "" : String(v)).trim();
  return t.length ? t : null;
};

export async function loadVillaTranslationsCentral(
  villaId: string
): Promise<{ ok: true; rows: Array<{ locale: Locale } & Record<string, unknown>>; layout: AdminLocaleLayout; technicalKey: string | null; slugSeparated: boolean; rootSlug: string | null } | { ok: false; error: string }> {
  const r = await loadTranslationRows("villa", villaId, VILLA_CONTENT_FIELDS);
  if (!r.ok) return r;
  const [technicalKey, slugSeparated, all] = await Promise.all([
    getTechnicalKey("villa", villaId),
    getSlugSeparationCapability(),
    getAdminContent("villa", villaId),
  ]);
  return { ...r, technicalKey, slugSeparated, rootSlug: (all[r.layout.root]?.slug as string | null | undefined) ?? null };
}

export async function saveVillaTranslationCentral(
  actor: Actor,
  input: { villaId: string; locale: string; description?: string | null; badge?: string | null; seoTitle?: string | null; seoDescription?: string | null; slug?: string | null }
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const villaId = (input?.villaId ?? "").toString().trim();
  if (!villaId) return { ok: false, error: "Geçersiz villa" };
  const values: Record<string, string | null> = {
    description: str(input.description),
    badge: str(input.badge),
    seo_title: str(input.seoTitle),
    seo_description: str(input.seoDescription),
  };
  for (const f of VILLA_CONTENT_FIELDS) {
    const v = values[f];
    if (v && v.length > LIMITS[f]) return { ok: false, error: `${LABELS[f]} ${LIMITS[f]} karakteri geçemez` };
  }
  if (values.description) values.description = sanitizeHtml(values.description);
  const patch: Record<string, unknown> = { ...values };
  if (input.slug !== undefined) patch.slug = input.slug === null ? null : String(input.slug);
  return saveTranslationRow(actor, "villa", villaId, input.locale, patch, { route: "/maki-admin/villas" });
}

/** Ana dilin URL slug'ı (içerik ana formda düzenlenir). */
export async function saveVillaRootSlugCentral(
  actor: Actor,
  villaId: string,
  slug: string | null
): Promise<{ ok: true; slug: string | null } | { ok: false; error: string }> {
  const layout = await getAdminLocaleLayout();
  const r = await adminSaveContent(actor, {
    entity: "villa",
    parentId: villaId,
    locale: layout.root,
    patch: { slug },
    route: "/maki-admin/villas",
  });
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.code === "guard"
          ? "Türkçe URL slug'ı teknik anahtardan ayrılmadan (migration 108) değiştirilemez"
          : r.error,
    };
  }
  return { ok: true, slug: r.slug ?? null };
}
