import type { Locale } from "@/lib/i18n/config";
import type { ContentEntityDef } from "@/lib/i18n/content/content-registry";
import { quoteIdent, type SqlQuery } from "@/lib/i18n/content/content-sql";

/* ===============================================================
   🌐 MERKEZİ İÇERİK YAZMA — SQL ÜRETİCİ (Seçenek D, Faz 4, SAF)
   ===============================================================
   Tanımlayıcılar yalnız registry'den gelir ve quoteIdent ile doğrulanır;
   bütün değerler parametredir. Ayna bayrağı (app.content_mirror) bu
   katmanda ASLA açılmaz: servis guard'ları atlatmaz, yalnız o moddaki
   doğru tarafa yazar; diğer taraf 106 aynasıyla güncellenir.
   =============================================================== */

const idCast = (def: ContentEntityDef) => (def.parentIdType === "smallint" ? "smallint" : "uuid");

export function sqlMirrorMode(): SqlQuery {
  return { text: "SELECT public.content_mirror_mode() AS mode", values: [] };
}

export function sqlTxSettings(lockTimeoutMs: number, statementTimeoutMs: number): SqlQuery[] {
  return [
    { text: `SET LOCAL lock_timeout = '${Math.max(1, Math.floor(lockTimeoutMs))}ms'`, values: [] },
    { text: `SET LOCAL statement_timeout = '${Math.max(1, Math.floor(statementTimeoutMs))}ms'`, values: [] },
  ];
}

/** Ana kaydı kilitler (aynı kayda bütün dillerdeki yazmalar sıralanır). */
export function sqlLockParent(def: ContentEntityDef, id: string): SqlQuery {
  return {
    text: `SELECT "id"::text AS id FROM ${quoteIdent(def.parentTable)} WHERE "id" = $1::${idCast(def)} FOR UPDATE`,
    values: [id],
  };
}

/** Aynı slug'ı aynı anda talep eden oturumları sıralar (tablolar arası
 *  çakışma kontrolü yarışsız olsun). Transaction sonunda bırakılır. */
export function sqlSlugAdvisoryLock(key: string): SqlQuery {
  return { text: "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", values: [key] };
}

export function sqlNotNullColumns(table: string): SqlQuery {
  quoteIdent(table);
  return {
    text:
      "SELECT column_name FROM information_schema.columns " +
      "WHERE table_schema = current_schema() AND table_name = $1 AND is_nullable = 'NO'",
    values: [table],
  };
}

export function sqlTranslationRow(def: ContentEntityDef, id: string, locale: Locale): SqlQuery {
  const slug = def.slugKind ? `, "slug"` : "";
  return {
    text:
      `SELECT "locale"${slug} FROM ${quoteIdent(def.table)} ` +
      `WHERE ${quoteIdent(def.parentIdColumn)} = $1::${idCast(def)} AND "locale" = $2`,
    values: [id, locale],
  };
}

export function sqlSlugTakenInBase(def: ContentEntityDef, slug: string, id: string): SqlQuery {
  return {
    text: `SELECT 1 FROM ${quoteIdent(def.parentTable)} WHERE "slug" = $1 AND "id" <> $2::${idCast(def)} LIMIT 1`,
    values: [slug, id],
  };
}

export function sqlSlugTakenInTranslation(def: ContentEntityDef, slug: string, locale: Locale, id: string): SqlQuery {
  return {
    text:
      `SELECT 1 FROM ${quoteIdent(def.table)} WHERE "locale" = $1 AND "slug" = $2 ` +
      `AND ${quoteIdent(def.parentIdColumn)} <> $3::${idCast(def)} LIMIT 1`,
    values: [locale, slug, id],
  };
}

function encode(def: ContentEntityDef, name: string, value: unknown): { cast: string; value: unknown } {
  const field = def.fields.find((f) => f.name === name);
  if (field?.kind === "jsonb") return { cast: "::jsonb", value: value === null ? null : JSON.stringify(value) };
  return { cast: "", value };
}

/** Mod=base, dil=TR: ana tablonun kalıcı ayna kolonları (+ teknik slug).
 *  106 aynası aynı transaction'da tr satırını günceller. */
export function sqlUpdateBase(
  def: ContentEntityDef,
  id: string,
  fields: Record<string, unknown>,
  slug: string | null | undefined
): SqlQuery {
  const values: unknown[] = [id];
  const sets: string[] = [];
  for (const [name, raw] of Object.entries(fields)) {
    const col = def.fields.find((f) => f.name === name)?.baseColumn;
    if (!col) throw new Error(`content-write-sql: bilinmeyen alan ${name}`);
    const e = encode(def, name, raw);
    values.push(e.value);
    sets.push(`${quoteIdent(col)} = $${values.length}${e.cast}`);
  }
  if (slug !== undefined) {
    values.push(slug);
    sets.push(`"slug" = $${values.length}`);
  }
  if (sets.length === 0) throw new Error("content-write-sql: boş güncelleme");
  return {
    text: `UPDATE ${quoteIdent(def.parentTable)} SET ${sets.join(", ")} WHERE "id" = $1::${idCast(def)}`,
    values,
  };
}

