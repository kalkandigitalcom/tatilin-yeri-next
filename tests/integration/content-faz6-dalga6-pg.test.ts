import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService, type ContentCacheAdapter } from "@/lib/i18n/content/content-read-core";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { contentWriteInvalidationTags, isPersistentlyCacheable } from "@/lib/i18n/content/content-cache-policy";

/* ===============================================================
   Faz 6 DALGA 6 — İZOLE PostgreSQL: kalıcı içerik cache'i ↔ merkezi
   yazma invalidation'ı (GERÇEK SQL, gerçek okuma/yazma çekirdeği).
   unstable_cache/revalidateTag yerine aynı semantiği taşıyan bellek içi
   TagCache kullanılır: anahtar → değer + tag listesi; revalidate(tag)
   o tag'i taşıyan TÜM girdileri düşürür.
   CONTENT_F6D6_PG_URL_108   : m108clean'in TEK KULLANIMLIK kopyası
   CONTENT_F6D6_PG_URL_NO108 : m106'nın TEK KULLANIMLIK kopyası
   Testler veri YAZAR. Şablonlarda ÇALIŞTIRILMAZ.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};
const ACTOR = { actorId: "faz6-dalga6" };
const RUN = Date.now().toString(36);
const L: Locale[] = ["tr", "en", "de"];

class TagCache {
  store = new Map<string, { value: string; tags: string[] }>();
  misses = 0;
  adapter: ContentCacheAdapter = async (key, tags, fn) => {
    const hit = this.store.get(key);
    if (hit) return JSON.parse(hit.value);
    this.misses++;
    const v = await fn();
    this.store.set(key, { value: JSON.stringify(v), tags: [...tags] });
    return v;
  };
  revalidate(tag: string) {
    for (const [k, e] of this.store) if (e.tags.includes(tag)) this.store.delete(k);
  }
}

async function mkPool(url: string): Promise<Pool> {
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 8 }) as unknown as Pool;
}
function writer(pool: Pool, cache: TagCache | null, log?: string[][]) {
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
  return createContentWriteService({
    transaction,
    enabled: () => true,
    lockTimeoutMs: 10_000,
    /* content-write.server.ts'deki onCommitted ile AYNI tag kümesi. */
    onCommitted: cache
      ? ({ entities }) => {
          const tags = contentWriteInvalidationTags(entities);
          log?.push(tags);
          for (const t of tags) cache.revalidate(t);
        }
      : undefined,
  });
}

