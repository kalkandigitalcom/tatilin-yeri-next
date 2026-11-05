import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* ===============================================================
   Faz 6 — DALGA 5 / kararlar:
   A) Kayıtlı varsayılan SEO başlığı (karar B): sayfanın kendi dili →
      ana dil → ana dilin sözlük karşılığı; pasif dil yok.
   B) Site geneli indeksleme kapalı: her sayfa noindex (dispatcher
      politikası), sitemap boş, robots.txt değişmez.
   C) Kısa süreli fırsatlar sitemap'te: yalnız villalı ay + gece, aktif
      ve gerçek çevirisi olan diller; sayfa metadata'sıyla tutarlı.
   =============================================================== */

const h = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  rows: {} as Record<string, Record<string, unknown>>,
  gaps: [] as Array<{ bucket_month: string; gap_nights: number; villa_count: number }>,
  gapError: null as null | { message: string },
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
}));
vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "--font-outfit" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: async () => h.settings,
  getCachedVillaTypes: async () => [],
  getCachedVillaLocations: async () => [],
  getCachedCategoryCovers: async () => ({}),
  getCachedLocationVillaCounts: async () => ({}),
}));
vi.mock("@/lib/i18n/routing/slug-map.server", () => ({
  getCachedLocalizedSlugMap: async () => ({}),
  getCachedRedirectMap: async () => ({}),
}));
vi.mock("@/lib/i18n/content/content-read.server", () => ({ getAllLocales: async () => structuredClone(h.rows) }));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: { listPublicSlugs: async () => [{ slug: "deniz", created_at: "2024-01-01T00:00:00Z" }] },
}));
vi.mock("@/lib/db/pages.repository", () => ({ pagesRepository: { findActivePages: async () => ({ data: [], error: null }) } }));
vi.mock("@/lib/db/blog.repository", () => ({ blogRepository: { findActiveSlugs: async () => ({ data: [], error: null }) } }));
vi.mock("@/lib/db/short-gaps.repository", () => ({
  shortGapsRepository: { getShortGapCounts: async () => ({ data: h.gaps, error: h.gapError }) },
}));
vi.mock("@/lib/i18n/sitemap-data.server", () => ({
  loadNoindexSlugs: async () => ({ villa: new Set(), page: new Set(), blog: new Set() }),
  loadSitemapIds: async () => ({ villa: new Map([["deniz", "v1"]]), blog: new Map() }),
}));
vi.mock("@/lib/i18n/content/public-seo-content.server", async () =>
  (await import("../fixtures/faz6/sitemap-content")).sitemapReaderMock(() => ({ villa: { v1: { tr: { description: "x" } } } }))
);

import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { buildRootMetadata } from "@/app/_root/root-document";
import { applySiteIndexingPolicy, siteIndexingEnabled } from "@/lib/seo-site-policy";
import { localeRoute, localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { shortGapSitemapPaths, resolveBucketMonthFromSlug, bucketMonthToSlug } from "@/lib/short-gaps.helpers";
import { shortGapsSeoLocales } from "@/app/components/short-gaps/short-gaps-metadata";

const L: Locale[] = ["tr", "en", "de"];
const SID = "5e771e65-0000-4000-8000-0000000000bb";
function settings(root: Locale, enabled: Locale[] = L, extra: Record<string, unknown> = {}) {
  return {
    id: SID,
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
    default_meta_title: "TR Kayıtlı",
    default_meta_description: "TR Açıklama",
    robots_index: true,
    robots_follow: true,
    ...extra,
  };
}
const row = (t: string | null, d: string | null = null) => ({ default_meta_title: t, default_meta_description: d });
const seo = (l: Locale) => getDictionary(l).home.seo;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  h.rows = {};
  h.gaps = [];
  h.gapError = null;
});
afterEach(() => vi.unstubAllEnvs());

/* ---------------------------------------------------------------
   A) Kayıtlı varsayılan başlık — karar B
   --------------------------------------------------------------- */
