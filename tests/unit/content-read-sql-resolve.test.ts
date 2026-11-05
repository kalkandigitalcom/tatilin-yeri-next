import { describe, expect, it } from "vitest";

import { CONTENT_ENTITIES, CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import {
  buildBaseSupplementQuery,
  buildColumnExistsQuery,
  buildCoverageQuery,
  buildRowsQuery,
  buildSlugLookupQuery,
  quoteIdent,
} from "@/lib/i18n/content/content-sql";
import {
  canonicalParentId,
  contentCacheKey,
  isEmptyContentValue,
  normalizeParentIds,
} from "@/lib/i18n/content/content-resolve";
import { createContentRepository, CONTENT_ID_CHUNK_SIZE } from "@/lib/i18n/content/content-repository";
import {
  CONTENT_CACHE_POLICY_COVERS_ALL,
  CONTENT_LEGACY_TAGS,
  contentCacheTags,
} from "@/lib/i18n/content/content-cache-policy";
import {
  contentLocaleContextFromSettings,
  sanitizeContentLocaleContext,
} from "@/lib/i18n/content/content-locale-context";

describe("Faz 3 — SQL üretici", () => {
  it("her varlık için tek SELECT; parametreli; teknik kolon yok", () => {
    for (const def of CONTENT_ENTITIES) {
      const q = buildRowsQuery(def, ["x"], ["tr", "en", "de"]);
      expect(q.text.startsWith("SELECT ")).toBe(true);
      expect(q.text).not.toMatch(/\b(INSERT|UPDATE|DELETE|created_at|updated_at)\b/);
      expect(q.text).toContain(`"${def.table}"`);
      expect(q.text).toContain(`"${def.parentIdColumn}"::text AS parent_id`);
      expect(q.text).toContain(def.parentIdType === "smallint" ? "$1::smallint[]" : "$1::uuid[]");
      for (const f of def.fields) expect(q.text).toContain(`"${f.name}"`);
      expect(q.text.includes(`"slug"`)).toBe(!!def.slugKind);
      expect(q.values).toEqual([["x"], ["tr", "en", "de"]]);
    }
  });
  it("coverage: jsonb boş dizi/obje/null dolu sayılmaz; metinde btrim", () => {
    const q = buildCoverageQuery(CONTENT_ENTITY_BY_KEY.page, "en");
    expect(q.text).toContain(`'[]'::jsonb`);
    expect(q.text).toContain(`btrim("title") <> ''`);
    expect(q.text).toContain(`FROM "pages"`);
    expect(q.text).toContain(`"slug_filled"`);
    expect(q.values).toEqual(["en"]);
  });
  it("slug sorgusu yalnız slugKind'li varlıkta", () => {
    expect(buildSlugLookupQuery(CONTENT_ENTITY_BY_KEY.villa, "a", "en").values).toEqual(["en", "a"]);
    expect(() => buildSlugLookupQuery(CONTENT_ENTITY_BY_KEY.faq, "a", "en")).toThrow();
  });
  it("Faz 3.1: ek yedek ve şema sorguları parametreli, yalnız SELECT", () => {
    const q = buildBaseSupplementQuery(CONTENT_ENTITY_BY_KEY.page, ["x"], [{ field: "body", baseColumn: "content" }]);
    expect(q.text).toBe('SELECT "id"::text AS parent_id, "content" AS "body" FROM "pages" WHERE "id" = ANY($1::uuid[])');
    expect(q.values).toEqual([["x"]]);
    const c = buildColumnExistsQuery("pages", "content");
    expect(c.text).toContain("information_schema.columns");
    expect(c.values).toEqual(["pages", "content"]);
    expect(() => buildColumnExistsQuery("pages", "x;drop")).toThrow();
  });
  it("geçersiz tanımlayıcı reddedilir", () => {
    expect(() => quoteIdent('x"; drop table y; --')).toThrow();
  });
  it("repository büyük listeyi parçalara böler, satırları eşler", async () => {
    const seen: unknown[][] = [];
    const repo = createContentRepository(async (q) => {
      seen.push(q.values[0] as unknown[]);
      return { rows: [{ parent_id: "A0000000-0000-0000-0000-000000000001", locale: "en", name: "X", extra: 1 }, { parent_id: "z", locale: "fr", name: "Y" }] };
    });
    const ids = Array.from({ length: CONTENT_ID_CHUNK_SIZE * 2 + 1 }, (_, i) => `id${i}`);
    const rows = await repo.fetchRows(CONTENT_ENTITY_BY_KEY.villa_type, ids);
    expect(seen.length).toBe(3);
    expect(rows.length).toBe(3); // fr satırları atlanır
    expect(rows[0]).toEqual({ parentId: "a0000000-0000-0000-0000-000000000001", locale: "en", values: { name: "X" }, slug: null });
    expect(await repo.fetchRows(CONTENT_ENTITY_BY_KEY.villa_type, [])).toEqual([]);
    expect(seen.length).toBe(3);
  });
  it("repository coverage sayıları sayıya çevirir", async () => {
    const repo = createContentRepository(async () => ({ rows: [{ total: "5", rows: 3, f_name: "2" }] }));
    expect(await repo.coverage(CONTENT_ENTITY_BY_KEY.menu, "de")).toEqual({ total: 5, rows: 3, filled: { name: 2 } });
  });
});

describe("Faz 3 — boşluk ve kimlik kuralları", () => {
  it("isEmptyContentValue", () => {
    expect(isEmptyContentValue(null, "text")).toBe(true);
    expect(isEmptyContentValue(undefined, "text")).toBe(true);
    expect(isEmptyContentValue("", "text")).toBe(true);
    expect(isEmptyContentValue(" \n\t", "text")).toBe(true);
    expect(isEmptyContentValue("0", "text")).toBe(false);
    expect(isEmptyContentValue([], "jsonb")).toBe(true);
    expect(isEmptyContentValue({}, "jsonb")).toBe(true);
    expect(isEmptyContentValue([{}], "jsonb")).toBe(false);
    expect(isEmptyContentValue(0, "jsonb")).toBe(false);
  });
  it("canonicalParentId", () => {
    expect(canonicalParentId(" A0000000-0000-0000-0000-00000000000F ", "uuid")).toBe("a0000000-0000-0000-0000-00000000000f");
    expect(canonicalParentId("x", "uuid")).toBeNull();
    expect(canonicalParentId(1, "smallint")).toBe("1");
    expect(canonicalParentId("007", "smallint")).toBe("7");
    expect(canonicalParentId("32768", "smallint")).toBeNull();
    expect(canonicalParentId("-1", "smallint")).toBeNull();
    expect(normalizeParentIds(["b", "a"], "smallint").canonical).toEqual([]);
  });
  it("cache anahtarı dil/ana dil/aktif dil/kimliklere duyarlı ve sıradan bağımsız (sıralı kimlik)", () => {
    const base = { op: "many", entity: "villa", requested: "en" as const, chain: ["en", "tr"] as const, root: "tr" as const, enabled: ["tr", "en"] as const, ids: ["a"] };
    const k = contentCacheKey(base);
    expect(contentCacheKey({ ...base, requested: "de" })).not.toBe(k);
    expect(contentCacheKey({ ...base, root: "en" })).not.toBe(k);
    expect(contentCacheKey({ ...base, enabled: ["tr"] })).not.toBe(k);
    expect(contentCacheKey({ ...base, ids: ["b"] })).not.toBe(k);
    const many = Array.from({ length: 50 }, (_, i) => `id${i}`);
    expect(contentCacheKey({ ...base, ids: many }).length).toBeLessThan(140);
    expect(contentCacheKey({ ...base, ids: many })).not.toBe(contentCacheKey({ ...base, ids: [...many.slice(1), "x"] }));
  });
});

describe("Faz 3 — dil bağlamı ve cache politikası", () => {
  it("settings → ana dil + aktif diller (mevcut config kuralı)", () => {
    expect(contentLocaleContextFromSettings({ multilingual_enabled: false, public_default_locale: "en" })).toEqual({ root: "tr", enabled: ["tr"] });
    expect(
      contentLocaleContextFromSettings({
        multilingual_enabled: true,
        public_default_locale: "en",
        public_locales: [
          { code: "tr", is_enabled: false, sort_order: 1 },
          { code: "en", is_enabled: true, sort_order: 0 },
          { code: "de", is_enabled: true, sort_order: 2 },
        ] as never,
      })
    ).toEqual({ root: "en", enabled: ["en", "de"] });
  });
  it("sanitize: geçersiz/tekrarlı dil atılır, ana dil eklenir", () => {
    expect(sanitizeContentLocaleContext({ root: "de", enabled: ["en", "en", "fr"] })).toEqual({ root: "de", enabled: ["de", "en"] });
  });
  it("politika 14 varlığı kapsar; tag literal'leri kaynak sabitlerle aynı", async () => {
    expect(CONTENT_CACHE_POLICY_COVERS_ALL).toBe(true);
    expect(Object.keys(CONTENT_LEGACY_TAGS).length).toBe(14);
    const fs = await import("node:fs");
    const slugSrc = fs.readFileSync("lib/i18n/routing/slug-map.server.ts", "utf8");
    expect(slugSrc).toContain('export const LOCALE_SLUGS_TAG = "locale-slugs"');
    const popupSrc = fs.readFileSync("lib/site-popup.cache.ts", "utf8");
    expect(popupSrc).toContain('export const SITE_POPUP_CACHE_TAG = "site-popup"');
    expect(contentCacheTags("faq")).toEqual(["content", "content:faq", "settings", "faqs"]);
  });
});
