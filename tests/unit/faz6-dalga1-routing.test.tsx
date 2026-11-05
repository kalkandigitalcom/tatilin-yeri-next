import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 6 — DALGA 1: locale routing simetrisi + tek route modülü
   =============================================================== */

const h = vi.hoisted(() => ({
  ctx: { root: "tr", enabled: ["tr", "en", "de"], slugs: {}, redirects: {} } as Record<string, unknown>,
  settings: { multilingual_enabled: true, public_default_locale: "tr", public_locales: null } as Record<string, unknown>,
  requestLocales: [] as string[],
  gate: vi.fn(async () => {}),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => h.notFound(),
  permanentRedirect: (u: string) => h.permanentRedirect(u),
}));
vi.mock("@/lib/i18n/routing/context.server", () => ({ primeRoutingContext: async () => h.ctx }));
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (l: string) => void h.requestLocales.push(l),
  getRequestLocale: () => h.requestLocales.at(-1) ?? "tr",
}));
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({ requirePublicLocaleEnabled: (...a: unknown[]) => h.gate(...(a as [])) }));
vi.mock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => h.settings }));

import type { Locale } from "@/lib/i18n/config";
import {
  setRoutingContext,
  slugOwnerLocale,
  slugSource,
  toBaseSlug,
  toLocalizedSlug,
  type RoutingContext,
} from "@/lib/i18n/routing/context";
import { buildRoutePath, resolveIncomingPath } from "@/lib/i18n/routing/url";
import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { isLocaleToggleLocked, validateEnabledLocalesInput } from "@/lib/i18n/site-locales.validation";
import { offerRouteModule } from "@/app/(public)/_routes/offer";
import { favoritesRouteModule } from "@/app/(public)/_routes/favorites";
import OfferPageBody from "@/app/components/offer/OfferPageBody";
import FavoritesPageBody from "@/app/components/favorites/FavoritesPageBody";
import { buildOfferMetadata } from "@/app/components/offer/offer-metadata";
import { loadRouteContent, SLUG_KIND_ENTITY } from "@/lib/i18n/routing/route-content";
import { buildTechnicalKeyLookupQuery } from "@/lib/i18n/content/content-sql";
import { CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";

const L: Locale[] = ["tr", "en", "de"];
const ROOTS: Locale[] = ["tr", "en", "de"];

/* Kayıtlar (teknik anahtar → dil slug'ları):
     deniz  : tr "deniz-villa", en "sea-villa", de "meer-villa"
     orman  : en "forest-villa" (TR/DE kendi slug'ı YOK → teknik anahtar)
     koy    : tr "koy-villa", en "bay-villa"; DE'de "sea-villa" (çakışma: EN'de deniz'in slug'ı)
     gecmis : de "neu-villa"; DE geçmişi: "alt-villa" → gecmis
   "bay-villa" ayrıca DE geçmişinde "orman"a işaret ediyor (kendi dil geçmişi > başka dil). */
function ctxFor(root: Locale, enabled: Locale[] = L): RoutingContext {
  return {
    root,
    enabled,
    slugs: {
      villa: {
        deniz: { tr: "deniz-villa", en: "sea-villa", de: "meer-villa" },
        orman: { en: "forest-villa" },
        koy: { tr: "koy-villa", en: "bay-villa", de: "sea-villa" },
        gecmis: { de: "neu-villa" },
      },
    },
    redirects: {
      villa: {
        de: { "alt-villa": "gecmis", "bay-villa": "orman" },
        en: { "old-sea": "deniz" },
        tr: { "eski-deniz": "deniz" },
      },
    },
  };
}

beforeEach(() => {
  h.notFound.mockClear();
  h.permanentRedirect.mockClear();
  h.gate.mockClear();
  h.requestLocales = [];
});

/* ====================== SLUG ÇÖZÜMLEME ====================== */
describe("simetrik slug çözümleme (TR özel durumu yok)", () => {
  for (const root of ROOTS) {
    describe(`ana dil ${root}`, () => {
      const ctx = ctxFor(root);
      it("kendi dil slug'ı → teknik anahtar; teknik anahtar → kendi slug'ı (her dilde aynı kural)", () => {
        for (const l of L) {
          const own = ctx.slugs.villa!.deniz[l]!;
          expect({ l, b: toBaseSlug(ctx, "villa", own, l), s: slugSource(ctx, "villa", own, l) }).toEqual({ l, b: "deniz", s: "own" });
          expect(toLocalizedSlug(ctx, "villa", "deniz", l)).toBe(own);
        }
      });
      it("kendi slug'ı olmayan dilde teknik anahtar KANONİK ('own'); başka dile slug yedeği YOK", () => {
        for (const l of ["tr", "de"] as Locale[]) {
          expect(toLocalizedSlug(ctx, "villa", "orman", l)).toBe("orman");
          expect(slugSource(ctx, "villa", "orman", l)).toBe("own");
        }
        expect(slugSource(ctx, "villa", "orman", "en")).toBe("base"); // EN'in kendi slug'ı var
        expect(toLocalizedSlug(ctx, "villa", "orman", "en")).toBe("forest-villa");
      });
      it("kendi dilin geçmişi, başka dilin GÜNCEL slug'ından önce gelir (yanlış kayda gitmez)", () => {
        // DE'de "bay-villa" geçmişte orman'a aitti; bugün EN'de koy'un slug'ı → DE isteği orman'a gider
        expect(toBaseSlug(ctx, "villa", "bay-villa", "de")).toBe("orman");
        expect(slugSource(ctx, "villa", "bay-villa", "de")).toBe("history");
        expect(toBaseSlug(ctx, "villa", "alt-villa", "de")).toBe("gecmis");
      });
      it("başka dilin slug'ı yalnız TEK kayda işaret ediyorsa çözülür; çakışma → çözülmez (404)", () => {
        expect(toBaseSlug(ctx, "villa", "forest-villa", "de")).toBe("orman");
        expect(slugSource(ctx, "villa", "forest-villa", "de")).toBe("other");
        // "sea-villa": EN'de deniz, DE'de koy → TR isteğinde çakışma
        expect(slugSource(ctx, "villa", "sea-villa", "tr")).toBe("unknown");
        expect(toBaseSlug(ctx, "villa", "sea-villa", "tr")).toBe("sea-villa");
        // ama kendi dilinde çakışma yok
        expect(toBaseSlug(ctx, "villa", "sea-villa", "en")).toBe("deniz");
        expect(toBaseSlug(ctx, "villa", "sea-villa", "de")).toBe("koy");
      });
      it("başka dilin geçmişi: tek kayıtsa çözülür; TR geçmişine ÖZEL yedek yok", () => {
        expect(toBaseSlug(ctx, "villa", "old-sea", "tr")).toBe("deniz"); // EN geçmişi
        expect(toBaseSlug(ctx, "villa", "eski-deniz", "en")).toBe("deniz"); // TR geçmişi, diğer dillerle aynı kural
      });
    });
  }

  it("PASİF dilin slug'ı ve geçmişi kullanılmaz", () => {
    const ctx = ctxFor("en", ["en", "de"]); // TR pasif
    expect(slugSource(ctx, "villa", "koy-villa", "de")).toBe("unknown");
    expect(toBaseSlug(ctx, "villa", "eski-deniz", "de")).toBe("eski-deniz");
    // TR pasifken "sea-villa" çakışması da yalnız aktif dillere göre: EN deniz, DE koy → EN isteğinde kendi
    expect(toBaseSlug(ctx, "villa", "sea-villa", "en")).toBe("deniz");
  });

  it("teknik anahtarın sahibi: kendi slug'ı olmayan AKTİF dil (TR'ye özel değil)", () => {
    const ctx = ctxFor("en");
    expect(slugOwnerLocale(ctx, "villa", "orman", "en")).toBe("tr"); // TR ve DE'nin kanoniği teknik anahtar; ilk aktif
    expect(slugOwnerLocale(ctxFor("en", ["en", "de"]), "villa", "orman", "en")).toBe("de"); // TR pasif → DE
    expect(slugOwnerLocale(ctx, "villa", "forest-villa", "de")).toBe("en");
  });
});

/* ====================== PROXY KARARLARI ====================== */
describe("proxy: kök / önek / 308-307 / pasif dil", () => {
  for (const root of ROOTS) {
    it(`ana dil ${root}: kök öneksiz, diğer diller önekli; ana dil öneki 307 ile soyulur`, () => {
      const ctx = ctxFor(root);
      for (const l of L) {
        const path = buildRoutePath("villa", { slug: "deniz" }, l, ctx);
        expect(path.startsWith(l === root ? "/" : `/${l}/`)).toBe(true);
        if (l === root) expect(path.startsWith(`/${l}/`)).toBe(false);
        expect(resolveIncomingPath(path, ctx).type).toBe("rewrite");
      }
      const rootPrefixed = `/${root}${buildRoutePath("villas", {}, root, ctx)}`.replace(/\/$/, "");
      expect(resolveIncomingPath(rootPrefixed, ctx)).toMatchObject({ type: "redirect", status: 307 });
    });

    it(`ana dil ${root}: önekli dilde başka dilin slug'ı → o dilin kanonik slug'ına 308`, () => {
      const ctx = ctxFor(root);
      const de = root === "de" ? "" : "/de";
      const d = resolveIncomingPath(`${de}/villa/forest-villa`, ctx);
      if (root === "de") {
        /* Öneksiz (ana dile bağlı) yol + aynı desen EN'de de var: Faz 4 kuralı
           korunur — URL eskiden EN kök URL'siydi → EN sayfasına GEÇİCİ 307. */
        expect(d).toEqual({ type: "redirect", path: "/en/villa/forest-villa", status: 307 });
      } else {
        expect(d).toEqual({ type: "redirect", path: "/de/villa/orman", status: 308 });
      }
    });

    it(`ana dil ${root}: slug geçmişi → güncel slug (zincir/döngü yok)`, () => {
      const ctx = ctxFor(root);
      const p = (l: Locale, slug: string) => (l === root ? "" : `/${l}`) + `/villa/${slug}`;
      const d = resolveIncomingPath(p("de", "alt-villa"), ctx) as { type: string; path: string };
      expect(d.type).toBe("redirect");
      expect(d.path).toBe(buildRoutePath("villa", { slug: "gecmis" }, "de", ctx));
      expect(resolveIncomingPath(d.path, ctx).type).toBe("rewrite");
    });

    it(`ana dil ${root}: çakışan slug yanlış kayda YÖNLENMEZ`, () => {
      const ctx = ctxFor(root);
      if (root === "tr") {
        const d = resolveIncomingPath("/kiralik-villa/sea-villa", ctx);
        expect(d.type).toBe("rewrite"); // çözülmedi → sayfa/proxy canlı kontrolünde 404 (yönlendirme YOK)
      }
    });
  }

  it("pasif dil öneki → 404; pasif dilin deseni öneksiz gelirse 404 (yönlendirme yok)", () => {
    const ctx = ctxFor("en", ["en", "de"]);
    expect(resolveIncomingPath("/tr/kiralik-villalar", ctx)).toMatchObject({ type: "notFound", reason: "disabledLocale" });
    expect(resolveIncomingPath("/kiralik-villalar", ctx)).toMatchObject({ type: "notFound" });
    expect(resolveIncomingPath("/villas-for-rent", ctx).type).toBe("rewrite");
    expect(resolveIncomingPath("/de/ferienvillen", ctx).type).toBe("rewrite");
  });

  it("mevcut URL'ler korunur (ana dil TR): segment ve slug tablosu", () => {
    const ctx = ctxFor("tr");
    expect(buildRoutePath("villas", {}, "tr", ctx)).toBe("/kiralik-villalar");
    expect(buildRoutePath("villas", {}, "en", ctx)).toBe("/en/villas-for-rent");
    expect(buildRoutePath("villas", {}, "de", ctx)).toBe("/de/ferienvillen");
    expect(buildRoutePath("villa", { slug: "deniz" }, "tr", ctx)).toBe("/kiralik-villa/deniz-villa");
    expect(buildRoutePath("villa", { slug: "deniz" }, "en", ctx)).toBe("/en/villa/sea-villa");
    expect(buildRoutePath("offer", {}, "de", ctx)).toBe("/de/angebot-anfordern");
    expect(buildRoutePath("favorites", {}, "tr", ctx)).toBe("/favoriler");
  });
});

/* ====================== DİL AKTİFLİĞİ ====================== */
describe("aktif/pasif dil kuralları (K4)", () => {
  it("ana dil pasifleştirilemez; TR'ye özel kilit yok", () => {
    for (const root of ROOTS) {
      expect(validateEnabledLocalesInput(L.filter((l) => l !== root), root)).toMatchObject({ ok: false });
      for (const l of L) expect(isLocaleToggleLocked(l, root)).toBe(l === root);
    }
    expect(validateEnabledLocalesInput(["en", "de"], "de")).toMatchObject({ ok: true });
  });
});

/* ====================== TEK ROUTE MODÜLÜ ====================== */
function props(params: Record<string, string>, sp: Record<string, string> = {}) {
  return { params: Promise.resolve(params), searchParams: Promise.resolve(sp) };
}

describe("localeRouteFor — tek, dile duyarlı modül", () => {
  beforeEach(() => {
    h.ctx = ctxFor("tr");
    setRoutingContext(h.ctx as RoutingContext);
  });
  it("dili AÇIKÇA geçirir, setRequestLocale her dilde (TR dahil); slug teknik anahtar", async () => {
    const seen: unknown[] = [];
    const r = localeRouteFor("villa", {
      Page: (p) => (seen.push({ locale: p.locale, params: p.params }), null),
      generateMetadata: (p) => ({ title: `${p.locale}:${p.params.slug}` }),
    });
    for (const l of L) {
      const ctx = h.ctx as RoutingContext;
      const own = toLocalizedSlug(ctx, "villa", "deniz", l);
      const el = (await r.Page(props({ lang: l, slug: own }))) as { type: (p: unknown) => unknown; props: unknown };
      el.type(el.props);
      expect((await r.generateMetadata(props({ lang: l, slug: own }))).title).toBe(`${l}:deniz`);
    }
    expect(seen).toEqual(L.map((l) => ({ locale: l, params: { slug: "deniz" } })));
    expect(h.requestLocales.filter((x, i, a) => a.indexOf(x) === i)).toEqual(L);
  });
  it("kanonik olmayan slug → 308 (query korunur); pasif/desteklenmeyen dil → 404", async () => {
    const r = localeRouteFor("villa", { Page: () => null });
    await expect(r.Page(props({ lang: "en", slug: "deniz-villa" }, { start: "2026-07-01" }))).rejects.toThrow(
      "NEXT_REDIRECT:/en/villa/sea-villa?start=2026-07-01"
    );
    h.ctx = ctxFor("en", ["en", "de"]);
    await expect(r.Page(props({ lang: "tr", slug: "deniz-villa" }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(r.Page(props({ lang: "fr", slug: "x" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("çoklu dil KAPALI: ana dil açılır (eski EN/DE master-switch kapısı ana dili 404 yapmaz)", async () => {
    h.ctx = { ...ctxFor("tr", ["tr"]) };
    const r = localeRouteFor("favorites", favoritesRouteModule);
    await expect(r.Page(props({ lang: "tr" }))).resolves.toBeTruthy();
    expect(h.gate).not.toHaveBeenCalled();
    await expect(r.Page(props({ lang: "en" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("OG locale eklenir (sayfa openGraph verdiyse) — eski dispatcher ile aynı", async () => {
    const r = localeRouteFor("offer", { Page: () => null, generateMetadata: () => ({ openGraph: { title: "x" } }) });
    const m = await r.generateMetadata(props({ lang: "de" }));
    expect(m.openGraph).toMatchObject({ locale: "de_DE" });
  });
});

/* ====================== PİLOT ROUTE EŞDEĞERLİĞİ ====================== */
type El = { type: unknown; props: Record<string, unknown> };
async function render(r: { Page: (p: ReturnType<typeof props>) => Promise<unknown> }, lang: Locale): Promise<El> {
  const outer = (await r.Page(props({ lang }))) as El;
  const fn = outer.type as (p: unknown) => unknown;
  return (await fn(outer.props)) as El;
}

describe("pilot route'lar: tek modül = eski üç kopya (gövde + metadata)", () => {
  beforeEach(() => {
    h.ctx = ctxFor("tr");
    setRoutingContext(h.ctx as RoutingContext);
  });
  for (const l of L) {
    it(`teklif-al (${l}): aynı gövde + aynı metadata`, async () => {
      const unified = localeRouteFor("offer", offerRouteModule);
      const el = await render(unified, l);
      expect(el.type).toBe(OfferPageBody);
      expect(el.props).toEqual({ locale: l });
      expect(await unified.generateMetadata(props({ lang: l }))).toEqual(await buildOfferMetadata(l));
    });
    it(`favoriler (${l}): aynı gövde + aynı metadata (noindex)`, async () => {
      const unified = localeRouteFor("favorites", favoritesRouteModule);
      const el = await render(unified, l);
      expect(el.type).toBe(FavoritesPageBody);
      expect(el.props).toEqual({ locale: l });
      const m = await unified.generateMetadata(props({ lang: l }));
      expect(m.robots).toEqual({ index: false, follow: false, googleBot: { index: false, follow: false } });
      expect(m.title).toBeTruthy();
    });
  }
});

/* ====================== ROUTE ↔ İÇERİK ALTYAPISI ====================== */
describe("route-content: teknik anahtar → kimlik → sayfanın dili", () => {
  it("4 slug türü varlıklara bağlı; teknik anahtar sorgusu parametreli ve yalnız SELECT", () => {
    expect(SLUG_KIND_ENTITY).toEqual({ villa: "villa", villaType: "villa_type", blog: "blog_post", page: "page" });
    const q = buildTechnicalKeyLookupQuery(CONTENT_ENTITY_BY_KEY.blog_post, "x'; DROP");
    expect(q.text).toBe(`SELECT "id"::text AS parent_id FROM "blog_posts" WHERE "slug" = $1 LIMIT 2`);
    expect(q.values).toEqual(["x'; DROP"]);
    expect(() => buildTechnicalKeyLookupQuery(CONTENT_ENTITY_BY_KEY.faq, "x")).toThrow();
  });
  it("dili AYNEN merkezi okumaya geçirir; kayıt yoksa içerik okunmaz", async () => {
    const calls: unknown[] = [];
    const deps = {
      findIdByTechnicalKey: async (e: string, k: string) => (calls.push(["id", e, k]), k === "deniz" ? "id-1" : null),
      getContent: async (e: string, id: string, l: Locale) => (calls.push(["c", e, id, l]), { values: {}, sourceLocale: {}, missing: [], isFallback: false }),
    };
    for (const l of L) {
      expect(await loadRouteContent(deps as never, "villa", "deniz", l)).toMatchObject({ found: true, id: "id-1" });
    }
    expect(await loadRouteContent(deps as never, "blog", "yok", "de")).toEqual({ found: false });
    expect(calls).toEqual([
      ...L.flatMap((l) => [["id", "villa", "deniz"], ["c", "villa", "id-1", l]]),
      ["id", "blog_post", "yok"],
    ]);
  });
});
