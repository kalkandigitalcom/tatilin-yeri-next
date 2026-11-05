import { describe, expect, it, vi } from "vitest";

import { CONTENT_ENTITIES, CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import { contentWriteTarget, validateContentPayload } from "@/lib/i18n/content/content-write-validate";
import {
  createContentWriteService,
  mapPgError,
  type TransactionRunner,
  type TxQuery,
} from "@/lib/i18n/content/content-write-core";
import { sqlUpdateBase, sqlUpsertTranslation } from "@/lib/i18n/content/content-write-sql";
import type { ContentWriteItem } from "@/lib/i18n/content/content-contract";

/* Faz 4 — merkezi yazma çekirdeği: sahte transaction ile davranış testleri.
   Gerçek DB davranışı (ayna, guard, slug geçmişi, eşzamanlılık) izole PG
   entegrasyon testindedir (tests/integration/content-write-pg.test.ts). */

const V = (n: number) => `a0000000-0000-0000-0000-00000000000${n}`;
const ACTOR = { actorId: "admin-1" };

type Opts = {
  mode?: string;
  missingParents?: string[];
  notNull?: Record<string, string[]>;
  slugTakenBase?: string[];
  slugTakenTr?: string[];
  trSlugAfter?: string | null;
  /** Faz 5: migration 108 (dil slug ayrımı) uygulanmış mı. */
  slugSeparated?: boolean;
  /** Faz 5: tr satırı UPDATE'inde etkilenen satır sayısı. */
  trRowCount?: number;
  failOn?: (text: string) => unknown | undefined;
};

function fakeTx(opts: Opts = {}) {
  const log: string[] = [];
  let tx = 0;
  let rolledBack = 0;
  const q: TxQuery = async (text, values = []) => {
    log.push(text);
    const f = opts.failOn?.(text);
    if (f) throw f;
    if (text.startsWith("SET LOCAL")) return { rows: [] };
    if (text.includes("content_mirror_mode()")) return { rows: [{ mode: opts.mode ?? "base" }] };
    if (text.includes("FOR UPDATE")) {
      return { rows: (opts.missingParents ?? []).includes(String(values[0])) ? [] : [{ id: values[0] }] };
    }
    if (text.includes("pg_advisory_xact_lock")) return { rows: [{}] };
    if (text.includes("content_language_slugs_separated")) return { rows: [{ ok: opts.slugSeparated ?? true }] };
    if (text.startsWith(`UPDATE "villa_translations" SET "slug"`)) return { rows: [], rowCount: opts.trRowCount ?? 1 };
    if (text.includes("information_schema.columns")) {
      return { rows: (opts.notNull?.[String(values[0])] ?? []).map((c) => ({ column_name: c })) };
    }
    if (text.includes(`WHERE "slug" = $1 AND "id" <>`)) {
      return { rows: (opts.slugTakenBase ?? []).includes(String(values[0])) ? [{}] : [] };
    }
    if (text.includes(`WHERE "locale" = $1 AND "slug" = $2`)) {
      return { rows: (opts.slugTakenTr ?? []).includes(String(values[1])) ? [{}] : [] };
    }
    if (text.startsWith(`SELECT "locale"`)) {
      return { rows: [{ locale: values[1], slug: opts.trSlugAfter === undefined ? "deniz-villa" : opts.trSlugAfter }] };
    }
    if (text.startsWith("UPDATE")) return { rows: [], rowCount: 1 };
    if (text.startsWith("INSERT")) return { rows: [{ inserted: true }] };
    throw new Error("beklenmeyen sorgu " + text);
  };
  const transaction: TransactionRunner = async (fn) => {
    tx++;
    try {
      return await fn(q);
    } catch (e) {
      rolledBack++;
      throw e;
    }
  };
  return { log, transaction, stats: () => ({ tx, rolledBack }) };
}

function svc(opts: Opts = {}, enabled = true) {
  const t = fakeTx(opts);
  const onCommitted = vi.fn();
  const onError = vi.fn();
  const s = createContentWriteService({ transaction: t.transaction, enabled: () => enabled, onCommitted, onError });
  return { s, ...t, onCommitted, onError };
}

describe("Faz 4 — validateContentPayload", () => {
  const villa = CONTENT_ENTITY_BY_KEY.villa;
  it("eksik / null / boş ayrımı korunur", () => {
    const r = validateContentPayload(villa, "en", { description: "", badge: null, seo_title: undefined });
    expect(r).toEqual({ ok: true, value: { fields: { description: "", badge: null } } });
  });
  it("teknik ve bilinmeyen alanlar reddedilir", () => {
    for (const k of ["id", "villa_id", "locale", "created_at", "updated_at", "title", "foo"]) {
      const r = validateContentPayload(villa, "en", { [k]: "x" });
      expect(r.ok).toBe(false);
    }
  });
  it("boş patch ve yalnız undefined reddedilir; nesne olmayan patch reddedilir", () => {
    expect(validateContentPayload(villa, "en", {}).ok).toBe(false);
    expect(validateContentPayload(villa, "en", { badge: undefined }).ok).toBe(false);
    expect(validateContentPayload(villa, "en", null).ok).toBe(false);
    expect(validateContentPayload(villa, "en", ["x"]).ok).toBe(false);
    expect(validateContentPayload(villa, "fr", { badge: "x" }).ok).toBe(false);
  });
  it("tip kontrolleri: metin, sections, stats", () => {
    expect(validateContentPayload(villa, "tr", { description: 5 }).ok).toBe(false);
    const page = CONTENT_ENTITY_BY_KEY.page;
    expect(validateContentPayload(page, "en", { sections: [{ type: "richtext", content: "x" }] }).ok).toBe(true);
    expect(validateContentPayload(page, "en", { sections: null }).ok).toBe(true);
    expect(validateContentPayload(page, "en", { sections: { a: 1 } }).ok).toBe(false);
    const popup = CONTENT_ENTITY_BY_KEY.site_popup;
    expect(validateContentPayload(popup, "en", { stats: ["a", "b"] }).ok).toBe(true);
    expect(validateContentPayload(popup, "en", { stats: null }).ok).toBe(false);
    expect(validateContentPayload(popup, "en", { stats: ["1", "2", "3", "4", "5"] }).ok).toBe(false);
    expect(validateContentPayload(popup, "en", { stats: [{ v: 1 }] }).ok).toBe(false);
    expect(validateContentPayload(popup, "en", { highlight_text: "x".repeat(25) }).ok).toBe(false);
    expect(validateContentPayload(popup, "en", { title: "x".repeat(200) }).ok).toBe(true);
  });
  it("slug: normalizasyon, format, ayrılmış kelime, slug'sız varlık", () => {
    expect(validateContentPayload(villa, "en", { slug: "  Deniz Manzaralı " })).toEqual({ ok: true, value: { fields: {}, slug: "deniz-manzarali" } });
    expect(validateContentPayload(villa, "en", { slug: "" })).toEqual({ ok: true, value: { fields: {}, slug: null } });
    expect(validateContentPayload(villa, "en", { slug: "a_b" }).ok).toBe(false);
    expect(validateContentPayload(villa, "en", { slug: "success" }).ok).toBe(false);
    expect(validateContentPayload(villa, "en", { slug: 5 }).ok).toBe(false);
    expect(validateContentPayload(CONTENT_ENTITY_BY_KEY.faq, "en", { slug: "x" }).ok).toBe(false);
  });
  it("14 varlığın her alanı kabul edilir", () => {
    for (const def of CONTENT_ENTITIES) {
      for (const f of def.fields) {
        const v = f.kind === "jsonb" ? (f.name === "stats" ? [] : []) : "x";
        expect({ e: def.key, f: f.name, ok: validateContentPayload(def, "de", { [f.name]: v }).ok }).toEqual({ e: def.key, f: f.name, ok: true });
      }
    }
  });
});

describe("Faz 4 — hedef seçimi (mod + dil; ana dil belirleyici değil)", () => {
  it("base: TR → ana tablo, EN/DE → çeviri; translations: hepsi çeviri", () => {
    expect(contentWriteTarget("tr", "base")).toBe("base");
    expect(contentWriteTarget("en", "base")).toBe("translation");
    expect(contentWriteTarget("de", "base")).toBe("translation");
    expect(contentWriteTarget("tr", "translations")).toBe("translation");
  });
  it("SQL: base güncellemesi ana kolonlara, upsert yalnız gönderilen kolonlara", () => {
    const u = sqlUpdateBase(CONTENT_ENTITY_BY_KEY.villa, V(1), { description: "d", badge: null }, "deniz");
    expect(u.text).toBe(`UPDATE "villa" SET "description" = $2, "badge" = $3, "slug" = $4 WHERE "id" = $1::uuid`);
    const i = sqlUpsertTranslation(CONTENT_ENTITY_BY_KEY.page, V(1), "en", { sections: [{ type: "x" }] }, undefined);
    expect(i.text).toContain(`("page_id", "locale", "sections") VALUES ($1::uuid, $2, $3::jsonb)`);
    expect(i.text).toContain(`DO UPDATE SET "sections" = EXCLUDED."sections" RETURNING (xmax = 0) AS inserted`);
    expect(i.values[2]).toBe('[{"type":"x"}]');
    const p = sqlUpsertTranslation(CONTENT_ENTITY_BY_KEY.site_popup, "1", "de", { title: "t" }, undefined);
    expect(p.text).toContain("$1::smallint");
    expect(sqlUpdateBase(CONTENT_ENTITY_BY_KEY.site_popup, "1", { title: "t" }, undefined).text).not.toContain("slug");
  });
});

describe("Faz 4 — saveContent / saveContentMany (sahte transaction)", () => {
  it("servis kapalıyken (varsayılan) hiçbir sorgu atılmaz", async () => {
    const { s, log } = svc({}, false);
    expect(await s.saveContent("villa", V(1), "en", { badge: "x" }, ACTOR)).toMatchObject({ ok: false, code: "disabled" });
    expect(log).toEqual([]);
  });
  it("actorId zorunlu", async () => {
    const { s, log } = svc();
    expect(await s.saveContent("villa", V(1), "en", { badge: "x" }, { actorId: " " })).toMatchObject({ ok: false, code: "validation", field: "actorId" });
    expect(log).toEqual([]);
  });
  it("mod=base, EN: çeviri upsert; created bilgisi; onCommitted bir kez", async () => {
    const { s, log, onCommitted } = svc();
    const r = await s.saveContent("villa", V(1), "en", { description: "EN", slug: "Sea Villa" }, ACTOR);
    expect(r).toEqual({ ok: true, created: true, target: "translation", mode: "base", written: ["description", "slug"], slug: "sea-villa" });
    expect(log.some((x) => x.startsWith(`INSERT INTO "villa_translations"`))).toBe(true);
    expect(log.some((x) => x.startsWith("UPDATE"))).toBe(false);
    expect(onCommitted).toHaveBeenCalledWith({ entities: ["villa"], slugChanged: true });
  });
  /* Faz 5 kararı: ana tablo slug'ı TEKNİK ANAHTAR — servis onu ASLA yazmaz;
     TR URL slug'ı tr çeviri satırına (migration 108 guard'ı yalnız slug'a izin verir). */
  it("mod=base, TR: içerik ana tabloya, TR URL slug'ı tr satırına; teknik anahtar YAZILMAZ", async () => {
    const { s, log } = svc();
    const r = await s.saveContent("villa", V(1), "tr", { description: "TR", slug: "deniz-villa" }, ACTOR);
    expect(r).toMatchObject({ ok: true, target: "base", mode: "base", created: false });
    expect(log.filter((x) => x.startsWith("UPDATE"))).toEqual([
      `UPDATE "villa" SET "description" = $2 WHERE "id" = $1::uuid`,
      `UPDATE "villa_translations" SET "slug" = $3 WHERE "villa_id" = $1::uuid AND "locale" = $2`,
    ]);
    expect(log.some((x) => /UPDATE "villa" SET[^]*"slug"/.test(x))).toBe(false);
    expect(log.some((x) => x.startsWith("INSERT"))).toBe(false);
  });
  it("mod=translations, TR: çeviri satırına yazar (ayna ana kolonu günceller)", async () => {
    const { s, log } = svc({ mode: "translations" });
    const r = await s.saveContent("villa", V(1), "tr", { description: "TR" }, ACTOR);
    expect(r).toMatchObject({ ok: true, target: "translation", mode: "translations" });
    expect(log.some((x) => x.startsWith(`INSERT INTO "villa_translations"`))).toBe(true);
    expect(log.some((x) => x.startsWith("UPDATE"))).toBe(false);
  });
  it("bilinmeyen mod → guard, yazma yok", async () => {
    const { s, log } = svc({ mode: "weird" });
    expect(await s.saveContent("villa", V(1), "en", { badge: "x" }, ACTOR)).toMatchObject({ ok: false, code: "guard" });
    expect(log.some((x) => x.startsWith("INSERT") || x.startsWith("UPDATE"))).toBe(false);
  });
  it("mod=base TR slug: 108 yoksa guard (rollback); null serbest (teknik anahtara düşer); tr satırı yoksa not-found", async () => {
    const a = svc({ slugSeparated: false });
    expect(await a.s.saveContent("villa", V(1), "tr", { slug: "yeni" }, ACTOR)).toMatchObject({ ok: false, code: "guard", field: "slug" });
    expect(a.stats().rolledBack).toBe(1);
    expect(a.onCommitted).not.toHaveBeenCalled();
    const b = svc();
    expect(await b.s.saveContent("villa", V(1), "tr", { slug: null }, ACTOR)).toMatchObject({ ok: true, slug: null, target: "base" });
    const c = svc({ trRowCount: 0 });
    expect(await c.s.saveContent("villa", V(1), "tr", { slug: "yeni" }, ACTOR)).toMatchObject({ ok: false, code: "not-found", field: "slug" });
    expect(c.stats().rolledBack).toBe(1);
  });
  it("slug çakışması: başka kaydın ana slug'ı veya aynı dildeki çeviri slug'ı", async () => {
    const a = svc({ slugTakenBase: ["deniz-villa"] });
    expect(await a.s.saveContent("villa", V(2), "en", { slug: "deniz-villa" }, ACTOR)).toMatchObject({ ok: false, code: "conflict" });
    const b = svc({ slugTakenTr: ["sea-villa"] });
    expect(await b.s.saveContent("villa", V(2), "en", { slug: "sea-villa" }, ACTOR)).toMatchObject({ ok: false, code: "conflict" });
    const c = svc({ slugTakenBase: ["x"] });
    expect(await c.s.saveContent("villa", V(2), "en", { slug: null }, ACTOR)).toMatchObject({ ok: true, slug: null });
  });
  it("NOT NULL kolona null → validation (şemadan okunur, tablo başına bir kez)", async () => {
    const { s, log } = svc({ notNull: { blog_posts: ["title", "slug"], site_popup_translations: ["stats"] } });
    expect(await s.saveContent("blog_post", V(1), "tr", { title: null }, ACTOR)).toMatchObject({ ok: false, code: "validation", field: "title" });
    expect(await s.saveContent("blog_post", V(1), "en", { title: null }, ACTOR)).toMatchObject({ ok: true });
    expect(await s.saveContent("blog_post", V(1), "tr", { title: null }, ACTOR)).toMatchObject({ ok: false });
    expect(log.filter((x) => x.includes("information_schema")).length).toBe(2); // blog_post_translations + blog_posts
  });
  it("ana kayıt yok → not-found, rollback", async () => {
    const { s, stats } = svc({ missingParents: [V(9)] });
    expect(await s.saveContent("villa", V(9), "en", { badge: "x" }, ACTOR)).toMatchObject({ ok: false, code: "not-found" });
    expect(stats().rolledBack).toBe(1);
  });
  it("aynı kayıt+dil iki kez → validation, hiçbir sorgu", async () => {
    const { s, log } = svc();
    const r = await s.saveContentMany(
      [
        { entity: "villa", parentId: V(1), locale: "en", patch: { badge: "a" } },
        { entity: "villa", parentId: V(1).toUpperCase(), locale: "en", patch: { badge: "b" } },
      ],
      ACTOR
    );
    expect(r).toMatchObject({ ok: false, code: "validation", index: 1 });
    expect(log).toEqual([]);
  });

  it("DETERMİNİSTİK KİLİT SIRASI: karışık girdi → ana kayıtlar sıralı, sonra slug kilitleri, sonra yazmalar", async () => {
    const { s, log } = svc();
    const items: ContentWriteItem[] = [
      { entity: "page", parentId: V(2), locale: "en", patch: { title: "b" } },
      { entity: "villa", parentId: V(3), locale: "de", patch: { slug: "zeta" } },
      { entity: "villa", parentId: V(1), locale: "en", patch: { slug: "alfa" } },
      { entity: "villa", parentId: V(3), locale: "en", patch: { badge: "x" } },
      { entity: "site_popup", parentId: "1", locale: "en", patch: { title: "p" } },
    ];
    const r = await s.saveContentMany(items, ACTOR);
    expect(r.ok).toBe(true);
    const locks = log.filter((x) => x.includes("FOR UPDATE")).map((x) => x.match(/FROM "([a-z_]+)"/)![1]);
    expect(locks).toEqual(["villa", "villa", "pages", "site_popup"]); // registry sırası, villa tekrarsız (V1, V3)
    const firstSlugLock = log.findIndex((x) => x.includes("pg_advisory_xact_lock"));
    const lastParentLock = log.map((x) => x.includes("FOR UPDATE")).lastIndexOf(true);
    const firstWrite = log.findIndex((x) => x.startsWith("INSERT") || x.startsWith("UPDATE"));
    expect(lastParentLock).toBeLessThan(firstSlugLock);
    expect(firstSlugLock).toBeLessThan(firstWrite);
    const writes = log.filter((x) => x.startsWith("INSERT")).map((x) => x.match(/INTO "([a-z_]+)"/)![1]);
    expect(writes).toEqual(["villa_translations", "villa_translations", "villa_translations", "page_translations", "site_popup_translations"]);
    // sonuçlar GİRDİ sırasında
    if (r.ok) expect(r.results.map((x) => x.ok && x.written)).toEqual([["title"], ["slug"], ["slug"], ["badge"], ["title"]]);
  });

  it("40P01 deadlock → bütün transaction yeniden denenir", async () => {
    let n = 0;
    const { s, stats } = svc({
      failOn: (t) => (t.startsWith("INSERT") && n++ === 0 ? Object.assign(new Error("deadlock"), { code: "40P01" }) : undefined),
    });
    expect(await s.saveContent("villa", V(1), "en", { badge: "x" }, ACTOR)).toMatchObject({ ok: true });
    expect(stats()).toEqual({ tx: 2, rolledBack: 1 });
  });
  it("hata eşlemesi", () => {
    expect(mapPgError({ code: "23505", constraint: "villa_translations_locale_slug_key" })).toMatchObject({ code: "conflict", field: "slug" });
    expect(mapPgError({ code: "23514", constraint: "x" }).code).toBe("validation");
    expect(mapPgError({ code: "55P03" }).code).toBe("busy");
    expect(mapPgError({ code: "P0001", message: "content_mirror_guard: x" }).code).toBe("guard");
    expect(mapPgError(new Error("?")).code).toBe("db");
  });
  it("bir öğe başarısızsa hiçbiri commit edilmez (onCommitted çağrılmaz)", async () => {
    const { s, onCommitted, stats } = svc({ slugTakenTr: ["taken"] });
    const r = await s.saveContentMany(
      [
        { entity: "villa", parentId: V(1), locale: "en", patch: { badge: "ok" } },
        { entity: "villa", parentId: V(2), locale: "en", patch: { slug: "taken" } },
      ],
      ACTOR
    );
    expect(r).toMatchObject({ ok: false, code: "conflict", index: 1 });
    expect(stats().rolledBack).toBe(1);
    expect(onCommitted).not.toHaveBeenCalled();
  });
  it("getContentWriteConfig: mod + 14 varlık hedefleri", async () => {
    const { s } = svc({ mode: "base" });
    const c = await s.getContentWriteConfig();
    expect(c.mode).toBe("base");
    expect(c.entities).toHaveLength(14);
    expect(c.entities.find((e) => e.key === "villa")?.targets).toEqual({ tr: "base", en: "translation", de: "translation" });
  });
});

describe("Faz 4 sınırı", () => {
  /* Faz 5: yazma servisi YALNIZ admin içerik katmanından kullanılır
     (lib/i18n/content/content-admin.server.ts); app/ ve diğer lib
     modülleri çekirdeği / sunucu bağlantısını DOĞRUDAN import etmez. */
  it("yazma servisi yalnız admin içerik katmanı üzerinden kullanılıyor", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || p === path.join("lib", "i18n", "content")) continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && /i18n\/content\/content-write(\.server|-core|-sql)/.test(fs.readFileSync(p, "utf8"))) {
          hits.push(p);
        }
      }
    };
    walk("app");
    walk("lib");
    expect(hits).toEqual([]);
  });
  it("yazma çekirdeği ayna bayrağını açmaz, mod değiştirmez, DDL içermez", async () => {
    const fs = await import("node:fs");
    for (const f of ["content-write-core.ts", "content-write-sql.ts", "content-write.server.ts"]) {
      const src = fs.readFileSync(`lib/i18n/content/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(src).not.toMatch(/set_config\(|CREATE |ALTER |DROP |content_mirror_mode\(\)\s*=|url_redirects/);
    }
  });
});
