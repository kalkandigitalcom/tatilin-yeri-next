import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITIES, CONTENT_ENTITY_BY_KEY, type ContentEntityDef } from "@/lib/i18n/content/content-registry";
import {
  createContentWriteService,
  type TransactionRunner,
  type TxQuery,
} from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";

/* ===============================================================
   Faz 4 — İZOLE PostgreSQL entegrasyon testi (merkezi yazma servisi)
   ===============================================================
   CONTENT_WRITE_PG_URL tanımlı DEĞİLSE ATLANIR (normal suite hiçbir
   DB'ye bağlanmaz). Hedef: migration 082–107 uygulanmış, mod='base',
   TEK KULLANIMLIK test DB'si (yazar!).
   CONTENT_WRITE_PG_TRANSLATIONS_URL ayrıca verilirse o AYRI test DB'sinde
   content_mirror_mode() 'translations' döndürecek şekilde YALNIZ TEST
   İÇİN yeniden tanımlanır ve test sonunda 'base'e geri alınır. Bu bir
   migration değildir; repo'ya şema değişikliği eklenmez.
   =============================================================== */

type PgPool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{
    query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
    release: () => void;
  }>;
  end: () => Promise<void>;
};

const URL = process.env.CONTENT_WRITE_PG_URL;
const TURL = process.env.CONTENT_WRITE_PG_TRANSLATIONS_URL;
const ACTOR = { actorId: "faz4-test" };

async function makePool(url: string): Promise<PgPool> {
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 12 }) as unknown as PgPool;
}

