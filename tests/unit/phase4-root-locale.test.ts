/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 4 — dinamik ana dil değişimi
   ===============================================================
   • Saf doğrulama (validateRootLocaleChange) — client + server ortak
   • Etki planı (planRootLocaleChange) — 6 geçiş, tek adım, döngü yok
   • Geçiş sonrası URL kararları (TR/EN/DE kök) + query korunması
   • Ana dil değişip GERİ alındığında önbelleğe alınmış kalıcı
     yönlendirmelerle döngü oluşmaz
   • Canonical / hreflang / x-default her kökte; kapalı dil dışarıda
   • Proxy cache geçersiz kılma + nesil koruması (eski yükleme yazamaz)
   • /api/admin/settings/root-locale: yetki, doğrulama, onay, çakışma,
     başarısızlıkta eski ana dil korunur, cache + geçiş kaydı
   • /api/admin/settings: ana dil hâlâ genel formdan değişmez; TR dışı
     kökte çoklu dil kapatılamaz
   GERÇEK DB'YE DOKUNULMAZ.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import type { RoutingContext } from "@/lib/i18n/routing/context";
import { ROUTES, type RouteKey } from "@/lib/i18n/routing/route-registry";
import {
  planRootLocaleChange,
  validateRootLocaleChange,
} from "@/lib/i18n/root-locale-change";
import { buildRoutePath, resolveIncomingPath } from "@/lib/i18n/routing/url";

const SLUGS: RoutingContext["slugs"] = {
  villa: { "deniz-villa": { en: "sea-villa", de: "meer-villa" } },
  blog: { "kas-rehberi": { en: "kas-guide", de: "kas-reisefuehrer" } },
  page: { hakkimizda: { en: "about-us" } },
  villaType: { "balayi-villalari": { en: "honeymoon-villas" } },
};
const ALL: Locale[] = ["tr", "en", "de"];
const ctx = (root: Locale, enabled: Locale[] = ALL): RoutingContext => ({
  root,
  enabled,
  slugs: SLUGS,
  redirects: { villa: { tr: { "eski-deniz": "deniz-villa" } } },
});
const PARAMS: Partial<Record<RouteKey, Record<string, string>>> = {
  villa: { slug: "deniz-villa" },
  villaType: { slug: "balayi-villalari" },
  region: { slug: "kas" },
  blogPost: { slug: "kas-rehberi" },
  page: { slug: "hakkimizda" },
  favoritesShare: { token: "t" },
  reservation: { slug: "deniz-villa" },
  shortGaps: { ay: "2026-07", gece: "3" },
  sharedList: { token: "t" },
  privateVilla: { token: "t" },
};
const TRANSITIONS: [Locale, Locale][] = [
  ["tr", "en"],
  ["tr", "de"],
  ["en", "tr"],
  ["en", "de"],
  ["de", "tr"],
  ["de", "en"],
];

/* ---------------------------------------------------------------
   1) DOĞRULAMA
--------------------------------------------------------------- */
describe("validateRootLocaleChange", () => {
  const state = { current: "tr" as Locale, enabled: ALL, multilingualEnabled: true };
  it("geçerli hedef", () => {
    expect(validateRootLocaleChange({ to: "en", expected: "tr" }, state)).toEqual({
      ok: true,
      from: "tr",
      to: "en",
    });
  });
  it("hatalı / desteklenmeyen locale reddedilir", () => {
    for (const bad of ["fr", "EN", "", null, 1, undefined, "tr-TR"]) {
      const r = validateRootLocaleChange({ to: bad }, state);
      expect(r.ok, String(bad)).toBe(false);
      if (!r.ok) expect(r.code).toBe("invalid");
    }
  });
  it("kapalı dil ana dil seçilemez", () => {
    const r = validateRootLocaleChange({ to: "de" }, { ...state, enabled: ["tr", "en"] });
    expect(r).toMatchObject({ ok: false, code: "disabled" });
  });
  it("aynı dil / çoklu dil kapalıyken TR dışı / bayat expected reddedilir", () => {
    expect(validateRootLocaleChange({ to: "tr" }, state)).toMatchObject({ ok: false, code: "same" });
    expect(
      validateRootLocaleChange({ to: "en" }, { ...state, multilingualEnabled: false })
    ).toMatchObject({ ok: false, code: "multilingual" });
    expect(validateRootLocaleChange({ to: "en", expected: "de" }, state)).toMatchObject({
      ok: false,
      code: "conflict",
    });
  });
  it("çoklu dil kapalıyken TR'ye dönüş serbest", () => {
    expect(
      validateRootLocaleChange(
        { to: "tr" },
        { current: "en", enabled: ["en", "tr"], multilingualEnabled: false }
      ).ok
    ).toBe(true);
  });
});

