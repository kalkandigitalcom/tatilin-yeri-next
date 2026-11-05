import { CONTENT_LOCALES, type ContentEntityDef } from "@/lib/i18n/content/content-registry";
import type { ContentCoverage, ContentValues } from "@/lib/i18n/content/content-contract";
import type { ContentRow } from "@/lib/i18n/content/content-resolve";
import {
  buildBaseSupplementQuery,
  buildColumnExistsQuery,
  buildCoverageQuery,
  buildRowsQuery,
  buildSlugLookupQuery,
  buildTechnicalKeyLookupQuery,
  type SqlQuery,
} from "@/lib/i18n/content/content-sql";
import { CONTENT_BASE_SUPPLEMENTS } from "@/lib/i18n/content/content-field-rules";
import { isSupportedLocale, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🌐 MERKEZİ İÇERİK OKUMA — REPOSITORY (Seçenek D, Faz 3)
   ===============================================================
   Bağlantıdan bağımsız: `query` fonksiyonu enjekte edilir (sunucuda
   getPgPool().query, testte sahte/izole PG). Yalnız SELECT.
   Büyük kimlik listeleri CHUNK_SIZE'lık parçalara bölünür; her parça
   tek sorgudur (N kayıt için ⌈N/500⌉ sorgu, kayıt başına sorgu YOK).
   =============================================================== */

export type QueryFn = (q: SqlQuery) => Promise<{ rows: Record<string, unknown>[] }>;

export const CONTENT_ID_CHUNK_SIZE = 500;

export type ContentRepository = {
  /** Varsayılan: bütün diller (CONTENT_LOCALES) — pasif dil filtrelemesi
   *  çözümleyicide yapılır; böylece aynı dil asla iki kez sorgulanmaz. */
  fetchRows(
    def: ContentEntityDef,
    canonicalIds: readonly string[],
    locales?: readonly Locale[]
  ): Promise<ContentRow[]>;
  coverage(def: ContentEntityDef, locale: Locale): Promise<ContentCoverage>;
  findParentIdsBySlug(def: ContentEntityDef, slug: string, locale: Locale): Promise<string[]>;
  /** Faz 6 Dalga 1 — teknik anahtar (ana tablo slug'ı) → kimlik(ler). */
  findParentIdsByTechnicalKey?(def: ContentEntityDef, technicalKey: string): Promise<string[]>;
  /** Faz 3.1 — ana tablo ek yedekleri (ör. pages.content → body).
   *  Varlığın ek yedeği yoksa veya kolon şemada yoksa SORGU ATILMAZ. */
  fetchBaseSupplements?(
    def: ContentEntityDef,
    canonicalIds: readonly string[]
  ): Promise<Map<string, ContentValues>>;
};

export function createContentRepository(query: QueryFn): ContentRepository {
  /* Şema kontrolü süreç başına bir kez (başarılı sonuç cache'lenir;
     hata cache'lenmez → bir sonraki çağrı yeniden dener). */
  const columnCache = new Map<string, Promise<boolean>>();
  const columnExists = (table: string, column: string): Promise<boolean> => {
    const key = `${table}.${column}`;
    let p = columnCache.get(key);
    if (!p) {
      p = query(buildColumnExistsQuery(table, column)).then((r) => r.rows.length > 0);
      p.catch(() => columnCache.delete(key));
      columnCache.set(key, p);
    }
    return p;
  };

  return {
    async fetchBaseSupplements(def, canonicalIds) {
      const out = new Map<string, ContentValues>();
      const supplements = CONTENT_BASE_SUPPLEMENTS[def.key] ?? [];
      if (supplements.length === 0 || canonicalIds.length === 0) return out;
      const present: typeof supplements[number][] = [];
      for (const s of supplements) {
        if (await columnExists(def.parentTable, s.baseColumn)) present.push(s);
      }
      if (present.length === 0) return out;
      for (let i = 0; i < canonicalIds.length; i += CONTENT_ID_CHUNK_SIZE) {
        const chunk = canonicalIds.slice(i, i + CONTENT_ID_CHUNK_SIZE);
        const res = await query(buildBaseSupplementQuery(def, chunk, present));
        for (const r of res.rows) {
          const values: ContentValues = {};
          for (const s of present) values[s.field] = (r[s.field] ?? null) as ContentValues[string];
          out.set(String(r.parent_id).toLowerCase(), values);
        }
      }
      return out;
    },

    async fetchRows(def, canonicalIds, locales = CONTENT_LOCALES) {
      const uniqLocales = [...new Set(locales)].filter(isSupportedLocale);
      if (canonicalIds.length === 0 || uniqLocales.length === 0) return [];
      const out: ContentRow[] = [];
      for (let i = 0; i < canonicalIds.length; i += CONTENT_ID_CHUNK_SIZE) {
        const chunk = canonicalIds.slice(i, i + CONTENT_ID_CHUNK_SIZE);
        const res = await query(buildRowsQuery(def, chunk, uniqLocales));
        for (const r of res.rows) {
          const locale = r.locale;
          if (!isSupportedLocale(locale)) continue;
          const values: ContentValues = {};
          for (const f of def.fields) values[f.name] = (r[f.name] ?? null) as ContentValues[string];
          const row: ContentRow = { parentId: String(r.parent_id).toLowerCase(), locale, values };
          if (def.slugKind) row.slug = (r.slug as string | null | undefined) ?? null;
          out.push(row);
        }
      }
      return out;
    },

    async coverage(def, locale) {
      const res = await query(buildCoverageQuery(def, locale));
      const r = res.rows[0] ?? {};
      const filled: Record<string, number> = {};
      for (const f of def.fields) filled[f.name] = Number(r[`f_${f.name}`] ?? 0);
      const cov: ContentCoverage = {
        total: Number(r.total ?? 0),
        rows: Number(r.rows ?? 0),
        filled,
      };
      if (def.slugKind) cov.slugFilled = Number(r.slug_filled ?? 0);
      return cov;
    },

    async findParentIdsBySlug(def, slug, locale) {
      const res = await query(buildSlugLookupQuery(def, slug, locale));
      return res.rows.map((r) => String(r.parent_id).toLowerCase());
    },
    async findParentIdsByTechnicalKey(def, technicalKey) {
      const res = await query(buildTechnicalKeyLookupQuery(def, technicalKey));
      return res.rows.map((r) => String(r.parent_id).toLowerCase());
    },
  };
}
