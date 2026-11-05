import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { diffLegacyVsNext, resolveLegacy } from "@/lib/i18n/content/content-legacy-compare";
import { indexContentRows } from "@/lib/i18n/content/content-resolve";
import {
  contentText,
  labelItems,
  loadContentLabels,
  loadVillaDetailContent,
  resolveCategoryName,
  villaRobots,
  type PublicContentReader,
} from "@/lib/i18n/content/public-villa-content";

/* ===============================================================
   Faz 6 DALGA 2 — İZOLE PostgreSQL: villa / kategori public içeriği
   merkezi okuma ile (gerçek SQL + çözümleyici), ana dil TR / EN / DE.
   CONTENT_F6D2_PG_URL_108   : m108clean'in TEK KULLANIMLIK kopyası
   CONTENT_F6D2_PG_URL_NO108 : m106'nın TEK KULLANIMLIK kopyası
   Testler veri YAZAR. Şablonlarda ÇALIŞTIRILMAZ.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};
const ACTOR = { actorId: "faz6-dalga2" };
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
/** Beklenen değer: zincir [istenen, ana dil, diğer aktif diller] içinde ilk dolu dil. */
function expectFromChain(
  rows: Partial<Record<Locale, string | null>>,
  requested: Locale,
  root: Locale,
  enabled: Locale[]
): string | null {
  const en = [root, ...enabled.filter((l) => l !== root)];
  const chain = [requested, ...en].filter((v, i, a) => a.indexOf(v) === i && (en.includes(v) || v === requested));
  for (const l of chain) {
    if (!en.includes(l)) continue;
    const v = rows[l];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

const CONFIGS = [
  { name: "108 SONRASI (m108clean kopyası)", url: process.env.CONTENT_F6D2_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ (m106 kopyası)", url: process.env.CONTENT_F6D2_PG_URL_NO108, has108: false },
];

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 6 Dalga 2 — izole PG (${cfg.name})`, () => {
    let pool: Pool;
    const ids: Record<string, string> = {};
    const k = (n: string) => `f6d2-${n}-${cfg.has108 ? "a" : "b"}-${RUN}`;
    const DESC: Record<string, Partial<Record<Locale, string | null>>> = {
      deniz: { tr: "<p>TR deniz</p>", en: "<p>EN sea</p>", de: "<p>DE meer</p>" },
      kismi: { tr: "<p>TR kısmi</p>", en: "<p>EN partial</p>" },
    };
    let techBefore = "";

    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      const cap = (await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok;
      expect(cap).toBe(cfg.has108);
      const w = writer(pool);
      const mk = async (entity: ContentEntityKey, key: string, technical: Record<string, unknown>, locales: Array<{ locale: Locale; patch: Record<string, unknown> }>) => {
        const r = await w.createContent({ entity, technical, locales }, ACTOR);
        expect(r.ok ? true : r).toBe(true);
        ids[key] = (r as { id: string }).id;
      };
      await mk("villa", "deniz", { slug: k("deniz"), title: "Deniz", is_active: true }, L.map((l) => ({
        locale: l,
        patch: { description: DESC.deniz[l]!, badge: `badge-${l}`, seo_title: `SEO ${l}`, seo_description: `meta ${l}` },
      })));
      await mk("villa", "kismi", { slug: k("kismi"), title: "Kısmi", is_active: true }, [
        { locale: "tr", patch: { description: DESC.kismi.tr!, badge: "Yeni" } },
        { locale: "en", patch: { description: DESC.kismi.en! } },
      ]);
      for (const only of L) {
        /* İçerik YALNIZ tek dilde (diğer diller boş / ''). */
        await mk("villa", `only-${only}`, { slug: k(`only-${only}`), title: `Only ${only}`, is_active: true }, [
          { locale: only, patch: { description: `<p>yalnız ${only}</p>` } },
        ]);
      }
      await mk("villa_feature", "f1", {}, L.map((l) => ({ locale: l, patch: { name: `F1-${l}` } })));
      await mk("villa_feature", "f2", {}, [{ locale: "tr", patch: { name: "F2-tr" } }]);
      await mk("rule_item", "r1", {}, [{ locale: "tr", patch: { title: "R1-tr" } }, { locale: "de", patch: { title: "R1-de" } }]);
      await mk("price_include_item", "p1", {}, [{ locale: "en", patch: { title: "P1-en" } }]);
      await mk("villa_type", "t1", { slug: k("t1") }, L.map((l) => ({ locale: l, patch: { name: `Kategori ${l}` } })));
      await mk("villa_type", "t2", { slug: k("t2") }, [{ locale: "en", patch: { name: "Only EN type" } }]);
      /* Teknik (dil bağımsız) veri anlık görüntüsü — okumalar bunu DEĞİŞTİRMEMELİ. */
      techBefore = JSON.stringify(
        (await pool.query("SELECT id::text, slug, title, is_active, deleted_at FROM villa ORDER BY id")).rows
      );
    });
    afterAll(async () => {
      await pool?.end();
    });

    for (const root of L) {
      describe(`ana dil ${root.toUpperCase()}`, () => {
        it("villa detay: istenen dil → ana dil → aktif diller; alan bazında; teknik anahtar okunmaz/değişmez", async () => {
          const r = reader(pool, root, L);
          for (const l of L) {
            const dz = await loadVillaDetailContent(r, ids.deniz, l);
            expect(dz.description).toBe(DESC.deniz[l]);
            expect(dz.seoTitle).toBe(`SEO ${l}`);
            expect(dz.seoDescription).toBe(`meta ${l}`);
            expect(villaRobots(dz.content, false)).toBeUndefined();
            const kz = await loadVillaDetailContent(r, ids.kismi, l);
            expect(kz.description).toBe(expectFromChain(DESC.kismi, l, root, L));
            /* Yedek dilin seo_description'ı istenen dile geçmez → açıklama özeti. */
            expect(kz.seoDescription).toBe(String(expectFromChain(DESC.kismi, l, root, L)).replace(/<[^>]+>/g, ""));
            expect(villaRobots(kz.content, false)).toBeUndefined(); // Faz 3.1: yedek dil noindex sebebi değil
            expect(villaRobots(kz.content, true)).toEqual({ index: false, follow: false });
          }
        });

        it("pasif dil zincire girmez; içerik yalnız pasif dildeyse boş durum + noindex,follow", async () => {
          for (const passive of L.filter((x) => x !== root)) {
            const enabled = L.filter((x) => x !== passive);
            const r = reader(pool, root, enabled);
            for (const l of enabled) {
              const c = await loadVillaDetailContent(r, ids[`only-${passive}`], l);
              expect(c.description).toBeNull();
              expect(villaRobots(c.content, false)).toEqual({ index: false, follow: true });
              /* Aktif dildeki içerik ise kullanılır. */
              const own = await loadVillaDetailContent(r, ids[`only-${l}`], l);
              expect(own.description).toBe(`<p>yalnız ${l}</p>`);
            }
          }
        });

        it("özellik / kural / fiyata dahil: tek batch; zincir; hiçbir aktif dilde yoksa gizli; sıra korunur", async () => {
          const r = reader(pool, root, L);
          for (const l of L) {
            const f = await loadContentLabels(r, "villa_feature", "name", [ids.f1, ids.f2], l);
            const items = labelItems([{ id: ids.f2 }, { id: ids.f1 }], f, (x, name) => ({ id: x.id, name }));
            expect(items).toEqual([
              { id: ids.f2, name: "F2-tr" },
              { id: ids.f1, name: `F1-${l}` },
            ]);
            const rr = await loadContentLabels(r, "rule_item", "title", [ids.r1], l);
            expect(rr.get(ids.r1)).toBe(expectFromChain({ tr: "R1-tr", de: "R1-de" }, l, root, L));
            const pp = await loadContentLabels(r, "price_include_item", "title", [ids.p1], l);
            expect(pp.get(ids.p1)).toBe("P1-en");
          }
          /* EN pasif → P1 (yalnız EN) hiçbir aktif dilde yok → gizli (ana dil EN değilse). */
          if (root !== "en") {
            const r2 = reader(pool, root, L.filter((x) => x !== "en"));
            expect((await loadContentLabels(r2, "price_include_item", "title", [ids.p1], root)).has(ids.p1)).toBe(false);
          }
        });

        it("kart rozeti: istenen dil → zincir; ana tablo kolonu kullanılmaz", async () => {
          const r = reader(pool, root, L);
          for (const l of L) {
            const b = await loadContentLabels(r, "villa", "badge", [ids.deniz, ids.kismi, ids["only-tr"]], l);
            expect(b.get(ids.deniz)).toBe(`badge-${l}`);
            expect(b.get(ids.kismi)).toBe(expectFromChain({ tr: "Yeni" }, l, root, L) ?? undefined);
            expect(b.has(ids["only-tr"])).toBe(false);
          }
        });

        it("kategori adı: merkezi servis; yoksa genel etiket (slug DEĞİL)", async () => {
          const r = reader(pool, root, L);
          for (const l of L) {
            const n = await loadContentLabels(r, "villa_type", "name", [ids.t1, ids.t2], l);
            expect(resolveCategoryName(n, ids.t1, "GENEL").name).toBe(`Kategori ${l}`);
            expect(resolveCategoryName(n, ids.t2, "GENEL")).toEqual({ name: "Only EN type", hasContent: true });
          }
          if (root !== "en") {
            const r2 = reader(pool, root, L.filter((x) => x !== "en"));
            const n2 = await loadContentLabels(r2, "villa_type", "name", [ids.t2], root);
            const c = resolveCategoryName(n2, ids.t2, "GENEL");
            expect(c).toEqual({ name: "GENEL", hasContent: false });
            expect(c.name).not.toBe(k("t2"));
          }
        });
      });
    }

    it("teknik anahtarlar ve teknik villa verisi okumalardan sonra değişmedi; içerik yazımı teknik anahtarı değiştirmez", async () => {
      expect(
        JSON.stringify((await pool.query("SELECT id::text, slug, title, is_active, deleted_at FROM villa ORDER BY id")).rows)
      ).toBe(techBefore);
      const w = writer(pool);
      expect((await w.saveContent("villa", ids.deniz, "en", { description: "<p>EN sea v2</p>" }, ACTOR)).ok).toBe(true);
      expect((await w.saveContent("villa_type", ids.t1, "de", { name: "Kategorie v2" }, ACTOR)).ok).toBe(true);
      expect((await pool.query("SELECT slug FROM villa WHERE id = $1", [ids.deniz])).rows[0].slug).toBe(k("deniz"));
      expect((await pool.query("SELECT slug FROM villa_types WHERE id = $1", [ids.t1])).rows[0].slug).toBe(k("t1"));
      const r = reader(pool, "tr", L);
      expect((await loadVillaDetailContent(r, ids.deniz, "en")).description).toBe("<p>EN sea v2</p>");
      expect((await loadContentLabels(r, "villa_type", "name", [ids.t1], "de")).get(ids.t1)).toBe("Kategorie v2");
    });

    it("ana dil TR: eski okuyucu ↔ merkezi servis — şablon verisi dahil BÜTÜN kayıtlarda ayna kayması / açıklanamayan fark YOK", async () => {
      const repo = createContentRepository((q) => pool.query(q.text, q.values));
      const svc = createContentReadService({ repository: repo, getLocaleContext: () => ({ root: "tr", enabled: L }) });
      const allowed = new Set(["fills-gap", "empty-normalization"]);
      const counts: Record<string, number> = {};
      for (const entity of ["villa", "villa_type", "villa_feature", "rule_item", "price_include_item"] as ContentEntityKey[]) {
        const def = CONTENT_ENTITY_BY_KEY[entity];
        const cols = def.fields.map((f) => `"${f.baseColumn}"`).join(", ");
        const base = (await pool.query(`SELECT id::text AS id, ${cols}${def.slugKind ? ', slug' : ""} FROM "${def.parentTable}"`)).rows;
        const idList = base.map((b) => String(b.id));
        const idx = indexContentRows(await repo.fetchRows(def, idList));
        for (const l of L) {
          const next = await svc.getContentMany(entity, idList, l);
          for (const b of base) {
            const legacy = resolveLegacy(def, b as never, idx.get(String(b.id)) ?? {}, l);
            const diffs = diffLegacyVsNext(def, legacy, next.get(String(b.id)) ?? null, idx.get(String(b.id)) ?? {}).filter(
              (x) => x.field !== "slug"
            );
            for (const df of diffs) counts[df.reason] = (counts[df.reason] ?? 0) + 1;
            expect(diffs.filter((x) => !allowed.has(x.reason))).toEqual([]);
          }
        }
        expect(contentText(null, "x")).toBeNull();
      }
      console.log(`[f6d2] legacy↔merkezi fark nedenleri (${cfg.name}):`, JSON.stringify(counts));
    });
  });
}
