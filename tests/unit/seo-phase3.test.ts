/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 3 — slug geçmişi, hreflang/x-default,
   çeviri kapsamı
   =============================================================== */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/i18n/get-translation.server", () => ({
  getTranslation: vi.fn(async (_e: string, _id: string, locale: string) =>
    locale === "en" ? { title: "Guide", body: "" } : locale === "de" ? { title: " ", body: null } : null
  ),
}));

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import type { RoutingContext } from "@/lib/i18n/routing/context";
import { buildRoutePath, resolveIncomingPath } from "@/lib/i18n/routing/url";
import { rowsToRedirectMap } from "@/lib/i18n/routing/sql";
import { pickSeoAlternates, buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import {
  getContentLocales,
  translatedLocalesFromRows,
} from "@/lib/i18n/content-availability.server";

function ctx(root: Locale = "tr", enabled: Locale[] = ["tr", "en", "de"]): RoutingContext {
  return {
    root,
    enabled,
    slugs: { villa: { "deniz-villa-3": { en: "sea-villa" } }, blog: { rehber: { en: "guide" } } },
    redirects: rowsToRedirectMap([
      // taban (TR) slug geçmişi: deniz-villa → deniz-villa-2 → deniz-villa-3
      { kind: "villa", locale: "tr", old_slug: "deniz-villa", base: "deniz-villa-3" },
      { kind: "villa", locale: "tr", old_slug: "deniz-villa-2", base: "deniz-villa-3" },
      // EN dil slug'ı geçmişi
      { kind: "villa", locale: "en", old_slug: "sea-view-villa", base: "deniz-villa-3" },
      { kind: "blog", locale: "tr", old_slug: "eski-rehber", base: "rehber" },
      // desteklenmeyen dil → yok sayılır
      { kind: "page", locale: "fr", old_slug: "x", base: "y" },
    ]),
  };
}

describe("slug geçmişi → tek adım 308", () => {
  it("eski TR slug → GÜNCEL kanonik (zincir yok: 2 eski slug da doğrudan son slug'a)", () => {
    const c = ctx();
    for (const old of ["deniz-villa", "deniz-villa-2"]) {
      expect(resolveIncomingPath(`/kiralik-villa/${old}`, c)).toEqual({
        type: "redirect",
        path: "/kiralik-villa/deniz-villa-3",
        status: 308,
      });
    }
  });

  it("eski TR slug, EN URL'sinde → EN'in GÜNCEL dil slug'ı", () => {
    expect(resolveIncomingPath("/en/villa/deniz-villa", ctx())).toEqual({
      type: "redirect",
      path: "/en/villa/sea-villa",
      status: 308,
    });
  });

  it("eski EN dil slug'ı → yeni EN slug'ı; rezervasyon route'u da aynı kuralı izler", () => {
    expect(resolveIncomingPath("/en/villa/sea-view-villa", ctx())).toEqual({
      type: "redirect",
      path: "/en/villa/sea-villa",
      status: 308,
    });
    expect(resolveIncomingPath("/rezervasyon/deniz-villa", ctx())).toEqual({
      type: "redirect",
      path: "/rezervasyon/deniz-villa-3",
      status: 308,
    });
  });

  it("blog: eski TR slug, EN'de → EN dil slug'ı; ana dil EN iken kökte", () => {
    expect(resolveIncomingPath("/en/blog/eski-rehber", ctx())).toEqual({
      type: "redirect",
      path: "/en/blog/guide",
      status: 308,
    });
    expect(resolveIncomingPath("/blog/eski-rehber", ctx("en"))).toEqual({
      type: "redirect",
      path: "/blog/guide",
      status: 308,
    });
  });

  it("yönlendirme hedefi tekrar çözümlendiğinde DAİMA rewrite (döngü/zincir yok) — tüm ana diller", () => {
    for (const root of ["tr", "en", "de"] as Locale[]) {
      const c = ctx(root);
      for (const p of [
        "/kiralik-villa/deniz-villa",
        "/en/villa/deniz-villa-2",
        "/de/villa/sea-view-villa",
        "/tr/blog/eski-rehber",
        "/en/blog/eski-rehber",
      ]) {
        const first = resolveIncomingPath(p, c);
        if (first.type === "redirect") {
          expect(resolveIncomingPath(first.path, c).type, `${p} → ${first.path}`).toBe("rewrite");
        }
      }
    }
  });

  it("geçmişte olmayan / silinmiş içerik slug'ı → yönlendirme YOK (404'e rewrite)", () => {
    expect(resolveIncomingPath("/kiralik-villa/hic-olmamis", ctx())).toEqual({
      type: "rewrite",
      path: "/tr/kiralik-villa/hic-olmamis",
    });
  });

  it("canlı dil slug'ı her zaman geçmişten önce gelir", () => {
    expect(resolveIncomingPath("/en/villa/sea-villa", ctx())).toEqual({
      type: "rewrite",
      path: "/en/kiralik-villa/sea-villa",
    });
  });

  it("hedef yalnız merkezi route sisteminden (site içi, kanonik)", () => {
    const d = resolveIncomingPath("/kiralik-villa/deniz-villa", ctx());
    expect(d.type).toBe("redirect");
    if (d.type === "redirect") {
      expect(d.path.startsWith("/")).toBe(true);
      expect(d.path.startsWith("//")).toBe(false);
      expect(d.path).toBe(buildRoutePath("villa", { slug: "deniz-villa-3" }, "tr", ctx()));
    }
  });

  it("rowsToRedirectMap desteklenmeyen dili atar", () => {
    expect(ctx().redirects?.page).toBeUndefined();
  });
});

describe("hreflang + x-default (çeviri kapsamı)", () => {
  const settings = (root: Locale, enabled: Locale[]) => ({
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: SUPPORTED_LOCALES.map((code, i) => ({
      code,
      is_enabled: enabled.includes(code),
      sort_order: i,
    })),
  });
  const LANGS = { tr: "/blog/x", en: "/en/blog/x", de: "/de/blog/x", "x-default": "/blog/x" };

  it("yalnız gerçekten çevrilmiş diller listelenir", () => {
    expect(
      pickSeoAlternates(settings("tr", ["tr", "en", "de"]), "/en/blog/x", LANGS, {
        available: ["tr", "en"],
        locale: "en",
      })
    ).toEqual({ canonical: "/en/blog/x", languages: { tr: "/blog/x", en: "/en/blog/x", "x-default": "/blog/x" } });
  });

  it("sayfanın kendi dili çeviri değilse hreflang YOK (yalnız kendi canonical'ı)", () => {
    expect(
      pickSeoAlternates(settings("tr", ["tr", "en", "de"]), "/de/blog/x", LANGS, {
        available: ["tr", "en"],
        locale: "de",
      })
    ).toEqual({ canonical: "/de/blog/x" });
  });

  it("x-default ana dile bağlanır; ana dilde çeviri yoksa mevcut ilk sürüme (asla var olmayan URL'ye değil)", () => {
    const enRoot = { tr: "/tr/blog/x", en: "/blog/x", de: "/de/blog/x", "x-default": "/blog/x" };
    expect(
      pickSeoAlternates(settings("en", ["tr", "en", "de"]), "/tr/blog/x", enRoot, {
        available: ["tr", "de"],
        locale: "tr",
      }).languages?.["x-default"]
    ).toBe("/tr/blog/x");
    expect(
      pickSeoAlternates(settings("en", ["tr", "en", "de"]), "/blog/x", enRoot, {
        available: ["tr", "en"],
        locale: "en",
      }).languages?.["x-default"]
    ).toBe("/blog/x");
  });

  it("kapalı dil hreflang'de yok; çeviri olsa bile", () => {
    expect(
      Object.keys(
        pickSeoAlternates(settings("tr", ["tr", "en"]), "/blog/x", LANGS, {
          available: ["tr", "en", "de"],
          locale: "tr",
        }).languages ?? {}
      )
    ).toEqual(["tr", "en", "x-default"]);
  });

  it("kanonik URL'ler merkezi üreticiyle aynı (ana dil kökte)", () => {
    expect(buildLocaleAlternates("/blog/x", "tr").canonical).toBe("/blog/x");
    expect(buildLocaleAlternates("/blog/x", "en").canonical).toBe("/en/blog/x");
  });
});

describe("çeviri kapsamı", () => {
  it("translatedLocalesFromRows: boş/boşluk başlık ve gövde çeviri SAYILMAZ; TR daima", () => {
    expect(
      translatedLocalesFromRows([
        { locale: "en", title: "A" },
        { locale: "de", title: "  ", body: "" },
      ])
    ).toEqual(["tr", "en"]);
  });

  it("getContentLocales: içerik okuyucusuyla aynı veriden", async () => {
    expect(await getContentLocales("blog", "post-1")).toEqual(["tr", "en"]);
    expect(await getContentLocales("page", "")).toEqual(["tr"]);
  });
});
