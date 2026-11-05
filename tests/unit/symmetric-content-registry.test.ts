/* ===============================================================
   🌐 SEÇENEK D — FAZ 1: simetrik içerik kaydı + migration 105
   ===============================================================
   Canlı DB YOK. Migration 105 izole PostgreSQL 16'da ayrıca test
   edildi (bkz. Claude outputs/faz-1-uygulama-raporu.md). Burada:
     • content-registry ↔ TRANSLATION_ENTITY_CONFIG tutarlılığı
     • kayıttaki her çeviri alanının migration'larda tanımlı olması
     • migration 105'in yapısal sözleşmesi (veri taşımaz, idempotent,
       guard 14 tabloya bağlı, ana tablo guard'ı bağlı değil)
     • okuma sırası (istenen → ana dil → diğer aktif diller)
   =============================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

import {
  CONTENT_ENTITIES,
  CONTENT_ENTITY_BY_KEY,
  CONTENT_LOCALES,
  CONTENT_MIRROR_FLAG,
  CONTENT_MIRROR_MODES,
  contentFallbackChain,
} from "@/lib/i18n/content/content-registry";
import { TRANSLATION_ENTITY_CONFIG } from "@/lib/i18n/translations.types";

const MIG_DIR = join(process.cwd(), "db/migrations");
const sql105 = readFileSync(join(MIG_DIR, "105_symmetric_content_foundation.sql"), "utf8");

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

/** Bir tablonun migration'larda tanımlanan kolonları (CREATE TABLE + ADD COLUMN − DROP COLUMN). */
function migrationColumns(table: string): Set<string> {
  const cols = new Set<string>();
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const s = stripComments(readFileSync(join(MIG_DIR, file), "utf8"));
    const create = new RegExp(
      `CREATE TABLE IF NOT EXISTS public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
      "i"
    ).exec(s);
    if (create) {
      for (const line of create[1].split("\n")) {
        const m = /^\s*([a-z_]+)\s+(uuid|text|jsonb|smallint|timestamptz|boolean)/i.exec(line);
        if (m) cols.add(m[1]);
      }
    }
    for (const stmt of s.split(";")) {
      if (!new RegExp(`ALTER TABLE (IF EXISTS )?public\\.${table}\\b`, "i").test(stmt)) continue;
      for (const m of stmt.matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/gi)) cols.add(m[1]);
      for (const m of stmt.matchAll(/DROP COLUMN IF EXISTS\s+([a-z_]+)/gi)) cols.delete(m[1]);
    }
  }
  return cols;
}

/** 102 `slug` kolonunu dinamik EXECUTE ile ekler; tablo listesi dizideki. */
const SLUG_TABLES_102 = new Set(
  [
    ...(/tables\s+text\[\]\s*:=\s*ARRAY\[([^\]]+)\]/i.exec(
      readFileSync(join(MIG_DIR, "102_translation_slugs.sql"), "utf8")
    )?.[1] ?? "").matchAll(/'([a-z_]+)'/g),
  ].map((m) => m[1])
);

describe("content-registry", () => {
  it("14 varlık; anahtarlar ve tablolar tekil", () => {
    expect(CONTENT_ENTITIES).toHaveLength(14);
    expect(new Set(CONTENT_ENTITIES.map((e) => e.key)).size).toBe(14);
    expect(new Set(CONTENT_ENTITIES.map((e) => e.table)).size).toBe(14);
    expect(CONTENT_ENTITY_BY_KEY.villa.table).toBe("villa_translations");
  });

  it("TRANSLATION_ENTITY_CONFIG ile tablo ve parent FK birebir aynı", () => {
    for (const [key, cfg] of Object.entries(TRANSLATION_ENTITY_CONFIG)) {
      const def = CONTENT_ENTITY_BY_KEY[key as keyof typeof CONTENT_ENTITY_BY_KEY];
      expect(def, key).toBeDefined();
      expect(def.table).toBe(cfg.table);
      expect(def.parentIdColumn).toBe(cfg.parentIdColumn);
    }
  });

  it("kayıttaki her çeviri alanı, parent FK ve slug migration'larda tanımlı", () => {
    for (const e of CONTENT_ENTITIES) {
      const cols = migrationColumns(e.table);
      expect(cols.has("locale"), `${e.table}.locale`).toBe(true);
      expect(cols.has(e.parentIdColumn), `${e.table}.${e.parentIdColumn}`).toBe(true);
      for (const field of e.fields) {
        expect(cols.has(field.name), `${e.table}.${field.name}`).toBe(true);
        expect(field.baseColumn).toBe(field.name);
      }
      if (e.slugKind) expect(SLUG_TABLES_102.has(e.table), `${e.table}.slug (102)`).toBe(true);
    }
  });

  it("slug'lı varlıklar 102'nin tablolarıyla birebir", () => {
    expect([...SLUG_TABLES_102].sort()).toEqual(
      CONTENT_ENTITIES.filter((e) => e.slugKind).map((e) => e.table).sort()
    );
  });

  it("settings çevirisinde 084 ile kaldırılan maintenance_message yok", () => {
    expect(migrationColumns("settings_translations").has("maintenance_message")).toBe(false);
    expect(CONTENT_ENTITY_BY_KEY.settings.fields.map((x) => x.name)).not.toContain(
      "maintenance_message"
    );
  });

  it("sabitler", () => {
    expect(CONTENT_LOCALES).toEqual(["tr", "en", "de"]);
    expect(CONTENT_MIRROR_MODES).toEqual(["base", "translations"]);
    expect(CONTENT_MIRROR_FLAG).toBe("app.content_mirror");
  });
});

describe("contentFallbackChain — istenen → ana dil → diğer aktif diller", () => {
  it("üç dil açık", () => {
    expect(contentFallbackChain("de", "en", ["tr", "en", "de"])).toEqual(["de", "en", "tr"]);
    expect(contentFallbackChain("tr", "tr", ["tr", "en", "de"])).toEqual(["tr", "en", "de"]);
    expect(contentFallbackChain("en", "de", ["de", "tr", "en"])).toEqual(["en", "de", "tr"]);
  });
  it("kapalı diller zincire girmez", () => {
    expect(contentFallbackChain("de", "en", ["tr", "en"])).toEqual(["en", "tr"]);
    expect(contentFallbackChain("en", "en", ["en"])).toEqual(["en"]);
  });
});

describe("migration 105 — yapısal sözleşme", () => {
  const body = stripComments(sql105);

  it("tek transaction", () => {
    expect(body.trim().startsWith("BEGIN;")).toBe(true);
    expect(body.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("veri taşımaz (INSERT/UPDATE/DELETE veri ifadesi yok)", () => {
    expect(body).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(body).not.toMatch(/\bUPDATE\s+public\./i);
    expect(body).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(body).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(body).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });

  it("settings ve popup çevirileri TR kabul eder", () => {
    for (const t of ["settings_translations", "site_popup_translations"]) {
      expect(body).toMatch(
        new RegExp(`ADD CONSTRAINT ${t}_locale_check\\s+CHECK \\(locale IN \\('tr', 'en', 'de'\\)\\)`)
      );
      expect(body).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${t}_locale_check`));
    }
  });

  it("mod fonksiyonu yalnız YOKSA 'base' ile oluşturulur (tekrar çalıştırma modu geri çevirmez)", () => {
    expect(body).toMatch(/IF NOT EXISTS \([\s\S]*?proname = 'content_mirror_mode'/);
    expect(body).toMatch(/SELECT 'base'::text/);
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION public\.content_mirror_mode/);
  });

  it("TR guard'ı kayıttaki 14 çeviri tablosuna doğru parent/FK ile bağlanır", () => {
    const rows = [...body.matchAll(/\('([a-z_]+_translations)',\s*'([a-z_]+)',\s*'([a-z_]+)'\)/g)].map(
      (m) => ({ table: m[1], parent: m[2], fk: m[3] })
    );
    expect(rows).toHaveLength(14);
    for (const e of CONTENT_ENTITIES) {
      expect(rows, e.table).toContainEqual({ table: e.table, parent: e.parentTable, fk: e.parentIdColumn });
    }
    expect(body).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.%I/);
  });

  it("ana tablo guard'ı tanımlı ama hiçbir tabloya BAĞLI DEĞİL", () => {
    expect(body).toMatch(/CREATE OR REPLACE FUNCTION public\.trg_content_base_guard\(\)/);
    expect(body).not.toMatch(/EXECUTE FUNCTION public\.trg_content_base_guard/);
  });

  it("guard yalnız locale=tr'ye ve base moduna bakar; ayna bayrağını tanır; cascade silmeye izin verir", () => {
    expect(body).toMatch(/NEW\.locale = 'tr'/);
    expect(body).toMatch(/content_mirror_mode\(\) = 'translations'/);
    expect(body).toMatch(/current_setting\('app\.content_mirror', true\) = 'on'/);
    expect(body).toMatch(/v_parent_alive/);
  });

  it("custom_title çeviri tabloları: CASCADE FK, UNIQUE(parent, locale), CHECK, updated_at trigger", () => {
    for (const [t, parent] of [
      ["homepage_collection_translations", "homepage_collections"],
      ["discount_collection_translations", "discount_collections"],
    ]) {
      expect(body).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`));
      expect(body).toMatch(
        new RegExp(`collection_id\\s+uuid NOT NULL REFERENCES public\\.${parent} \\(id\\) ON DELETE CASCADE`)
      );
      expect(body).toMatch(new RegExp(`${t}_collection_locale_key UNIQUE \\(collection_id, locale\\)`));
      expect(body).toMatch(new RegExp(`${t}_locale_check CHECK \\(locale IN \\('tr', 'en', 'de'\\)\\)`));
      expect(body).toMatch(new RegExp(`${t}_touch_updated_at`));
    }
  });
});