/** Çeviri satırı upsert — YALNIZ gönderilen kolonlar yazılır/güncellenir;
 *  gönderilmeyen kolonlar yeni satırda varsayılan (NULL/default), mevcut
 *  satırda AYNEN kalır. `inserted` = satır bu yazmayla oluştu. */
export function sqlUpsertTranslation(
  def: ContentEntityDef,
  id: string,
  locale: Locale,
  fields: Record<string, unknown>,
  slug: string | null | undefined
): SqlQuery {
  const values: unknown[] = [id, locale];
  const cols: string[] = [];
  const params: string[] = [];
  for (const [name, raw] of Object.entries(fields)) {
    if (!def.fields.some((f) => f.name === name)) throw new Error(`content-write-sql: bilinmeyen alan ${name}`);
    const e = encode(def, name, raw);
    values.push(e.value);
    cols.push(quoteIdent(name));
    params.push(`$${values.length}${e.cast}`);
  }
  if (slug !== undefined) {
    if (!def.slugKind) throw new Error(`content-write-sql: ${def.key} slug taşımaz`);
    values.push(slug);
    cols.push(`"slug"`);
    params.push(`$${values.length}`);
  }
  if (cols.length === 0) throw new Error("content-write-sql: boş upsert");
  const fk = quoteIdent(def.parentIdColumn);
  return {
    text:
      `INSERT INTO ${quoteIdent(def.table)} (${fk}, "locale", ${cols.join(", ")}) ` +
      `VALUES ($1::${idCast(def)}, $2, ${params.join(", ")}) ` +
      `ON CONFLICT (${fk}, "locale") DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(", ")} ` +
      `RETURNING (xmax = 0) AS inserted`,
    values,
  };
}

/* ---------------------------------------------------------------
   Faz 5 — teknik anahtar / dil slug'ı ayrımı ve yeni kayıt
--------------------------------------------------------------- */

/** Migration 108 (taslak) uygulanmış mı? (TR dil slug'ı base modunda yazılabilir) */
export function sqlSlugSeparationCapability(): SqlQuery {
  return {
    text: "SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok",
    values: [],
  };
}

/** Mod=base, TR: dil slug'ı tr satırına (108 guard'ı yalnız slug değişimine izin verir).
 *  Teknik anahtar (ana tablo slug'ı) ASLA değişmez. */
export function sqlUpdateMirrorSlug(def: ContentEntityDef, id: string, locale: Locale, slug: string | null): SqlQuery {
  if (!def.slugKind) throw new Error(`content-write-sql: ${def.key} slug taşımaz`);
  return {
    text:
      `UPDATE ${quoteIdent(def.table)} SET "slug" = $3 ` +
      `WHERE ${quoteIdent(def.parentIdColumn)} = $1::${idCast(def)} AND "locale" = $2`,
    values: [id, locale, slug],
  };
}

/** Yeni ana kayıt: teknik kolonlar (çağıran sunucu kodu verir) + NOT NULL
 *  içerik kolonları için yer tutucu ('' / '[]'). İçerik ayrıca saveContent
 *  ile ana dilde yazılır. */
export function sqlInsertParent(
  def: ContentEntityDef,
  technical: Record<string, unknown>,
  placeholders: Record<string, unknown>
): SqlQuery {
  const cols: string[] = [];
  const params: string[] = [];
  const values: unknown[] = [];
  for (const [col, raw] of [...Object.entries(technical), ...Object.entries(placeholders)]) {
    const isJson = def.fields.some((f) => f.baseColumn === col && f.kind === "jsonb");
    values.push(isJson && raw !== null ? JSON.stringify(raw) : raw);
    cols.push(quoteIdent(col));
    params.push(`$${values.length}${isJson ? "::jsonb" : ""}`);
  }
  if (cols.length === 0) {
    return { text: `INSERT INTO ${quoteIdent(def.parentTable)} DEFAULT VALUES RETURNING "id"::text AS id`, values };
  }
  return {
    text: `INSERT INTO ${quoteIdent(def.parentTable)} (${cols.join(", ")}) VALUES (${params.join(", ")}) RETURNING "id"::text AS id`,
    values,
  };
}

/** Faz 5 dalga 2 — ana tablonun İÇERİK DIŞI (teknik) kolonları, içerikle
 *  AYNI transaction'da. İçerik kolonları ve teknik anahtar (`slug`)
 *  çekirdekte reddedilir. jsonColumns → JSON.stringify + ::jsonb. */
export function sqlUpdateTechnical(
  def: ContentEntityDef,
  id: string,
  values: Record<string, unknown>,
  jsonColumns: readonly string[] = []
): SqlQuery {
  const params: unknown[] = [id];
  const sets: string[] = [];
  for (const [col, raw] of Object.entries(values)) {
    const isJson = jsonColumns.includes(col);
    params.push(isJson && raw !== null && raw !== undefined ? JSON.stringify(raw) : raw);
    sets.push(`${quoteIdent(col)} = $${params.length}${isJson ? "::jsonb" : ""}`);
  }
  if (sets.length === 0) throw new Error("content-write-sql: boş teknik güncelleme");
  return {
    text: `UPDATE ${quoteIdent(def.parentTable)} SET ${sets.join(", ")} WHERE "id" = $1::${idCast(def)}`,
    values: params,
  };
}
