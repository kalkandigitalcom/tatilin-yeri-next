import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 6 — DALGA 5: SEO TUTARLILIĞI (sitemap ↔ sayfa metadata'sı).
   A) Saf eşdeğerlik: sayfa metadata'sının kararı (404 / robots /
      hreflang) ile sitemap kararı, GERÇEK merkezi çekirdek + bellek içi
      depo üzerinde, üretilmiş senaryoların TAMAMINDA aynı.
   B) sitemap(): ana dil TR / EN / DE, pasif dil, x-default, villa /
      kategori / blog / CMS, okuma hatasında bozulma modu.
   =============================================================== */

const h = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  data: {} as Record<string, Record<string, Record<string, Record<string, unknown>>>>,
  fail: [] as string[],
  ids: { villa: new Map<string, string>(), blog: new Map<string, string>() } as {
    villa: Map<string, string> | null;
    blog: Map<string, string> | null;
  },
  noindex: { villa: new Set<string>(), page: new Set<string>(), blog: new Set<string>() },
  villas: [] as { slug: string; created_at: string }[],
  pages: [] as { id: string; slug: string; created_at: string }[],
  posts: [] as { slug: string; published_at: string; updated_at: null }[],
  types: [] as { id: string; slug: string }[],
  covers: {} as Record<string, { coverImageUrl: null; villaCount: number }>,
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: async () => h.settings,
  getCachedVillaTypes: async () => h.types,
  getCachedVillaLocations: async () => [],
  getCachedCategoryCovers: async () => h.covers,
  getCachedLocationVillaCounts: async () => ({}),
}));
vi.mock("@/lib/i18n/routing/slug-map.server", () => ({
  getCachedLocalizedSlugMap: async () => ({}),
  getCachedRedirectMap: async () => ({}),
}));
vi.mock("@/lib/db/villa.repository.server", () => ({ villaAdminRepository: { listPublicSlugs: async () => h.villas } }));
vi.mock("@/lib/db/pages.repository", () => ({ pagesRepository: { findActivePages: async () => ({ data: h.pages, error: null }) } }));
vi.mock("@/lib/db/blog.repository", () => ({ blogRepository: { findActiveSlugs: async () => ({ data: h.posts, error: null }) } }));
vi.mock("@/lib/i18n/sitemap-data.server", () => ({
  loadNoindexSlugs: async () => h.noindex,
  loadSitemapIds: async () => h.ids,
}));
vi.mock("@/lib/i18n/content/public-seo-content.server", async () =>
  (await import("../fixtures/faz6/sitemap-content")).sitemapReaderMock(() => h.data as never, { fail: () => h.fail })
);

import type { Locale } from "@/lib/i18n/config";
import { fixtureReader } from "../fixtures/faz6/content-fixture";
import { loadAvailableLocales, isTextContentMissing, textRobots } from "@/lib/i18n/content/public-text-content";
import { villaRobots } from "@/lib/i18n/content/public-villa-content";
import {
  hasNoContentAnywhere,
  loadContentsByLocale,
  textIndexableLocales,
  villaIndexableLocales,
} from "@/lib/i18n/content/public-seo-content";

const L: Locale[] = ["tr", "en", "de"];
const ID = "aaaaaaaa-5555-4555-8555-000000000001";
const ENABLED_SETS: Locale[][] = [["tr", "en", "de"], ["tr", "en"], ["tr", "de"], ["en", "de"], ["tr"], ["en"], ["de"]];
type Cell = "full" | "title" | "none" | "emptyBody" | "absent";
const CELLS: Cell[] = ["full", "title", "none", "emptyBody", "absent"];
const cellRow = (c: Cell, l: string): Record<string, unknown> | undefined =>
  c === "absent"
    ? undefined
    : c === "full"
      ? { title: `${l} t`, body: `<p>${l}</p>`, excerpt: `${l} e`, seo_title: null, seo_description: null }
      : c === "title"
        ? { title: `${l} t`, body: null, excerpt: null, seo_title: null, seo_description: null }
        : c === "emptyBody"
          ? { title: null, body: "", excerpt: null, seo_title: null, seo_description: null }
          : { title: null, body: null, excerpt: null, seo_title: null, seo_description: null };

