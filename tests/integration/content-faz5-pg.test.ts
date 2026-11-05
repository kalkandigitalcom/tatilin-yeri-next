import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITIES, CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import { LOCALIZED_SLUGS_SQL, rowsToSlugMap } from "@/lib/i18n/routing/sql";
import { toBaseSlug, toLocalizedSlug, type RoutingContext } from "@/lib/i18n/routing/context";

/* ===============================================================
   Faz 5 — İZOLE PostgreSQL: teknik anahtar / dil slug'ı ayrımı
   (migration 108 TASLAĞI), yeni kayıt (createContent), 14 tür × ana dil
   TR/EN/DE, pages.content sözleşmesi, eşzamanlılık ve rollback.
   CONTENT_FAZ5_PG_URL: 082–107 + 108 TASLAĞI uygulanmış TEK KULLANIMLIK DB.
   CONTENT_FAZ5_PG_URL_NO108: 108'siz kopya (TR slug kilidi).
   Tanımlı değilse ATLANIR. Testler veri YAZAR.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};

const URL = process.env.CONTENT_FAZ5_PG_URL;
const URL_NO108 = process.env.CONTENT_FAZ5_PG_URL_NO108;
const ACTOR = { actorId: "faz5-test" };

async function mkPool(url: string): Promise<Pool> {
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 12 }) as unknown as Pool;
}

function writer(pool: Pool) {
  const stats = { deadlocks: 0 };
  const transaction: TransactionRunner = async (fn) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn((t, v) => c.query(t, v as unknown[]));
      await c.query("COMMIT");
      return r;
    } catch (e) {
      if ((e as { code?: string }).code === "40P01") stats.deadlocks++;
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };
  return { ...createContentWriteService({ transaction, enabled: () => true, lockTimeoutMs: 10_000 }), stats };
}

function reader(pool: Pool, root: Locale, enabled: Locale[] = ["tr", "en", "de"]) {
  return createContentReadService({
    repository: createContentRepository((q) => pool.query(q.text, q.values)),
    getLocaleContext: () => ({ root, enabled: [root, ...enabled.filter((l) => l !== root)] }),
  });
}

async function trRow(pool: Pool, key: ContentEntityKey, id: string, locale: Locale) {
  const d = CONTENT_ENTITY_BY_KEY[key];
  return (await pool.query(`SELECT * FROM "${d.table}" WHERE "${d.parentIdColumn}"::text=$1 AND locale=$2`, [id, locale])).rows[0] ?? null;
}
async function baseRow(pool: Pool, key: ContentEntityKey, id: string) {
  const d = CONTENT_ENTITY_BY_KEY[key];
  return (await pool.query(`SELECT * FROM "${d.parentTable}" WHERE id::text=$1`, [id])).rows[0] ?? null;
}

/** Minimal şemada her türün NOT NULL teknik kolonları (gerçek eylemler
 *  bunları kendi formundan verir). */
const villaCursor: Record<string, number> = {};
async function technicalFor(pool: Pool, key: ContentEntityKey, n: string): Promise<Record<string, unknown>> {
  /* koleksiyonlarda villa_id UNIQUE → her oluşturma için ayrı test villası */
  const k = (villaCursor[key] = (villaCursor[key] ?? 0) + 1);
  const villaId = `a8000000-0000-0000-0000-${String(k).padStart(12, "0")}`;
  switch (key) {
    case "villa": return { slug: `f5-villa-${n}`, title: `F5 Villa ${n}` };
    case "villa_type": return { slug: `f5-tip-${n}` };
    case "blog_post": return { slug: `f5-blog-${n}`, is_active: true };
    case "page": return { slug: `f5-sayfa-${n}` };
    case "homepage_collection": return { villa_id: villaId };
    case "discount_collection": return { villa_id: villaId };
    default: return {};
  }
}

function val(key: ContentEntityKey, tag: string): Record<string, unknown> {
  const d = CONTENT_ENTITY_BY_KEY[key];
  const f = d.key === "site_popup" ? "title" : d.fields[0].name;
  return { [f]: `${key}-${tag}` };
}

const d = URL ? describe : describe.skip;

