/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 2 — merkezi URL üretimi/çözümü
   ===============================================================
   Tüm ana dil kombinasyonları (TR/EN/DE) × aktif diller; çeviri
   slug'ları; eski desenlerin yönlendirilmesi; DÖNGÜ/ZİNCİR olmaması.
   =============================================================== */

import { describe, it, expect } from "vitest";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import type { RoutingContext } from "@/lib/i18n/routing/context";
import { ROUTES } from "@/lib/i18n/routing/route-registry";
import {
  buildInternalPath,
  buildRoutePath,
  localeOfPath,
  localizeHref,
  resolveIncomingPath,
  resolveRoute,
  toBaseRoutePath,
} from "@/lib/i18n/routing/url";

const SLUGS: RoutingContext["slugs"] = {
  villa: { "deniz-villa": { en: "sea-villa", de: "meer-villa" } },
  blog: { "kas-gezi-rehberi": { en: "kas-travel-guide" } },
  page: { hakkimizda: { en: "about-us", de: "ueber-uns" } },
  villaType: { "balayi-villalari": { en: "honeymoon-villas" } },
};

function ctx(root: Locale, enabled: Locale[] = ["tr", "en", "de"]): RoutingContext {
  return { root, enabled, slugs: SLUGS };
}

const SAMPLE_PARAMS: Record<string, Record<string, string>> = {
  villa: { slug: "deniz-villa" },
  villaType: { slug: "balayi-villalari" },
  region: { slug: "kas" },
  blogPost: { slug: "kas-gezi-rehberi" },
  page: { slug: "hakkimizda" },
  favoritesShare: { token: "abc123" },
  reservation: { slug: "deniz-villa" },
  shortGaps: { ay: "2026-07", gece: "3" },
  sharedList: { token: "tok1" },
  privateVilla: { token: "tok2" },
};

describe("buildRoutePath — ana dil kökte, diğerleri önekli", () => {
  it("TR ana dil", () => {
    const c = ctx("tr");
    expect(buildRoutePath("villas", {}, "tr", c)).toBe("/kiralik-villalar");
    expect(buildRoutePath("villas", {}, "en", c)).toBe("/en/villas-for-rent");
    expect(buildRoutePath("villas", {}, "de", c)).toBe("/de/ferienvillen");
    expect(buildRoutePath("home", {}, "tr", c)).toBe("/");
    expect(buildRoutePath("home", {}, "en", c)).toBe("/en");
  });

  it("EN ana dil", () => {
    const c = ctx("en");
    expect(buildRoutePath("villas", {}, "en", c)).toBe("/villas-for-rent");
    expect(buildRoutePath("villas", {}, "tr", c)).toBe("/tr/kiralik-villalar");
    expect(buildRoutePath("villas", {}, "de", c)).toBe("/de/ferienvillen");
    expect(buildRoutePath("home", {}, "en", c)).toBe("/");
    expect(buildRoutePath("home", {}, "tr", c)).toBe("/tr");
  });

  it("DE ana dil", () => {
    const c = ctx("de");
    expect(buildRoutePath("villas", {}, "de", c)).toBe("/ferienvillen");
    expect(buildRoutePath("villas", {}, "tr", c)).toBe("/tr/kiralik-villalar");
    expect(buildRoutePath("villas", {}, "en", c)).toBe("/en/villas-for-rent");
  });

  it("dil bazlı içerik slug'ı; çevirisi olmayan dilde TR slug'ı", () => {
    const c = ctx("tr");
    expect(buildRoutePath("villa", { slug: "deniz-villa" }, "tr", c)).toBe("/kiralik-villa/deniz-villa");
    expect(buildRoutePath("villa", { slug: "deniz-villa" }, "en", c)).toBe("/en/villa/sea-villa");
    expect(buildRoutePath("blogPost", { slug: "kas-gezi-rehberi" }, "de", c)).toBe(
      "/de/blog/kas-gezi-rehberi"
    );
    expect(buildRoutePath("villa", { slug: "yok-villa" }, "en", c)).toBe("/en/villa/yok-villa");
    expect(buildRoutePath("region", { slug: "kas" }, "en", c)).toBe("/en/regions/kas");
  });
});

