import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityDef, ContentField } from "@/lib/i18n/content/content-registry";

/* ===============================================================
   🌐 MERKEZİ İÇERİK OKUMA — SQL ÜRETİCİ (Seçenek D, Faz 3, SAF)
   ===============================================================
   Tablo/kolon adları YALNIZ content-registry'den gelir ve yine de
   tırnaklanır + doğrulanır; kullanıcı girdisi (kimlik, dil, slug)
   DAİMA parametredir ($1, $2 …). Hiçbir sorgu yazma yapmaz.
   =============================================================== */

export type SqlQuery = { text: string; values: unknown[] };

const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;

export function quoteIdent(name: string): string {
  if (!IDENT_RE.test(name)) throw new Error(`content-sql: geçersiz tanımlayıcı ${name}`);
  return `"${name}"`;
}

function idArrayType(def: ContentEntityDef): string {
  return def.parentIdType === "smallint" ? "smallint[]" : "uuid[]";
}

/** Boş OLMAYAN değer koşulu (SQL tarafı; content-resolve.isEmptyContentValue ile aynı). */
export function filledPredicate(field: ContentField): string {
  const c = quoteIdent(field.name);
  if (field.kind === "jsonb") {
    return `(${c} IS NOT NULL AND ${c} NOT IN ('null'::jsonb, '[]'::jsonb, '{}'::jsonb, '""'::jsonb) AND NOT (jsonb_typeof(${c}) = 'string' AND btrim(${c} #>> '{}') = ''))`;
  }
  return `(${c} IS NOT NULL AND btrim(${c}) <> '')`;
}

/** N kayıt × M dil → TEK sorgu (N+1 yok). Parent FK text'e çevrilir
 *  (smallint/uuid farkı, büyük/küçük harf) → kimlik eşlemesi kararlı. */
export function buildRowsQuery(
  def: ContentEntityDef,
  canonicalIds: readonly string[],
  locales: readonly Locale[]
): SqlQuery {
  const cols = def.fields.map((f) => quoteIdent(f.name));
  if (def.slugKind) cols.push(`"slug"`);
  return {
    text:
      `SELECT ${quoteIdent(def.parentIdColumn)}::text AS parent_id, "locale", ${cols.join(", ")} ` +
      `FROM ${quoteIdent(def.table)} ` +
      `WHERE ${quoteIdent(def.parentIdColumn)} = ANY($1::${idArrayType(def)}) AND "locale" = ANY($2::text[])`,
    values: [canonicalIds, locales],
  };
}

/** Tek dil doluluğu: alan başına sayaç + toplam ana kayıt sayısı, TEK sorgu. */
export function buildCoverageQuery(def: ContentEntityDef, locale: Locale): SqlQuery {
  const counts = def.fields.map(
    (f) => `count(*) FILTER (WHERE ${filledPredicate(f)})::int AS ${quoteIdent(`f_${f.name}`)}`
  );
  if (def.slugKind) {
    counts.push(`count(*) FILTER (WHERE "slug" IS NOT NULL AND btrim("slug") <> '')::int AS "slug_filled"`);
  }
  return {
    text:
      `SELECT (SELECT count(*) FROM ${quoteIdent(def.parentTable)})::int AS total, ` +
      `count(*)::int AS rows, ${counts.join(", ")} ` +
      `FROM ${quoteIdent(def.table)} WHERE "locale" = $1`,
    values: [locale],
  };
}

/** Dil bazlı slug → içerik kimliği (102: partial unique (locale, slug)). */
export function buildSlugLookupQuery(def: ContentEntityDef, slug: string, locale: Locale): SqlQuery {
  if (!def.slugKind) throw new Error(`content-sql: ${def.key} slug taşımıyor`);
  return {
    text:
      `SELECT ${quoteIdent(def.parentIdColumn)}::text AS parent_id FROM ${quoteIdent(def.table)} ` +
      `WHERE "locale" = $1 AND "slug" = $2 LIMIT 2`,
    values: [locale, slug],
  };
}

/** Faz 6 Dalga 1 — TEKNİK ANAHTARdan (ana tablo `slug`) kayıt kimliği.
 *  Dispatcher dil slug'ını teknik anahtara çevirdikten sonra route'lar
 *  içeriği bu kimlikle merkezi servisten okur. Yalnız SELECT. */
export function buildTechnicalKeyLookupQuery(def: ContentEntityDef, technicalKey: string): SqlQuery {
  if (!def.slugKind) throw new Error(`content-sql: ${def.key} slug taşımıyor`);
  return {
    text: `SELECT "id"::text AS parent_id FROM ${quoteIdent(def.parentTable)} WHERE "slug" = $1 LIMIT 2`,
    values: [technicalKey],
  };
}

/** Faz 3.1 — ana tablodaki eski yedek kolon canlı şemada var mı? */
export function buildColumnExistsQuery(table: string, column: string): SqlQuery {
  quoteIdent(table);
  quoteIdent(column);
  return {
    text:
      `SELECT 1 AS ok FROM information_schema.columns ` +
      `WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1`,
    values: [table, column],
  };
}

/** Faz 3.1 — ana tablo ek yedek kolonlarını kimlik listesiyle TEK sorguda okur.
 *  Kolonlar `<alan>` adıyla döner (ör. pages.content AS "body"). */
export function buildBaseSupplementQuery(
  def: ContentEntityDef,
  canonicalIds: readonly string[],
  columns: readonly { field: string; baseColumn: string }[]
): SqlQuery {
  const cols = columns.map((c) => `${quoteIdent(c.baseColumn)} AS ${quoteIdent(c.field)}`);
  return {
    text:
      `SELECT "id"::text AS parent_id, ${cols.join(", ")} FROM ${quoteIdent(def.parentTable)} ` +
      `WHERE "id" = ANY($1::${def.parentIdType === "smallint" ? "smallint[]" : "uuid[]"})`,
    values: [canonicalIds],
  };
}
