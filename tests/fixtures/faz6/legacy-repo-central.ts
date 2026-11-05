/* ===============================================================
   Faz 6 Dalga 4 — ESKİ çeviri deposu sahtesinden MERKEZİ okuma sahtesi
   (yalnız test). Eski testler EN/DE satırlarını `translationRepository
   .findManyForLocale(entity, ids, locale)` sahtesiyle verir; merkezi
   servis ise TR dahil bütün dil satırlarını okur. Bu köprü:
     • TR satırı = ana tablo aynası (migration 107) → test dosyasının
       verdiği `trRows()` (ör. menü ağacındaki ad),
     • EN/DE satırları = aynı eski depo sahtesi (değişmeden),
     • dil bağlamı = gerçek kural (`contentLocaleContextFromSettings`)
       ile test ayarları,
     • zincir / doluluk = content-table-mock (gerçek alan kuralları).
   Depo hatası → gerçek servis gibi BOŞ sonuç (çağıran çökmez).
   =============================================================== */
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import { contentCtx, contentTables, resolveContent } from "./content-table-mock";

type LegacyFind = (entity: string, ids: string[], locale: "en" | "de") => Promise<{ data: unknown; error: unknown }>;
export type TrRows = Partial<Record<string, Record<string, Record<string, unknown>>>>;

export function legacyRepoCentralMock(opts: {
  findManyForLocale: LegacyFind;
  trRows: () => TrRows | Promise<TrRows>;
  settings: () => unknown;
  spy?: (entity: string, ids: readonly string[], locale: string) => void;
}) {
  const getContentMany = async (entity: string, ids: readonly string[], locale: string) => {
    opts.spy?.(entity, ids, locale);
    try {
      const settings = await Promise.resolve(opts.settings()).catch(() => null);
      const ctx = contentLocaleContextFromSettings(settings as never);
      contentCtx.root = ctx.root;
      contentCtx.enabled = [...ctx.enabled];
      const def = CONTENT_ENTITY_BY_KEY[entity as ContentEntityKey];
      const idCol = def?.parentIdColumn ?? "id";
      const rows: Record<string, Record<string, Record<string, unknown>>> = {};
      const tr = (await opts.trRows())[entity] ?? {};
      for (const id of ids) if (tr[id]) (rows[id] ??= {}).tr = tr[id];
      for (const l of ["en", "de"] as const) {
        if (!ctx.enabled.includes(l)) continue;
        const res = await opts.findManyForLocale(entity, [...ids], l);
        if (res.error) throw res.error;
        for (const r of (res.data as Record<string, unknown>[] | null) ?? []) {
          const id = String(r[idCol]);
          const { [idCol]: _id, locale: _l, ...values } = r;
          void _id;
          void _l;
          (rows[id] ??= {})[l] = values;
        }
      }
      contentTables[entity] = rows;
      return resolveContent(entity, ids, locale);
    } catch {
      return new Map();
    }
  };
  return {
    getContentMany,
    getContent: async (e: string, id: string, l: string) => (await getContentMany(e, [id], l)).get(id) ?? null,
    getAllLocales: async () => ({}),
  };
}

/** Menü ağacından TR satırları: manual → menu.name, category → villa_type.name,
 *  page → page.title (ana tablo adları; eski kanonik ad). */
export function trRowsFromMenu(nodes: unknown): TrRows {
  const out: Record<string, Record<string, Record<string, unknown>>> = { menu: {}, villa_type: {}, page: {} };
  const walk = (list: unknown) => {
    for (const n of (Array.isArray(list) ? list : []) as Record<string, unknown>[]) {
      const name = n?.name;
      if (n?.source_type === "manual" && typeof n.id === "string") out.menu[n.id] = { name };
      if (n?.source_type === "category" && typeof n.source_id === "string") out.villa_type[n.source_id] = { name };
      if (n?.source_type === "page" && typeof n.source_id === "string") out.page[n.source_id] = { title: name };
      walk(n?.children);
    }
  };
  walk(nodes);
  return out;
}

/** Ayar fikstüründen merkezi `getAllLocales("settings")` satırları:
 *  TR = ana tablo kolonları (107 aynası), EN/DE = `settings.translations`. */
export function settingsAllLocalesFrom(settings: unknown): Record<string, Record<string, unknown>> {
  const s = (settings ?? null) as (Record<string, unknown> & { translations?: Record<string, Record<string, unknown>> }) | null;
  if (!s) return {};
  const fields = CONTENT_ENTITY_BY_KEY.settings.fields.map((f) => f.name);
  const tr = Object.fromEntries(fields.map((f) => [f, (s[f] as unknown) ?? null]));
  return { tr, ...(s.translations ?? {}) };
}