function* scenarios() {
  for (const a of CELLS) for (const b of CELLS) for (const c of CELLS) yield { tr: a, en: b, de: c } as Record<Locale, Cell>;
}

/* Sayfa metadata'sının kararı — blog-metadata / cms-page-metadata ile AYNI
   çağrı sırası: 404 → loadAvailableLocales(known) → textRobots → hreflang. */
async function pageIndexable(
  entity: "blog_post" | "page",
  reader: ReturnType<typeof fixtureReader>,
  enabled: Locale[],
  noindex: boolean
): Promise<Locale[]> {
  const out: Locale[] = [];
  for (const l of enabled) {
    const content = await reader.getContent(entity, ID, l);
    if (isTextContentMissing(entity, content)) continue; // 404
    const available = await loadAvailableLocales(reader, entity, ID, enabled, { locale: l, content });
    const robots = textRobots(entity === "blog_post" ? "blog" : "page", noindex, available.includes(l));
    const indexable = robots === undefined || robots.index === true;
    if (indexable) out.push(l);
  }
  return out;
}

describe("A) saf eşdeğerlik — sayfa metadata'sı ↔ sitemap (gerçek çekirdek)", () => {
  for (const entity of ["blog_post", "page"] as const) {
    it(`${entity}: 125 içerik senaryosu × 3 ana dil × 7 aktif dil kümesi × noindex — kararlar BİREBİR`, async () => {
      let checked = 0;
      for (const sc of scenarios()) {
        const data = { [entity]: { [ID]: Object.fromEntries(L.flatMap((l) => (cellRow(sc[l], l) ? [[l, cellRow(sc[l], l)]] : []))) } };
        for (const root of L) {
          for (const set of ENABLED_SETS) {
            const enabled = (set.includes(root) ? set : [root, ...set]) as Locale[];
            const reader = fixtureReader(() => data as never, () => ({ root, enabled }));
            for (const noindex of [false, true]) {
              const page = await pageIndexable(entity, reader, enabled, noindex);
              const contents = (await loadContentsByLocale(reader, entity, [ID], enabled)).get(ID) ?? {};
              const site = textIndexableLocales(entity, noindex, contents, enabled);
              expect(site, JSON.stringify({ sc, root, enabled, noindex })).toEqual(page);
              /* Pasif dil hiçbir zaman sonuçta yok. */
              for (const l of site) expect(enabled).toContain(l);
              checked++;
            }
          }
        }
      }
      expect(checked).toBe(125 * 3 * 7 * 2);
    }, 60_000);
  }

  it("villa: sayfa robots kararı ↔ sitemap — yedek dilden içerik indexlenir; hiç içerik yoksa yok; bayrak yok", async () => {
    const VC: Array<Record<string, unknown> | undefined> = [
      undefined,
      { description: null, badge: null, seo_title: null, seo_description: null },
      { description: "<p>x</p>", badge: null, seo_title: null, seo_description: null },
      { description: null, badge: "Yeni", seo_title: null, seo_description: null },
    ];
    for (const a of VC) for (const b of VC) for (const c of VC) {
      const rows = Object.fromEntries(([["tr", a], ["en", b], ["de", c]] as const).filter(([, v]) => v));
      const data = { villa: { [ID]: rows } };
      for (const root of L) for (const set of ENABLED_SETS) {
        const enabled = (set.includes(root) ? set : [root, ...set]) as Locale[];
        const reader = fixtureReader(() => data as never, () => ({ root, enabled }));
        for (const noindex of [false, true]) {
          const page: Locale[] = [];
          for (const l of enabled) {
            const content = await reader.getContent("villa", ID, l);
            if (villaRobots(content, noindex) === undefined) page.push(l);
          }
          const rootContent = (await loadContentsByLocale(reader, "villa", [ID], [root])).get(ID)?.[root];
          expect(villaIndexableLocales(rootContent, noindex, enabled)).toEqual(page);
          /* Hreflang kuralı aynı kaynaktan: içerik hiç yoksa hreflang yok. */
          const anyActive = enabled.some((l) => rows[l] && Object.values(rows[l] as object).some((v) => typeof v === "string" && (v as string).trim() !== ""));
          expect(hasNoContentAnywhere(rootContent)).toBe(!anyActive);
        }
      }
    }
  });
});

