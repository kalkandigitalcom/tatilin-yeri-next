import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { diffLegacyVsNext, resolveLegacy } from "@/lib/i18n/content/content-legacy-compare";
import { indexContentRows } from "@/lib/i18n/content/content-resolve";
import type { PublicContentReader } from "@/lib/i18n/content/public-villa-content";
import {
  isTextContentMissing,
  loadAvailableLocales,
  loadTextContent,
  loadTextContentMany,
  textRobots,
} from "@/lib/i18n/content/public-text-content";
import { legacyTextAvailable } from "@/lib/i18n/content/content-legacy-compare";

/* ===============================================================
   Faz 6 DALGA 3 — İZOLE PostgreSQL: blog ve CMS public içeriği
   merkezi okuma ile (gerçek SQL + çözümleyici), ana dil TR / EN / DE.
   CONTENT_F6D3_PG_URL_108   : m108clean'in TEK KULLANIMLIK kopyası
   CONTENT_F6D3_PG_URL_NO108 : m106'nın TEK KULLANIMLIK kopyası
   Testler veri YAZAR. Şablonlarda ÇALIŞTIRILMAZ.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};
const ACTOR = { actorId: "faz6-dalga3" };
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
function reader(pool: Pool, root: Locale, enabled: Locale[]): PublicContentReader {
  const svc = createContentReadService({
    repository: createContentRepository((q) => pool.query(q.text, q.values)),
    getLocaleContext: () => ({ root, enabled: [root, ...enabled.filter((l) => l !== root)] }),
  });
  return { getContent: svc.getContent, getContentMany: svc.getContentMany };
}
const FIXTURE_DDL = process.env.CONTENT_F6D3_PG_FIXTURE_DDL === "1";
const CONFIGS = [
  { name: "108 SONRASI (m108clean kopyası)", url: process.env.CONTENT_F6D3_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ (m106 kopyası)", url: process.env.CONTENT_F6D3_PG_URL_NO108, has108: false },
];
const T = (l: Locale, p = "") => ({ title: `${p}${l} başlık`, excerpt: `${p}${l} özet`, body: `<p>${p}${l} gövde</p>`, seo_title: `${p}${l} seo`, seo_description: `${p}${l} meta` });
const SEC = (l: Locale) => [{ type: "richtext", content: `${l} bölüm` }];

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 6 Dalga 3 — izole PG (${cfg.name})`, () => {
    let pool: Pool;
    const ids: Record<string, string> = {};
    const k = (n: string) => `f6d3-${n}-${cfg.has108 ? "a" : "b"}-${RUN}`;

    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      const cap = (await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok;
      expect(cap).toBe(cfg.has108);
      /* pages.content (eski kolon) yalnız TEK KULLANIMLIK kopyada, açıkça istenirse (Faz 3.1 deseni; migration değil). */
      if (FIXTURE_DDL) await pool.query("ALTER TABLE pages ADD COLUMN IF NOT EXISTS content text");
      const w = writer(pool);
      const mk = async (entity: ContentEntityKey, key: string, technical: Record<string, unknown>, locales: Array<{ locale: Locale; patch: Record<string, unknown> }>) => {
        const r = await w.createContent({ entity, technical, locales }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        ids[key] = (r as { id: string }).id;
      };
      await mk("blog_post", "b-full", { slug: k("b-full"), is_active: true }, L.map((l) => ({ locale: l, patch: T(l) })));
      await mk("blog_post", "b-tr", { slug: k("b-tr"), is_active: true }, [{ locale: "tr", patch: T("tr") }]);
      for (const only of L) {
        await mk("blog_post", `b-only-${only}`, { slug: k(`b-only-${only}`), is_active: true }, [{ locale: only, patch: T(only, "yalnız ") }]);
      }
      await mk("page", "p-full", { slug: k("p-full"), is_active: true }, L.map((l) => ({ locale: l, patch: { ...T(l), sections: SEC(l) } })));
      await mk("page", "p-sec", { slug: k("p-sec"), is_active: true }, [
        { locale: "tr", patch: { ...T("tr"), sections: SEC("tr") } },
        { locale: "en", patch: { ...T("en"), sections: [] } },
        { locale: "de", patch: { ...T("de"), sections: [{ type: "bilinmeyen" }] } },
      ]);
      if (FIXTURE_DDL) {
        /* TR gövdesi NULL + eski pages.content → TR'de ek yedek. */
        await mk("page", "p-legacy", { slug: k("p-legacy"), is_active: true }, [
          { locale: "tr", patch: { title: "eski sayfa", excerpt: null, body: null } },
          { locale: "en", patch: { title: "legacy page", body: null } },
        ]);
        await pool.query("UPDATE pages SET content = $2 WHERE id = $1", [ids["p-legacy"], "<p>ESKİ CONTENT</p>"]);
      }
    });
    afterAll(async () => {
      await pool?.end();
    });

    for (const root of L) {
      describe(`ana dil ${root.toUpperCase()}`, () => {
        it("blog: istenen dil → ana dil → aktif diller; robots + hreflang kümesi", async () => {
          const r = reader(pool, root, L);
          for (const l of L) {
            const full = await loadTextContent(r, "blog_post", ids["b-full"], l);
            expect(full.resolved).toMatchObject({ title: `${l} başlık`, body: `<p>${l} gövde</p>`, seoTitle: `${l} seo` });
            expect(await loadAvailableLocales(r, "blog_post", ids["b-full"], L)).toEqual(L);
            expect(textRobots("blog", false, true)).toBeUndefined();
            const tr = await loadTextContent(r, "blog_post", ids["b-tr"], l);
            /* Yalnız TR'de: zincir TR'ye ulaşır (TR aktif). */
            expect(tr.resolved.title).toBe("tr başlık");
            const av = await loadAvailableLocales(r, "blog_post", ids["b-tr"], L, { locale: l, content: tr.content });
            expect(av).toEqual(["tr"]);
            expect(textRobots("blog", false, av.includes(l))).toEqual(l === "tr" ? undefined : { index: false, follow: true });
          }
        });

        it("pasif dil zincire girmez; içerik yalnız pasif dildeyse 404 ve listede yok", async () => {
          for (const passive of L.filter((x) => x !== root)) {
            const enabled = L.filter((x) => x !== passive);
            const r = reader(pool, root, enabled);
            for (const l of enabled) {
              const c = await loadTextContent(r, "blog_post", ids[`b-only-${passive}`], l);
              expect(isTextContentMissing("blog_post", c.content)).toBe(true);
              const list = await loadTextContentMany(r, "blog_post", [ids["b-full"], ids[`b-only-${passive}`], ids[`b-only-${l}`]], l);
              expect(list.has(ids[`b-only-${passive}`])).toBe(false);
              expect(list.get(ids[`b-only-${l}`])?.resolved.title).toBe(`yalnız ${l} başlık`);
              expect(list.has(ids["b-full"])).toBe(true);
            }
          }
        });

        it("ana dilde bilinçli boş gövde zinciri durdurur (Faz 5); diğer alanlar yedeklenir", async () => {
          const w = writer(pool);
          const key = `b-empty-${root}`;
          const created = await w.createContent(
            { entity: "blog_post", technical: { slug: k(key), is_active: true }, locales: [{ locale: root, patch: { ...T(root), body: "" } }] },
            ACTOR
          );
          expect(created.ok).toBe(true);
          const id = (created as { id: string }).id;
          ids[key] = id;
          const r = reader(pool, root, L);
          for (const l of L.filter((x) => x !== root)) {
            const c = await loadTextContent(r, "blog_post", id, l);
            expect(c.resolved.body).toBe("");
            expect(c.resolved.title).toBe(`${root} başlık`);
          }
        });

        it("CMS: başlık/gövde/BÖLÜMLER istenen dilde; geçersiz bölüm → yedek; robots index (açık)", async () => {
          const r = reader(pool, root, L);
          for (const l of L) {
            const c = await loadTextContent(r, "page", ids["p-full"], l);
            expect(c.resolved).toMatchObject({ title: `${l} başlık`, body: `<p>${l} gövde</p>` });
            expect(c.resolved.sections).toEqual(SEC(l));
            expect(textRobots("page", false, !c.content!.isFallback)).toEqual({ index: true, follow: true });
            const s = await loadTextContent(r, "page", ids["p-sec"], l);
            expect(s.resolved.body).toBe(`<p>${l} gövde</p>`);
            /* Bölüm yalnız TR'de geçerli → TR aktif olduğu sürece TR bölümleri. */
            expect(s.resolved.sections).toEqual(SEC("tr"));
          }
        });

        it("CMS: pages.content ek yedeği yalnız TR satırı için", async () => {
          if (!FIXTURE_DDL) return;
          const r = reader(pool, root, L);
          expect((await loadTextContent(r, "page", ids["p-legacy"], "tr")).resolved.body).toBe("<p>ESKİ CONTENT</p>");
          const en = await loadTextContent(r, "page", ids["p-legacy"], "en");
          /* EN gövdesi yok → zincir: (ana dil) … TR (ek yedekle dolu). */
          expect(en.resolved.title).toBe("legacy page");
          expect(en.resolved.body).toBe("<p>ESKİ CONTENT</p>");
        });
      });
    }

    it("teknik anahtar (slug) içerik yazımından sonra değişmez", async () => {
      const w = writer(pool);
      expect((await w.saveContent("blog_post", ids["b-full"], "en", { title: "EN v2" }, ACTOR)).ok).toBe(true);
      expect((await w.saveContent("page", ids["p-full"], "de", { title: "DE v2" }, ACTOR)).ok).toBe(true);
      expect((await pool.query("SELECT slug FROM blog_posts WHERE id = $1", [ids["b-full"]])).rows[0].slug).toBe(k("b-full"));
      expect((await pool.query("SELECT slug FROM pages WHERE id = $1", [ids["p-full"]])).rows[0].slug).toBe(k("p-full"));
      const r = reader(pool, "tr", L);
      expect((await loadTextContent(r, "blog_post", ids["b-full"], "en")).resolved.title).toBe("EN v2");
    });

    it("ana dil TR: eski okuyucu ↔ merkezi servis + eski SEO 'çeviri var' kararı — BÜTÜN kayıtlar (şablon dahil)", async () => {
      const repo = createContentRepository((q) => pool.query(q.text, q.values));
      const svc = createContentReadService({ repository: repo, getLocaleContext: () => ({ root: "tr", enabled: L }) });
      const allowed = new Set(["fills-gap", "empty-normalization"]);
      const counts: Record<string, number> = {};
      const seoDiff: string[] = [];
      for (const entity of ["blog_post", "page"] as ContentEntityKey[]) {
        const def = CONTENT_ENTITY_BY_KEY[entity];
        const hasContent = entity === "page" && FIXTURE_DDL;
        const cols = def.fields.map((f) => `"${f.baseColumn}"`).join(", ");
        const base = (await pool.query(`SELECT id::text AS id, ${cols}, slug${hasContent ? ", content" : ""} FROM "${def.parentTable}"`)).rows;
        const idList = base.map((b) => String(b.id));
        const idx = indexContentRows(await repo.fetchRows(def, idList));
        for (const l of L) {
          const next = await svc.getContentMany(entity, idList, l);
          for (const b of base) {
            const byLocale = idx.get(String(b.id)) ?? {};
            const n = next.get(String(b.id)) ?? null;
            const diffs = diffLegacyVsNext(def, resolveLegacy(def, b as never, byLocale, l), n, byLocale).filter((x) => x.field !== "slug");
            const who = Object.entries(ids).find(([, v]) => v === String(b.id))?.[0] ?? "TEMPLATE";
            for (const df of diffs) {
              const key = `${entity}:${who === "TEMPLATE" ? "TEMPLATE" : "seed"}:${df.reason}`;
              counts[key] = (counts[key] ?? 0) + 1;
            }
            expect(diffs.filter((x) => !allowed.has(x.reason))).toEqual([]);
            /* SEO: eski "çeviri var" (TR daima) ↔ merkezi !isFallback */
            const legacyAvail = legacyTextAvailable(byLocale, l);
            const nextAvail = !!n && !n.isFallback;
            if (legacyAvail !== nextAvail) seoDiff.push(`${entity}:${who}:${l}:${legacyAvail}->${nextAvail}`);
          }
        }
      }
      console.log(`[f6d3] fark nedenleri (${cfg.name}):`, JSON.stringify(counts), "SEO farkı:", JSON.stringify(seoDiff));
      /* Tek izinli SEO farkı: TR satırında başlık/gövde/özet OLMAYAN kayıtlar (yalnız başka dilde
         oluşturulmuş) — eski kural TR'yi "daima mevcut" sayıyordu (simetri düzeltmesi, S3). */
      for (const x of seoDiff) expect(x).toMatch(/:(b-only-en|b-only-de|b-empty-en|b-empty-de):tr:true->false$/);
      /* Şablon verisinde eski ↔ merkezi SEO kararı BİREBİR. */
      expect(seoDiff.filter((x) => x.includes(":TEMPLATE:"))).toEqual([]);
    });
  });
}