describe("A) kök layout varsayılan başlığı — sayfanın dili öncelikli", () => {
  it("ana dil TR, TR sayfası: eski davranışla BİREBİR (ana kolon / TR satırı)", async () => {
    h.settings = settings("tr");
    h.rows = { tr: row("TR Kayıtlı", "TR Açıklama"), en: row("EN Saved", "EN Desc") };
    const m = await buildRootMetadata("tr");
    expect(m.title).toBe("TR Kayıtlı");
    expect(m.description).toBe("TR Açıklama");
    /* TR satırı henüz yoksa (107 öncesi) ana kolon. */
    h.rows = { en: row("EN Saved") };
    expect((await buildRootMetadata("tr")).title).toBe("TR Kayıtlı");
    /* Dil verilmezse (admin kökü / 404) ana dil → aynı. */
    expect((await buildRootMetadata()).title).toBe("TR Kayıtlı");
  });

  for (const root of L) {
    const others = L.filter((x) => x !== root);
    describe(`ana dil ${root.toUpperCase()}`, () => {
      it("1) sayfanın kendi dilindeki kayıtlı değer; 2) yoksa ana dilin değeri", async () => {
        h.settings = settings(root);
        h.rows = { [root]: row(`${root} kayıtlı`, `${root} açıklama`), [others[0]]: row(`${others[0]} kayıtlı`) };
        if (root !== "tr" && others[0] !== "tr") h.rows.tr = row("TR Kayıtlı", "TR Açıklama");
        for (const l of L) {
          const m = await buildRootMetadata(l);
          const own = h.rows[l]?.default_meta_title as string | undefined;
          expect(m.title, l).toBe(own ?? `${root} kayıtlı`);
          /* Açıklama yalnız ana dilde kayıtlı → diğer dillerde ana dilinki. */
          const ownDesc = h.rows[l]?.default_meta_description as string | null | undefined;
          expect(m.description, l).toBe(ownDesc || `${root} açıklama`);
        }
      });

      it("3) ana dilde kayıtlı değer yoksa / boşsa → ana dilin SÖZLÜK karşılığı (başka dilden alınmaz)", async () => {
        h.settings = settings(root, L, root === "tr" ? { default_meta_title: "", default_meta_description: null } : {});
        h.rows = { [root]: row("", null), [others[0]]: row(`${others[0]} kayıtlı`) };
        const missing = others[1];
        const m = await buildRootMetadata(missing);
        expect(m.title).toBe(seo(root).metaTitleFallback);
        expect(m.description).toBe(seo(root).metaDescriptionFallback);
        /* Ana dil satırı HİÇ yoksa da (ör. ana dil EN, EN satırı yok) TR'ye değil sözlüğe. */
        if (root !== "tr") {
          h.rows = { tr: row("TR Kayıtlı", "TR Açıklama") };
          const m2 = await buildRootMetadata(root);
          expect(m2.title).toBe(seo(root).metaTitleFallback);
        }
      });

      it("pasif dil: değeri hiçbir sayfada kullanılmaz; pasif dil sayfası istenirse ana dil", async () => {
        const passive = others[0];
        h.settings = settings(root, L.filter((x) => x !== passive));
        h.rows = { [root]: row(`${root} kayıtlı`), [passive]: row("PASİF başlık") };
        if (root !== "tr" && passive !== "tr") h.rows.tr = row("TR Kayıtlı");
        for (const l of L) {
          const m = await buildRootMetadata(l);
          expect(m.title).not.toBe("PASİF başlık");
        }
        expect((await buildRootMetadata(passive)).title).toBe(`${root} kayıtlı`);
      });
    });
  }

  it("public [lang] layout sayfanın dilini geçirir (og:locale aynen)", async () => {
    h.settings = settings("tr");
    h.rows = { tr: row("TR Kayıtlı"), en: row("EN Saved"), de: row(null) };
    const { generateMetadata } = await import("@/app/(public)/[lang]/layout");
    const en = await generateMetadata({ params: Promise.resolve({ lang: "en" }) });
    expect(en.title).toBe("EN Saved");
    expect((en.openGraph as { locale?: string }).locale).toBe("en_US");
    const de = await generateMetadata({ params: Promise.resolve({ lang: "de" }) });
    expect(de.title).toBe("TR Kayıtlı");
  });
});

/* ---------------------------------------------------------------
   B) Site geneli indeksleme kapalı
   --------------------------------------------------------------- */