/* ---------------------------------------------------------------
   B) sitemap()
   --------------------------------------------------------------- */
const V = { full: "v-full", fb: "v-fb", none: "v-none", flag: "v-flag" };
function settings(root: Locale, enabled: Locale[] = L, multilingual = true) {
  return {
    multilingual_enabled: multilingual,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
  };
}
type Entry = { url: string; alternates?: { languages?: Record<string, string> } };
async function run(): Promise<Entry[]> {
  return (await (await import("@/app/sitemap")).default()) as Entry[];
}
const T = (l: string) => ({ title: `${l} t`, body: `<p>${l}</p>`, excerpt: null });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  h.fail = [];
  h.noindex = { villa: new Set(["villa-flag"]), page: new Set(), blog: new Set() };
  h.villas = ["villa-full", "villa-fb", "villa-none", "villa-flag"].map((slug) => ({ slug, created_at: "2024-01-01T00:00:00Z" }));
  h.ids = {
    villa: new Map([["villa-full", V.full], ["villa-fb", V.fb], ["villa-none", V.none], ["villa-flag", V.flag]]),
    blog: new Map([["yazi-hepsi", "b-all"], ["yazi-tr", "b-tr"], ["yazi-de", "b-de"], ["yazi-bos", "b-none"]]),
  };
  h.pages = [
    { id: "p-all", slug: "hakkimizda", created_at: "2024-01-01T00:00:00Z" },
    { id: "p-en", slug: "gizlilik", created_at: "2024-01-01T00:00:00Z" },
  ];
  h.posts = ["yazi-hepsi", "yazi-tr", "yazi-de", "yazi-bos"].map((slug) => ({ slug, published_at: "2024-01-01T00:00:00Z", updated_at: null }));
  h.types = [{ id: "t-ad", slug: "luks" }, { id: "t-adsiz", slug: "adsiz" }];
  h.covers = { "t-ad": { coverImageUrl: null, villaCount: 3 }, "t-adsiz": { coverImageUrl: null, villaCount: 2 } };
  h.data = {
    villa: {
      [V.full]: Object.fromEntries(L.map((l) => [l, { description: `${l} d` }])),
      /* Yalnız DE'de içerik → diğer dillerde yedekle gösterilir → İNDEXLENİR. */
      [V.fb]: { de: { description: "nur de" } },
      [V.none]: { tr: { description: null } },
      [V.flag]: { tr: { description: "x" } },
    },
    blog_post: {
      "b-all": Object.fromEntries(L.map((l) => [l, T(l)])),
      "b-tr": { tr: T("tr") },
      "b-de": { de: T("de") },
      "b-none": {},
    },
    page: { "p-all": Object.fromEntries(L.map((l) => [l, T(l)])), "p-en": { en: T("en") } },
    villa_type: { "t-ad": { tr: { name: "Lüks" } }, "t-adsiz": {} },
  };
});
afterEach(() => vi.unstubAllEnvs());

/* Ana dil öneksiz, diğer diller `/<dil>` önekli (merkezi route kuralı). */
const isLocaleUrl = (u: string, l: Locale, root: Locale) => {
  const p = u.replace("https://example.com", "");
  return l === root ? !/^\/(tr|en|de)(\/|$)/.test(p) : p === `/${l}` || p.startsWith(`/${l}/`);
};
const has = (e: Entry[], frag: string, l: Locale, root: Locale) =>
  e.some((x) => isLocaleUrl(x.url, l, root) && x.url.includes(frag));

