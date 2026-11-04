/* ===============================================================
   🌐 FAZ 3 SON KONTROL — proxy 404 kararı, robots, robots/sitemap
   tutarlılığı (TR/EN/DE ana dil kombinasyonları)
   ===============================================================
   • resolveIncomingPath "notFound": kapalı dil / eşleşmeyen yol /
     yayında olmayan villa-blog-sayfa → /<dil>/__404__ (global-not-found
     SSR). Yönlendirmeler 404 kontrolünden ÖNCE gelir (slug geçmişi).
   • proxy.ts: 404 dil header'ını yalnız proxy yazar; istemcininki silinir.
   • robots: ana dil TR/EN/DE için disallow kümesi, public sayfalar
     engellenmez, sitemap URL'si yalnız NEXT_PUBLIC_SITE_URL'den.
   • sitemap'teki HİÇBİR URL robots tarafından engellenmez.
   GERÇEK DB'YE DOKUNULMAZ (repository + settings mock).
   =============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import type { RoutingContext } from "@/lib/i18n/routing/context";
import { ROUTES, type RouteKey } from "@/lib/i18n/routing/route-registry";
import { rowsToLiveSet, LIVE_SLUGS_SQL } from "@/lib/i18n/routing/sql";
import {
  NOT_FOUND_LOCALE_HEADER,
  buildRoutePath,
  localeOfPath,
  matchRouteAnyLocale,
  resolveIncomingPath,
} from "@/lib/i18n/routing/url";

const SLUGS: RoutingContext["slugs"] = {
  villa: {
    "deniz-villa": { en: "sea-villa", de: "meer-villa" },
    "pasif-villa": { en: "passive-villa" },
  },
  blog: { "kas-rehberi": { en: "kas-guide" } },
  page: { hakkimizda: { en: "about-us" } },
};
const LIVE: RoutingContext["live"] = {
  villa: new Set(["deniz-villa", "gunes-villa"]),
  blog: new Set(["kas-rehberi"]),
  page: new Set(["hakkimizda"]),
};
function ctx(
  root: Locale = "tr",
  enabled: Locale[] = ["tr", "en", "de"],
  extra: Partial<RoutingContext> = {}
): RoutingContext {
  return {
    root,
    enabled,
    slugs: SLUGS,
    redirects: { villa: { tr: { "eski-deniz": "deniz-villa" }, en: { "old-sea": "deniz-villa" } } },
    live: LIVE,
    ...extra,
  };
}
const nf = (locale: Locale, reason: string) => ({
  type: "notFound",
  path: `/${locale}/__404__`,
  locale,
  reason,
});

describe("resolveIncomingPath — proxy 404 kararı", () => {
  it("eşleşmeyen yol → ana dilde / önek dilinde 404", () => {
    expect(resolveIncomingPath("/olmayan-sayfa", ctx())).toEqual(nf("tr", "noRoute"));
    expect(resolveIncomingPath("/en/olmayan", ctx())).toEqual(nf("en", "noRoute"));
    expect(resolveIncomingPath("/de/x/y/z", ctx())).toEqual(nf("de", "noRoute"));
    expect(resolveIncomingPath("/olmayan", ctx("en"))).toEqual(nf("en", "noRoute"));
  });

  it("kapalı dil: önekli HER yol (ana sayfa, liste, olmayan) → 404, gövde ana dilde", () => {
    const c = ctx("tr", ["tr", "en"]);
    for (const p of ["/de", "/de/ferienvillen", "/de/villa/meer-villa", "/de/olmayan"]) {
      expect(resolveIncomingPath(p, c), p).toEqual(nf("tr", "disabledLocale"));
    }
    const enRoot = ctx("en", ["en"]);
    expect(resolveIncomingPath("/tr/kiralik-villalar", enRoot)).toEqual(nf("en", "disabledLocale"));
    expect(resolveIncomingPath("/de", enRoot)).toEqual(nf("en", "disabledLocale"));
  });

  it("yayında olmayan villa / blog / sayfa → 404 (doğru dilde)", () => {
    expect(resolveIncomingPath("/kiralik-villa/yok-villa", ctx())).toEqual(nf("tr", "noContent"));
    expect(resolveIncomingPath("/en/villa/passive-villa", ctx())).toEqual(nf("en", "noContent"));
    expect(resolveIncomingPath("/kiralik-villa/pasif-villa", ctx())).toEqual(nf("tr", "noContent"));
    expect(resolveIncomingPath("/de/blog/olmayan-yazi", ctx())).toEqual(nf("de", "noContent"));
    expect(resolveIncomingPath("/en/p/olmayan", ctx())).toEqual(nf("en", "noContent"));
    expect(resolveIncomingPath("/villa/yok", ctx("en"))).toEqual(nf("en", "noContent"));
  });

  it("yayındaki içerik → rewrite (taban slug iç yolda), çevirisi olmayan dil TR slug'ıyla", () => {
    expect(resolveIncomingPath("/kiralik-villa/deniz-villa", ctx())).toEqual({
      type: "rewrite",
      path: "/tr/kiralik-villa/deniz-villa",
    });
    expect(resolveIncomingPath("/en/villa/sea-villa", ctx())).toEqual({
      type: "rewrite",
      path: "/en/kiralik-villa/sea-villa",
    });
    expect(resolveIncomingPath("/en/villa/gunes-villa", ctx())).toEqual({
      type: "rewrite",
      path: "/en/kiralik-villa/gunes-villa",
    });
    expect(resolveIncomingPath("/en/blog/kas-guide", ctx()).type).toBe("rewrite");
    expect(resolveIncomingPath("/en/p/about-us", ctx()).type).toBe("rewrite");
  });

  it("slug geçmişi 404'ten ÖNCE: eski slug → tek adım 308, hedef rewrite (zincir/döngü yok)", () => {
    const first = resolveIncomingPath("/kiralik-villa/eski-deniz", ctx());
    expect(first).toEqual({ type: "redirect", path: "/kiralik-villa/deniz-villa", status: 308 });
    expect(resolveIncomingPath(first.path, ctx()).type).toBe("rewrite");
    const en = resolveIncomingPath("/en/villa/old-sea", ctx());
    expect(en).toEqual({ type: "redirect", path: "/en/villa/sea-villa", status: 308 });
    expect(resolveIncomingPath(en.path, ctx()).type).toBe("rewrite");
  });

  it("canlı küme yoksa (sorgu başarısız / server bağlamı) içerik 404'ü verilmez", () => {
    const c = ctx("tr", ["tr", "en", "de"], { live: undefined });
    expect(resolveIncomingPath("/kiralik-villa/yok-villa", c).type).toBe("rewrite");
    const partial = ctx("tr", ["tr", "en", "de"], { live: { villa: LIVE!.villa } });
    expect(resolveIncomingPath("/blog/olmayan", partial).type).toBe("rewrite");
    expect(resolveIncomingPath("/kiralik-villa/yok-villa", partial).type).toBe("notFound");
  });

  it("rezervasyon, token ve taksonomi route'ları proxy içerik kontrolüne GİRMEZ", () => {
    for (const p of [
      "/rezervasyon/yok-villa",
      "/v/tok",
      "/liste/tok",
      "/villa-turleri/yok-tur",
      "/bolgeler/yok-bolge",
    ]) {
      expect(resolveIncomingPath(p, ctx()).type, p).toBe("rewrite");
    }
  });

  it("URL-encoded slug canlı kümeyle çözülmüş haliyle eşleşir", () => {
    const c = ctx("tr", ["tr"], { live: { villa: new Set(["çam-villa"]) } });
    expect(resolveIncomingPath(`/kiralik-villa/${encodeURIComponent("çam-villa")}`, c).type).toBe("rewrite");
  });

  it("kapalı dilin yolunda kabuk dili ana dile düşer (kapalı dil linki üretilmez)", () => {
    const c = ctx("tr", ["tr", "en"]);
    expect(localeOfPath("/de/ferienvillen", c)).toBe("tr");
    expect(localeOfPath("/en/villas-for-rent", c)).toBe("en");
    expect(localeOfPath("/de", ctx("en", ["en"]))).toBe("en");
  });

  it("404 iç yolu hiçbir route desenine uymaz (global-not-found'a düşer)", () => {
    for (const l of SUPPORTED_LOCALES) {
      expect(matchRouteAnyLocale(["__404__"], l)).toBeNull();
    }
  });

  it("tüm kombinasyonlar: aktif dilin kanonik URL'si asla 404 olmaz", () => {
    const params: Partial<Record<RouteKey, Record<string, string>>> = {
      villa: { slug: "deniz-villa" },
      blogPost: { slug: "kas-rehberi" },
      page: { slug: "hakkimizda" },
      villaType: { slug: "balayi" },
      region: { slug: "kas" },
      favoritesShare: { token: "t" },
      reservation: { slug: "deniz-villa" },
      shortGaps: { ay: "2026-07", gece: "3" },
      sharedList: { token: "t" },
      privateVilla: { token: "t" },
    };
    for (const root of SUPPORTED_LOCALES) {
      for (const enabled of [["tr", "en", "de"], [root]] as Locale[][]) {
        const set = Array.from(new Set([root, ...enabled]));
        const c = ctx(root, set);
        for (const r of ROUTES) {
          for (const l of set) {
            const url = buildRoutePath(r.key, params[r.key] ?? {}, l, c);
            expect(resolveIncomingPath(url, c).type, `${root} ${url}`).toBe("rewrite");
          }
        }
      }
    }
  });
});

describe("canlı slug kümesi SQL'i", () => {
  it("public detay filtreleriyle aynı (villa: aktif + silinmemiş; blog/sayfa: aktif)", () => {
    expect(LIVE_SLUGS_SQL.villa).toMatch(/is_active = true/);
    expect(LIVE_SLUGS_SQL.villa).toMatch(/deleted_at IS NULL/);
    expect(LIVE_SLUGS_SQL.blog).toMatch(/blog_posts WHERE is_active = true/);
    expect(LIVE_SLUGS_SQL.page).toMatch(/pages WHERE is_active = true/);
    expect([...rowsToLiveSet([{ slug: "a" }, { slug: null }, { slug: "" }, {}])]).toEqual(["a"]);
  });
});

describe("proxy.ts — 404 rewrite ve dil header'ı", () => {
  async function loadProxy(c: RoutingContext, fresh?: RoutingContext) {
    vi.resetModules();
    const refresh = vi.fn(async () => fresh ?? c);
    vi.doMock("@/lib/i18n/routing/proxy-config", () => ({
      getProxyRoutingContext: async () => c,
      refreshProxyRoutingContext: refresh,
    }));
    vi.doMock("@/lib/auth/native/jwt", () => ({
      verifyAccessToken: async () => ({ ok: true }),
    }));
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    return { proxy, NextRequest, refresh };
  }
  const overridden = (res: Response, name: string) =>
    res.headers.get(`x-middleware-request-${name}`);

  it("olmayan yol → /<dil>/__404__ rewrite + proxy'nin yazdığı dil header'ı", async () => {
    const { proxy, NextRequest } = await loadProxy(ctx());
    const res = await proxy(new NextRequest("https://x.test/en/olmayan"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://x.test/en/__404__");
    expect(overridden(res, NOT_FOUND_LOCALE_HEADER)).toBe("en");
  });

  it("istemcinin gönderdiği 404 dil header'ı normal sayfada ve admin'de silinir", async () => {
    const { proxy, NextRequest } = await loadProxy(ctx());
    const spoof = { headers: { [NOT_FOUND_LOCALE_HEADER]: "de" } };
    const page = await proxy(new NextRequest("https://x.test/kiralik-villalar", spoof));
    expect(page.headers.get("x-middleware-rewrite")).toBe("https://x.test/tr/kiralik-villalar");
    expect(overridden(page, NOT_FOUND_LOCALE_HEADER)).toBeNull();
    const nfRes = await proxy(new NextRequest("https://x.test/olmayan", spoof));
    expect(overridden(nfRes, NOT_FOUND_LOCALE_HEADER)).toBe("tr");
    const { ACCESS_COOKIE } = await import("@/lib/auth/native/cookie-names");
    const admin = await proxy(
      new NextRequest("https://x.test/maki-admin/villas", {
        headers: { ...spoof.headers, cookie: `${ACCESS_COOKIE}=tok` },
      })
    );
    expect(admin.headers.get("x-middleware-next")).toBe("1");
    expect(overridden(admin, NOT_FOUND_LOCALE_HEADER)).toBeNull();
  });

  it("içerik 404'ünden önce bağlam tazelenir; yeni yayınlanan içerik 404 görmez", async () => {
    const stale = ctx("tr", ["tr"], { live: { villa: new Set<string>() } });
    const fresh = ctx("tr", ["tr"], { live: { villa: new Set(["yeni-villa"]) } });
    const { proxy, NextRequest, refresh } = await loadProxy(stale, fresh);
    const res = await proxy(new NextRequest("https://x.test/kiralik-villa/yeni-villa"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://x.test/tr/kiralik-villa/yeni-villa");
  });

  it("yol 404'ünde (içerik değil) tazeleme yapılmaz; yönlendirme query'yi korur", async () => {
    const { proxy, NextRequest, refresh } = await loadProxy(ctx());
    await proxy(new NextRequest("https://x.test/olmayan"));
    expect(refresh).not.toHaveBeenCalled();
    const rd = await proxy(new NextRequest("https://x.test/kiralik-villa/eski-deniz?start=2026-07-01&n=3"));
    expect(rd.status).toBe(308);
    expect(rd.headers.get("location")).toBe(
      "https://x.test/kiralik-villa/deniz-villa?start=2026-07-01&n=3"
    );
  });
});

/* ---------------------------------------------------------------
   ROBOTS + SITEMAP — ana dil TR / EN / DE
--------------------------------------------------------------- */