describe("B) site geneli indeksleme politikası", () => {
  it("saf kural: açıkken sayfa kararı aynen; kapalıyken index:false, follow korunur; robots yoksa dokunulmaz", () => {
    const on = { robots_index: true };
    const off = { robots_index: false };
    const page: Metadata = { robots: { index: true, follow: true } };
    expect(applySiteIndexingPolicy(page, on)).toBe(page);
    expect(applySiteIndexingPolicy(page, off).robots).toEqual({ index: false, follow: true });
    expect(applySiteIndexingPolicy({ robots: { index: false, follow: false } }, off).robots).toEqual({ index: false, follow: false });
    const none: Metadata = { title: "x" };
    expect(applySiteIndexingPolicy(none, off)).toBe(none);
    expect(applySiteIndexingPolicy({ robots: "index, nofollow" }, off).robots).toEqual({ index: false, follow: false });
    expect(siteIndexingEnabled(null)).toBe(true);
    expect(siteIndexingEnabled({ robots_index: null })).toBe(true);
  });

  it("dispatcher (yeni ve eski modül tipi): kapalıyken sayfanın açık 'index' kararı ezilir; açıkken aynen", async () => {
    const mods = [
      { robots: { index: true, follow: true } as Metadata["robots"] },
      { robots: { index: false, follow: true } as Metadata["robots"] },
      { robots: undefined },
    ];
    for (const index of [true, false]) {
      h.settings = settings("tr", L, { robots_index: index });
      for (const m of mods) {
        const unified = localeRouteFor("offer", { Page: () => null, generateMetadata: async () => ({ title: "t", robots: m.robots }) });
        const legacy = localeRoute("contact", {
          tr: { default: () => null, generateMetadata: async () => ({ title: "t", robots: m.robots }) },
          en: { default: () => null, generateMetadata: async () => ({ title: "t", robots: m.robots }) },
          de: { default: () => null, generateMetadata: async () => ({ title: "t", robots: m.robots }) },
        });
        for (const r of [unified, legacy]) {
          for (const lang of L) {
            const out = await r.generateMetadata({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({}) } as never);
            if (m.robots === undefined) expect(out.robots).toBeUndefined();
            else if (index) expect(out.robots).toEqual(m.robots);
            else expect(out.robots).toEqual({ ...(m.robots as object), index: false });
          }
        }
      }
    }
  });

  it("bütün public [lang] sayfaları dispatcher'dan geçer (politika her içerik türünü kapsar)", () => {
    const root = join(process.cwd(), "app/(public)/[lang]");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n === "page.tsx") files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(15);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/localeRoute(For)?\(/);
      expect(src, f).toMatch(/export const generateMetadata = route\.generateMetadata/);
    }
  });

  it("kapalıyken sitemap HİÇ URL sunmaz; açıkken sunar", async () => {
    h.settings = settings("tr", L, { robots_index: false });
    expect(await (await import("@/app/sitemap")).default()).toEqual([]);
    vi.resetModules();
    h.settings = settings("tr");
    expect((await (await import("@/app/sitemap")).default()).length).toBeGreaterThan(0);
  });

  it("kök layout robots aynen ayardan; robots.txt indeksleme kapalıyken DEĞİŞMEZ (Disallow: / eklenmez)", async () => {
    h.settings = settings("tr", L, { robots_index: false, robots_follow: true });
    expect((await buildRootMetadata("tr")).robots).toEqual({ index: false, follow: true });
    const off = await (await import("@/app/robots")).default();
    vi.resetModules();
    h.settings = settings("tr");
    const on = await (await import("@/app/robots")).default();
    expect(off).toEqual(on);
    const rules = (Array.isArray(off.rules) ? off.rules[0] : off.rules) as { allow?: string; disallow?: string[] };
    expect(rules.allow).toBe("/");
    expect(rules.disallow).not.toContain("/");
  });
});

/* ---------------------------------------------------------------
   C) Kısa süreli fırsatlar
   --------------------------------------------------------------- */
