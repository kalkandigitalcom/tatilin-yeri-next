import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import { assignMissingTechnicalKeyWith } from "@/lib/i18n/content/content-technical-key";
import { resolveLegacy, diffLegacyVsNext } from "@/lib/i18n/content/content-legacy-compare";

/* ===============================================================
   Faz 5 SON KONTROLLER — İZOLE PostgreSQL
   1) Teknik anahtar: yalnız oluşturmada yazılır, güncellemede değişmez;
      TR/EN/DE slug'ları bağımsız (villa, blog, sayfa, kategori).
      Migration 108 ÖNCESİ (CONTENT_SK_PG_URL_NO108) ve SONRASI
      (CONTENT_SK_PG_URL_108) AYRI AYRI.
   2) Bilinçli boş gövde (""): blog ve sayfada zincir durur; NULL ve
      "anahtar yok" sözleşmesi; eski ↔ yeni okuma karşılaştırması.
   Ayrıca ayna tetikleyicisi, guard, rollback, eşzamanlı yazma.
   Her URL TEK KULLANIMLIK bir TEMPLATE kopyası olmalı. Testler veri
   YAZAR. CONTENT_SK_PG_FIXTURE_DDL=1 ise YALNIZ bu kopyaya
   `pages.content` test kolonu eklenir (migration değil).
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};

const ACTOR = { actorId: "faz5-son-kontroller" };
const RUN = Date.now().toString(36);
const L: Locale[] = ["tr", "en", "de"];

async function mkPool(url: string): Promise<Pool> {
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 14 }) as unknown as Pool;
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
function reader(pool: Pool, root: Locale) {
  return createContentReadService({
    repository: createContentRepository((q) => pool.query(q.text, q.values)),
    getLocaleContext: () => ({ root, enabled: [root, ...L.filter((l) => l !== root)] }),
  });
}
async function tRow(pool: Pool, key: ContentEntityKey, id: string, locale: Locale) {
  const d = CONTENT_ENTITY_BY_KEY[key];
  return (await pool.query(`SELECT * FROM "${d.table}" WHERE "${d.parentIdColumn}"::text=$1 AND locale=$2`, [id, locale])).rows[0] ?? null;
}
async function base(pool: Pool, key: ContentEntityKey, id: string) {
  const d = CONTENT_ENTITY_BY_KEY[key];
  return (await pool.query(`SELECT * FROM "${d.parentTable}" WHERE id::text=$1`, [id])).rows[0] ?? null;
}
async function rowsByLocale(pool: Pool, key: ContentEntityKey, id: string) {
  const d = CONTENT_ENTITY_BY_KEY[key];
  const r = await pool.query(`SELECT * FROM "${d.table}" WHERE "${d.parentIdColumn}"::text=$1`, [id]);
  const out: Record<string, { parentId: string; locale: Locale; values: Record<string, unknown>; slug: string | null }> = {};
  for (const row of r.rows) {
    const values: Record<string, unknown> = {};
    for (const f of d.fields) values[f.name] = row[f.name] ?? null;
    out[String(row.locale)] = { parentId: id, locale: row.locale as Locale, values, slug: (row.slug as string | null) ?? null };
  }
  return out;
}

/* Tür başına: oluşturma için teknik alanlar + bir içerik alanı. */
const CASES: Array<{ key: ContentEntityKey; field: string; technical: (h: string) => Record<string, unknown>; techUpdate: Record<string, unknown> }> = [
  { key: "villa", field: "description", technical: (h) => ({ slug: h, title: `V ${h}` }), techUpdate: { title: "Yeni villa adı" } },
  { key: "blog_post", field: "title", technical: (h) => ({ slug: h, is_active: false }), techUpdate: { is_active: true } },
  { key: "page", field: "title", technical: (h) => ({ slug: h, is_active: true }), techUpdate: { is_active: false } },
  { key: "villa_type", field: "name", technical: (h) => ({ slug: h }), techUpdate: {} },
];

