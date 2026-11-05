import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

/* Faz 3 — sunucu bağlantısı: unstable_cache anahtar/tag'i, pg sorgusu,
   settings'ten dil bağlamı ve "hiçbir çalışan modül henüz kullanmıyor". */

const h = vi.hoisted(() => ({
  settings: { multilingual_enabled: true, public_default_locale: "tr", public_locales: null } as Record<string, unknown>,
  queries: [] as { text: string; values: unknown[] }[],
  cacheCalls: [] as { key: string[]; tags: string[]; revalidate: number }[],
  cacheStore: new Map<string, string>(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, key: string[], opts: { tags: string[]; revalidate: number }) => async () => {
    h.cacheCalls.push({ key, tags: opts.tags, revalidate: opts.revalidate });
    const k = key.join("|");
    if (h.cacheStore.has(k)) return JSON.parse(h.cacheStore.get(k)!);
    const v = await fn();
    h.cacheStore.set(k, JSON.stringify(v));
    return v;
  },
}));
vi.mock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => h.settings }));
vi.mock("@/lib/db/pg.client", () => ({
  getPgPool: () => ({
    query: async (text: string, values: unknown[]) => {
      h.queries.push({ text, values });
      if (text.includes("count(*)")) return { rows: [{ total: 2, rows: 1, f_name: 1 }] };
      const ids = values[0] as string[];
      return {
        rows: ids.flatMap((id) => [
          { parent_id: id, locale: "tr", name: `TR ${id.slice(-1)}`, slug: `tr-${id.slice(-1)}` },
          { parent_id: id, locale: "en", name: `EN ${id.slice(-1)}`, slug: null },
        ]),
      };
    },
  }),
}));

const T1 = "b0000000-0000-0000-0000-000000000001";
const T2 = "b0000000-0000-0000-0000-000000000002";

beforeEach(() => {
  h.queries.length = 0;
  h.cacheCalls.length = 0;
  h.cacheStore.clear();
  h.settings = { multilingual_enabled: true, public_default_locale: "tr", public_locales: null };
});

describe("Faz 3 — content-read.server", () => {
  it("getContentMany: tek pg sorgusu, unstable_cache anahtarında dil bağlamı, doğru tag'ler", async () => {
    const mod = await import("@/lib/i18n/content/content-read.server");
    const m = await mod.getContentMany("villa_type", [T1, T2], "en");
    expect(m.get(T1)?.values.name).toBe("EN 1");
    expect(m.get(T1)?.slug).toBeNull();
    expect(h.queries.length).toBe(1);
    expect(h.queries[0].values[1]).toEqual(["tr", "en", "de"]);
    expect(h.cacheCalls[0].key[0]).toContain("root=tr");
    expect(h.cacheCalls[0].key[0]).toContain("req=en");
    expect(h.cacheCalls[0].tags).toEqual(expect.arrayContaining(["content", "content:villa_type", "settings", "taxonomy", "locale-slugs"]));
    expect(h.cacheCalls[0].revalidate).toBe(600);
  });

  it("cache'ten dönen (JSON) sonuç da Map olarak verilir; ana dil değişince yeni anahtar", async () => {
    const mod = await import("@/lib/i18n/content/content-read.server");
    await mod.getContentMany("villa_type", [T1], "de");
    const again = await mod.getContentMany("villa_type", [T1], "de");
    expect(again).toBeInstanceOf(Map);
    expect(again.get(T1)?.values.name).toBe("TR 1");
    expect(h.queries.length).toBe(1);
    h.settings = { multilingual_enabled: true, public_default_locale: "en", public_locales: null };
    const after = await mod.getContentMany("villa_type", [T1], "de");
    expect(after.get(T1)?.values.name).toBe("EN 1");
    expect(h.queries.length).toBe(2);
    expect(new Set(h.cacheCalls.map((c) => c.key[0])).size).toBe(2);
  });

  it("getContent / getCoverage / getAllLocales", async () => {
    const mod = await import("@/lib/i18n/content/content-read.server");
    expect((await mod.getContent("villa_type", T2, "tr"))?.slug).toBe("tr-2");
    expect(await mod.getCoverage("menu", "en")).toEqual({ total: 2, rows: 1, filled: { name: 1 } });
    expect(Object.keys(await mod.getAllLocales("villa_type", T1)).sort()).toEqual(["en", "tr"]);
  });
});