describe("C) kısa süreli fırsatlar — sitemap", () => {
  const TODAY = new Date("2026-11-05T12:00:00Z");
  it("yol üretimi: villası olan ay+gece; geçersiz gece, 0 villa ve bugün başka kovaya çözülen ay YOK; tekrarsız", () => {
    const rows = [
      { bucket_month: "2026-11-01", gap_nights: 2, villa_count: 3 },
      { bucket_month: "2026-11-01", gap_nights: 2, villa_count: 3 },
      { bucket_month: "2026-12-01", gap_nights: 3, villa_count: 0 },
      { bucket_month: "2027-01-01", gap_nights: 99, villa_count: 4 },
      { bucket_month: "2027-11-01", gap_nights: 2, villa_count: 1 }, // "kasim" bugün 2026-11'e çözülür
      { bucket_month: "2027-06-01", gap_nights: 4, villa_count: 1 },
    ];
    expect(shortGapSitemapPaths(rows, TODAY)).toEqual([
      `/kisa-sureli-tarihler/${bucketMonthToSlug("2026-11-01")}/2`,
      `/kisa-sureli-tarihler/${bucketMonthToSlug("2027-06-01")}/4`,
    ]);
    expect(resolveBucketMonthFromSlug(bucketMonthToSlug("2027-11-01"), TODAY)).toBe("2026-11-01");
  });

  it("dil kararı sayfa metadata'sıyla aynı: geçersiz parametre → yok; aktif diller (pasif yok)", () => {
    expect(shortGapsSeoLocales("haziran", "99", L)).toEqual([]);
    expect(shortGapsSeoLocales("yokay", "2", L)).toEqual([]);
    expect(shortGapsSeoLocales("haziran", "2", ["tr", "de"])).toEqual(["tr", "de"]);
  });

  for (const root of L) {
    it(`ana dil ${root.toUpperCase()}: sitemap girdileri dilin URL'si; hreflang = sayfa hreflang'i; pasif dil yok; villasız yok`, async () => {
      const bm = resolveBucketMonthFromSlug("haziran")!;
      h.gaps = [
        { bucket_month: bm, gap_nights: 2, villa_count: 2 },
        { bucket_month: bm, gap_nights: 3, villa_count: 0 },
      ];
      h.settings = settings(root);
      const e = (await (await import("@/app/sitemap")).default()) as Array<{ url: string; alternates?: { languages?: Record<string, string> } }>;
      const sg = e.filter((x) => /kisa-sureli-tarihler|short-stays|kurzaufenthalte/.test(x.url));
      expect(sg).toHaveLength(3);
      expect(sg.some((x) => x.url.endsWith("/3"))).toBe(false);
      /* Aynı modül grafiği (sitemap'in kurduğu yönlendirme bağlamı). */
      const meta = await import("@/app/components/short-gaps/short-gaps-metadata");
      const m = await meta.buildShortGapsMetadata(Promise.resolve({ ay: "haziran", gece: "2" }), root);
      expect(m.robots).toBeUndefined();
      const pageLangs = (m.alternates as { languages: Record<string, string> }).languages;
      const siteLangs = sg[0].alternates!.languages!;
      expect(Object.keys(siteLangs).sort()).toEqual(Object.keys(pageLangs).sort());
      for (const [k, v] of Object.entries(pageLangs)) expect(siteLangs[k]).toBe(`https://example.com${v}`);
      expect(siteLangs["x-default"]).toBe(siteLangs[root]);

      vi.resetModules();
      const passive = L.find((x) => x !== root)!;
      h.settings = settings(root, L.filter((x) => x !== passive));
      const e2 = (await (await import("@/app/sitemap")).default()) as Array<{ url: string; alternates?: { languages?: Record<string, string> } }>;
      const sg2 = e2.filter((x) => /kisa-sureli-tarihler|short-stays|kurzaufenthalte/.test(x.url));
      expect(sg2).toHaveLength(2);
      for (const x of sg2) expect(Object.keys(x.alternates?.languages ?? {})).not.toContain(passive);
    });
  }

  it("kısa süreli fırsat okuması hata verirse sitemap'in geri kalanı döner (fail-soft)", async () => {
    h.settings = settings("tr");
    h.gapError = { message: "down" };
    const e = await (await import("@/app/sitemap")).default();
    expect(e.some((x) => x.url.includes("kisa-sureli-tarihler"))).toBe(false);
    expect(e.some((x) => x.url === "https://example.com/")).toBe(true);
  });
});
