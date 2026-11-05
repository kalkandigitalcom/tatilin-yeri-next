/* ===============================================================
   Faz 6 Dalga 2 — merkezi okuma servisinin TABLO tabanlı sahtesi
   (yalnız test). Faz 3 zinciri: istenen → ana dil → diğer aktif diller;
   pasif dil yok; boş/boşluk değer yok sayılır. Kimlik doğrulaması
   yapmaz (UUID olmayan test kimlikleri için).
   =============================================================== */
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey, type ContentField } from "@/lib/i18n/content/content-registry";
import {
  availabilityFields,
  isContentFieldFilled,
  isExplicitEmptyContent,
} from "@/lib/i18n/content/content-field-rules";

export type Rows = Record<string, Record<string, Record<string, unknown>>>;

export const contentTables: Record<string, Rows> = {};
export const contentCtx = { root: "tr", enabled: ["tr", "en", "de"] as string[] };

export function resetContentTables() {
  for (const k of Object.keys(contentTables)) delete contentTables[k];
  contentCtx.root = "tr";
  contentCtx.enabled = ["tr", "en", "de"];
}

export function resolveContent(entity: string, ids: readonly string[], locale: string) {
  const enabled = contentCtx.enabled.includes(contentCtx.root) ? contentCtx.enabled : [contentCtx.root, ...contentCtx.enabled];
  const chain = [locale, contentCtx.root, ...enabled].filter(
    (v, i, a) => a.indexOf(v) === i && (enabled.includes(v) || v === locale)
  );
  const def = CONTENT_ENTITY_BY_KEY[entity as ContentEntityKey];
  const out = new Map<string, unknown>();
  for (const id of ids) {
    const rows = contentTables[entity]?.[id];
    if (!rows) continue;
    /* Alan listesi: kayıt defterinden (gerçek servis gibi); bilinmeyen
       varlıkta satırlardaki anahtarlar. Doluluk / bilinçli boş kuralları
       GERÇEK content-field-rules fonksiyonlarıyla. */
    const fields: ContentField[] = def
      ? [...def.fields]
      : Array.from(new Set(Object.values(rows).flatMap((r) => Object.keys(r))))
          .filter((f) => f !== "slug")
          .map((name) => ({ name, baseColumn: name, kind: "text" as const }));
    const values: Record<string, unknown> = {};
    const sourceLocale: Record<string, string | null> = {};
    const missing: string[] = [];
    const explicitEmpty: string[] = [];
    for (const f of fields) {
      let found: string | null = null;
      for (const c of chain) {
        if (!enabled.includes(c)) continue;
        const v = rows[c]?.[f.name];
        if (def && isExplicitEmptyContent(def, f, v)) {
          values[f.name] = "";
          sourceLocale[f.name] = c;
          explicitEmpty.push(f.name);
          missing.push(f.name);
          found = "explicit";
          break;
        }
        const filled = def ? isContentFieldFilled(def, f, v) : typeof v === "string" && v.trim() !== "";
        if (filled) {
          values[f.name] = v;
          sourceLocale[f.name] = c;
          found = c;
          break;
        }
      }
      if (!found) {
        values[f.name] = null;
        sourceLocale[f.name] = null;
        missing.push(f.name);
      }
    }
    const avail = def ? availabilityFields(def) : fields.map((f) => f.name);
    const isFallback = !avail.some((f) => sourceLocale[f] === locale && !explicitEmpty.includes(f));
    out.set(id, { values, sourceLocale, missing, isFallback, requestedLocale: locale, explicitEmpty });
  }
  return out;
}

/** vi.mock("@/lib/i18n/content/content-read.server", () => contentReadServerMock(spy)) */
export function contentReadServerMock(spy?: (...a: unknown[]) => void) {
  const getContentMany = async (e: string, ids: string[], l: string) => {
    spy?.(e, ids, l);
    return resolveContent(e, ids, l);
  };
  return {
    getContentMany,
    getContent: async (e: string, id: string, l: string) => (await getContentMany(e, [id], l)).get(id) ?? null,
  };
}
