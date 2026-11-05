import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import { LIVE_SLUGS_SQL, LOCALIZED_SLUGS_SQL, REDIRECTS_SQL, rowsToLiveSet, rowsToRedirectMap, rowsToSlugMap } from "@/lib/i18n/routing/sql";
import { slugSource, toBaseSlug, toLocalizedSlug, type RoutingContext } from "@/lib/i18n/routing/context";
import { buildRoutePath, resolveIncomingPath } from "@/lib/i18n/routing/url";
import { loadRouteContent } from "@/lib/i18n/routing/route-content";

/* ===============================================================
   Faz 6 DALGA 1 — İZOLE PostgreSQL: routing simetrisi gerçek veriyle
   (dil slug haritası, slug geçmişi, canlı küme, teknik anahtar → içerik).
   CONTENT_F6D1_PG_URL_108   : m108clean'in TEK KULLANIMLIK kopyası
   CONTENT_F6D1_PG_URL_NO108 : m106'nın TEK KULLANIMLIK kopyası
   Testler veri YAZAR. Şablonlarda ÇALIŞTIRILMAZ.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};
const ACTOR = { actorId: "faz6-dalga1" };
const RUN = Date.now().toString(36);
const L: Locale[] = ["tr", "en", "de"];

async function mkPool(url: string): Promise<Pool> {
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 8 }) as unknown as Pool;
}
function writer(pool: Pool) {
  const transaction: TransactionRunner = async (fn) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn((t, v) => c.query(t, v as unknown[]));
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };
  return createContentWriteService({ transaction, enabled: () => true, lockTimeoutMs: 10_000 });
}
async function routingCtx(pool: Pool, root: Locale, enabled: Locale[] = L): Promise<RoutingContext> {
  const [slugs, redirects, villa, blog, page] = await Promise.all([
    pool.query(LOCALIZED_SLUGS_SQL),
    pool.query(REDIRECTS_SQL),
    pool.query(LIVE_SLUGS_SQL.villa!),
    pool.query(LIVE_SLUGS_SQL.blog!),
    pool.query(LIVE_SLUGS_SQL.page!),
  ]);
  return {
    root,
    enabled: [root, ...enabled.filter((l) => l !== root)],
    slugs: rowsToSlugMap(slugs.rows as never),
    redirects: rowsToRedirectMap(redirects.rows as never),
    live: { villa: rowsToLiveSet(villa.rows), blog: rowsToLiveSet(blog.rows), page: rowsToLiveSet(page.rows) },
  };
}

const CONFIGS = [
  { name: "108 SONRASI (m108clean kopyası)", url: process.env.CONTENT_F6D1_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ (m106 kopyası)", url: process.env.CONTENT_F6D1_PG_URL_NO108, has108: false },
];

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 6 Dalga 1 — izole PG (${cfg.name})`, () => {
    let pool: Pool;
    let deniz: string, orman: string, koy: string;
    const k = (n: string) => `f6d1-${n}-${cfg.has108 ? "a" : "b"}-${RUN}`;
    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      const cap = (await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok;
      expect(cap).toBe(cfg.has108);
      const w = writer(pool);
      const mk = async (key: string, locales: Array<{ locale: Locale; patch: Record<string, unknown> }>) => {
        const r = await w.createContent({ entity: "villa", technical: { slug: k(key), title: key, is_active: true }, locales }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        return (r as { id: string }).id;
      };
      // deniz: 3 dilde kendi slug'ı (TR yalnız 108 sonrası ayrılabilir)
      deniz = await mk("deniz", [
        { locale: "tr", patch: { description: "TR deniz", ...(cfg.has108 ? { slug: `${k("deniz")}-tr` } : {}) } },
        { locale: "en", patch: { description: "EN sea", slug: `${k("deniz")}-en` } },
        { locale: "de", patch: { description: "DE meer", slug: `${k("deniz")}-de` } },
      ]);
      // orman: yalnız EN slug'ı (TR/DE'de URL = teknik anahtar)
      orman = await mk("orman", [
        { locale: "tr", patch: { description: "TR orman" } },
        { locale: "en", patch: { description: "EN forest", slug: `${k("orman")}-en` } },
      ]);
      // koy: DE slug'ı sonra değişir → DE geçmişi
      koy = await mk("koy", [
        { locale: "tr", patch: { description: "TR koy" } },
        { locale: "de", patch: { description: "DE bucht", slug: `${k("koy")}-alt` } },
      ]);
      expect((await w.saveContent("villa", koy, "de", { slug: `${k("koy")}-neu` }, ACTOR)).ok).toBe(true);
    });
    afterAll(async () => {
      await pool?.end();
    });

    for (const root of L) {
      it(`ana dil ${root.toUpperCase()}: kanonik URL'ler, dil slug'ı → teknik anahtar, teknik anahtar değişmez`, async () => {
        const ctx = await routingCtx(pool, root);
        for (const l of L) {
          const own = toLocalizedSlug(ctx, "villa", k("deniz"), l);
          const expected = l === "tr" && !cfg.has108 ? k("deniz") : `${k("deniz")}-${l}`;
          expect({ l, own }).toEqual({ l, own: expected });
          expect(toBaseSlug(ctx, "villa", own, l)).toBe(k("deniz"));
          const path = buildRoutePath("villa", { slug: k("deniz") }, l, ctx);
          expect(path.startsWith(l === root ? "/" : `/${l}/`)).toBe(true);
          expect(resolveIncomingPath(path, ctx).type).toBe("rewrite");
        }
        // kendi slug'ı olmayan dil: URL = teknik anahtar (başka dilin slug'ına YEDEK YOK)
        expect(toLocalizedSlug(ctx, "villa", k("orman"), "de")).toBe(k("orman"));
        expect(toLocalizedSlug(ctx, "villa", k("orman"), "tr")).toBe(k("orman"));
        const base = (await pool.query("SELECT slug FROM villa WHERE id=$1", [deniz])).rows[0].slug;
        expect(base).toBe(k("deniz"));
      });

      it(`ana dil ${root.toUpperCase()}: başka dilin slug'ı (önekli) → doğru kaydın o dildeki URL'si (308); geçmiş → güncel`, async () => {
        const ctx = await routingCtx(pool, root);
        const pre = (l: Locale) => (l === root ? "" : `/${l}`);
        const seg = (l: Locale) => (l === "tr" ? "kiralik-villa" : "villa");
        if (root !== "de") {
          const d = resolveIncomingPath(`/de/villa/${k("orman")}-en`, ctx);
          expect(d).toEqual({ type: "redirect", path: `/de/villa/${k("orman")}`, status: 308 });
        }
        if (root !== "en") {
          const d = resolveIncomingPath(`/en/villa/${k("deniz")}-de`, ctx);
          expect(d).toEqual({ type: "redirect", path: `/en/villa/${k("deniz")}-en`, status: 308 });
        }
        // DE geçmişi
        const h = resolveIncomingPath(`${pre("de")}/${seg("de")}/${k("koy")}-alt`, ctx) as { type: string; path: string };
        expect(h.type).toBe("redirect");
        expect(h.path).toBe(buildRoutePath("villa", { slug: k("koy") }, "de", ctx));
        expect(h.path.endsWith(`${k("koy")}-neu`)).toBe(true);
        expect(resolveIncomingPath(h.path, ctx).type).toBe("rewrite");
      });

      it(`ana dil ${root.toUpperCase()}: teknik anahtar → kimlik → sayfanın dilinde içerik (merkezi okuma)`, async () => {
        const rd = createContentReadService({
          repository: createContentRepository((q) => pool.query(q.text, q.values)),
          getLocaleContext: () => ({ root, enabled: [root, ...L.filter((l) => l !== root)] }),
        });
        const deps = { findIdByTechnicalKey: rd.findIdByTechnicalKey, getContent: rd.getContent };
        const expected: Record<Locale, string> = { tr: "TR deniz", en: "EN sea", de: "DE meer" };
        for (const l of L) {
          const r = await loadRouteContent(deps, "villa", k("deniz"), l);
          expect(r).toMatchObject({ found: true, id: deniz });
          expect((r as { content: { values: Record<string, unknown> } }).content.values.description).toBe(expected[l]);
        }
        // orman: DE yok → ana dil zinciri (TR'ye özel değil)
        const dm = await loadRouteContent(deps, "villa", k("orman"), "de");
        expect(dm).toMatchObject({ found: true, id: orman });
        const rootDesc: Record<Locale, string> = { tr: "TR orman", en: "EN forest", de: "TR orman" };
        expect((dm as { content: { values: Record<string, unknown> } }).content.values.description).toBe(root === "de" ? "TR orman" : rootDesc[root]);
        expect(await loadRouteContent(deps, "villa", "yok-boyle-bir-anahtar", "tr")).toEqual({ found: false });
        // dil slug'ı teknik anahtar değildir → kimlik bulunmaz (yanlış eşleşme yok)
        expect(await loadRouteContent(deps, "villa", `${k("deniz")}-en`, "en")).toEqual({ found: false });
      });
    }

    it("pasif dil: önek 404, slug'ı ve geçmişi yedek olarak KULLANILMAZ", async () => {
      const ctx = await routingCtx(pool, "en", ["en", "tr"]); // DE pasif
      expect(resolveIncomingPath(`/de/villa/${k("deniz")}-de`, ctx)).toMatchObject({ type: "notFound", reason: "disabledLocale" });
      expect(slugSource(ctx, "villa", `${k("deniz")}-de`, "en")).toBe("unknown");
      expect(toBaseSlug(ctx, "villa", `${k("koy")}-alt`, "tr")).toBe(`${k("koy")}-alt`);
      const ctx2 = await routingCtx(pool, "de", ["de"]); // yalnız ana dil
      expect(resolveIncomingPath(`/en/villa/${k("deniz")}-en`, ctx2)).toMatchObject({ type: "notFound" });
      expect(resolveIncomingPath(`/tr/kiralik-villa/${k("deniz")}`, ctx2)).toMatchObject({ type: "notFound" });
    });

    it("çakışan slug yanlış kayda yönlendirilmez (iki kaydın farklı dillerdeki aynı slug'ı)", async () => {
      const w = writer(pool);
      const clash = `${k("cakisma")}`;
      const a = await w.createContent({ entity: "villa", technical: { slug: `${clash}-a`, title: "A", is_active: true }, locales: [{ locale: "en", patch: { slug: clash } }] }, ACTOR);
      const b = await w.createContent({ entity: "villa", technical: { slug: `${clash}-b`, title: "B", is_active: true }, locales: [{ locale: "de", patch: { slug: clash } }] }, ACTOR);
      expect(a.ok && b.ok).toBe(true);
      const ctx = await routingCtx(pool, "tr");
      expect(slugSource(ctx, "villa", clash, "tr")).toBe("unknown");
      expect(resolveIncomingPath(`/kiralik-villa/${clash}`, ctx)).toMatchObject({ type: "notFound", reason: "noContent" });
      expect(toBaseSlug(ctx, "villa", clash, "en")).toBe(`${clash}-a`);
      expect(toBaseSlug(ctx, "villa", clash, "de")).toBe(`${clash}-b`);
    });
  });
}
