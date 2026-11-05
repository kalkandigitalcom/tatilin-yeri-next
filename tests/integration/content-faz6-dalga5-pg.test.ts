import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import type { PublicContentReader } from "@/lib/i18n/content/public-villa-content";
import { villaRobots } from "@/lib/i18n/content/public-villa-content";
import { isTextContentMissing, loadAvailableLocales, textRobots } from "@/lib/i18n/content/public-text-content";
import {
  categoryIndexableLocales,
  hasNoContentAnywhere,
  loadContentsByLocale,
  textIndexableLocales,
  villaIndexableLocales,
} from "@/lib/i18n/content/public-seo-content";
import { SITEMAP_BLOG_ID_SQL, SITEMAP_VILLA_ID_SQL } from "@/lib/i18n/sitemap-sql";
import { CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import { resolveSingletonFields, withBaseTrRow, type SingletonRows } from "@/lib/i18n/content/public-shared-content";

/* ===============================================================
   Faz 6 DALGA 5 — İZOLE PostgreSQL: sitemap dil kararı ↔ sayfa
   metadata'sı (404 / robots / hreflang) GERÇEK SQL + çekirdekle aynı;
   eski "çeviri var" SQL'iyle ana dil TR farkları sınıflandırılır.
   CONTENT_F6D5_PG_URL_108   : m108clean'in TEK KULLANIMLIK kopyası
   CONTENT_F6D5_PG_URL_NO108 : m106'nın TEK KULLANIMLIK kopyası
   CONTENT_F6D5_PG_FIXTURE_DDL=1 → pages.content YALNIZ kopyaya eklenir.
   Testler veri YAZAR. Şablonlarda ÇALIŞTIRILMAZ.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};
const ACTOR = { actorId: "faz6-dalga5" };
const RUN = Date.now().toString(36);
const L: Locale[] = ["tr", "en", "de"];
const ENABLED_SETS: Locale[][] = [["tr", "en", "de"], ["tr", "en"], ["tr", "de"], ["en", "de"], ["tr"]];
const FIXTURE_DDL = process.env.CONTENT_F6D5_PG_FIXTURE_DDL === "1";

/* Dalga 5 ÖNCESİ sitemap kuralı (kaldırılan lib/i18n/sitemap-data.server
   TRANSLATED_SQL; yalnız karşılaştırma için burada). */
const LEGACY_TRANSLATED_SQL = `
  SELECT 'blog' AS kind, p.id::text AS id, t.locale
    FROM public.blog_post_translations t JOIN public.blog_posts p ON p.id = t.blog_post_id
   WHERE COALESCE(btrim(t.title), '') <> '' OR COALESCE(btrim(t.body), '') <> ''
      OR COALESCE(btrim(t.excerpt), '') <> ''
  UNION ALL
  SELECT 'page', p.id::text, t.locale
    FROM public.page_translations t JOIN public.pages p ON p.id = t.page_id
   WHERE COALESCE(btrim(t.title), '') <> '' OR COALESCE(btrim(t.body), '') <> ''
      OR COALESCE(btrim(t.excerpt), '') <> ''`;

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
function reader(pool: Pool, root: Locale, enabled: Locale[]): PublicContentReader {
  const svc = createContentReadService({
    repository: createContentRepository((q) => pool.query(q.text, q.values)),
    getLocaleContext: () => ({ root, enabled }),
  });
  return { getContent: svc.getContent, getContentMany: svc.getContentMany };
}
const ctxEnabled = (root: Locale, set: Locale[]) => (set.includes(root) ? set : [root, ...set]);

/** Sayfa metadata'sının dil kararı (blog-metadata / cms-page-metadata çağrı sırası). */
async function pageLocales(r: PublicContentReader, entity: "blog_post" | "page", id: string, enabled: Locale[], noindex: boolean) {
  const out: Locale[] = [];
  for (const l of enabled) {
    const content = await r.getContent(entity, id, l);
    if (isTextContentMissing(entity, content)) continue;
    const available = await loadAvailableLocales(r, entity, id, enabled, { locale: l, content });
    const robots = textRobots(entity === "blog_post" ? "blog" : "page", noindex, available.includes(l));
    if (robots === undefined || robots.index) out.push(l);
  }
  return out;
}

const CONFIGS = [
  { name: "108 SONRASI (m108clean kopyası)", url: process.env.CONTENT_F6D5_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ (m106 kopyası)", url: process.env.CONTENT_F6D5_PG_URL_NO108, has108: false },
];
const T = (l: Locale, p = "") => ({ title: `${p}${l} başlık`, excerpt: null, body: `<p>${p}${l}</p>` });

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 6 Dalga 5 — izole PG (${cfg.name})`, () => {
    let pool: Pool;
    const ids: Record<string, string> = {};
    const created = new Set<string>();
    const k = (n: string) => `f6d5-${n}-${cfg.has108 ? "a" : "b"}-${RUN}`;

    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      expect((await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok).toBe(cfg.has108);
      if (FIXTURE_DDL) await pool.query("ALTER TABLE pages ADD COLUMN IF NOT EXISTS content text");
      const w = writer(pool);
      const mk = async (entity: ContentEntityKey, key: string, technical: Record<string, unknown>, locales: Array<{ locale: Locale; patch: Record<string, unknown> }>) => {
        const r = await w.createContent({ entity, technical, locales }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        ids[key] = (r as { id: string }).id;
        created.add(ids[key]);
      };
      for (const entity of ["blog_post", "page"] as const) {
        const e = entity === "blog_post" ? "b" : "p";
        await mk(entity, `${e}-all`, { slug: k(`${e}-all`), is_active: true }, L.map((l) => ({ locale: l, patch: T(l) })));
        for (const only of L) {
          await mk(entity, `${e}-only-${only}`, { slug: k(`${e}-only-${only}`), is_active: true }, [{ locale: only, patch: T(only, "yalnız ") }]);
        }
        await mk(entity, `${e}-tr-en`, { slug: k(`${e}-tr-en`), is_active: true }, [{ locale: "tr", patch: T("tr") }, { locale: "en", patch: { title: "EN yalnız başlık" } }]);
        await mk(entity, `${e}-empty-body-de`, { slug: k(`${e}-empty-body-de`), is_active: true }, [
          { locale: "tr", patch: T("tr") },
          { locale: "de", patch: { title: null, body: "" } },
        ]);
      }
      if (FIXTURE_DDL) {
        await mk("page", "p-legacy", { slug: k("p-legacy"), is_active: true }, [{ locale: "en", patch: { title: "legacy EN", body: null } }]);
        await pool.query("UPDATE pages SET content = $2 WHERE id = $1", [ids["p-legacy"], "<p>ESKİ CONTENT</p>"]);
      }
      await mk("villa", "v-all", { slug: k("v-all"), title: "V all", is_active: true }, L.map((l) => ({ locale: l, patch: { description: `<p>${l}</p>` } })));
      await mk("villa", "v-de", { slug: k("v-de"), title: "V de", is_active: true }, [{ locale: "de", patch: { description: "<p>nur de</p>" } }]);
      await mk("villa", "v-none", { slug: k("v-none"), title: "V none", is_active: true }, [{ locale: "tr", patch: { description: null } }]);
      await mk("villa_type", "t-name", { slug: k("t-name") }, [{ locale: "en", patch: { name: "Only EN" } }]);
      await mk("villa_type", "t-none", { slug: k("t-none") }, [{ locale: "tr", patch: { name: null } }]);
    });
    afterAll(async () => {
      await pool?.end();
    });

    it("sitemap kimlik SQL'leri gerçek şemada çalışır; test kayıtlarını taban slug'la eşler", async () => {
      const villa = new Map((await pool.query(SITEMAP_VILLA_ID_SQL)).rows.map((r) => [String(r.slug), String(r.id)]));
      const blog = new Map((await pool.query(SITEMAP_BLOG_ID_SQL)).rows.map((r) => [String(r.slug), String(r.id)]));
      expect(villa.get(k("v-all"))).toBe(ids["v-all"]);
      expect(blog.get(k("b-all"))).toBe(ids["b-all"]);
    });

    for (const root of L) {
      it(`ana dil ${root.toUpperCase()}: blog + CMS — sitemap dilleri sayfa metadata'sıyla BİREBİR (her aktif dil kümesi, noindex dahil)`, async () => {
        const allBlog = (await pool.query("SELECT id::text AS id FROM blog_posts")).rows.map((r) => String(r.id));
        const allPage = (await pool.query("SELECT id::text AS id FROM pages")).rows.map((r) => String(r.id));
        for (const set of ENABLED_SETS) {
          const enabled = ctxEnabled(root, set);
          const r = reader(pool, root, enabled);
          for (const [entity, list] of [["blog_post", allBlog], ["page", allPage]] as const) {
            const contents = await loadContentsByLocale(r, entity, list, enabled);
            for (const id of list) {
              for (const noindex of [false, true]) {
                const site = textIndexableLocales(entity, noindex, contents.get(id) ?? {}, enabled);
                expect(site, `${entity} ${id} ${enabled}`).toEqual(await pageLocales(r, entity, id, enabled, noindex));
                for (const l of site) expect(enabled).toContain(l);
              }
            }
          }
        }
        /* Somut beklentiler (üç dil açık). */
        const r = reader(pool, root, L);
        const site = async (e: "blog_post" | "page", key: string) =>
          textIndexableLocales(e, false, (await loadContentsByLocale(r, e, [ids[key]], L)).get(ids[key]) ?? {}, L);
        expect(await site("blog_post", "b-all")).toEqual(L);
        expect(await site("blog_post", "b-only-de")).toEqual(["de"]);
        expect(await site("page", "p-tr-en")).toEqual(["tr", "en"]);
        /* DE'de bilinçli boş gövde: başlık/özet yok → DE "çevrili" değil. */
        expect(await site("page", "p-empty-body-de")).toEqual(["tr"]);
        if (FIXTURE_DDL) expect(await site("page", "p-legacy")).toEqual(["tr", "en"]);
      });

      it(`ana dil ${root.toUpperCase()}: villa + kategori — yedekli içerik indexlenir; hiç içerik yoksa yok; pasif dil yok`, async () => {
        for (const set of ENABLED_SETS) {
          const enabled = ctxEnabled(root, set);
          const r = reader(pool, root, enabled);
          const rootContents = await loadContentsByLocale(r, "villa", [ids["v-all"], ids["v-de"], ids["v-none"]], [root]);
          for (const key of ["v-all", "v-de", "v-none"]) {
            const page: Locale[] = [];
            for (const l of enabled) if (villaRobots(await r.getContent("villa", ids[key], l), false) === undefined) page.push(l);
            expect(villaIndexableLocales(rootContents.get(ids[key])?.[root], false, enabled), `${key} ${enabled}`).toEqual(page);
          }
          const deActive = enabled.includes("de");
          expect(villaIndexableLocales(rootContents.get(ids["v-de"])?.[root], false, enabled)).toEqual(deActive ? enabled : []);
          expect(villaIndexableLocales(rootContents.get(ids["v-none"])?.[root], false, enabled)).toEqual([]);
          const types = await loadContentsByLocale(r, "villa_type", [ids["t-name"], ids["t-none"]], [root]);
          const named = (id: string) => {
            const c = types.get(id)?.[root];
            return typeof c?.values?.name === "string" && c.values.name.trim() !== "";
          };
          expect(categoryIndexableLocales(named(ids["t-name"]), 1, enabled)).toEqual(enabled.includes("en") ? enabled : []);
          expect(categoryIndexableLocales(named(ids["t-none"]), 1, enabled)).toEqual([]);
          expect(hasNoContentAnywhere(types.get(ids["t-none"])?.[root])).toBe(true);
        }
      });
    }

    it("kök layout varsayılan başlığı (karar B): kendi dil → ana dil → (yok → sözlük); pasif dil yok; TR kökte eskisiyle aynı", async () => {
      const sid = String((await pool.query("SELECT id FROM settings LIMIT 1")).rows[0].id);
      /* Kopyada: TR ve EN kayıtlı değer; DE satırı yok. */
      for (const [l, v] of [["tr", "TR kayıtlı"], ["en", "EN kayıtlı"]] as const) {
        const r = await writer(pool).saveContent("settings", sid, l, { default_meta_title: v, default_meta_description: null }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
      }
      const base = (await pool.query("SELECT * FROM settings LIMIT 1")).rows[0] as Record<string, unknown>;
      /* TR yazımı ana kolona da yansır (mirror 'base') → eski davranışın kaynağı. */
      expect(base.default_meta_title).toBe("TR kayıtlı");
      const resolve = async (root: Locale, enabled: Locale[], l: Locale) => {
        const svc = createContentReadService({
          repository: createContentRepository((q) => pool.query(q.text, q.values)),
          getLocaleContext: () => ({ root, enabled }),
        });
        const rows = withBaseTrRow(
          (await svc.getAllLocales("settings", sid)) as SingletonRows,
          base,
          CONTENT_ENTITY_BY_KEY.settings.fields,
          { root, enabled }
        );
        return resolveSingletonFields(CONTENT_ENTITY_BY_KEY.settings, rows, l, { root, enabled }, { otherActiveFallback: false })
          .default_meta_title as string | null;
      };
      const tr = (base.default_meta_title as string | null) ?? null;
      /* Ana dil TR: TR sayfası eski ana kolon değeri; EN kendi değeri; DE ana dil (TR). */
      expect(await resolve("tr", L, "tr")).toBe(tr);
      expect(await resolve("tr", L, "en")).toBe("EN kayıtlı");
      expect(await resolve("tr", L, "de")).toBe(tr);
      /* Ana dil EN: DE → EN değeri (ana dil), TR kendi değeri. */
      expect(await resolve("en", L, "de")).toBe("EN kayıtlı");
      expect(await resolve("en", L, "tr")).toBe(tr);
      /* Ana dil DE, DE satırı yok: TR'ye/EN'e düşmez → null (çağıran ana dilin sözlüğünü basar). */
      expect(await resolve("de", L, "de")).toBeNull();
      expect(await resolve("de", L, "en")).toBe("EN kayıtlı");
      /* Pasif EN: değeri hiçbir dile geçmez; pasif EN sayfası istenirse ana dil. */
      expect(await resolve("tr", ["tr", "de"], "en")).toBe(tr);
      expect(await resolve("de", ["de", "tr"], "tr")).toBe(tr);
    });

    it("eski sitemap kuralı ↔ merkezi kural (ana dil TR, üç dil): farklar yalnız beklenen sınıflarda", async () => {
      const legacy = new Map<string, Set<string>>();
      for (const row of (await pool.query(LEGACY_TRANSLATED_SQL)).rows) {
        const key = `${row.kind}:${row.id}`;
        if (row.locale !== "en" && row.locale !== "de") continue;
        (legacy.get(key) ?? legacy.set(key, new Set(["tr"])).get(key)!).add(String(row.locale));
      }
      const r = reader(pool, "tr", L);
      const diffs: Record<string, number> = {};
      let same = 0;
      for (const [kind, entity, table] of [["blog", "blog_post", "blog_posts"], ["page", "page", "pages"]] as const) {
        const list = (await pool.query(`SELECT id::text AS id FROM ${table}`)).rows.map((x) => String(x.id));
        const contents = await loadContentsByLocale(r, entity, list, L);
        for (const id of list) {
          const old = [...(legacy.get(`${kind}:${id}`) ?? new Set(["tr"]))].sort();
          const now = [...textIndexableLocales(entity, false, contents.get(id) ?? {}, L)].sort();
          if (JSON.stringify(old) === JSON.stringify(now)) {
            same++;
            continue;
          }
          const c = contents.get(id) ?? {};
          const cls = isTextContentMissing(entity, c.tr ?? null)
            ? "içerik-yok-404"
            : !now.includes("tr") && old.includes("tr")
              ? "tr-çevrili-değil"
              : now.length > old.length
                ? "yeni-kural-ek-dil"
                : "diğer";
          diffs[cls] = (diffs[cls] ?? 0) + 1;
          /* Şablon kayıtlarında (test dışı) fark beklenmez. */
          if (!created.has(id)) diffs[`ŞABLON:${cls}`] = (diffs[`ŞABLON:${cls}`] ?? 0) + 1;
        }
      }
      console.log(`[faz6-dalga5] eski↔yeni aynı=${same} farklar=${JSON.stringify(diffs)}`);
      expect(diffs.diğer ?? 0).toBe(0);
      expect(Object.keys(diffs).filter((x) => x.startsWith("ŞABLON:"))).toEqual([]);
      expect(same).toBeGreaterThan(0);
    });
  });
}