const CONFIGS = [
  { name: "108 SONRASI (m108clean kopyası)", url: process.env.CONTENT_F6D6_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ (m106 kopyası)", url: process.env.CONTENT_F6D6_PG_URL_NO108, has108: false },
];

/* Varlık → okunacak/yazılacak tek metin alanı. */
const FIELD: Record<string, string> = { blog_post: "title", page: "title", villa: "description", villa_type: "name" };
const ENTITIES = ["blog_post", "page", "villa", "villa_type"] as const;

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 6 Dalga 6 — izole PG cache invalidation (${cfg.name})`, () => {
    let pool: Pool;
    const ids: Record<string, string> = {};
    const k = (n: string) => `f6d6-${n.replace(/_/g, "-")}-${cfg.has108 ? "a" : "b"}-${RUN}`;
    const ctx = { root: "tr" as Locale, enabled: [...L] as Locale[] };
    const cache = new TagCache();
    const reader = () =>
      createContentReadService({
        repository: createContentRepository((q) => pool.query(q.text, q.values)),
        getLocaleContext: () => ({ root: ctx.root, enabled: [...ctx.enabled] }),
        cache: cache.adapter,
      });
    const val = async (entity: ContentEntityKey, key: string, l: Locale) => {
      const c = await reader().getContent(entity, ids[key], l);
      const v = c?.values?.[FIELD[entity]];
      return typeof v === "string" ? v : null;
    };
    const txt = (entity: string, l: string, p: string) => (FIELD[entity] === "description" ? `<p>${p} ${l}</p>` : `${p} ${l}`);

    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      expect((await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok).toBe(cfg.has108);
      const w = writer(pool, cache);
      const tech = (e: string, key: string) =>
        e === "villa" ? { slug: k(key), title: `V ${key}`, is_active: true } : e === "villa_type" ? { slug: k(key) } : { slug: k(key), is_active: true };
      for (const e of ENTITIES) {
        const extra = (l: Locale) => (e === "blog_post" || e === "page" ? { body: `<p>${l}</p>` } : {});
        const all = await w.createContent(
          { entity: e, technical: tech(e, `${e}-all`), locales: L.map((l) => ({ locale: l, patch: { [FIELD[e]]: txt(e, l, "v1"), ...extra(l) } })) },
          ACTOR
        );
        expect(all.ok ? true : all).toBe(true);
        ids[`${e}-all`] = (all as { id: string }).id;
        /* Yalnız TR + EN: DE ana dile düşer → ana dil değişiminin görünür olduğu kayıt. */
        const tren = await w.createContent(
          { entity: e, technical: tech(e, `${e}-tren`), locales: (["tr", "en"] as Locale[]).map((l) => ({ locale: l, patch: { [FIELD[e]]: txt(e, l, "v1"), ...extra(l) } })) },
          ACTOR
        );
        expect(tren.ok ? true : tren).toBe(true);
        ids[`${e}-tren`] = (tren as { id: string }).id;
      }
      cache.store.clear();
    });
    afterAll(async () => {
      await pool?.end();
    });

    it("politika: test edilen tüm varlıklar kalıcı cache'lenir (etiketsiz okuma yok)", () => {
      for (const e of ENTITIES) expect(isPersistentlyCacheable(e)).toBe(true);
    });

    for (const e of ENTITIES) {
      it(`${e}: TR/EN/DE okuma cache'ten gelir; çeviri kaydı yalnız ilgili tag'lerle düşer ve TAZE değer döner`, async () => {
        cache.store.clear();
        ctx.root = "tr";
        ctx.enabled = [...L];
        for (const l of L) expect(await val(e, `${e}-all`, l)).toBe(txt(e, l, "v1"));
        const misses = cache.misses;
        for (const l of L) expect(await val(e, `${e}-all`, l)).toBe(txt(e, l, "v1"));
        expect(cache.misses, "ikinci okuma DB'ye gitmemeli").toBe(misses);

        /* KONTROL: invalidation'sız yazım (onCommitted yok) → cache BAYAT kalır.
           Bu, testin cache'i gerçekten ölçtüğünü kanıtlar. */
        const silent = await writer(pool, null).saveContent(e, ids[`${e}-all`], "en", { [FIELD[e]]: txt(e, "en", "v2") }, ACTOR);
        expect(silent.ok ? true : silent).toBe(true);
        expect(await val(e, `${e}-all`, "en")).toBe(txt(e, "en", "v1"));

        /* Gerçek yol: merkezi yazma onCommitted → contentWriteInvalidationTags. */
        const log: string[][] = [];
        for (const l of L) {
          const r = await writer(pool, cache, log).saveContent(e, ids[`${e}-all`], l, { [FIELD[e]]: txt(e, l, "v3") }, ACTOR);
          expect(r.ok ? true : r).toBe(true);
          expect(await val(e, `${e}-all`, l), `${e} ${l}`).toBe(txt(e, l, "v3"));
        }
        for (const tags of log) {
          expect(tags).toContain(`content:${e}`);
          expect(tags).not.toContain("settings");
        }
      });

      it(`${e}: ana dil TR→EN→DE değişince eski ana dilin yedeği gösterilmez (anahtar ana dili taşır)`, async () => {
        ctx.enabled = [...L];
        ctx.root = "tr";
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "tr", "v1"));
        ctx.root = "en";
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "en", "v1"));
        ctx.root = "tr";
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "tr", "v1"));
        /* Onaylı Faz 3 zinciri: istenen → ana dil → diğer AKTİF diller (sırayla).
           DE ana dil, DE satırı yok: [de, tr, en] → TR; TR pasifse [de, en] → EN. */
        ctx.root = "de";
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "tr", "v1"));
        ctx.enabled = ["de", "en"];
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "en", "v1"));
        ctx.root = "tr";
        ctx.enabled = [...L];
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "tr", "v1"));
      });

      it(`${e}: pasif dil (EN kapalı) değerleri hiçbir dile sızmaz; EN tekrar açılınca güncel EN döner`, async () => {
        ctx.root = "tr";
        ctx.enabled = [...L];
        const enBefore = await val(e, `${e}-tren`, "en");
        expect(enBefore).toBe(txt(e, "en", "v1"));
        ctx.enabled = ["tr", "de"];
        expect(await val(e, `${e}-tren`, "en")).toBe(txt(e, "tr", "v1"));
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "tr", "v1"));
        /* Pasifken EN kaydedilir (admin pasif dili de düzenleyebilir). */
        const r = await writer(pool, cache).saveContent(e, ids[`${e}-tren`], "en", { [FIELD[e]]: txt(e, "en", "v4") }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        expect(await val(e, `${e}-tren`, "en")).toBe(txt(e, "tr", "v1"));
        ctx.enabled = [...L];
        expect(await val(e, `${e}-tren`, "en")).toBe(txt(e, "en", "v4"));
        expect(await val(e, `${e}-tren`, "de")).toBe(txt(e, "tr", "v1"));
      });
    }

    it("silme: eski silme yolu + invalidateContentEntity tag kümesi → silinen kayıt artık okunmaz", async () => {
      ctx.root = "tr";
      ctx.enabled = [...L];
      for (const [e, table] of [
        ["blog_post", "blog_posts"],
        ["page", "pages"],
      ] as const) {
        expect(await val(e, `${e}-tren`, "en")).not.toBeNull();
        /* Gerçek repository (blog/pages deleteById) yalnız ana satırı siler; çeviriler FK ile gider. */
        await pool.query(`DELETE FROM ${table} WHERE id = $1`, [ids[`${e}-tren`]]);
        expect((await pool.query(`SELECT count(*)::int AS n FROM ${e}_translations WHERE ${e}_id = $1`, [ids[`${e}-tren`]])).rows[0].n).toBe(0);
        /* Cache düşürülmeden: bayat (route'taki eksikliğin kanıtı). */
        expect(await val(e, `${e}-tren`, "en")).not.toBeNull();
        for (const t of contentWriteInvalidationTags([e])) cache.revalidate(t);
        expect(await val(e, `${e}-tren`, "en")).toBeNull();
        expect(await val(e, `${e}-tren`, "tr")).toBeNull();
      }
    });

    it("settings: kayıt yalnız settings + content:settings tag'iyle düşer; TR/EN/DE taze", async () => {
      const sid = String((await pool.query("SELECT id FROM settings LIMIT 1")).rows[0].id);
      ctx.root = "tr";
      ctx.enabled = [...L];
      const sv = async (l: Locale) => {
        const c = await reader().getContent("settings", sid, l);
        return (c?.values?.default_meta_title as string | null | undefined) ?? null;
      };
      const log: string[][] = [];
      for (const l of L) {
        await sv(l);
        const r = await writer(pool, cache, log).saveContent("settings", sid, l, { default_meta_title: `F6D6 ${l}` }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        expect(await sv(l)).toBe(`F6D6 ${l}`);
      }
      for (const tags of log) expect(tags).toEqual(expect.arrayContaining(["content", "content:settings", "settings"]));
    });
  });
}