const getCachedSettingsMock = vi.fn();
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...a: unknown[]) => getCachedSettingsMock(...a),
  /* Sitemap'in kategori/bölge girdileri de robots ile karşılaştırılsın. */
  getCachedVillaTypes: async () => [{ id: 1, slug: "balayi-villalari" }],
  getCachedVillaLocations: async () => [
    { id: "l1", name: "Kaş", filter_group_name: "Kaş", slug: "kas" },
  ],
  getCachedCategoryCovers: async () => ({ "1": { villaCount: 2 } }),
  getCachedLocationVillaCounts: async () => ({ l1: 3 }),
}));
vi.mock("@/lib/i18n/routing/slug-map.server", () => ({
  getCachedLocalizedSlugMap: async () => ({ villa: { "deniz-villa": { en: "sea-villa" } } }),
  getCachedRedirectMap: async () => ({}),
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    listPublicSlugs: async () => [{ slug: "deniz-villa", created_at: "2024-01-01T00:00:00.000Z" }],
  },
}));
vi.mock("@/lib/db/pages.repository", () => ({
  pagesRepository: {
    findActivePages: async () => ({
      data: [{ slug: "hakkimizda", created_at: "2024-01-01T00:00:00.000Z" }],
      error: null,
    }),
  },
}));
vi.mock("@/lib/db/blog.repository", () => ({
  blogRepository: {
    findActiveSlugs: async () => ({
      data: [{ slug: "ilk-yazi", published_at: "2024-01-01T00:00:00.000Z", updated_at: null }],
      error: null,
    }),
  },
}));
vi.mock("@/lib/i18n/sitemap-data.server", () => ({
  loadNoindexSlugs: async () => ({ villa: new Set(), page: new Set(), blog: new Set() }),
  loadTranslatedContentLocales: async () => ({
    blog: new Map([["ilk-yazi", ["tr", "en", "de"]]]),
    page: new Map([["hakkimizda", ["tr", "en"]]]),
  }),
}));