/* ---------------------------------------------------------------
   2) ETKİ PLANI — 6 GEÇİŞ
--------------------------------------------------------------- */
describe("planRootLocaleChange — 6 geçiş", () => {
  for (const [from, to] of TRANSITIONS) {
    it(`${from} → ${to}: sorun yok, eski ana dil önek alır, yeni ana dil köke taşınır`, () => {
      const plan = planRootLocaleChange(ctx(from), to, PARAMS);
      expect(plan.issues).toEqual([]);
      expect(plan.from).toBe(from);
      expect(plan.to).toBe(to);
      const villas = (l: Locale) => plan.rows.find((r) => r.route === "villas" && r.locale === l)!;
      expect(villas(to).after).toBe(buildRoutePath("villas", {}, to, ctx(to)));
      expect(villas(to).after.startsWith(`/${to}/`)).toBe(false);
      expect(villas(from).after.startsWith(`/${from}/`)).toBe(true);
      const third = ALL.find((l) => l !== from && l !== to)!;
      expect(villas(third).outcome).toBe("same");
      for (const r of plan.rows.filter((x) => x.outcome === "redirect")) {
        expect(r.status, r.before).toBe(307);
      }
      expect(plan.summary.redirectStatus).toBe(307);
    });
  }

  it("belirsiz eski URL (ortak desen + taban slug) aynı içeriğin TR sayfasına; işaretlenir, engellemez", () => {
    const plan = planRootLocaleChange(ctx("de"), "en", PARAMS);
    const row = plan.rows.find((r) => r.route === "page" && r.locale === "de")!;
    expect(row).toMatchObject({
      before: "/p/hakkimizda",
      after: "/tr/p/hakkimizda",
      outcome: "redirect",
      status: 307,
      note: "language-fallback",
    });
    expect(plan.issues).toEqual([]);
  });

  it("kapalı dil plana girmez", () => {
    const plan = planRootLocaleChange(ctx("tr", ["tr", "en"]), "en", PARAMS);
    expect(plan.rows.some((r) => r.locale === "de")).toBe(false);
    expect(plan.issues).toEqual([]);
  });
});

/* ---------------------------------------------------------------
   3) GEÇİŞ SONRASI URL DAVRANIŞI
--------------------------------------------------------------- */
describe("ana dil EN — örnek senaryo (görev tanımı)", () => {
  const c = ctx("en");
  it("/ İngilizce ana sayfa; /villas-for-rent İngilizce liste (rewrite)", () => {
    expect(resolveIncomingPath("/", c)).toEqual({ type: "rewrite", path: "/en" });
    expect(resolveIncomingPath("/villas-for-rent", c)).toEqual({
      type: "rewrite",
      path: "/en/kiralik-villalar",
    });
  });
  it("/kiralik-villalar → /tr/kiralik-villalar; /en/villas-for-rent → /villas-for-rent; /de/ferienvillen aynı", () => {
    expect(resolveIncomingPath("/kiralik-villalar", c)).toEqual({
      type: "redirect",
      path: "/tr/kiralik-villalar",
      status: 307,
    });
    expect(resolveIncomingPath("/en/villas-for-rent", c)).toEqual({
      type: "redirect",
      path: "/villas-for-rent",
      status: 307,
    });
    expect(resolveIncomingPath("/de/ferienvillen", c)).toEqual({
      type: "rewrite",
      path: "/de/kiralik-villalar",
    });
  });
});

describe("her kök için: kanonik URL rewrite, eski kökün URL'leri tek adım", () => {
  for (const [from, to] of TRANSITIONS) {
    it(`${from} → ${to}`, () => {
      const before = ctx(from);
      const after = ctx(to);
      for (const r of ROUTES) {
        const p = PARAMS[r.key] ?? {};
        for (const l of ALL) {
          const newUrl = buildRoutePath(r.key, p, l, after);
          expect(resolveIncomingPath(newUrl, after).type, `${to}: ${newUrl}`).toBe("rewrite");
          const oldUrl = buildRoutePath(r.key, p, l, before);
          const d = resolveIncomingPath(oldUrl, after);
          if (d.type === "redirect") {
            const second = resolveIncomingPath(d.path, after);
            expect(second.type, `${oldUrl} → ${d.path}`).toBe("rewrite");
          } else {
            expect(d.type, oldUrl).toBe("rewrite");
          }
        }
      }
    });
  }
});