const CONFIGS = [
  { name: "108 SONRASI", url: process.env.CONTENT_SK_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ", url: process.env.CONTENT_SK_PG_URL_NO108, has108: false },
];

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 5 son kontroller — izole PG (${cfg.name})`, () => {
    let pool: Pool;
    let hasContentCol = false;
    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      const cap = (await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok;
      expect(cap).toBe(cfg.has108);
      if (process.env.CONTENT_SK_PG_FIXTURE_DDL === "1") {
        await pool.query("ALTER TABLE pages ADD COLUMN IF NOT EXISTS content text");
      }
      hasContentCol = (await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name='pages' AND column_name='content'`)).rows.length > 0;
    });
    afterAll(async () => {
      await pool?.end();
    });

    /* ---------------- 1) TEKNİK ANAHTAR ---------------- */
    for (const c of CASES) {
      it(`${c.key}: anahtar yalnız oluşturmada; 3 dil içerik + teknik güncelleme anahtarı DEĞİŞTİRMEZ; dil slug'ları bağımsız`, async () => {
        const w = writer(pool);
        const h = `sk-${c.key.replace("_", "-")}-${cfg.has108 ? "a" : "b"}-${RUN}`;
        const cr = await w.createContent({ entity: c.key, technical: c.technical(h), locales: [{ locale: "tr", patch: { [c.field]: "TR ilk" } }] }, ACTOR);
        expect(cr.ok ? true : cr).toBe(true);
        const id = (cr as { id: string }).id;
        expect((await base(pool, c.key, id)).slug).toBe(h);
        // TR satırının slug'ı oluşturmada teknik anahtardan tohumlanır (108: INSERT tohumu; 106: ayna)
        expect((await tRow(pool, c.key, id, "tr"))?.slug).toBe(h);

        // 3 dilde içerik + (varsa) teknik yama — tek tx
        const items = L.map((l) => ({ entity: c.key, parentId: id, locale: l, patch: { [c.field]: `${l} güncel` } }));
        const tech = Object.keys(c.techUpdate).length ? [{ entity: c.key, parentId: id, values: c.techUpdate }] : [];
        expect((await w.saveContentMany(items, ACTOR, { technical: tech })).ok).toBe(true);
        expect((await base(pool, c.key, id)).slug).toBe(h);
        expect((await tRow(pool, c.key, id, "tr"))?.slug).toBe(h); // ayna TR slug'ını ezmez/değiştirmez

        // EN ve DE slug'ları bağımsız; teknik anahtar ve TR slug'ı etkilenmez
        expect((await w.saveContent(c.key, id, "en", { slug: `${h}-en` }, ACTOR)).ok).toBe(true);
        expect((await w.saveContent(c.key, id, "de", { slug: `${h}-de` }, ACTOR)).ok).toBe(true);
        expect((await tRow(pool, c.key, id, "en"))?.slug).toBe(`${h}-en`);
        expect((await tRow(pool, c.key, id, "de"))?.slug).toBe(`${h}-de`);
        expect((await base(pool, c.key, id)).slug).toBe(h);
        expect((await tRow(pool, c.key, id, "tr"))?.slug).toBe(h);

        // TR slug: 108 sonrası bağımsız yazılır; öncesi guard ile REDDEDİLİR (hiçbir şey değişmez)
        const tr = await w.saveContent(c.key, id, "tr", { slug: `${h}-tr` }, ACTOR);
        if (cfg.has108) {
          expect(tr.ok ? true : tr).toBe(true);
          expect((await tRow(pool, c.key, id, "tr"))?.slug).toBe(`${h}-tr`);
        } else {
          expect(tr).toMatchObject({ ok: false, code: "guard" });
          expect((await tRow(pool, c.key, id, "tr"))?.slug).toBe(h);
        }
        expect((await base(pool, c.key, id)).slug).toBe(h);
        expect((await tRow(pool, c.key, id, "en"))?.slug).toBe(`${h}-en`);
        expect((await tRow(pool, c.key, id, "de"))?.slug).toBe(`${h}-de`);

        // TR içerik yazımı sonrası da (ayna) TR slug'ı korunur
        expect((await w.saveContent(c.key, id, "tr", { [c.field]: "TR son" }, ACTOR)).ok).toBe(true);
        expect((await tRow(pool, c.key, id, "tr"))?.slug).toBe(cfg.has108 ? `${h}-tr` : h);
        expect((await base(pool, c.key, id)).slug).toBe(h);

        // teknik yama ile anahtar yazılamaz
        expect(await w.saveContentMany([], ACTOR, { technical: [{ entity: c.key, parentId: id, values: { slug: "x" } }] })).toMatchObject({ ok: false, code: "validation" });
        expect((await base(pool, c.key, id)).slug).toBe(h);
      });
    }

    it("ayna tetikleyicisi: TR içerik yazımı ana kolona yansır; EN/DE yazımı ana kolonu DEĞİŞTİRMEZ", async () => {
      const w = writer(pool);
      const cr = await w.createContent({ entity: "villa", technical: { slug: `sk-ayna-${cfg.has108}-${RUN}`, title: "A" }, locales: [{ locale: "tr", patch: { description: "TR-1" } }] }, ACTOR);
      const id = (cr as { id: string }).id;
      expect((await base(pool, "villa", id)).description).toBe("TR-1");
      await w.saveContent("villa", id, "tr", { description: "TR-2" }, ACTOR);
      expect((await base(pool, "villa", id)).description).toBe("TR-2");
      await w.saveContent("villa", id, "en", { description: "EN-1" }, ACTOR);
      await w.saveContent("villa", id, "de", { description: "DE-1" }, ACTOR);
      expect((await base(pool, "villa", id)).description).toBe("TR-2");
      expect((await tRow(pool, "villa", id, "tr"))?.description).toBe("TR-2");
    });

    it("guard: TR satırının içeriğine DOĞRUDAN yazım reddedilir (her iki durumda); slug-only TR güncellemesi yalnız 108 sonrası serbest", async () => {
      const w = writer(pool);
      const h = `sk-guard-${cfg.has108}-${RUN}`;
      const cr = await w.createContent({ entity: "villa", technical: { slug: h, title: "G" }, locales: [{ locale: "tr", patch: { description: "TR" } }] }, ACTOR);
      const id = (cr as { id: string }).id;
      await expect(pool.query(`UPDATE villa_translations SET description='HACK' WHERE villa_id::text=$1 AND locale='tr'`, [id])).rejects.toThrow(/content_mirror_guard/);
      expect((await tRow(pool, "villa", id, "tr"))?.description).toBe("TR");
      const slugOnly = pool.query(`UPDATE villa_translations SET slug=$2 WHERE villa_id::text=$1 AND locale='tr'`, [id, `${h}-x`]);
      if (cfg.has108) await expect(slugOnly).resolves.toBeTruthy();
      else await expect(slugOnly).rejects.toThrow(/content_mirror_guard/);
      expect((await base(pool, "villa", id)).slug).toBe(h);
    });

    it("rollback: hatalı teknik kolon → içerik ve dil slug'ı da geri alınır; anahtar sabit", async () => {
      const w = writer(pool);
      const h = `sk-rb-${cfg.has108}-${RUN}`;
      const cr = await w.createContent({ entity: "blog_post", technical: { slug: h, is_active: false }, locales: [{ locale: "tr", patch: { title: "İlk" } }] }, ACTOR);
      const id = (cr as { id: string }).id;
      const r = await w.saveContentMany(
        [
          { entity: "blog_post", parentId: id, locale: "tr", patch: { title: "GERİ AL" } },
          { entity: "blog_post", parentId: id, locale: "en", patch: { title: "ROLLBACK", slug: `${h}-en` } },
        ],
        ACTOR,
        { technical: [{ entity: "blog_post", parentId: id, values: { olmayan_kolon: 1 } }] }
      );
      expect(r.ok).toBe(false);
      expect((await tRow(pool, "blog_post", id, "tr"))?.title).toBe("İlk");
      expect(await tRow(pool, "blog_post", id, "en")).toBeNull();
      expect((await base(pool, "blog_post", id)).slug).toBe(h);
    });

    it("eşzamanlı: 18 paralel (3 dil içerik + EN/DE slug + teknik) → kilitlenme yok, anahtar sabit, slug'lar kendi dilinde", async () => {
      const w = writer(pool);
      const h = `sk-es-${cfg.has108}-${RUN}`;
      const cr = await w.createContent({ entity: "page", technical: { slug: h, is_active: true }, locales: [{ locale: "tr", patch: { title: "E" } }] }, ACTOR);
      const id = (cr as { id: string }).id;
      const rs = await Promise.all(
        Array.from({ length: 18 }, (_, i) => {
          const l = L[i % 3];
          const patch: Record<string, unknown> = { excerpt: `e${i}` };
          if (l !== "tr") patch.slug = `${h}-${l}-${i}`;
          return w.saveContentMany([{ entity: "page", parentId: id, locale: l, patch }], ACTOR, {
            technical: [{ entity: "page", parentId: id, values: { is_active: i % 2 === 0 } }],
          });
        })
      );
      expect(rs.filter((r) => !r.ok)).toEqual([]);
      expect((await base(pool, "page", id)).slug).toBe(h);
      expect((await tRow(pool, "page", id, "tr"))?.slug).toBe(h);
      expect(String((await tRow(pool, "page", id, "en"))?.slug)).toMatch(new RegExp(`^${h}-en-\\d+$`));
      expect(String((await tRow(pool, "page", id, "de"))?.slug)).toMatch(new RegExp(`^${h}-de-\\d+$`));
    });

    it("kategori: boş anahtar bir kez atanır, sonraki ad güncellemeleri DEĞİŞTİRMEZ", async () => {
      const w = writer(pool);
      const connect = async () => (await pool.connect()) as never;
      const id = (await pool.query(`INSERT INTO villa_types (name, slug) VALUES ($1, NULL) RETURNING id::text AS id`, [`Koy SK ${cfg.has108} ${RUN}`])).rows[0].id as string;
      const first = await assignMissingTechnicalKeyWith(connect, "villa_type", id, `Koy SK ${cfg.has108} ${RUN}`);
      expect(first).toMatchObject({ ok: true, assigned: true });
      const key = (first as { slug: string }).slug;
      expect((await w.saveContent("villa_type", id, "tr", { name: "Bambaşka Ad" }, ACTOR)).ok).toBe(true);
      expect((await w.saveContent("villa_type", id, "en", { name: "Bay", slug: `${key}-en` }, ACTOR)).ok).toBe(true);
      expect(await assignMissingTechnicalKeyWith(connect, "villa_type", id, "Bambaşka Ad")).toEqual({ ok: true, slug: key, assigned: false });
      expect((await base(pool, "villa_type", id)).slug).toBe(key);
    });

    /* ---------------- 2) BİLİNÇLİ BOŞ GÖVDE ---------------- */
    for (const key of ["blog_post", "page"] as const) {
      for (const root of L) {
        it(`${key} — ana dil ${root.toUpperCase()}: gövde "" → başka dile düşmez; NULL → düşer; anahtar yok → dokunulmaz`, async () => {
          const w = writer(pool);
          const h = `sk-govde-${key.replace("_", "-")}-${root}-${cfg.has108}-${RUN}`;
          const cr = await w.createContent(
            {
              entity: key,
              technical: { slug: h, is_active: true },
              locales: L.map((l) => ({ locale: l, patch: { title: `${l} başlık`, body: `<p>${l} gövde</p>`, ...(l !== "tr" ? { slug: `${h}-${l}` } : {}) } })),
            },
            ACTOR
          );
          expect(cr.ok ? true : cr).toBe(true);
          const id = (cr as { id: string }).id;
          const rd = reader(pool, root);

          // bilinçli boş (ana form boşaltma): yalnız ana dilin gövdesi ""
          expect((await w.saveContent(key, id, root, { body: "" }, ACTOR)).ok).toBe(true);
          expect((await tRow(pool, key, id, root))?.body).toBe("");
          if (root === "tr") expect((await base(pool, key, id)).body).toBe(""); // ayna
          const own = await rd.getContent(key, id, root);
          expect(own?.values.body).toBe("");
          expect(own?.sourceLocale.body).toBe(root);
          expect(own?.explicitEmpty).toEqual(["body"]);
          expect(own?.isFallback).toBe(false); // başlık kendi dilinde → index (noindex kuralı aynı)
          // diğer diller kendi gövdeleriyle (etkilenmez)
          for (const l of L.filter((x) => x !== root)) {
            expect((await rd.getContent(key, id, l))?.values.body).toBe(`<p>${l} gövde</p>`);
          }

          // anahtar yok → gövde DOKUNULMAZ
          expect((await w.saveContent(key, id, root, { title: `${root} başlık 2` }, ACTOR)).ok).toBe(true);
          expect((await tRow(pool, key, id, root))?.body).toBe("");

          // başka dilde NULL gövde → ana dile düşer, ana dil bilinçli boş → "" (üçüncü dile geçmez)
          const other = L.find((x) => x !== root)!;
          expect((await w.saveContent(key, id, other, { body: null }, ACTOR)).ok).toBe(true);
          const ov = await rd.getContent(key, id, other);
          expect(ov?.values.body).toBe("");
          expect(ov?.sourceLocale.body).toBe(root);
          expect(ov?.values.title).toBe(`${other} başlık`); // diğer alanlar etkilenmez

          // NULL (değer yok) → zincir devam eder
          expect((await w.saveContent(key, id, root, { body: null }, ACTOR)).ok).toBe(true);
          const back = await rd.getContent(key, id, root);
          const third = L.find((x) => x !== root && x !== other)!;
          expect(back?.values.body).toBe(`<p>${third} gövde</p>`);
          expect(back?.sourceLocale.body).toBe(third);
          expect(back?.explicitEmpty).toBeUndefined();
        });
      }
    }

    it("noindex korunur: istenen dilde yalnız bilinçli boş gövde → isFallback=true; tam çeviri → false", async () => {
      const w = writer(pool);
      const h = `sk-noindex-${cfg.has108}-${RUN}`;
      const cr = await w.createContent({ entity: "blog_post", technical: { slug: h, is_active: true }, locales: [{ locale: "tr", patch: { title: "TR", body: "<p>TR</p>" } }] }, ACTOR);
      const id = (cr as { id: string }).id;
      await w.saveContent("blog_post", id, "en", { body: "" }, ACTOR);
      const en = await reader(pool, "tr").getContent("blog_post", id, "en");
      expect(en?.isFallback).toBe(true);
      expect(en?.values.body).toBe("");
      await w.saveContent("blog_post", id, "en", { title: "EN" }, ACTOR);
      expect((await reader(pool, "tr").getContent("blog_post", id, "en"))?.isFallback).toBe(false);
    });

    it("sayfa: eski pages.content — gövde \"\" iken GERİ GELMEZ, NULL iken gelir (kolon varsa)", async () => {
      if (!hasContentCol) return;
      const w = writer(pool);
      const h = `sk-content-${cfg.has108}-${RUN}`;
      const cr = await w.createContent({ entity: "page", technical: { slug: h, is_active: true }, locales: [{ locale: "tr", patch: { title: "TR", body: null } }] }, ACTOR);
      const id = (cr as { id: string }).id;
      await pool.query(`UPDATE pages SET content='<p>ESKİ</p>' WHERE id::text=$1`, [id]);
      await w.saveContent("page", id, "en", { title: "EN", body: "<p>EN</p>" }, ACTOR);
      const rd = reader(pool, "tr");
      expect((await rd.getContent("page", id, "tr"))?.values.body).toBe("<p>ESKİ</p>");
      await w.saveContent("page", id, "tr", { body: "" }, ACTOR);
      const t = await rd.getContent("page", id, "tr");
      expect(t?.values.body).toBe("");
      expect((await base(pool, "page", id)).content).toBe("<p>ESKİ</p>"); // eski kolon değişmez
    });

    it("eski ↔ yeni karşılaştırma (PG verisiyle): ana dil TR, gövde \"\" → TR ve çevirisiz dilde gövde farkı YOK", async () => {
      const w = writer(pool);
      for (const key of ["blog_post", "page"] as const) {
        const def = CONTENT_ENTITY_BY_KEY[key];
        const h = `sk-cmp-${key.replace("_", "-")}-${cfg.has108}-${RUN}`;
        const cr = await w.createContent({ entity: key, technical: { slug: h, is_active: true }, locales: [{ locale: "tr", patch: { title: "TR", body: "" } }, { locale: "de", patch: { title: "DE", body: "<p>DE</p>", slug: `${h}-de` } }] }, ACTOR);
        const id = (cr as { id: string }).id;
        const byLocale = await rowsByLocale(pool, key, id);
        const b = await base(pool, key, id);
        for (const req of ["tr", "en"] as Locale[]) {
          const legacy = resolveLegacy(def, b as never, byLocale as never, req);
          const next = await reader(pool, "tr").getContent(key, id, req);
          const bodyDiff = diffLegacyVsNext(def, legacy, next, byLocale as never).filter((x) => x.field === "body");
          expect({ key, req, bodyDiff }).toEqual({ key, req, bodyDiff: [] });
        }
      }
    });
  });
}