d("Faz 5 — izole PG (108 taslağı uygulanmış)", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await mkPool(URL!);
    expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
    expect((await pool.query("SELECT public.content_language_slugs_separated() AS ok")).rows[0].ok).toBe(true);
    await pool.query(
      `INSERT INTO villa (id,title,slug,description) SELECT ('a8000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid, 'K'||g, 'f5-k-'||g, 'k' FROM generate_series(1,12) g ON CONFLICT DO NOTHING`
    );
  });
  afterAll(async () => {
    await pool?.end();
  });

  const SINGLETONS = new Set<ContentEntityKey>(["settings", "site_popup"]);
  const CREATABLE = CONTENT_ENTITIES.filter((e) => !SINGLETONS.has(e.key));

  for (const root of ["tr", "en", "de"] as Locale[]) {
    it(`14 tür — ana dil ${root.toUpperCase()}: yeni kayıt (3 dil), güncelleme (3 dil), eksik çeviri`, async () => {
      const w = writer(pool);
      for (const def of CONTENT_ENTITIES) {
        let id: string;
        if (SINGLETONS.has(def.key)) {
          id = String((await pool.query(`SELECT id::text AS id FROM "${def.parentTable}" ORDER BY id LIMIT 1`)).rows[0].id);
          await pool.query(`DELETE FROM "${def.table}" WHERE "${def.parentIdColumn}"::text=$1 AND locale <> 'tr'`, [id]);
          // tekil kayıt: "yeni" = ana dil DIŞINDAKİ dillerde yeni çeviri satırı
          for (const l of (["tr", "en", "de"] as Locale[]).filter((x) => x !== "tr")) {
            const r = await w.saveContent(def.key, id, l, val(def.key, `new-${root}-${l}`), ACTOR);
            expect({ e: def.key, l, r }).toMatchObject({ e: def.key, l, r: { ok: true, created: true } });
          }
        } else {
          // yalnız ana dilde oluştur → diğer diller EKSİK
          const c = await w.createContent(
            { entity: def.key, technical: await technicalFor(pool, def.key, `${root}-a`), locales: [{ locale: root, patch: val(def.key, `root-${root}`) }] },
            ACTOR
          );
          expect({ e: def.key, c }).toMatchObject({ e: def.key, c: { ok: true } });
          id = (c as { id: string }).id;
          const f = Object.keys(val(def.key, "x"))[0];
          const rd = reader(pool, root);
          for (const l of ["tr", "en", "de"] as Locale[]) {
            const got = await rd.getContent(def.key, id, l);
            expect({ e: def.key, l, v: got?.values[f], src: got?.sourceLocale[f] }).toEqual({ e: def.key, l, v: `${def.key}-root-${root}`, src: root });
            if (l !== root && ["page", "blog_post"].includes(def.key)) expect(got?.isFallback).toBe(true);
          }
          if (root !== "tr") {
            // TR aynası boş başlar (onaylı karar): NOT NULL'da '' , değilse NULL
            const tr = await trRow(pool, def.key, id, "tr");
            expect({ e: def.key, ok: ["", null].includes((tr?.[f] ?? null) as string | null) }).toEqual({ e: def.key, ok: true });
          }
          // 3 dilde birden yeni kayıt
          const c3 = await w.createContent(
            {
              entity: def.key,
              technical: await technicalFor(pool, def.key, `${root}-b`),
              locales: (["tr", "en", "de"] as Locale[]).map((l) => ({ locale: l, patch: val(def.key, `all-${l}`) })),
            },
            ACTOR
          );
          expect({ e: def.key, c3 }).toMatchObject({ e: def.key, c3: { ok: true } });
          for (const l of ["tr", "en", "de"] as Locale[]) {
            const got = await reader(pool, root).getContent(def.key, (c3 as { id: string }).id, l);
            expect({ e: def.key, l, src: got?.sourceLocale[f] }).toEqual({ e: def.key, l, src: l });
          }
        }
        // 3 dilde güncelleme
        for (const l of ["tr", "en", "de"] as Locale[]) {
          const r = await w.saveContent(def.key, id, l, val(def.key, `upd-${root}-${l}`), ACTOR);
          expect({ e: def.key, l, ok: r.ok }).toEqual({ e: def.key, l, ok: true });
          const f = Object.keys(val(def.key, "x"))[0];
          expect({ e: def.key, l, v: (await trRow(pool, def.key, id, l))?.[f] }).toEqual({ e: def.key, l, v: `${def.key}-upd-${root}-${l}` });
        }
        // TR aynası = ana kolon (karar 1)
        const f = Object.keys(val(def.key, "x"))[0];
        const col = def.fields.find((x) => x.name === f)!.baseColumn;
        expect({ e: def.key, base: (await baseRow(pool, def.key, id))?.[col] }).toEqual({ e: def.key, base: `${def.key}-upd-${root}-tr` });
      }
      expect(CREATABLE.length).toBe(12);
    });
  }

  it("teknik anahtar ≠ TR URL slug'ı: TR slug değişir, teknik anahtar DEĞİŞMEZ; ayna ezmez; geçmiş (tr)", async () => {
    const w = writer(pool);
    const c = await w.createContent({ entity: "villa", technical: { slug: "f5-handle-1", title: "H" }, locales: [{ locale: "tr", patch: { description: "TR" } }] }, ACTOR);
    expect(c.ok).toBe(true);
    const id = (c as { id: string }).id;
    expect((await trRow(pool, "villa", id, "tr"))?.slug).toBe("f5-handle-1"); // INSERT tohumu
    expect(await w.saveContent("villa", id, "tr", { slug: "deniz-manzarali-f5" }, ACTOR)).toMatchObject({ ok: true, target: "base" });
    expect((await baseRow(pool, "villa", id))?.slug).toBe("f5-handle-1");
    expect((await trRow(pool, "villa", id, "tr"))?.slug).toBe("deniz-manzarali-f5");
    // TR içerik yazımı (ayna) TR slug'ını EZMEZ (108)
    expect((await w.saveContent("villa", id, "tr", { description: "TR 2" }, ACTOR)).ok).toBe(true);
    expect((await trRow(pool, "villa", id, "tr"))?.slug).toBe("deniz-manzarali-f5");
    expect((await baseRow(pool, "villa", id))?.description).toBe("TR 2");
    // geçmiş
    expect((await w.saveContent("villa", id, "tr", { slug: "deniz-manzarali-f5-2" }, ACTOR)).ok).toBe(true);
    const red = await pool.query(`SELECT locale FROM url_redirects WHERE entity_kind='villa' AND old_slug='deniz-manzarali-f5'`);
    expect(red.rows).toEqual([{ locale: "tr" }]);
    // routing: TR URL çeviri satırından, teknik anahtar → TR slug
    const rows = (await pool.query(LOCALIZED_SLUGS_SQL)).rows as never;
    const ctx = { root: "tr", enabled: ["tr", "en", "de"], slugs: rowsToSlugMap(rows), redirects: {} } as unknown as RoutingContext;
    expect(toLocalizedSlug(ctx, "villa", "f5-handle-1", "tr")).toBe("deniz-manzarali-f5-2");
    expect(toBaseSlug(ctx, "villa", "deniz-manzarali-f5-2", "tr")).toBe("f5-handle-1");
    // TR slug temizle → URL teknik anahtar
    expect(await w.saveContent("villa", id, "tr", { slug: null }, ACTOR)).toMatchObject({ ok: true, slug: null });
    // guard: tr satırının İÇERİK kolonuna doğrudan yazma hâlâ engelli
    await expect(pool.query(`UPDATE villa_translations SET description='x' WHERE villa_id::text=$1 AND locale='tr'`, [id])).rejects.toThrow(/content_mirror_guard/);
    // teknik anahtar başka kaydın TR slug'ı olarak kullanılamaz
    const c2 = await w.createContent({ entity: "villa", technical: { slug: "f5-handle-2", title: "H2" }, locales: [{ locale: "tr", patch: { description: "x" } }] }, ACTOR);
    expect(await w.saveContent("villa", (c2 as { id: string }).id, "tr", { slug: "f5-handle-1" }, ACTOR)).toMatchObject({ ok: false, code: "conflict" });
  });

  it("pages.content sözleşmesi: NULL → eski content görünür; \"\" (bilerek boşaltma) → GÖRÜNMEZ; eski veri bozulmaz", async () => {
    await pool.query("ALTER TABLE pages ADD COLUMN IF NOT EXISTS content text");
    const id = "e5000000-0000-0000-0000-000000000001";
    await pool.query(`INSERT INTO pages (id,title,slug,body,content) VALUES ($1,'Eski','f5-eski',NULL,'<p>ESKİ content</p>') ON CONFLICT (id) DO NOTHING`, [id]);
    const rd = reader(pool, "tr");
    expect((await rd.getContent("page", id, "tr"))?.values.body).toBe("<p>ESKİ content</p>");
    const w = writer(pool);
    expect((await w.saveContent("page", id, "tr", { body: "" }, ACTOR)).ok).toBe(true);
    const after = await rd.getContent("page", id, "tr");
    /* Faz 5 son kontroller: bilinçli boş → "" döner (NULL değil); eski content
       GÖRÜNMEZ, içerik yok sayılır (missing), zincir durur. */
    expect(after?.values.body).toBe("");
    expect(after?.explicitEmpty).toEqual(["body"]);
    expect(after?.missing).toContain("body");
    expect((await baseRow(pool, "page", id))?.content).toBe("<p>ESKİ content</p>"); // eski kolon korunur
    expect((await w.saveContent("page", id, "tr", { body: null }, ACTOR)).ok).toBe(true);
    expect((await rd.getContent("page", id, "tr"))?.values.body).toBe("<p>ESKİ content</p>");
    expect((await w.saveContent("page", id, "tr", { body: "<p>Yeni</p>" }, ACTOR)).ok).toBe(true);
    expect((await rd.getContent("page", id, "tr"))?.values.body).toBe("<p>Yeni</p>");
  });

  it("yeni kayıt rollback: ikinci dil çakışırsa ANA KAYIT DA oluşmaz", async () => {
    const w = writer(pool);
    const before = Number((await pool.query(`SELECT count(*) FROM villa`)).rows[0].count);
    const r = await w.createContent(
      { entity: "villa", technical: { slug: "f5-rollback", title: "R" }, locales: [{ locale: "tr", patch: { description: "x" } }, { locale: "en", patch: { slug: "f5-handle-2" } }] },
      ACTOR
    );
    expect(r).toMatchObject({ ok: false, code: "conflict" });
    expect(Number((await pool.query(`SELECT count(*) FROM villa`)).rows[0].count)).toBe(before);
    expect((await pool.query(`SELECT 1 FROM villa WHERE slug='f5-rollback'`)).rows).toEqual([]);
  });

  it("eşzamanlı yeni kayıt aynı teknik anahtarla → tam olarak biri; eşzamanlı güncellemeler deadlock'suz", async () => {
    const w = writer(pool);
    const rs = await Promise.all(
      Array.from({ length: 6 }, () =>
        w.createContent({ entity: "villa_type", technical: { slug: "f5-yaris" }, locales: [{ locale: "en", patch: { name: "Race" } }] }, ACTOR)
      )
    );
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok).every((r) => (r as { code?: string }).code === "conflict")).toBe(true);
    const ids = (await pool.query(`SELECT id::text AS id FROM villa_types WHERE slug LIKE 'f5-tip-%' ORDER BY id LIMIT 3`)).rows.map((x) => String(x.id));
    for (let i = 0; i < 15; i++) {
      const mk = (order: string[], l: Locale) =>
        w.saveContentMany(order.map((id) => ({ entity: "villa_type" as const, parentId: id, locale: l, patch: { name: `c${i}` } })), ACTOR);
      const out = await Promise.all([mk(ids, "tr"), mk([...ids].reverse(), "en"), mk([ids[1], ids[2], ids[0]], "de")]);
      expect(out.every((o) => o.ok)).toBe(true);
    }
    expect(w.stats.deadlocks).toBe(0);
  });

  it("108: yeni ana kayıt INSERT'i TR slug'ını teknik anahtardan tohumlar; teknik anahtar değişimi TR slug'ına dokunmaz", async () => {
    await pool.query(`INSERT INTO villa (id,title,slug,description) VALUES ('a7000000-0000-0000-0000-000000000001','L','f5-legacy-handle','d') ON CONFLICT DO NOTHING`);
    expect((await trRow(pool, "villa", "a7000000-0000-0000-0000-000000000001", "tr"))?.slug).toBe("f5-legacy-handle");
    await pool.query(`UPDATE villa SET slug='f5-legacy-handle-2' WHERE id='a7000000-0000-0000-0000-000000000001'`);
    expect((await trRow(pool, "villa", "a7000000-0000-0000-0000-000000000001", "tr"))?.slug).toBe("f5-legacy-handle");
  });
});

const dn = URL_NO108 ? describe : describe.skip;
dn("Faz 5 — izole PG (108 YOK): TR URL slug'ı kilitli, teknik anahtar korunur", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await mkPool(URL_NO108!);
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("base modunda TR slug yazımı guard; içerik yazımı çalışır; teknik anahtar değişmez", async () => {
    const w = writer(pool);
    const id = String((await pool.query(`SELECT id::text AS id FROM villa WHERE slug IS NOT NULL ORDER BY id LIMIT 1`)).rows[0].id);
    const handle = (await baseRow(pool, "villa", id))?.slug;
    expect(await w.saveContent("villa", id, "tr", { slug: "yeni-tr" }, ACTOR)).toMatchObject({ ok: false, code: "guard" });
    expect((await w.saveContent("villa", id, "tr", { description: "TR yeni" }, ACTOR)).ok).toBe(true);
    expect((await baseRow(pool, "villa", id))?.slug).toBe(handle);
    expect((await w.saveContent("villa", id, "en", { slug: "en-ok-f5" }, ACTOR)).ok).toBe(true);
  });
});
