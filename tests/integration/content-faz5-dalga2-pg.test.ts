import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import { assignMissingTechnicalKeyWith } from "@/lib/i18n/content/content-technical-key";

/* ===============================================================
   Faz 5 — DALGA 2 — İZOLE PostgreSQL
   Popup, genel ayarlar, blog, CMS sayfası, villa: içerik (ana dil +
   çeviri) ile içerik DIŞI ana tablo kolonlarının (teknik yama) TEK
   transaction'da yazılması; 3 ana dil; rollback; eşzamanlılık;
   teknik anahtar / dil slug'ı ayrımı; pages.content sözleşmesi.
   CONTENT_DALGA2_PG_URL: 082–107 + 108 TASLAĞI uygulanmış TEK KULLANIMLIK
   DB. Tanımlı değilse ATLANIR. Testler veri YAZAR.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};

const URL = process.env.CONTENT_DALGA2_PG_URL;
const ACTOR = { actorId: "dalga2-test" };
/** Tekrar çalıştırılabilirlik: teknik anahtarlar koşu başına benzersiz. */
const RUN = Date.now().toString(36);

async function mkPool(url: string): Promise<Pool> {
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 14 }) as unknown as Pool;
}

function writer(pool: Pool) {
  const stats = { deadlocks: 0, committed: [] as string[][] };
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
  return {
    ...createContentWriteService({
      transaction,
      enabled: () => true,
      lockTimeoutMs: 10_000,
      onCommitted: ({ entities }) => {
        stats.committed.push([...entities]);
      },
    }),
    stats,
  };
}