function settingsFor(root: Locale, enabled: Locale[] = ["tr", "en", "de"]) {
  return {
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: SUPPORTED_LOCALES.map((code, i) => ({
      code,
      is_enabled: enabled.includes(code),
      sort_order: i,
    })),
  };
}

function disallowOf(robots: { rules: unknown }): string[] {
  const rule = (Array.isArray(robots.rules) ? robots.rules[0] : robots.rules) as {
    disallow?: string[];
  };
  return rule.disallow ?? [];
}
/** robots.txt eşleşmesi: kural bir yol önekidir. */
const blockedBy = (path: string, rules: string[]) => rules.find((r) => path.startsWith(r));

describe("robots + sitemap — TR/EN/DE ana dil", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.tatilinyeri.com/");
    getCachedSettingsMock.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  async function run(root: Locale, enabled?: Locale[]) {
    vi.resetModules();
    vi.doUnmock("@/lib/i18n/routing/proxy-config");
    getCachedSettingsMock.mockResolvedValue(settingsFor(root, enabled));
    const robots = await (await import("@/app/robots")).default();
    const sitemap = await (await import("@/app/sitemap")).default();
    const { buildRoutePath: brp } = await import("@/lib/i18n/routing/url");
    const { getRoutingContext } = await import("@/lib/i18n/routing/context");
    return { robots, sitemap, brp, ctx: getRoutingContext() };
  }

  for (const root of SUPPORTED_LOCALES) {
    it(`ana dil ${root}: sitemap/host yalnız NEXT_PUBLIC_SITE_URL'den (dil ayarından bağımsız)`, async () => {
      const { robots } = await run(root);
      expect(robots.sitemap).toBe("https://www.tatilinyeri.com/sitemap.xml");
      expect(robots.host).toBe("https://www.tatilinyeri.com");
      const single = await run(root, [root]);
      expect(single.robots.sitemap).toBe("https://www.tatilinyeri.com/sitemap.xml");
    });

    it(`ana dil ${root}: admin/API ve özel yollar engelli; public sayfalar AÇIK`, async () => {
      const { robots, brp, ctx: c } = await run(root);
      const rules = disallowOf(robots);
      expect(c.root).toBe(root);
      for (const must of ["/maki-admin", "/api"]) expect(rules).toContain(must);
      for (const l of SUPPORTED_LOCALES) {
        for (const key of ["search", "favorites"] as RouteKey[]) {
          expect(rules, `${key}/${l}`).toContain(brp(key, {}, l, c));
        }
        expect(blockedBy(brp("reservation", { slug: "deniz-villa" }, l, c), rules)).toBeTruthy();
        expect(blockedBy(brp("reservationSuccess", {}, l, c), rules)).toBeTruthy();
        expect(blockedBy(brp("privateVilla", { token: "t" }, l, c), rules)).toBeTruthy();
        expect(blockedBy(brp("sharedList", { token: "t" }, l, c), rules)).toBeTruthy();
        expect(blockedBy(brp("favoritesShare", { token: "t" }, l, c), rules)).toBeTruthy();
      }
      const publicKeys: [RouteKey, Record<string, string>][] = [
        ["home", {}],
        ["villas", {}],
        ["villa", { slug: "deniz-villa" }],
        ["villaType", { slug: "balayi" }],
        ["region", { slug: "kas" }],
        ["blog", {}],
        ["blogPost", { slug: "ilk-yazi" }],
        ["page", { slug: "hakkimizda" }],
        ["contact", {}],
        ["offer", {}],
        ["reservationLookup", {}],
        ["shortGaps", { ay: "2026-07", gece: "3" }],
      ];
      for (const l of SUPPORTED_LOCALES) {
        for (const [key, p] of publicKeys) {
          const url = brp(key, p, l, c);
          expect(blockedBy(url, rules), `${root}: ${url}`).toBeUndefined();
        }
      }
      // Dil kökleri toptan engellenmez.
      for (const bad of ["/", "/en", "/de", "/tr", "/en/", "/de/", "/tr/"]) {
        expect(rules).not.toContain(bad);
      }
    });

    it(`ana dil ${root}: sitemap'teki HİÇBİR URL robots'ta engelli değil; tümü SITE_URL altında`, async () => {
      const { robots, sitemap } = await run(root);
      const rules = disallowOf(robots);
      expect(sitemap.length).toBeGreaterThan(0);
      for (const e of sitemap) {
        expect(e.url.startsWith("https://www.tatilinyeri.com/")).toBe(true);
        const path = e.url.replace("https://www.tatilinyeri.com", "") || "/";
        expect(blockedBy(path, rules), e.url).toBeUndefined();
        expect(path).not.toContain("__404__");
      }
      // Blog, CMS sayfası, kategori ve bölge girdileri de sitemap'te (ve engelsiz).
      expect(sitemap.some((e) => e.url.includes("/blog/ilk-yazi"))).toBe(true);
      expect(sitemap.some((e) => e.url.includes("/p/hakkimizda"))).toBe(true);
      expect(sitemap.some((e) => e.url.includes("balayi-villalari"))).toBe(true);
      expect(sitemap.some((e) => /\/kas$/.test(e.url))).toBe(true);
      // Ana dil kökte, öneksiz.
      expect(sitemap.some((e) => e.url === "https://www.tatilinyeri.com/")).toBe(true);
      expect(sitemap.some((e) => e.url === `https://www.tatilinyeri.com/${root}`)).toBe(false);
    });
  }
});
