import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { LIVE_SLUGS_SQL, LOCALIZED_SLUGS_SQL, REDIRECTS_SQL, rowsToLiveSet, rowsToRedirectMap, rowsToSlugMap } from "@/lib/i18n/routing/sql";
import type { RoutingContext } from "@/lib/i18n/routing/context";
import { resolveIncomingPath } from "@/lib/i18n/routing/url";

/* ===============================================================
   Faz 7 R-B — İZOLE PostgreSQL: 108 sonrası TR slug değişikliği
   (merkezi yazma → 108 guard → 103/106 slug geçmişi trigger'ı →
   REDIRECTS_SQL → proxy kararı) uçtan uca.
   CONTENT_F7_PG_URL_108   : m108clean'in TEK KULLANIMLIK kopyası
   CONTENT_F7_PG_URL_NO108 : m106'nın TEK KULLANIMLIK kopyası
   Testler veri YAZAR. Şablonlarda ÇALIŞTIRILMAZ.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};
const ACTOR = { actorId: "faz7-rb" };
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
const T = (l: Locale) => ({ title: `${l} başlık`, excerpt: null, body: `<p>${l}</p>` });

const CONFIGS = [
  { name: "108 SONRASI (m108clean kopyası)", url: process.env.CONTENT_F7_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ (m106 kopyası)", url: process.env.CONTENT_F7_PG_URL_NO108, has108: false },
];

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 7 R-B — izole PG (${cfg.name})`, () => {
    let pool: Pool;
    const ids: Record<string, string> = {};
    const k = (n: string) => `f7-${n}-${cfg.has108 ? "a" : "b"}-${RUN}`;
    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      expect((await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok).toBe(cfg.has108);
      const w = writer(pool);
      const mk = async (entity: "blog_post" | "page" | "villa", key: string, technical: Record<string, unknown>, locales: Array<{ locale: Locale; patch: Record<string, unknown> }>) => {
        const r = await w.createContent({ entity, technical, locales }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        ids[key] = (r as { id: string }).id;
      };
      await mk("blog_post", "blog", { slug: k("blog"), is_active: true }, [
        { locale: "tr", patch: T("tr") },
        { locale: "en", patch: { ...T("en"), slug: `${k("blog")}-en` } },
      ]);
      await mk("page", "page", { slug: k("page"), is_active: true }, [{ locale: "tr", patch: T("tr") }]);
      await mk("villa", "villa", { slug: k("villa"), title: "V", is_active: true }, [
        { locale: "tr", patch: { description: "<p>tr</p>" } },
        { locale: "en", patch: { description: "<p>en</p>", slug: `${k("villa")}-en` } },
      ]);
    });
    afterAll(async () => {
      await pool?.end();
    });

    it("değişiklikten önce: TR URL = teknik anahtar → rewrite (davranış aynı)", async () => {
      const ctx = await routingCtx(pool, "tr");
      expect(resolveIncomingPath(`/blog/${k("blog")}`, ctx).type).toBe("rewrite");
      expect(resolveIncomingPath(`/p/${k("page")}`, ctx).type).toBe("rewrite");
      expect(resolveIncomingPath(`/kiralik-villa/${k("villa")}`, ctx).type).toBe("rewrite");
    });

    if (cfg.has108) {
      it("TR slug'ları merkezi yazmayla değişir; geçmiş (url_redirects) korunur ve REDIRECTS_SQL'de görünür", async () => {
        const w = writer(pool);
        for (const [entity, key] of [["blog_post", "blog"], ["page", "page"], ["villa", "villa"]] as const) {
          const r = await w.saveContent(entity, ids[key], "tr", { slug: `${k(key)}-yeni` }, ACTOR);
          expect(r.ok ? true : r).toBe(true);
        }
        const hist = (await pool.query(
          "SELECT entity_kind, locale, old_slug FROM url_redirects WHERE old_slug = ANY($1) ORDER BY 1",
          [[k("blog"), k("page"), k("villa")]]
        )).rows;
        expect(hist).toEqual([
          { entity_kind: "blog", locale: "tr", old_slug: k("blog") },
          { entity_kind: "page", locale: "tr", old_slug: k("page") },
          { entity_kind: "villa", locale: "tr", old_slug: k("villa") },
        ]);
        const rows = (await pool.query(REDIRECTS_SQL)).rows.filter((r) => String(r.old_slug).startsWith(`f7-`) && String(r.old_slug).includes(RUN));
        expect(rows.length).toBe(3);
        for (const r of rows) expect(r.base).toBe(r.old_slug); // eski slug = kaydın kendi teknik anahtarı
      });

      for (const root of L) {
        it(`ana dil ${root}: eski TR URL → yeni TR URL; başka dile yanlış yönlendirme yok; döngü yok`, async () => {
          const ctx = await routingCtx(pool, root);
          const tr = root === "tr" ? "" : "/tr";
          const cases: Array<[string, string]> = [
            [`${tr}/blog/${k("blog")}`, `${tr}/blog/${k("blog")}-yeni`],
            [`${tr}/p/${k("page")}`, `${tr}/p/${k("page")}-yeni`],
            [`${tr}/kiralik-villa/${k("villa")}`, `${tr}/kiralik-villa/${k("villa")}-yeni`],
          ];
          for (const [from, to] of cases) {
            expect(resolveIncomingPath(from, ctx), from).toEqual({ type: "redirect", path: to, status: 308 });
            expect(resolveIncomingPath(to, ctx).type, to).toBe("rewrite");
          }
          // EN/DE URL'leri değişmedi
          const en = root === "en" ? "" : "/en";
          expect(resolveIncomingPath(`${en}/blog/${k("blog")}-en`, ctx).type).toBe("rewrite");
          expect(resolveIncomingPath(`${en}/villa/${k("villa")}-en`, ctx).type).toBe("rewrite");
          const de = root === "de" ? "" : "/de";
          expect(resolveIncomingPath(`${de}/blog/${k("blog")}`, ctx).type).toBe("rewrite"); // DE'nin kanoniği teknik anahtar
        });
      }

      it("çakışma: eski TR slug'ı (= teknik anahtar) başka bir kayda TR slug'ı olarak VERİLEMEZ; yönlendirme bozulmaz", async () => {
        const r = await writer(pool).createContent(
          { entity: "blog_post", technical: { slug: k("blog2"), is_active: true }, locales: [{ locale: "tr", patch: { ...T("tr"), slug: k("blog") } }] },
          ACTOR
        );
        expect(r).toMatchObject({ ok: false, code: "conflict", field: "slug" });
        const ctx = await routingCtx(pool, "tr");
        expect(resolveIncomingPath(`/blog/${k("blog")}`, ctx)).toEqual({ type: "redirect", path: `/blog/${k("blog")}-yeni`, status: 308 });
      });

      it("eski slug BAŞKA bir kaydın teknik anahtarıysa REDIRECTS_SQL onu atlar (önceki kural korunur)", async () => {
        const r = await writer(pool).createContent(
          { entity: "page", technical: { slug: k("page2"), is_active: true }, locales: [{ locale: "tr", patch: T("tr") }] },
          ACTOR
        );
        expect(r.ok ? true : r).toBe(true);
        await pool.query(
          "INSERT INTO url_redirects (entity_kind, entity_id, locale, old_slug) VALUES ('page', $1, 'en', $2)",
          [ids.page, k("page2")]
        );
        const rows = (await pool.query(REDIRECTS_SQL)).rows.filter((x) => x.old_slug === k("page2"));
        expect(rows).toEqual([]);
        const ctx = await routingCtx(pool, "tr");
        expect(resolveIncomingPath(`/p/${k("page2")}`, ctx).type).toBe("rewrite"); // page2 kendi sayfası
      });
    } else {
      it("108 öncesi: TR slug'ı değiştirilemez (guard), routing değişmez", async () => {
        const r = await writer(pool).saveContent("blog_post", ids.blog, "tr", { slug: `${k("blog")}-yeni` }, ACTOR);
        expect(r.ok).toBe(false);
        const ctx = await routingCtx(pool, "tr");
        expect(resolveIncomingPath(`/blog/${k("blog")}`, ctx).type).toBe("rewrite");
      });
    }
  });
}