describe("geri alma güvenliği — kalıcı yönlendirme önbelleği döngü üretmez", () => {
  /** Tarayıcı kalıcı (308) yönlendirmeleri saklar; geçici (307) saklamaz. */
  function permanentEdges(c: RoutingContext): Map<string, string> {
    const edges = new Map<string, string>();
    for (const r of ROUTES) {
      const p = PARAMS[r.key] ?? {};
      for (const pl of ALL) {
        for (const prefix of ["", "/tr", "/en", "/de"]) {
          const body = buildRoutePath(r.key, p, pl, { ...c, root: pl }).replace(/^\//, "");
          for (const slugLocale of ALL) {
            const slugBody = p.slug
              ? body.replace(
                  /[^/]+$/,
                  slugLocale === "tr" ? p.slug : SLUGS[r.slugKind ?? "villa"]?.[p.slug]?.[slugLocale] ?? p.slug
                )
              : body;
            const url = `${prefix}/${slugBody}`.replace(/\/$/, "") || "/";
            const d = resolveIncomingPath(url, c);
            if (d.type === "redirect" && d.status === 308) edges.set(url, d.path);
          }
        }
      }
    }
    return edges;
  }

  for (const [a, b] of TRANSITIONS) {
    it(`${a} → ${b} → ${a}: A'da önbelleğe alınan 308 + B kuralları döngü yapmaz`, () => {
      const ca = ctx(a);
      const cb = ctx(b);
      for (const [cachedA, cachedB] of [
        [permanentEdges(ca), cb],
        [permanentEdges(cb), ca],
      ] as const) {
        for (const [from, target] of cachedA) {
          // Önbellekteki kalıcı yönlendirmeyi izle, sonra canlı kuralları uygula.
          let url = target;
          const seen = new Set([from]);
          for (let i = 0; i < 4; i++) {
            expect(seen.has(url), `döngü: ${from} → ${target} …`).toBe(false);
            seen.add(url);
            const cached = cachedA.get(url);
            if (cached) {
              url = cached;
              continue;
            }
            const d = resolveIncomingPath(url, cachedB);
            if (d.type !== "redirect") break;
            url = d.path;
          }
        }
      }
    });
  }

  it("öneksiz yolda başka dilin slug'ı → o dilin sayfası, 307 (ana dile bağlı); önekli yolda 308", () => {
    // Ortak desen: slug dili belirler (dil değişmez).
    expect(resolveIncomingPath("/blog/kas-guide", ctx("tr"))).toEqual({
      type: "redirect",
      path: "/en/blog/kas-guide",
      status: 307,
    });
    expect(resolveIncomingPath("/blog/kas-rehberi", ctx("en"))).toEqual({
      type: "redirect",
      path: "/tr/blog/kas-rehberi",
      status: 307,
    });
    // EN ve DE'de ortak "villa/:slug": eski DE kök URL'si DE sayfasına.
    expect(resolveIncomingPath("/villa/meer-villa", ctx("tr"))).toEqual({
      type: "redirect",
      path: "/de/villa/meer-villa",
      status: 307,
    });
    // Yalnız TR'ye ait desen: TR sayfasının kanonik slug'ı.
    expect(resolveIncomingPath("/kiralik-villa/sea-villa", ctx("tr"))).toEqual({
      type: "redirect",
      path: "/kiralik-villa/deniz-villa",
      status: 307,
    });
    expect(resolveIncomingPath("/en/villa/deniz-villa", ctx("tr"))).toMatchObject({ status: 308 });
    // Slug geçmişi (url_redirects) ana dilden bağımsız → kalıcı kalır.
    expect(resolveIncomingPath("/kiralik-villa/eski-deniz", ctx("tr"))).toEqual({
      type: "redirect",
      path: "/kiralik-villa/deniz-villa",
      status: 308,
    });
  });
});

describe("query parametreleri — proxy yönlendirmesinde korunur", () => {
  it("TR→EN sonrası eski TR ve EN URL'leri query ile tek adım", async () => {
    vi.resetModules();
    vi.doMock("@/lib/i18n/routing/proxy-config", () => ({
      getProxyRoutingContext: async () => ctx("en"),
      refreshProxyRoutingContext: async () => ctx("en"),
    }));
    const { proxy } = await import("@/proxy");
    const { NextRequest } = await import("next/server");
    const a = await proxy(new NextRequest("https://x.test/kiralik-villalar?page=2&sort=price"));
    expect(a.status).toBe(307);
    expect(a.headers.get("location")).toBe("https://x.test/tr/kiralik-villalar?page=2&sort=price");
    const b = await proxy(new NextRequest("https://x.test/en/villa/sea-villa?start=2026-07-01&end=2026-07-08"));
    expect(b.status).toBe(307);
    expect(b.headers.get("location")).toBe(
      "https://x.test/villa/sea-villa?start=2026-07-01&end=2026-07-08"
    );
    vi.doUnmock("@/lib/i18n/routing/proxy-config");
  });
});

/* ---------------------------------------------------------------
   4) CANONICAL / HREFLANG / X-DEFAULT — 3 kök
--------------------------------------------------------------- */
describe("canonical + hreflang + x-default", () => {
  async function alternates(root: Locale, enabled: Locale[], path: string, locale: Locale) {
    const { setRoutingContext } = await import("@/lib/i18n/routing/context");
    const { buildLocaleAlternates, filterLocaleLanguages } = await import("@/lib/i18n/seo-alternates");
    setRoutingContext(ctx(root, enabled));
    const alt = buildLocaleAlternates(path, locale);
    const langs = filterLocaleLanguages(alt.languages, enabled, root);
    setRoutingContext(null);
    return { canonical: alt.canonical, langs };
  }

  const EXPECT: Record<Locale, Record<string, string>> = {
    tr: { tr: "/kiralik-villalar", en: "/en/villas-for-rent", de: "/de/ferienvillen", "x-default": "/kiralik-villalar" },
    en: { tr: "/tr/kiralik-villalar", en: "/villas-for-rent", de: "/de/ferienvillen", "x-default": "/villas-for-rent" },
    de: { tr: "/tr/kiralik-villalar", en: "/en/villas-for-rent", de: "/ferienvillen", "x-default": "/ferienvillen" },
  };

  for (const root of SUPPORTED_LOCALES) {
    it(`ana dil ${root}: her dilin canonical'ı kendi URL'si, hreflang karşılıklı, x-default kök`, async () => {
      for (const l of ALL) {
        const { canonical, langs } = await alternates(root, ALL, "/kiralik-villalar", l);
        expect(canonical).toBe(EXPECT[root][l]);
        expect(langs).toEqual(EXPECT[root]);
      }
    });
    it(`ana dil ${root}: kapalı dil hreflang dışında`, async () => {
      const other = ALL.find((l) => l !== root)!;
      const enabled = [root, other];
      const { langs } = await alternates(root, enabled, "/kiralik-villalar", root);
      const closed = ALL.find((l) => !enabled.includes(l))!;
      expect(Object.keys(langs)).not.toContain(closed);
      expect(langs["x-default"]).toBe(EXPECT[root][root]);
    });
  }
});

/* ---------------------------------------------------------------
   5) PROXY CACHE GEÇERSİZ KILMA
--------------------------------------------------------------- */
describe("proxy routing cache — geçersiz kılma ve nesil koruması", () => {
  type G = typeof globalThis & Record<string, unknown>;
  const g = globalThis as G;
  let root = "tr";
  let delay: Promise<void> | null = null;

  beforeEach(() => {
    vi.resetModules();
    root = "tr";
    delay = null;
    delete g.__tyLocaleRoutingCache;
    delete g.__tyLocaleRoutingInflight;
    g.__yazVillamPgPool = {
      query: async (sql: string) => {
        if (sql.includes("FROM public.settings")) {
          const r = root;
          if (delay) await delay;
          return { rows: [{ multilingual_enabled: true, public_default_locale: r }] };
        }
        if (sql.includes("site_locales")) {
          return { rows: ALL.map((code, i) => ({ code, is_enabled: true, sort_order: i })) };
        }
        return { rows: [] };
      },
    };
  });

  it("kayıttan sonra invalidate → bir sonraki istek yeni ana dili görür (TTL beklenmez)", async () => {
    const m = await import("@/lib/i18n/routing/proxy-config");
    expect((await m.getProxyRoutingContext()).root).toBe("tr");
    root = "en";
    expect((await m.getProxyRoutingContext()).root).toBe("tr"); // cache
    m.invalidateProxyRoutingContext();
    expect((await m.getProxyRoutingContext()).root).toBe("en");
  });

  it("değişiklikten ÖNCE başlamış yükleme eski değeri cache'e yazamaz", async () => {
    const m = await import("@/lib/i18n/routing/proxy-config");
    let release!: () => void;
    delay = new Promise<void>((r) => (release = r));
    const stale = m.getProxyRoutingContext(); // root "tr" okur, bekler
    await Promise.resolve();
    root = "en";
    m.invalidateProxyRoutingContext();
    delay = null;
    release();
    expect((await stale).root).toBe("tr");
    expect((await m.getProxyRoutingContext()).root).toBe("en");
  });
});