/* Faz 6 Dalga 1: public geçiş başladı. Merkezi okumaya YALNIZ açıkça
   listelenen bağlantı noktaları erişir; her dalga kendi noktasını buraya
   ekler. Bunun dışındaki her import hâlâ hatadır (kontrolsüz geçiş yok). */
const FAZ6_INTEGRATION_POINTS = [path.join("lib", "i18n", "routing", "route-content.server.ts")];
/* 🌐 Faz 6 Dalga 2 — merkezi okumayı `public-villa-content` üzerinden
   kullanan public sayfalar (yalnız bunlar; yenisi eklenirse test kırılır). */
const FAZ6_PUBLIC_CONTENT_CONSUMERS = [
  path.join("app", "(public)", "_routes", "villa.tsx"),
  path.join("app", "components", "search", "KiralikVillalarPageBody.tsx"),
  path.join("app", "components", "search", "TaxonomyLandingPageBody.tsx"),
  path.join("app", "components", "villa", "SimilarVillasSection.tsx"),
  /* 🌐 Faz 6 Dalga 3 — blog */
  path.join("app", "components", "blog", "blog-metadata.ts"),
  path.join("app", "components", "blog", "BlogDetailPageBody.tsx"),
  path.join("app", "components", "blog", "BlogIndexPageBody.tsx"),
  /* 🌐 Faz 6 Dalga 3 — CMS */
  path.join("app", "components", "cms", "cms-page-metadata.ts"),
  path.join("app", "(public)", "_routes", "cms-page.tsx"),
  /* 🌐 Faz 6 Dalga 4 — ana sayfa + ortak bileşenler (`public-shared-content`) */
  path.join("app", "components", "home", "HomePageBody.tsx"),
  path.join("app", "components", "home", "home-metadata.ts"),
  path.join("app", "components", "villa", "VillaList.tsx"),
  path.join("app", "components", "home", "DiscountCollection.tsx"),
  path.join("app", "components", "villa", "VillaTypeCarousel.tsx"),
  path.join("app", "components", "layout", "HeaderWrapper.tsx"),
  path.join("app", "components", "layout", "FooterWrapper.tsx"),
  path.join("app", "(public)", "_shell", "PublicShell.tsx"),
  path.join("app", "components", "contact", "ContactPageBody.tsx"),
  /* 🌐 Faz 6 Dalga 4 son düzeltme — kök layout varsayılan başlığı (ana dil bağlamı). */
  path.join("app", "_root", "root-document.tsx"),
  /* 🌐 Faz 6 Dalga 5 — sitemap (merkezi SEO kuralı) */
  path.join("app", "sitemap.ts"),
].sort();

describe("Faz 3 sınırı — hiçbir çalışan modül yeni servisi import etmiyor (Faz 6 bağlantı noktaları hariç)", () => {
  it("app/ ve lib/ (content klasörü ve onaylı Faz 6 noktaları hariç) içinde import yok", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || p === path.join("lib", "i18n", "content")) continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (/i18n\/content\/content-(read|repository|resolve|sql|legacy|field-rules|derived|presence)/.test(src)) hits.push(p);
        }
      }
    };
    walk("app");
    walk("lib");
    expect(hits.filter((h) => !FAZ6_INTEGRATION_POINTS.includes(h))).toEqual([]);
    /* Faz 6 Dalga 2 tüketicileri (yalnız `public-villa-content`). */
    const consumers: string[] = [];
    const walk2 = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules") walk2(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !p.startsWith(path.join("lib", "i18n", "content"))) {
          if (/i18n\/content\/public-(villa|text|shared|seo)-content/.test(fs.readFileSync(p, "utf8"))) consumers.push(p);
        }
      }
    };
    walk2("app");
    walk2("lib");
    expect(consumers.sort()).toEqual(FAZ6_PUBLIC_CONTENT_CONSUMERS);
    /* bağlantı noktası gerçekten merkezi okumayı kullanıyor */
    expect(hits).toEqual(FAZ6_INTEGRATION_POINTS);
  });
});