function makeRunner(pool: PgPool, stats: { attempts: number; deadlocks: number }, hook?: (q: TxQuery) => TxQuery): TransactionRunner {
  return async (fn) => {
    stats.attempts++;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const base: TxQuery = (t, v) => c.query(t, v as unknown[]);
      const r = await fn(hook ? hook(base) : base);
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
}

function writer(pool: PgPool, hook?: (q: TxQuery) => TxQuery) {
  const stats = { attempts: 0, deadlocks: 0, committed: 0 };
  const s = createContentWriteService({
    transaction: makeRunner(pool, stats, hook),
    enabled: () => true,
    onCommitted: () => {
      stats.committed++;
    },
    lockTimeoutMs: 10_000,
  });
  return { ...s, stats };
}

function reader(pool: PgPool, root: Locale) {
  const enabled: Locale[] = [root, ...(["tr", "en", "de"] as Locale[]).filter((l) => l !== root)];
  return createContentReadService({
    repository: createContentRepository((q) => pool.query(q.text, q.values)),
    getLocaleContext: () => ({ root, enabled }),
  });
}

async function row(pool: PgPool, def: ContentEntityDef, id: string, locale: Locale) {
  const r = await pool.query(
    `SELECT * FROM "${def.table}" WHERE "${def.parentIdColumn}"::text = $1 AND locale = $2`,
    [id, locale]
  );
  return r.rows[0] ?? null;
}
async function base(pool: PgPool, def: ContentEntityDef, id: string) {
  return (await pool.query(`SELECT * FROM "${def.parentTable}" WHERE id::text = $1`, [id])).rows[0] ?? null;
}

function sampleValue(def: ContentEntityDef, tag: string): [string, unknown] {
  const f = def.fields[0];
  if (def.key === "site_popup") return ["title", `Popup ${tag}`];
  if (f.kind === "jsonb") return [f.name, [{ type: "richtext", content: `<p>${tag}</p>` }]];
  return [f.name, `${def.key} ${tag}`];
}

const d = URL ? describe : describe.skip;

d("Faz 4 — izole PG: merkezi yazma (mod=base)", () => {
  let pool: PgPool;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = await makePool(URL!);
    expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
    for (const def of CONTENT_ENTITIES) {
      const r = await pool.query(`SELECT id::text AS id FROM "${def.parentTable}" ORDER BY id LIMIT 1`);
      expect({ e: def.key, has: r.rows.length > 0 }).toEqual({ e: def.key, has: true });
      ids[def.key] = String(r.rows[0].id);
    }
    // eşzamanlılık / slug testleri için ek villalar (yalnız bu test DB'sinde)
    await pool.query(`INSERT INTO villa (id,title,slug,description) SELECT ('a5000000-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid, 'W'||g, 'w-villa-'||g, 'TR w '||g FROM generate_series(1,20) g ON CONFLICT DO NOTHING`);
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("14 tür × DE: YENİ çeviri satırı oluşturma (created=true) ve GÜNCELLEME (created=false)", async () => {
    const w = writer(pool);
    for (const def of CONTENT_ENTITIES) {
      const id = ids[def.key];
      await pool.query(`DELETE FROM "${def.table}" WHERE "${def.parentIdColumn}"::text = $1 AND locale = 'de'`, [id]);
      const [f, v1] = sampleValue(def, "DE1");
      const r1 = await w.saveContent(def.key, id, "de", { [f]: v1 }, ACTOR);
      expect({ e: def.key, r: r1 }).toMatchObject({ e: def.key, r: { ok: true, created: true, target: "translation", mode: "base" } });
      const [, v2] = sampleValue(def, "DE2");
      const r2 = await w.saveContent(def.key, id, "de", { [f]: v2 }, ACTOR);
      expect({ e: def.key, r: r2 }).toMatchObject({ e: def.key, r: { ok: true, created: false } });
      expect({ e: def.key, v: (await row(pool, def, id, "de"))?.[f] }).toEqual({ e: def.key, v: v2 });
    }
  });

  it("14 tür × TR (mod=base): ana kolon yazılır, 106 aynası tr satırını AYNI transaction'da günceller", async () => {
    const w = writer(pool);
    for (const def of CONTENT_ENTITIES) {
      const id = ids[def.key];
      const [f, v] = sampleValue(def, "TR-yeni");
      const r = await w.saveContent(def.key, id, "tr", { [f]: v }, ACTOR);
      expect({ e: def.key, r }).toMatchObject({ e: def.key, r: { ok: true, target: "base", created: false } });
      const col = def.fields.find((x) => x.name === f)!.baseColumn;
      expect({ e: def.key, base: (await base(pool, def, id))?.[col] }).toEqual({ e: def.key, base: v });
      expect({ e: def.key, tr: (await row(pool, def, id, "tr"))?.[f] }).toEqual({ e: def.key, tr: v });
    }
  });

  it("14 tür × EN: oluştur/güncelle + merkezi okuma servisiyle uyum (ana dil TR/EN/DE)", async () => {
    const w = writer(pool);
    for (const def of CONTENT_ENTITIES) {
      const id = ids[def.key];
      const [f, v] = sampleValue(def, "EN-okuma");
      expect((await w.saveContent(def.key, id, "en", { [f]: v }, ACTOR)).ok).toBe(true);
      for (const root of ["tr", "en", "de"] as Locale[]) {
        const c = await reader(pool, root).getContent(def.key, id, "en");
        expect({ e: def.key, root, v: c?.values[f], src: c?.sourceLocale[f] }).toEqual({ e: def.key, root, v, src: "en" });
      }
    }
  });

  it("ana dil TR → EN → DE değişse de yazma hedefi ve veri yeri değişmez (fiziksel taşıma yok)", async () => {
    const w = writer(pool);
    const def = CONTENT_ENTITY_BY_KEY.villa;
    const id = ids.villa;
    const snapshot = async () =>
      (await pool.query(`SELECT locale, description FROM villa_translations WHERE villa_id::text=$1 ORDER BY locale`, [id])).rows;
    for (const root of ["tr", "en", "de"] as Locale[]) {
      await pool.query(`UPDATE settings SET public_default_locale = $1`, [root]);
      const before = await snapshot();
      const r = await w.saveContentMany(
        (["tr", "en", "de"] as Locale[]).map((l) => ({ entity: "villa" as const, parentId: id, locale: l, patch: { badge: `${l}-${root}` } })),
        ACTOR
      );
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.results.map((x) => x.ok && x.target)).toEqual(["base", "translation", "translation"]);
      expect(await snapshot()).toEqual(before); // description'lar yerinde
      expect((await base(pool, def, id))?.badge).toBe(`tr-${root}`);
    }
    await pool.query(`UPDATE settings SET public_default_locale = 'tr'`);
  });

  it("kısmi güncelleme, NULL ve boş metin ayrımı; NOT NULL ana kolon", async () => {
    const w = writer(pool);
    const def = CONTENT_ENTITY_BY_KEY.villa;
    const id = "a5000000-0000-0000-0000-000000000001";
    expect((await w.saveContent("villa", id, "en", { description: "D", badge: "B", seo_title: "S" }, ACTOR)).ok).toBe(true);
    expect((await w.saveContent("villa", id, "en", { badge: null }, ACTOR)).ok).toBe(true);
    expect((await w.saveContent("villa", id, "en", { seo_title: "" }, ACTOR)).ok).toBe(true);
    const r = await row(pool, def, id, "en");
    expect([r?.description, r?.badge, r?.seo_title, r?.seo_description]).toEqual(["D", null, "", null]);
    const blog = ids.blog_post;
    expect(await w.saveContent("blog_post", blog, "tr", { title: null }, ACTOR)).toMatchObject({ ok: false, code: "validation", field: "title" });
    expect((await w.saveContent("blog_post", blog, "en", { title: null }, ACTOR)).ok).toBe(true);
    expect(await w.saveContent("site_popup", "1", "en", { stats: null as never }, ACTOR)).toMatchObject({ ok: false, code: "validation" });
  });

  it("guard aktif: tr satırına doğrudan yazma DB'de reddedilir (servis bu yüzden ana tabloya yazar)", async () => {
    await expect(
      pool.query(`UPDATE villa_translations SET badge='x' WHERE villa_id::text=$1 AND locale='tr'`, [ids.villa])
    ).rejects.toThrow(/content_mirror_guard/);
  });

  it("slug: EN oluştur, çakışmalar, format; slug geçmişi (EN ve TR) ve yeniden kullanım", async () => {
    const w = writer(pool);
    const A = "a5000000-0000-0000-0000-000000000002";
    const B = "a5000000-0000-0000-0000-000000000003";
    expect(await w.saveContent("villa", A, "en", { slug: "Faz4 Sea" }, ACTOR)).toMatchObject({ ok: true, slug: "faz4-sea" });
    expect(await w.saveContent("villa", B, "en", { slug: "faz4-sea" }, ACTOR)).toMatchObject({ ok: false, code: "conflict", field: "slug" });
    expect(await w.saveContent("villa", B, "en", { slug: "w-villa-2" }, ACTOR)).toMatchObject({ ok: false, code: "conflict" }); // A'nın TR/teknik slug'ı
    expect(await w.saveContent("villa", B, "en", { slug: "Bad_Slug!" }, ACTOR)).toMatchObject({ ok: false, code: "validation" });
    expect((await row(pool, CONTENT_ENTITY_BY_KEY.villa, B, "en"))?.slug ?? null).toBeNull();

    // EN slug değişimi → url_redirects (en)
    expect((await w.saveContent("villa", A, "en", { slug: "faz4-sea-2" }, ACTOR)).ok).toBe(true);
    const red = await pool.query(`SELECT locale, entity_id::text AS id FROM url_redirects WHERE entity_kind='villa' AND old_slug='faz4-sea'`);
    expect(red.rows).toEqual([{ locale: "en", id: A }]);
    // eski slug'ı geri almak yönlendirmeyi siler
    expect((await w.saveContent("villa", A, "en", { slug: "faz4-sea" }, ACTOR)).ok).toBe(true);
    expect((await pool.query(`SELECT 1 FROM url_redirects WHERE entity_kind='villa' AND old_slug='faz4-sea'`)).rows).toEqual([]);
    // EN slug temizleme → geçmişe yazılır, satır slug NULL
    expect(await w.saveContent("villa", A, "en", { slug: null }, ACTOR)).toMatchObject({ ok: true, slug: null });
    expect((await pool.query(`SELECT locale FROM url_redirects WHERE entity_kind='villa' AND old_slug='faz4-sea'`)).rows).toEqual([{ locale: "en" }]);

    /* Faz 5 kararı: ana tablo slug'ı TEKNİK ANAHTAR, servis yazmaz. Bu DB'de
       migration 108 (dil slug ayrımı) YOK → TR URL slug'ı yazımı guard ile
       reddedilir, teknik anahtar ve tr satırı değişmez. 108'li davranış:
       tests/integration/content-faz5-pg.test.ts. */
    expect(await w.saveContent("villa", A, "tr", { slug: "w-villa-2-yeni" }, ACTOR)).toMatchObject({ ok: false, code: "guard", field: "slug" });
    expect((await base(pool, CONTENT_ENTITY_BY_KEY.villa, A))?.slug).toBe("w-villa-2");
    expect((await row(pool, CONTENT_ENTITY_BY_KEY.villa, A, "tr"))?.slug).toBe("w-villa-2");
    expect((await pool.query(`SELECT 1 FROM url_redirects WHERE entity_kind='villa' AND old_slug='w-villa-2'`)).rows).toEqual([]);
    // okuma servisi dil bazlı slug'ı görür (TR = teknik anahtar)
    expect(await reader(pool, "tr").findIdBySlug("villa", "w-villa-2", "tr")).toBe(A);
  });

  it("transaction rollback: toplu yazmada bir öğe çakışırsa HİÇBİRİ kalmaz", async () => {
    const w = writer(pool);
    const A = "a5000000-0000-0000-0000-000000000004";
    const B = "a5000000-0000-0000-0000-000000000005";
    const before = await row(pool, CONTENT_ENTITY_BY_KEY.villa, A, "en");
    const r = await w.saveContentMany(
      [
        { entity: "villa", parentId: A, locale: "en", patch: { description: "OLMAMALI" } },
        { entity: "villa", parentId: B, locale: "en", patch: { slug: "w-villa-6" } }, // başka villanın TR slug'ı
      ],
      ACTOR
    );
    expect(r).toMatchObject({ ok: false, code: "conflict", index: 1 });
    expect(await row(pool, CONTENT_ENTITY_BY_KEY.villa, A, "en")).toEqual(before);
    expect(w.stats.committed).toBe(0);
  });

  it("transaction rollback: yazmalar sırasında DB hatası (enjekte) → önceki yazmalar da geri alınır", async () => {
    let inserts = 0;
    const w = writer(pool, (q) => async (t, v) => {
      if (t.startsWith("INSERT") && ++inserts === 3) throw Object.assign(new Error("enjekte hata"), { code: "XX000" });
      return q(t, v);
    });
    const targets = ["a5000000-0000-0000-0000-000000000007", "a5000000-0000-0000-0000-000000000008", "a5000000-0000-0000-0000-000000000009"];
    const r = await w.saveContentMany(targets.map((id) => ({ entity: "villa" as const, parentId: id, locale: "de" as Locale, patch: { description: "ROLLBACK" } })), ACTOR);
    expect(r).toMatchObject({ ok: false, code: "db" });
    const n = await pool.query(`SELECT count(*)::int AS n FROM villa_translations WHERE description='ROLLBACK'`);
    expect(n.rows[0].n).toBe(0);
    // TR (ana tablo + ayna) yolu da geri alınır
    let updates = 0;
    const w2 = writer(pool, (q) => async (t, v) => {
      if (t.startsWith("UPDATE") && ++updates === 2) throw Object.assign(new Error("enjekte"), { code: "XX000" });
      return q(t, v);
    });
    const r2 = await w2.saveContentMany(targets.slice(0, 2).map((id) => ({ entity: "villa" as const, parentId: id, locale: "tr" as Locale, patch: { badge: "TR-ROLLBACK" } })), ACTOR);
    expect(r2.ok).toBe(false);
    expect((await pool.query(`SELECT count(*)::int AS n FROM villa WHERE badge='TR-ROLLBACK'`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM villa_translations WHERE badge='TR-ROLLBACK'`)).rows[0].n).toBe(0);
  });

  it("eşzamanlı: AYNI kayda 24 paralel yazma (farklı ve aynı alan) — hata yok, kayıp güncelleme yok", async () => {
    const w = writer(pool);
    const id = "a5000000-0000-0000-0000-000000000010";
    const fields = ["description", "badge", "seo_title", "seo_description"] as const;
    const jobs = Array.from({ length: 24 }, (_, i) =>
      w.saveContent("villa", id, Math.floor(i / 4) % 2 ? "en" : "de", { [fields[i % 4]]: `v${i}` }, ACTOR)
    );
    const rs = await Promise.all(jobs);
    expect(rs.every((r) => r.ok)).toBe(true);
    for (const l of ["en", "de"] as Locale[]) {
      const r = await row(pool, CONTENT_ENTITY_BY_KEY.villa, id, l);
      for (const f of fields) expect(r?.[f]).toMatch(/^v\d+$/);
    }
    // aynı alan: son değer gönderilenlerden biri
    const same = await Promise.all(Array.from({ length: 12 }, (_, i) => w.saveContent("villa", id, "en", { badge: `same-${i}` }, ACTOR)));
    expect(same.every((r) => r.ok)).toBe(true);
    expect(String((await row(pool, CONTENT_ENTITY_BY_KEY.villa, id, "en"))?.badge)).toMatch(/^same-\d+$/);
    // TR (ana tablo) + EN aynı kayda paralel → ayna tutarlı
    const mix = await Promise.all(Array.from({ length: 12 }, (_, i) => w.saveContent("villa", id, i % 2 ? "tr" : "en", { seo_title: `m${i}` }, ACTOR)));
    expect(mix.every((r) => r.ok)).toBe(true);
    const b = await base(pool, CONTENT_ENTITY_BY_KEY.villa, id);
    expect((await row(pool, CONTENT_ENTITY_BY_KEY.villa, id, "tr"))?.seo_title).toBe(b?.seo_title);
    expect(w.stats.deadlocks).toBe(0);
  });

  it("KONTROL: kilit sırası deterministik değilse (ham SQL, ters sıra) deadlock oluşur — Faz 2 K4", async () => {
    const A = "a5000000-0000-0000-0000-000000000011";
    const B = "a5000000-0000-0000-0000-000000000012";
    const tx = async (first: string, second: string) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(`UPDATE villa SET badge = 'k1' WHERE id = $1`, [first]);
        await c.query("SELECT pg_sleep(0.3)");
        await c.query(`UPDATE villa SET badge = 'k2' WHERE id = $1`, [second]);
        await c.query("COMMIT");
        return "ok";
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        return (e as { code?: string }).code;
      } finally {
        c.release();
      }
    };
    const out = await Promise.all([tx(A, B), tx(B, A)]);
    expect(out).toContain("40P01");
  });

  it("eşzamanlı: FARKLI kayıtlar ters sırayla (servis) — 30 tur, deadlock 0", async () => {
    const w = writer(pool);
    const A = "a5000000-0000-0000-0000-000000000013";
    const B = "a5000000-0000-0000-0000-000000000014";
    const C = "a5000000-0000-0000-0000-000000000015";
    for (let i = 0; i < 30; i++) {
      const mk = (order: string[], l: Locale) =>
        w.saveContentMany(order.map((id) => ({ entity: "villa" as const, parentId: id, locale: l, patch: { description: `r${i}` } })), ACTOR);
      const rs = await Promise.all([mk([A, B, C], "en"), mk([C, B, A], "en"), mk([B, C, A], "tr"), mk([A, C, B], "tr")]);
      expect(rs.every((r) => r.ok)).toBe(true);
    }
    expect(w.stats.deadlocks).toBe(0);
    expect(w.stats.attempts).toBe(120);
  });

  it("eşzamanlı slug yarışı: iki kayıt aynı EN slug'ını talep eder → tam olarak biri kazanır (10 tur)", async () => {
    const w = writer(pool);
    const A = "a5000000-0000-0000-0000-000000000016";
    const B = "a5000000-0000-0000-0000-000000000017";
    for (let i = 0; i < 10; i++) {
      const slug = `race-${i}`;
      const rs = await Promise.all([
        w.saveContent("villa", A, "en", { slug }, ACTOR),
        w.saveContent("villa", B, "en", { slug }, ACTOR),
      ]);
      expect(rs.filter((r) => r.ok)).toHaveLength(1);
      expect(rs.find((r) => !r.ok)).toMatchObject({ code: "conflict" });
      const holders = await pool.query(`SELECT count(*)::int AS n FROM villa_translations WHERE locale='en' AND slug=$1`, [slug]);
      expect(holders.rows[0].n).toBe(1);
    }
  });

  it("kilit zaman aşımı → busy (uzun tutulan kilit)", async () => {
    const w = createContentWriteService({
      transaction: makeRunner(pool, { attempts: 0, deadlocks: 0 }),
      enabled: () => true,
      lockTimeoutMs: 200,
    });
    const id = "a5000000-0000-0000-0000-000000000018";
    const c = await pool.connect();
    await c.query("BEGIN");
    await c.query("SELECT 1 FROM villa WHERE id = $1 FOR UPDATE", [id]);
    const r = await w.saveContent("villa", id, "en", { badge: "x" }, ACTOR);
    await c.query("ROLLBACK");
    c.release();
    expect(r).toMatchObject({ ok: false, code: "busy" });
  });
});

const dt = TURL ? describe : describe.skip;

dt("Faz 4 — izole PG: mod=translations (YALNIZ test DB'sinde, Faz 5 davranış önizlemesi)", () => {
  let pool: PgPool;
  beforeAll(async () => {
    pool = await makePool(TURL!);
    await pool.query(`CREATE OR REPLACE FUNCTION public.content_mirror_mode() RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $b$ SELECT 'translations'::text $b$`);
  });
  afterAll(async () => {
    await pool?.query(`CREATE OR REPLACE FUNCTION public.content_mirror_mode() RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $b$ SELECT 'base'::text $b$`);
    await pool?.end();
  });

  it("TR → çeviri satırı; 106 aynası ana kolonu günceller; ana tabloya doğrudan yazma guard'a takılır", async () => {
    const w = writer(pool);
    const r = await pool.query(`SELECT id::text AS id FROM villa ORDER BY id LIMIT 1`);
    const id = String(r.rows[0].id);
    expect(await w.saveContent("villa", id, "tr", { description: "TR-T" }, ACTOR)).toMatchObject({ ok: true, target: "translation", mode: "translations", created: false });
    expect((await base(pool, CONTENT_ENTITY_BY_KEY.villa, id))?.description).toBe("TR-T");
    await expect(pool.query(`UPDATE villa SET description='x' WHERE id::text=$1`, [id])).rejects.toThrow();
  });

  it("14 tür × TR/EN/DE yazma (translations modu)", async () => {
    const w = writer(pool);
    for (const def of CONTENT_ENTITIES) {
      const id = String((await pool.query(`SELECT id::text AS id FROM "${def.parentTable}" ORDER BY id LIMIT 1`)).rows[0].id);
      for (const l of ["tr", "en", "de"] as Locale[]) {
        const [f, v] = sampleValue(def, `T-${l}`);
        const res = await w.saveContent(def.key, id, l, { [f]: v }, ACTOR);
        expect({ e: def.key, l, res }).toMatchObject({ e: def.key, l, res: { ok: true, target: "translation" } });
        expect({ e: def.key, l, v: (await row(pool, def, id, l))?.[f] }).toEqual({ e: def.key, l, v });
      }
      const [f, v] = sampleValue(def, "T-tr");
      const col = def.fields.find((x) => x.name === f)!.baseColumn;
      expect({ e: def.key, base: (await base(pool, def, id))?.[col] }).toEqual({ e: def.key, base: v });
    }
  });

  it("TR satırı olmayan yeni kayıt: TR yazma satırı OLUŞTURUR (created=true) ve ana kolona aynalar", async () => {
    const w = writer(pool);
    const id = "a6000000-0000-0000-0000-000000000001";
    await pool.query(`INSERT INTO villa (id,title,slug,description) VALUES ($1,'Yeni','t-yeni-villa',NULL) ON CONFLICT DO NOTHING`, [id]);
    expect(await row(pool, CONTENT_ENTITY_BY_KEY.villa, id, "tr")).toBeNull(); // bilinen Faz 2 sınırı
    expect(await w.saveContent("villa", id, "tr", { description: "TR yeni" }, ACTOR)).toMatchObject({ ok: true, created: true });
    expect((await base(pool, CONTENT_ENTITY_BY_KEY.villa, id))?.description).toBe("TR yeni");
  });

  it("TR slug (translations): tr satırı slug'ı yazılır, teknik anahtar DEĞİŞMEZ, geçmiş (tr) yazılır", async () => {
    const w = writer(pool);
    const id = "a6000000-0000-0000-0000-000000000001";
    expect((await w.saveContent("villa", id, "tr", { slug: "t-tr-slug-1" }, ACTOR)).ok).toBe(true);
    expect((await w.saveContent("villa", id, "tr", { slug: "t-tr-slug-2" }, ACTOR)).ok).toBe(true);
    expect((await base(pool, CONTENT_ENTITY_BY_KEY.villa, id))?.slug).toBe("t-yeni-villa");
    expect((await row(pool, CONTENT_ENTITY_BY_KEY.villa, id, "tr"))?.slug).toBe("t-tr-slug-2");
    const red = await pool.query(`SELECT locale FROM url_redirects WHERE entity_kind='villa' AND old_slug='t-tr-slug-1'`);
    expect(red.rows).toEqual([{ locale: "tr" }]);
    expect(await w.saveContent("villa", id, "tr", { slug: null }, ACTOR)).toMatchObject({ ok: true, slug: null }); // handle'a düşer
  });
});
