import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITIES, type ContentEntityDef } from "@/lib/i18n/content/content-registry";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import {
  applyBaseSupplements,
  indexContentRows,
  type ContentRow,
} from "@/lib/i18n/content/content-resolve";
import { decideContentPresence } from "@/lib/i18n/content/content-presence";
import {
  diffLegacyVsNext,
  resolveLegacy,
  legacyTextAvailable,
  type ContentFieldDiff,
} from "@/lib/i18n/content/content-legacy-compare";
import type { ContentLocaleContext } from "@/lib/i18n/content/content-locale-context";

/* ===============================================================
   Faz 3 — İZOLE PostgreSQL entegrasyon testi (yalnız okuma servisi)
   ===============================================================
   CONTENT_READ_PG_URL tanımlı DEĞİLSE bütün dosya ATLANIR (normal
   suite canlı/uzak veritabanına ASLA bağlanmaz). Hedef: migration
   082–107 uygulanmış, mirror_mode='base' tek kullanımlık test DB'si.
   beforeAll yalnız sabit kimlikli test kayıtları ekler (ON CONFLICT).
   =============================================================== */

const URL = process.env.CONTENT_READ_PG_URL;
/* Faz 3.1: pages.content (eski kolon) yalnız AÇIKÇA istenirse ve yalnız
   tek kullanımlık test DB'sinde eklenir (CONTENT_READ_PG_FIXTURE_DDL=1).
   Bu bir migration değildir; repo'ya şema değişikliği eklenmez. */
const FIXTURE_DDL = process.env.CONTENT_READ_PG_FIXTURE_DDL === "1";
let HAS_CONTENT = false;
const d = URL ? describe : describe.skip;

type PgPool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
};
let pool: PgPool;
let queryCount = 0;
const ERRORS: unknown[] = [];

const SEED = `
INSERT INTO villa (id,title,slug,description,badge,seo_title,seo_description) VALUES
 ('a3000000-0000-0000-0000-000000000001','F3 Bir','f3-bir','TR f3 1','',NULL,'TR seo d 1'),
 ('a3000000-0000-0000-0000-000000000002','F3 İki','f3-iki',NULL,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO villa_translations (villa_id, locale, description, badge, seo_title, slug) VALUES
 ('a3000000-0000-0000-0000-000000000001','en','EN f3 1','  ',NULL,'f3-one'),
 ('a3000000-0000-0000-0000-000000000001','de','',NULL,'DE seo t 1','f3-eins'),
 ('a3000000-0000-0000-0000-000000000002','de','DE f3 2',NULL,NULL,NULL)
ON CONFLICT (villa_id, locale) DO NOTHING;
INSERT INTO villa (id,title,slug,description)
 SELECT ('a4000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Toplu '||g, 'toplu-'||g, 'TR toplu '||g
 FROM generate_series(1, 1000) g ON CONFLICT (id) DO NOTHING;
INSERT INTO villa_translations (villa_id, locale, description)
 SELECT ('a4000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'en', 'EN toplu '||g
 FROM generate_series(1, 1000, 2) g ON CONFLICT (villa_id, locale) DO NOTHING;
`;

/* Faz 5 son kontroller: çevrilmemiş EN gövdesi NULL (eski EN/DE çeviri
   servisleri boş alanı DAİMA NULL yazıyordu). "" artık BİLİNÇLİ BOŞ demektir
   ve zinciri durdurur — bu kasıtlı fark birim testinde ayrıca doğrulanır
   (faz5-son-kontroller.test.ts) ve izole PG'de content-faz5-son-kontroller-pg. */
const PAGE_SEED = `
INSERT INTO pages (id,title,slug,body,content) VALUES
 ('e3000000-0000-0000-0000-000000000001','F3 Sayfa','f3-sayfa',NULL,'<p>F3 TR içerik</p>'),
 ('e3000000-0000-0000-0000-000000000002','F3 Gövde','f3-govde','<p>F3 TR gövde</p>','<p>eski</p>')
ON CONFLICT (id) DO NOTHING;
INSERT INTO page_translations (page_id, locale, title, body, slug) VALUES
 ('e3000000-0000-0000-0000-000000000001','en','F3 About',NULL,'f3-about'),
 ('e3000000-0000-0000-0000-000000000002','de',NULL,NULL,NULL)
ON CONFLICT (page_id, locale) DO NOTHING;
`;