describe("resolveIncomingPath — rewrite / yönlendirme", () => {
  it("TR ana dil: kanonik URL'ler iç yola rewrite edilir", () => {
    const c = ctx("tr");
    expect(resolveIncomingPath("/", c)).toEqual({ type: "rewrite", path: "/tr" });
    expect(resolveIncomingPath("/kiralik-villalar", c)).toEqual({
      type: "rewrite",
      path: "/tr/kiralik-villalar",
    });
    expect(resolveIncomingPath("/en/villas-for-rent", c)).toEqual({
      type: "rewrite",
      path: "/en/kiralik-villalar",
    });
    expect(resolveIncomingPath("/en/villa/sea-villa", c)).toEqual({
      type: "rewrite",
      path: "/en/kiralik-villa/sea-villa",
    });
  });

  it("eski canlı EN/DE URL'leri (TR segmentli) → 308 yeni desen (tek adım, slug dahil)", () => {
    const c = ctx("tr");
    expect(resolveIncomingPath("/en/kiralik-villalar", c)).toEqual({
      type: "redirect",
      path: "/en/villas-for-rent",
      status: 308,
    });
    expect(resolveIncomingPath("/de/kiralik-villa/deniz-villa", c)).toEqual({
      type: "redirect",
      path: "/de/villa/meer-villa",
      status: 308,
    });
  });

  it("TR slug'ı EN URL'sinde → 308 EN slug'ı", () => {
    expect(resolveIncomingPath("/en/villa/deniz-villa", ctx("tr"))).toEqual({
      type: "redirect",
      path: "/en/villa/sea-villa",
      status: 308,
    });
  });

  it("ana dil önekli gelirse önek soyulur (307)", () => {
    expect(resolveIncomingPath("/tr", ctx("tr"))).toEqual({ type: "redirect", path: "/", status: 307 });
    expect(resolveIncomingPath("/tr/kiralik-villalar", ctx("tr"))).toEqual({
      type: "redirect",
      path: "/kiralik-villalar",
      status: 307,
    });
    expect(resolveIncomingPath("/en/villas-for-rent", ctx("en"))).toEqual({
      type: "redirect",
      path: "/villas-for-rent",
      status: 307,
    });
  });

  it("TR→EN ana dil değişimi örneği", () => {
    const c = ctx("en");
    expect(resolveIncomingPath("/kiralik-villalar", c)).toEqual({
      type: "redirect",
      path: "/tr/kiralik-villalar",
      status: 307,
    });
    expect(resolveIncomingPath("/villas-for-rent", c)).toEqual({
      type: "rewrite",
      path: "/en/kiralik-villalar",
    });
    expect(resolveIncomingPath("/de/ferienvillen", c)).toEqual({
      type: "rewrite",
      path: "/de/kiralik-villalar",
    });
    expect(resolveIncomingPath("/tr/kiralik-villalar", c)).toEqual({
      type: "rewrite",
      path: "/tr/kiralik-villalar",
    });
  });

  /* Faz 3 son kontrol — 404 kararı artık proxy'de (SSR 404 için):
     eskiden iç ağaçta eşleşmeyen yola rewrite edilip sayfa içinde
     notFound() fırlatılıyordu; sonuç yine 404'tü, yönlendirme yoktu. */
  it("kapalı dile çapraz tahmin yönlendirmesi yapılmaz (404)", () => {
    const c = ctx("tr", ["tr"]);
    expect(resolveIncomingPath("/villas-for-rent", c)).toEqual({
      type: "notFound",
      path: "/tr/__404__",
      locale: "tr",
      reason: "noRoute",
    });
  });

  it("bilinmeyen yol → 404 (ana dilde)", () => {
    expect(resolveIncomingPath("/olmayan/yol", ctx("tr"))).toEqual({
      type: "notFound",
      path: "/tr/__404__",
      locale: "tr",
      reason: "noRoute",
    });
  });
});