for (const root of L) {
  describe(`B) sitemap — ana dil ${root.toUpperCase()}`, () => {
    it("villa: tam ve yalnız-yedek içerikli villa bütün aktif dillerde; içeriksiz ve noindex bayraklı yok", async () => {
      h.settings = settings(root);
      const e = await run();
      for (const l of L) {
        expect(has(e, "villa-full", l, root)).toBe(true);
        expect(has(e, "villa-fb", l, root)).toBe(true);
      }
      expect(e.some((x) => x.url.includes("villa-none"))).toBe(false);
      expect(e.some((x) => x.url.includes("villa-flag"))).toBe(false);
    });

    it("blog / CMS: yalnız GERÇEK çevirisi olan diller; içeriği hiçbir aktif dilde olmayan yok", async () => {
      h.settings = settings(root);
      const e = await run();
      const urls = e.map((x) => x.url);
      for (const l of L) expect(has(e, "yazi-hepsi", l, root)).toBe(true);
      expect(urls.filter((u) => u.includes("yazi-hepsi"))).toHaveLength(3);
      const tr = urls.filter((u) => u.includes("yazi-tr"));
      expect(tr).toHaveLength(1);
      const de = urls.filter((u) => u.includes("yazi-de"));
      expect(de).toHaveLength(1);
      expect(urls.some((u) => u.includes("yazi-bos"))).toBe(false);
      expect(urls.filter((u) => u.includes("gizlilik"))).toHaveLength(1);
      /* Tek dilde mevcut kayıt: hreflang yok (≥2 dil gerekir). */
      expect(e.find((x) => x.url.includes("yazi-tr"))!.alternates).toBeUndefined();
    });

    it("kategori: adı hiçbir aktif dilde olmayan yok; adı olan bütün aktif dillerde", async () => {
      h.settings = settings(root);
      const e = await run();
      expect(e.filter((x) => x.url.includes("luks")).length).toBe(3);
      expect(e.some((x) => x.url.includes("adsiz"))).toBe(false);
    });

    it("x-default = ana dilin URL'si; ana dilde yoksa ilk aktif dil", async () => {
      h.settings = settings(root);
      const e = await run();
      const full = e.find((x) => x.url.includes("villa-full"))!.alternates!.languages!;
      expect(full["x-default"]).toBe(full[root]);
      const p = e.find((x) => x.url.includes("hakkimizda"))!.alternates!.languages!;
      expect(p["x-default"]).toBe(p[root]);
    });

    it("pasif dil: hiçbir URL'de ve hiçbir hreflang'de yok", async () => {
      for (const passive of L.filter((x) => x !== root)) {
        vi.resetModules();
        h.settings = settings(root, L.filter((x) => x !== passive));
        const e = await run();
        expect(e.some((x) => isLocaleUrl(x.url, passive, root))).toBe(false);
        for (const x of e) expect(Object.keys(x.alternates?.languages ?? {})).not.toContain(passive);
        /* Yalnız pasif dilde içeriği olan yazı hiç listelenmez. */
        if (passive === "de") expect(e.some((x) => x.url.includes("yazi-de"))).toBe(false);
      }
    });
  });
}

describe("B) sitemap — okuma hatasında bozulma modu (eski davranışın simetriği)", () => {
  it("villa / kategori okuması patlarsa: bütün aktif diller (kayıt var); blog / CMS: yalnız ana dil", async () => {
    h.settings = settings("en");
    h.fail = ["villa", "villa_type", "blog_post", "page"];
    const e = await run();
    expect(e.filter((x) => x.url.includes("villa-none")).length).toBe(3);
    expect(e.filter((x) => x.url.includes("adsiz")).length).toBe(3);
    const blog = e.filter((x) => x.url.includes("yazi-tr")).map((x) => x.url);
    expect(blog).toEqual(["https://example.com/blog/yazi-tr"]);
    /* noindex bayrağı bozulma modunda da geçerli. */
    expect(e.some((x) => x.url.includes("villa-flag"))).toBe(false);
  });

  it("kimlik eşlemesi okunamazsa da aynı bozulma modu", async () => {
    h.settings = settings("tr");
    h.ids = { villa: null, blog: null };
    const e = await run();
    expect(e.filter((x) => x.url.includes("villa-none")).length).toBe(3);
    expect(e.filter((x) => x.url.includes("yazi-de")).map((x) => x.url)).toEqual(["https://example.com/blog/yazi-de"]);
  });

  it("çoklu dil kapalı: yalnız ana dil; hiçbir hreflang yok", async () => {
    h.settings = settings("tr", L, false);
    const e = await run();
    expect(e.some((x) => /example\.com\/(en|de)(\/|$)/.test(x.url))).toBe(false);
    for (const x of e) expect(x.alternates).toBeUndefined();
    expect(e.some((x) => x.url.includes("yazi-de"))).toBe(false);
  });
});