function makeService(ctx: () => ContentLocaleContext) {
  const repository = createContentRepository(async (q) => {
    if (!q.text.includes("information_schema")) queryCount++;
    return pool.query(q.text, q.values);
  });
  return createContentReadService({ repository, getLocaleContext: ctx, onError: (e) => ERRORS.push(e) });
}

async function baseRows(def: ContentEntityDef) {
  const cols = def.fields.map((f) => `"${f.baseColumn}"`);
  if (def.slugKind) cols.push(`"slug"`);
  if (def.key === "page" && HAS_CONTENT) cols.push(`"content"`);
  const r = await pool.query(`SELECT id::text AS id, ${cols.join(", ")} FROM "${def.parentTable}"`);
  return r.rows;
}

const SUMMARY: Record<string, Record<string, number>> = {};
const SEO_PARITY: { e: string; id: string; locale: Locale; legacy: string; next: string }[] = [];

d("Faz 3 — izole PG: merkezi okuma servisi", () => {
  beforeAll(async () => {
    const pg = (await import("pg")).default;
    pool = new pg.Pool({ connectionString: URL, max: 8 }) as unknown as PgPool;
    const mode = await pool.query("SELECT content_mirror_mode() AS m");
    expect(mode.rows[0].m).toBe("base");
    await pool.query(SEED);
    if (FIXTURE_DDL) {
      await pool.query("ALTER TABLE pages ADD COLUMN IF NOT EXISTS content text");
    }
    const col = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name='pages' AND column_name='content'"
    );
    HAS_CONTENT = col.rows.length > 0;
    if (HAS_CONTENT) await pool.query(PAGE_SEED);
  });
  afterAll(async () => {
    console.log("FAZ3_COMPARE_SUMMARY " + JSON.stringify(SUMMARY));
    console.log("FAZ31_SEO_PARITY " + JSON.stringify({ checked: SEO_PARITY.length, mismatches: SEO_PARITY.filter((x) => x.legacy !== x.next) }));
    await pool?.end();
  });

  const contexts: Record<string, ContentLocaleContext> = {
    "root-tr": { root: "tr", enabled: ["tr", "en", "de"] },
    "root-en": { root: "en", enabled: ["en", "tr", "de"] },
    "root-de": { root: "de", enabled: ["de", "tr", "en"] },
    "root-en-tr-pasif": { root: "en", enabled: ["en", "de"] },
  };

  for (const [ctxName, ctx] of Object.entries(contexts)) {
    it(`14 varlık × TR/EN/DE: eski ↔ yeni karşılaştırma (${ctxName})`, async () => {
      const svc = makeService(() => ctx);
      const all: ContentFieldDiff[] = [];
      for (const def of CONTENT_ENTITIES) {
        const bases = await baseRows(def);
        const ids = bases.map((b) => String(b.id));
        if (ids.length === 0) continue;
        const repo = createContentRepository((q) => pool.query(q.text, q.values));
        const lower = ids.map((i) => i.toLowerCase());
        const index = indexContentRows(
          applyBaseSupplements(def, await repo.fetchRows(def, lower), await repo.fetchBaseSupplements!(def, lower))
        );
        for (const locale of ["tr", "en", "de"] as Locale[]) {
          const before = queryCount;
          const next = await svc.getContentMany(def.key, ids, locale);
          /* N kayıt → ⌈N/500⌉ sorgu (kayıt başına değil); sayfada pages.content
             ek yedeği varsa +⌈N/500⌉ (şema kontrolü sayılmaz, süreçte 1 kez). */
          const per = def.key === "page" && HAS_CONTENT ? 2 : 1;
          expect(queryCount - before).toBe(Math.ceil(ids.length / 500) * per);
          for (const b of bases) {
            const id = String(b.id);
            const byLocale = (index.get(id.toLowerCase()) ?? {}) as Partial<Record<Locale, ContentRow>>;
            const legacy = resolveLegacy(def, b as never, byLocale, locale);
            const diffs = diffLegacyVsNext(def, legacy, next.get(id) ?? null, byLocale);
            for (const df of diffs) {
              const k = `${ctxName}/${locale}`;
              SUMMARY[k] ??= {};
              const rk = `${def.key}:${df.field}:${df.reason}`;
              SUMMARY[k][rk] = (SUMMARY[k][rk] ?? 0) + 1;
            }
            all.push(...diffs);
            if (ctxName === "root-tr" && (def.key === "page" || def.key === "blog_post")) {
              const legacyRobots = legacyTextAvailable(byLocale, locale) ? "index" : "noindex-follow";
              const d = decideContentPresence(def.key === "page" ? "page" : "blog", {
                recordExists: true,
                content: next.get(id) ?? null,
              });
              SEO_PARITY.push({ e: def.key, id, locale, legacy: legacyRobots, next: d.kind === "render" ? d.robots : d.kind });
            }
          }
        }
      }
      /* 107 sonrası TR satırı = ana kolon → hiçbir yerde ayna sapması yok. */
      expect(all.filter((x) => x.reason === "mirror-drift")).toEqual([]);
      expect(all.filter((x) => x.reason === "other")).toEqual([]);
      if (ctxName === "root-tr") {
        /* Ana dil TR + hepsi aktif: TR isteğinde eski = yeni (yalnız boş normalizasyonu). */
        /* Ana dil TR + hepsi aktif: eskiden DOLU gösterilen hiçbir alan
           farklı bir değere dönmez; farklar yalnız boşluk doldurma,
           ""→null normalizasyonu ve 102 formatına uymayan TR slug'ı. */
        expect(all.filter((x) => !["empty-normalization", "fills-gap", "slug"].includes(x.reason))).toEqual([]);
      }
    });
  }

  it("TR ana dil: villa ayrıntıları (EN boş → TR → DE; DE boş string → TR)", async () => {
    const svc = makeService(() => contexts["root-tr"]);
    const en = await svc.getContent("villa", "a3000000-0000-0000-0000-000000000001", "en");
    expect(en?.values).toMatchObject({ description: "EN f3 1", badge: null, seo_title: "DE seo t 1", seo_description: "TR seo d 1" });
    expect(en?.missing).toEqual(["badge"]); // EN "  ", TR "", DE NULL
    expect(en?.sourceLocale.seo_title).toBe("de"); // EN NULL → TR NULL → DE
    const de = await svc.getContent("villa", "a3000000-0000-0000-0000-000000000001", "de");
    expect(de?.values.description).toBe("TR f3 1");
    expect(de?.values.seo_title).toBe("DE seo t 1");
    expect(de?.slug).toBe("f3-eins");
  });

  it("ana dil EN: DE isteğinde boş description önce EN'den", async () => {
    const svc = makeService(() => contexts["root-en"]);
    const de = await svc.getContent("villa", "a3000000-0000-0000-0000-000000000001", "de");
    expect(de?.values.description).toBe("EN f3 1");
    expect(de?.sourceLocale.description).toBe("en");
  });

  it("TR pasif: TR satırı yedek değil; yalnız TR'si olan kayıt null", async () => {
    const svc = makeService(() => contexts["root-en-tr-pasif"]);
    const v2 = await svc.getContent("villa", "a3000000-0000-0000-0000-000000000002", "en");
    expect(v2?.values.description).toBe("DE f3 2");
    const onlyTr = await svc.getContent("villa", "a4000000-0000-0000-0000-000000000002", "en");
    expect(onlyTr).toBeNull();
  });

  it("slug çözümleme gerçek tabloda", async () => {
    const svc = makeService(() => contexts["root-tr"]);
    expect(await svc.findIdBySlug("villa", "f3-one", "en")).toBe("a3000000-0000-0000-0000-000000000001");
    expect(await svc.findIdBySlug("villa", "f3-bir", "tr")).toBe("a3000000-0000-0000-0000-000000000001");
    expect(await svc.findIdBySlug("villa", "f3-one", "de")).toBeNull();
  });

  it("getCoverage elle SQL sayımıyla birebir (14 varlık × 3 dil)", async () => {
    const svc = makeService(() => contexts["root-tr"]);
    for (const def of CONTENT_ENTITIES) {
      for (const l of ["tr", "en", "de"] as Locale[]) {
        const c = await svc.getCoverage(def.key, l);
        const total = await pool.query(`SELECT count(*)::int AS n FROM "${def.parentTable}"`);
        expect(c.total).toBe(total.rows[0].n);
        for (const f of def.fields) {
          const r = await pool.query(`SELECT "${f.name}" AS v FROM "${def.table}" WHERE locale = $1`, [l]);
          const manual = r.rows.filter((x) => {
            const v = x.v;
            if (v === null || v === undefined) return false;
            if (typeof v === "string") return v.trim() !== "";
            if (Array.isArray(v)) return v.length > 0;
            if (typeof v === "object") return Object.keys(v).length > 0;
            return true;
          }).length;
          expect({ e: def.key, l, f: f.name, n: c.filled[f.name] }).toEqual({ e: def.key, l, f: f.name, n: manual });
        }
      }
    }
  });

  it("performans: 1000 kayıt tek sorgu, eşzamanlı 40 okuma tutarlı", async () => {
    const svc = makeService(() => contexts["root-tr"]);
    const ids = Array.from({ length: 1000 }, (_, i) => `a4000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`);
    const before = queryCount;
    const t0 = performance.now();
    const m = await svc.getContentMany("villa", ids, "en");
    const ms = performance.now() - t0;
    expect(queryCount - before).toBe(2); // 500'lük 2 parça
    expect(m.size).toBe(1000);
    expect(m.get(ids[0])?.values.description).toBe("EN toplu 1");
    expect(m.get(ids[1])?.values.description).toBe("TR toplu 2");
    expect(m.get(ids[1])?.sourceLocale.description).toBe("tr");
    console.log(`FAZ3_PERF 1000 villa getContentMany ${ms.toFixed(1)} ms`);

    const locales: Locale[] = ["tr", "en", "de"];
    const jobs = Array.from({ length: 40 }, (_, i) => {
      const l = locales[i % 3];
      const slice = ids.slice((i * 25) % 1000, ((i * 25) % 1000) + 25);
      return svc.getContentMany("villa", slice, l).then((r) => ({ l, slice, r }));
    });
    const t1 = performance.now();
    const out = await Promise.all(jobs);
    console.log(`FAZ3_PERF 40 eşzamanlı okuma ${(performance.now() - t1).toFixed(1)} ms`);
    for (const { l, slice, r } of out) {
      for (const id of slice) {
        const n = Number(id.slice(-4));
        const expected = l === "en" && n % 2 === 1 ? `EN toplu ${n}` : `TR toplu ${n}`;
        expect(r.get(id)?.values.description).toBe(expected);
      }
    }
  });

  it("Faz 3.1: ana dil TR'de page/blog SEO kararı eski ile birebir", () => {
    expect(SEO_PARITY.length).toBeGreaterThan(0);
    expect(SEO_PARITY.filter((x) => x.legacy !== x.next)).toEqual([]);
  });

  it("Faz 3.1: pages.body NULL → pages.content (TR/EN/DE, ana dil TR/EN/DE)", async () => {
    if (!HAS_CONTENT) return; // kolon yoksa ek yedek zaten devre dışı (birim testinde kapsanır)
    const P1 = "e3000000-0000-0000-0000-000000000001";
    const P2 = "e3000000-0000-0000-0000-000000000002";
    for (const [name, ctx] of Object.entries(contexts)) {
      const svc = makeService(() => ctx);
      const trActive = ctx.enabled.includes("tr");
      for (const l of ["tr", "en", "de"] as Locale[]) {
        const c1 = await svc.getContent("page", P1, l);
        const c2 = await svc.getContent("page", P2, l);
        expect({ name, l, b: c1?.values.body ?? null }).toEqual({ name, l, b: trActive ? "<p>F3 TR içerik</p>" : null });
        expect({ name, l, b: c2?.values.body ?? null }).toEqual({ name, l, b: trActive ? "<p>F3 TR gövde</p>" : null });
      }
      if (trActive) {
        expect((await svc.getContent("page", P1, "en"))?.slug).toBe("f3-about");
        expect((await svc.getContent("page", P1, "tr"))?.slug).toBe("f3-sayfa");
      }
    }
  });

  it("Faz 3.1: hiçbir aktif dilde içerik yok → sayfa 404, villa boş durum + noindex", async () => {
    const svc = makeService(() => contexts["root-en-tr-pasif"]);
    const onlyTrPage = await svc.getContent("page", "e0000000-0000-0000-0000-000000000001", "en");
    expect(onlyTrPage).toBeNull();
    expect(decideContentPresence("page", { recordExists: true, content: onlyTrPage }).kind).toBe("not-found");
    const onlyTrVilla = await svc.getContent("villa", "a4000000-0000-0000-0000-000000000002", "en");
    expect(decideContentPresence("villa", { recordExists: true, content: onlyTrVilla })).toMatchObject({
      kind: "render",
      robots: "noindex-follow",
      useEmptyState: true,
    });
  });

  it("hiçbir okuma DB hatası üretmedi", () => {
    expect(ERRORS).toEqual([]);
  });
});