describe("DÖNGÜ / ZİNCİR YOK — tüm kombinasyonlar", () => {
  const roots: Locale[] = ["tr", "en", "de"];
  const enabledSets: Locale[][] = [["tr", "en", "de"], ["tr", "en"], ["tr", "de"], ["en", "de"]];

  for (const root of roots) {
    for (const enabled of enabledSets) {
      if (!enabled.includes(root)) continue;
      it(`ana dil ${root}, aktif [${enabled}] — her kanonik URL rewrite; her yönlendirme tek adım`, () => {
        const c = ctx(root, enabled);
        for (const r of ROUTES) {
          const params = SAMPLE_PARAMS[r.key] ?? {};
          for (const l of SUPPORTED_LOCALES) {
            const url = buildRoutePath(r.key, params, l, c);
            const d = resolveIncomingPath(url, c);
            /* Kapalı dilin URL'si → 404 (ana dilde gövde), yönlendirme YOK. */
            if (!enabled.includes(l)) {
              expect(d, `${r.key}/${l} ${url}`).toEqual({
                type: "notFound",
                path: `/${root}/__404__`,
                locale: root,
                reason: "disabledLocale",
              });
              continue;
            }
            expect(d.type, `${r.key}/${l} ${url}`).toBe("rewrite");
            if (d.type === "rewrite") {
              expect(d.path).toBe(buildInternalPath(r.key, {
                ...params,
                ...(params.slug ? { slug: url.split("/").pop() as string } : {}),
              }, l));
            }
            // Her dilin TÜM desenleri + tüm önekler: yönlendirme hedefi rewrite olmalı.
            for (const pl of SUPPORTED_LOCALES) {
              for (const prefix of ["", "/tr", "/en", "/de"]) {
                const body = buildRoutePath(r.key, params, pl, { ...c, root: pl })
                  .replace(/^\//, "");
                const candidate = `${prefix}/${body}`.replace(/\/$/, "") || "/";
                const first = resolveIncomingPath(candidate, c);
                if (first.type === "redirect") {
                  const second = resolveIncomingPath(first.path, c);
                  expect(second.type, `${candidate} → ${first.path}`).toBe("rewrite");
                }
              }
            }
          }
        }
      });
    }
  }
});

describe("yardımcılar", () => {
  it("localizeHref: TR biçimli link hedef dile çevrilir, query korunur", () => {
    const c = ctx("tr");
    expect(localizeHref("/kiralik-villalar?page=2#x", "en", c)).toBe("/en/villas-for-rent?page=2#x");
    expect(localizeHref("/kiralik-villa/deniz-villa", "de", c)).toBe("/de/villa/meer-villa");
    expect(localizeHref("/en/villas-for-rent", "tr", c)).toBe("/kiralik-villalar");
    expect(localizeHref("/bilinmeyen", "en", c)).toBe("/en/bilinmeyen");
    expect(localizeHref("/", "de", ctx("de"))).toBe("/");
  });

  it("localeOfPath / toBaseRoutePath — public ve iç yol aynı sonucu verir (hydration güvenli)", () => {
    for (const root of ["tr", "en", "de"] as Locale[]) {
      const c = ctx(root);
      for (const l of SUPPORTED_LOCALES) {
        const pub = buildRoutePath("villa", { slug: "deniz-villa" }, l, c);
        const internal = buildInternalPath("villa", { slug: "deniz-villa" }, l);
        expect(localeOfPath(pub, c)).toBe(l);
        expect(localeOfPath(internal, c)).toBe(l);
        expect(toBaseRoutePath(pub, c)).toBe("/kiralik-villa/deniz-villa");
        expect(toBaseRoutePath(internal, c)).toBe("/kiralik-villa/deniz-villa");
      }
    }
  });

  it("resolveRoute: dil slug'ı taban slug'a çözülür", () => {
    expect(resolveRoute("/en/villa/sea-villa", ctx("tr"))).toEqual({
      key: "villa",
      params: { slug: "deniz-villa" },
      locale: "en",
    });
  });
});