function reader(pool: Pool, root: Locale) {
  return createContentReadService({
    repository: createContentRepository((q) => pool.query(q.text, q.values)),
    getLocaleContext: () => ({ root, enabled: [root, ...(["tr", "en", "de"] as Locale[]).filter((l) => l !== root)] }),
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

const d = URL ? describe : describe.skip;

d("Faz 5 dalga 2 — izole PG", () => {
  let pool: Pool;
  let settingsId: string;
  beforeAll(async () => {
    pool = await mkPool(URL!);
    expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
    expect((await pool.query("SELECT public.content_language_slugs_separated() AS ok")).rows[0].ok).toBe(true);
    settingsId = String((await pool.query("SELECT id::text AS id FROM settings LIMIT 1")).rows[0].id);
  });
  afterAll(async () => {
    await pool?.end();
  });

  /* ---------------- GENEL AYARLAR ---------------- */
  for (const root of ["tr", "en", "de"] as Locale[]) {
    it(`ayarlar — ana dil ${root.toUpperCase()}: çevrilebilir alan ana dile, dilden bağımsız alan ana tabloya (tek tx)`, async () => {
      const w = writer(pool);
      const before = await base(pool, "settings", settingsId);
      const r = await w.saveContentMany(
        [{ entity: "settings", parentId: settingsId, locale: root, patch: { hero_title: `Hero ${root}`, business_hours: null } }],
        ACTOR,
        { technical: [{ entity: "settings", parentId: settingsId, values: { site_name: `Site ${root}`, maintenance_message: `Bakım ${root}` } }] }
      );
      expect(r.ok).toBe(true);
      const b = await base(pool, "settings", settingsId);
      // dilden bağımsız → ana tablo (her ana dilde)
      expect(b.site_name).toBe(`Site ${root}`);
      expect(b.maintenance_message).toBe(`Bakım ${root}`);
      // çevrilebilir → ana dilin satırı; ana dil TR değilse TR ana kolonu DEĞİŞMEZ
      expect((await tRow(pool, "settings", settingsId, root))?.hero_title).toBe(`Hero ${root}`);
      if (root === "tr") expect(b.hero_title).toBe("Hero tr");
      else expect(b.hero_title).toBe(before.hero_title);
      // içerik okuma ana dilde ana dil değerini verir
      const got = await reader(pool, root).getContent("settings", settingsId, root);
      expect(got?.values.hero_title).toBe(`Hero ${root}`);
      // cache: settings varlığı commit sonrası bildirilir (tag "settings" düşer)
      expect(w.stats.committed.flat()).toContain("settings");
    });
  }

  it("ayarlar — public_default_locale değişimi içerik TAŞIMAZ (satırlar aynen kalır)", async () => {
    const snap = async () =>
      (await pool.query("SELECT locale, hero_title FROM settings_translations WHERE settings_id::text=$1 ORDER BY locale", [settingsId])).rows;
    const b0 = await base(pool, "settings", settingsId);
    const s0 = await snap();
    await pool.query("UPDATE settings SET public_default_locale='en' WHERE id::text=$1", [settingsId]);
    expect(await snap()).toEqual(s0);
    expect((await base(pool, "settings", settingsId)).hero_title).toBe(b0.hero_title);
    // ana dil EN iken okuma EN değerini verir; TR değeri yerinde
    expect((await reader(pool, "en").getContent("settings", settingsId, "en"))?.values.hero_title).toBe("Hero en");
    expect((await reader(pool, "en").getContent("settings", settingsId, "tr"))?.values.hero_title).toBe("Hero tr");
    await pool.query("UPDATE settings SET public_default_locale='tr' WHERE id::text=$1", [settingsId]);
  });

  it("ayarlar — teknik yama içerik kolonunu / id / slug'ı yazamaz; hatalı kolon tüm tx'i geri alır", async () => {
    const w = writer(pool);
    const b0 = await base(pool, "settings", settingsId);
    const en0 = await tRow(pool, "settings", settingsId, "en");
    for (const values of [{ hero_title: "x" }, { id: "x" }, { "site name": "x" }]) {
      const r = await w.saveContentMany([], ACTOR, { technical: [{ entity: "settings", parentId: settingsId, values }] });
      expect(r).toMatchObject({ ok: false, code: "validation" });
    }
    // var olmayan kolon → DB hatası → içerik de yazılmaz (rollback)
    const r = await w.saveContentMany(
      [{ entity: "settings", parentId: settingsId, locale: "en", patch: { hero_title: "ROLLBACK" } }],
      ACTOR,
      { technical: [{ entity: "settings", parentId: settingsId, values: { site_name: "ROLLBACK", no_such_column: 1 } }] }
    );
    expect(r.ok).toBe(false);
    expect((await base(pool, "settings", settingsId)).site_name).toBe(b0.site_name);
    expect((await tRow(pool, "settings", settingsId, "en"))?.hero_title).toBe(en0?.hero_title);
    // geçersiz içerik → teknik kolon da yazılmaz
    const r2 = await w.saveContentMany(
      [{ entity: "settings", parentId: settingsId, locale: "en", patch: { hero_title: 42 as unknown as string } }],
      ACTOR,
      { technical: [{ entity: "settings", parentId: settingsId, values: { site_name: "ROLLBACK2" } }] }
    );
    expect(r2.ok).toBe(false);
    expect((await base(pool, "settings", settingsId)).site_name).toBe(b0.site_name);
  });

  it("ayarlar — eşzamanlı 12 kayıt (içerik + teknik, farklı diller): kilitlenme yok, son durum tutarlı", async () => {
    const w = writer(pool);
    const locs: Locale[] = ["tr", "en", "de"];
    const rs = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        w.saveContentMany(
          [
            { entity: "settings", parentId: settingsId, locale: locs[i % 3], patch: { footer_copyright: `F${i}` } },
            { entity: "settings", parentId: settingsId, locale: locs[(i + 1) % 3], patch: { footer_copyright: `G${i}` } },
          ],
          ACTOR,
          { technical: [{ entity: "settings", parentId: settingsId, values: { site_name: `S${i}` } }] }
        )
      )
    );
    expect(rs.every((r) => r.ok)).toBe(true);
    expect((await base(pool, "settings", settingsId)).site_name).toMatch(/^S\d+$/);
    const tr = await tRow(pool, "settings", settingsId, "tr");
    expect(tr?.footer_copyright).toBe((await base(pool, "settings", settingsId)).footer_copyright); // ayna tutarlı
  });

  /* ---------------- POPUP ---------------- */
  for (const root of ["tr", "en", "de"] as Locale[]) {
    it(`popup — ana dil ${root.toUpperCase()}: 3 dil metin + stats (jsonb) + teknik alanlar tek tx`, async () => {
      const w = writer(pool);
      const others = (["tr", "en", "de"] as Locale[]).filter((l) => l !== root);
      const stats = ["120+ villa", `Destek ${root}`];
      const r = await w.saveContentMany(
        [
          { entity: "site_popup", parentId: "1", locale: root, patch: { title: `Başlık ${root}`, button_text: `Git ${root}`, stats } },
          ...others.map((l) => ({ entity: "site_popup" as const, parentId: "1", locale: l, patch: { title: `Başlık ${root}/${l}`, button_text: null } })),
        ],
        ACTOR,
        {
          technical: [
            {
              entity: "site_popup",
              parentId: "1",
              values: { is_enabled: true, show_button: true, display_scope: "home", dismiss_duration: "1d", starts_at: null, ends_at: null, updated_at: new Date().toISOString() },
            },
          ],
        }
      );
      expect(r.ok ? true : r).toBe(true);
      const b = await base(pool, "site_popup", "1");
      expect(b).toMatchObject({ is_enabled: true, show_button: true, display_scope: "home", dismiss_duration: "1d" });
      const rd = reader(pool, root);
      expect((await rd.getContent("site_popup", "1", root))?.values).toMatchObject({ title: `Başlık ${root}`, button_text: `Git ${root}`, stats });
      for (const l of others) {
        const got = await rd.getContent("site_popup", "1", l);
        expect(got?.values.title).toBe(`Başlık ${root}/${l}`);
        // boş buton metni → ana dile düşer (Faz 3.1 sırası)
        expect(got?.values.button_text).toBe(`Git ${root}`);
      }
    });
  }

  it("popup — boş stats ([]) kabul edilir; o dilde ana dile düşer (eski davranış)", async () => {
    const w = writer(pool);
    expect((await w.saveContentMany([
      { entity: "site_popup", parentId: "1", locale: "tr", patch: { stats: ["A", "B"] } },
      { entity: "site_popup", parentId: "1", locale: "de", patch: { stats: [] } },
    ], ACTOR)).ok).toBe(true);
    expect((await base(pool, "site_popup", "1")).stats).toEqual(["A", "B"]);
    expect((await tRow(pool, "site_popup", "1", "de"))?.stats).toEqual([]);
    expect((await reader(pool, "tr").getContent("site_popup", "1", "de"))?.values.stats).toEqual(["A", "B"]);
    // ana dil TR'de boş stats → ana tablo [] (NOT NULL korunur)
    expect((await w.saveContent("site_popup", "1", "tr", { stats: [] }, ACTOR)).ok).toBe(true);
    expect((await base(pool, "site_popup", "1")).stats).toEqual([]);
  });

  it("popup — geçersiz stats (alan kuralı) → hiçbir şey yazılmaz", async () => {
    const w = writer(pool);
    const b0 = await base(pool, "site_popup", "1");
    const r = await w.saveContentMany(
      [{ entity: "site_popup", parentId: "1", locale: "en", patch: { stats: { bad: true } as unknown as string } }],
      ACTOR,
      { technical: [{ entity: "site_popup", parentId: "1", values: { is_enabled: !b0.is_enabled } }] }
    );
    expect(r.ok).toBe(false);
    expect((await base(pool, "site_popup", "1")).is_enabled).toBe(b0.is_enabled);
  });

  /* ---------------- BLOG ---------------- */
  for (const root of ["tr", "en", "de"] as Locale[]) {
    it(`blog — ana dil ${root.toUpperCase()}: oluştur (teknik anahtar + yayın), 3 dil, slug geçmişi, eksik çeviri`, async () => {
      const w = writer(pool);
      const handle = `d2-blog-${root}-${RUN}`;
      const c = await w.createContent(
        {
          entity: "blog_post",
          technical: { slug: handle, is_active: false },
          locales: [{ locale: root, patch: { title: `Başlık ${root}`, body: `<p>${root}</p>`, ...(root !== "tr" ? { slug: handle } : {}) } }],
        },
        ACTOR
      );
      expect(c.ok ? true : c).toBe(true);
      const id = (c as { id: string }).id;
      // teknik anahtar ana tabloda; ana dilin URL slug'ı = teknik anahtar
      expect((await base(pool, "blog_post", id)).slug).toBe(handle);
      expect((await tRow(pool, "blog_post", id, root))?.slug).toBe(handle);
      if (root !== "tr") expect(["", null]).toContain((await base(pool, "blog_post", id)).title);
      // eksik çeviri → ana dile düşer, isFallback (noindex kararı Faz 3.1)
      const others = (["tr", "en", "de"] as Locale[]).filter((l) => l !== root);
      for (const l of others) {
        const got = await reader(pool, root).getContent("blog_post", id, l);
        expect(got?.values.title).toBe(`Başlık ${root}`);
        expect(got?.isFallback).toBe(true);
      }
      // yayınla (teknik) + ana dil içerik güncelle — tek tx
      expect((await w.saveContentMany(
        [{ entity: "blog_post", parentId: id, locale: root, patch: { excerpt: "Özet" } }],
        ACTOR,
        { technical: [{ entity: "blog_post", parentId: id, values: { is_active: true } }] }
      )).ok).toBe(true);
      expect((await base(pool, "blog_post", id)).is_active).toBe(true);
      // diğer diller kendi slug'larıyla
      for (const l of others) {
        const r = await w.saveContent("blog_post", id, l, { title: `T ${l}`, slug: `${handle}-${l}` }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        const got = await reader(pool, root).getContent("blog_post", id, l);
        expect(got?.isFallback).toBe(false);
      }
      // ana dil slug değişimi → geçmiş (yönlendirme) o dilde; teknik anahtar SABİT
      const r = await w.saveContent("blog_post", id, root, { slug: `${handle}-yeni` }, ACTOR);
      expect(r.ok ? true : r).toBe(true);
      expect((await base(pool, "blog_post", id)).slug).toBe(handle);
      const red = await pool.query(`SELECT locale FROM url_redirects WHERE entity_kind='blog' AND old_slug=$1`, [handle]);
      expect(red.rows.map((x) => x.locale)).toContain(root);
    });
  }

  it("blog — teknik anahtar çakışması: conflict, hiçbir şey yazılmaz", async () => {
    const w = writer(pool);
    const n0 = Number((await pool.query("SELECT count(*)::int AS n FROM blog_posts")).rows[0].n);
    const c = await w.createContent({ entity: "blog_post", technical: { slug: `d2-blog-en-${RUN}`, is_active: false }, locales: [{ locale: "en", patch: { title: "x", slug: `zz-unique-${RUN}` } }] }, ACTOR);
    expect(c).toMatchObject({ ok: false, code: "conflict" });
    expect(Number((await pool.query("SELECT count(*)::int AS n FROM blog_posts")).rows[0].n)).toBe(n0);
  });

  /* ---------------- CMS SAYFALARI ---------------- */
  for (const root of ["tr", "en", "de"] as Locale[]) {
    it(`sayfa — ana dil ${root.toUpperCase()}: oluştur (bölümler + noindex), içerik+teknik tek tx, slug geçmişi, eksik çeviri`, async () => {
      const w = writer(pool);
      const handle = `d2-sayfa-${root}-${RUN}`;
      const sections = [{ type: "richtext", content: `<p>${root}</p>` }];
      const c = await w.createContent(
        {
          entity: "page",
          technical: { slug: handle, is_active: true },
          locales: [{ locale: root, patch: { title: `Sayfa ${root}`, body: `<p>${root}</p>`, sections, ...(root !== "tr" ? { slug: handle } : {}) } }],
        },
        ACTOR
      );
      expect(c.ok ? true : c).toBe(true);
      const id = (c as { id: string }).id;
      expect((await base(pool, "page", id)).slug).toBe(handle);
      expect((await tRow(pool, "page", id, root))?.sections).toEqual(sections);
      // diğer diller eksik → ana dile düşer + isFallback (noindex)
      for (const l of (["tr", "en", "de"] as Locale[]).filter((x) => x !== root)) {
        const got = await reader(pool, root).getContent("page", id, l);
        expect(got?.values.title).toBe(`Sayfa ${root}`);
        expect(got?.values.sections).toEqual(sections);
        expect(got?.isFallback).toBe(true);
      }
      // gövde boşaltma + yayından kaldırma tek tx
      expect((await w.saveContentMany(
        [{ entity: "page", parentId: id, locale: root, patch: { body: "" } }],
        ACTOR,
        { technical: [{ entity: "page", parentId: id, values: { is_active: false } }] }
      )).ok).toBe(true);
      expect((await tRow(pool, "page", id, root))?.body).toBe("");
      expect((await base(pool, "page", id)).is_active).toBe(false);
      // teknik yama hatası → içerik de geri alınır
      const bad = await w.saveContentMany(
        [{ entity: "page", parentId: id, locale: root, patch: { title: "GERİ AL" } }],
        ACTOR,
        { technical: [{ entity: "page", parentId: id, values: { yok_kolon: true } }] }
      );
      expect(bad.ok).toBe(false);
      expect((await tRow(pool, "page", id, root))?.title).toBe(`Sayfa ${root}`);
      // ana dil slug değişimi → yönlendirme; teknik anahtar sabit
      expect((await w.saveContent("page", id, root, { slug: `${handle}-2` }, ACTOR)).ok).toBe(true);
      expect((await base(pool, "page", id)).slug).toBe(handle);
      const red = await pool.query(`SELECT locale FROM url_redirects WHERE entity_kind='page' AND old_slug=$1`, [handle]);
      expect(red.rows.map((x) => x.locale)).toContain(root);
    });
  }

  it("sayfa — eşzamanlı 3 dil + teknik yazım (aynı sayfa): kilitlenme yok", async () => {
    const w = writer(pool);
    const c = await w.createContent({ entity: "page", technical: { slug: `d2-eszaman-${RUN}`, is_active: true }, locales: [{ locale: "tr", patch: { title: "E" } }] }, ACTOR);
    const id = (c as { id: string }).id;
    const rs = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        w.saveContentMany(
          [{ entity: "page", parentId: id, locale: (["tr", "en", "de"] as Locale[])[i % 3], patch: { excerpt: `e${i}` } }],
          ACTOR,
          { technical: [{ entity: "page", parentId: id, values: { is_active: i % 2 === 0 } }] }
        )
      )
    );
    expect(rs.filter((r) => !r.ok)).toEqual([]);
  });

  /* ---------------- VİLLA ---------------- */
  for (const root of ["tr", "en", "de"] as Locale[]) {
    it(`villa — ana dil ${root.toUpperCase()}: oluştur, ad değişimi teknik anahtarı DEĞİŞTİRMEZ, 3 dil slug ayrımı, geçmiş`, async () => {
      const w = writer(pool);
      const handle = `d2-villa-${root}-${RUN}`;
      const c = await w.createContent(
        {
          entity: "villa",
          technical: { slug: handle, title: `Villa ${root}`, is_active: true },
          locales: [{ locale: root, patch: { description: `<p>${root}</p>`, badge: "Yeni", ...(root !== "tr" ? { slug: handle } : {}) } }],
        },
        ACTOR
      );
      expect(c.ok ? true : c).toBe(true);
      const id = (c as { id: string }).id;
      // ad (teknik) + ana dil açıklaması tek tx; teknik anahtar SABİT
      expect((await w.saveContentMany(
        [{ entity: "villa", parentId: id, locale: root, patch: { description: `<p>${root} 2</p>` } }],
        ACTOR,
        { technical: [{ entity: "villa", parentId: id, values: { title: `Villa ${root} Yeni Ad` } }] }
      )).ok).toBe(true);
      const b = await base(pool, "villa", id);
      expect(b.title).toBe(`Villa ${root} Yeni Ad`);
      expect(b.slug).toBe(handle);
      if (root !== "tr") expect(b.description).not.toBe(`<p>${root} 2</p>`); // TR aynası ana dil EN/DE'den etkilenmez
      // diğer diller kendi slug'ı; TR slug'ı teknik anahtardan bağımsız (108)
      for (const l of (["tr", "en", "de"] as Locale[]).filter((x) => x !== root)) {
        const r = await w.saveContent("villa", id, l, { description: `<p>${l}</p>`, slug: `${handle}-${l}` }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        expect((await tRow(pool, "villa", id, l))?.slug).toBe(`${handle}-${l}`);
      }
      expect((await base(pool, "villa", id)).slug).toBe(handle);
      // ana dil slug değişimi → o dilde yönlendirme
      expect((await w.saveContent("villa", id, root, { slug: `${handle}-yeni` }, ACTOR)).ok).toBe(true);
      const red = await pool.query(`SELECT locale FROM url_redirects WHERE entity_kind='villa' AND old_slug=$1`, [handle]);
      expect(red.rows.map((x) => x.locale)).toContain(root);
      // eksik çeviri yok → isFallback false; okuma ana dil değerini verir
      expect((await reader(pool, root).getContent("villa", id, root))?.values.description).toBe(`<p>${root} 2</p>`);
    });
  }

  it("villa — kopyalama deseni: 3 dil içerik tek createContent; kaynak slug'ları taşınmaz", async () => {
    const w = writer(pool);
    const handle = `d2-villa-kopya-${RUN}`;
    const c = await w.createContent(
      {
        entity: "villa",
        technical: { slug: handle, title: "Kopya", is_active: false },
        locales: [
          { locale: "tr", patch: { description: "TR" } },
          { locale: "en", patch: { description: "EN", slug: handle } },
          { locale: "de", patch: { description: "DE" } },
        ],
      },
      ACTOR
    );
    expect(c.ok ? true : c).toBe(true);
    const id = (c as { id: string }).id;
    expect((await base(pool, "villa", id)).description).toBe("TR");
    expect((await tRow(pool, "villa", id, "en"))?.slug).toBe(handle);
    expect((await tRow(pool, "villa", id, "de"))?.slug ?? null).toBeNull();
    expect((await base(pool, "villa", id)).is_active).toBe(false);
  });

  it("villa — teknik yama başarısızsa içerik de geri alınır; teknik anahtar yamadan yazılamaz", async () => {
    const w = writer(pool);
    const c = await w.createContent({ entity: "villa", technical: { slug: `d2-villa-rb-${RUN}`, title: "RB" }, locales: [{ locale: "tr", patch: { description: "ilk" } }] }, ACTOR);
    const id = (c as { id: string }).id;
    const r = await w.saveContentMany([{ entity: "villa", parentId: id, locale: "tr", patch: { description: "ikinci" } }], ACTOR, {
      technical: [{ entity: "villa", parentId: id, values: { guests_yok: 1 } }],
    });
    expect(r.ok).toBe(false);
    expect((await base(pool, "villa", id)).description).toBe("ilk");
    expect((await w.saveContentMany([], ACTOR, { technical: [{ entity: "villa", parentId: id, values: { slug: "x" } }] }))).toMatchObject({ ok: false, code: "validation" });
  });

  /* ---------------- RİSK 2: TEKNİK ANAHTARI BOŞ ESKİ KATEGORİLER ---------------- */
  it("boş teknik anahtar bir kez atanır; dolu anahtar DEĞİŞMEZ; çakışmada -2; dil slug'larına dokunulmaz; eşzamanlı güvenli", async () => {
    const w = writer(pool);
    const connect = async () => (await pool.connect()) as never;
    // dolu anahtarlı + TR URL slug'ı "deniz-<RUN>" olan bir tip (çakışma adayı)
    const full = await w.createContent({ entity: "villa_type", technical: { slug: `deniz-${RUN}` }, locales: [{ locale: "tr", patch: { name: "Dolu" } }] }, ACTOR);
    const fullId = (full as { id: string }).id;
    // eski kayıt: slug NULL
    const legacy = (await pool.query(`INSERT INTO villa_types (name, slug) VALUES ($1, NULL) RETURNING id::text AS id`, [`Deniz ${RUN}`])).rows[0].id as string;
    await pool.query(`UPDATE villa_type_translations SET name='Sea' WHERE villa_type_id::text=$1 AND locale='tr'`, [legacy]).catch(() => {});
    const r = await assignMissingTechnicalKeyWith(connect, "villa_type", legacy, `Deniz ${RUN}`);
    expect(r).toEqual({ ok: true, slug: `deniz-${RUN}-2`, assigned: true });
    expect((await base(pool, "villa_type", legacy)).slug).toBe(`deniz-${RUN}-2`);
    // tekrar çağrı / dolu kayıt → değişmez
    expect(await assignMissingTechnicalKeyWith(connect, "villa_type", legacy, "Bambaşka")).toEqual({ ok: true, slug: `deniz-${RUN}-2`, assigned: false });
    expect(await assignMissingTechnicalKeyWith(connect, "villa_type", fullId, "Bambaşka")).toEqual({ ok: true, slug: `deniz-${RUN}`, assigned: false });
    expect((await base(pool, "villa_type", fullId)).slug).toBe(`deniz-${RUN}`);
    // başka kaydın DİL URL slug'ıyla da çakışmaz
    await w.saveContent("villa_type", fullId, "en", { name: "Full", slug: `orman-${RUN}` }, ACTOR);
    const legacy2 = (await pool.query(`INSERT INTO villa_types (name, slug) VALUES ($1, '') RETURNING id::text AS id`, [`Orman ${RUN}`])).rows[0].id as string;
    expect(await assignMissingTechnicalKeyWith(connect, "villa_type", legacy2, `Orman ${RUN}`)).toMatchObject({ ok: true, slug: `orman-${RUN}-2`, assigned: true });
    // eşzamanlı: 6 çağrı → tek atama, hepsi aynı anahtarı görür
    const legacy3 = (await pool.query(`INSERT INTO villa_types (name, slug) VALUES ($1, NULL) RETURNING id::text AS id`, [`Koy ${RUN}`])).rows[0].id as string;
    const rs = await Promise.all(Array.from({ length: 6 }, () => assignMissingTechnicalKeyWith(connect, "villa_type", legacy3, `Koy ${RUN}`)));
    expect(rs.filter((x) => x.ok && x.assigned)).toHaveLength(1);
    expect(new Set(rs.map((x) => (x as { slug: string }).slug))).toEqual(new Set([`koy-${RUN}`]));
    // olmayan kayıt / boş ad
    expect(await assignMissingTechnicalKeyWith(connect, "villa_type", "00000000-0000-0000-0000-000000000000", "x")).toMatchObject({ ok: false });
    expect(await assignMissingTechnicalKeyWith(connect, "villa_type", legacy3, "  ")).toMatchObject({ ok: false });
  });
});
