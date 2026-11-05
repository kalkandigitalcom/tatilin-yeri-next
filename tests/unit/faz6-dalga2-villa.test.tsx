import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 6 — DALGA 2: villa detay + villa listeleme, ana dil TR / EN / DE.
   Merkezi okuma (gerçek çekirdek + bellek içi depo); teknik servisler
   sahte ve çağrı kayıtlı. Eski ↔ yeni eşdeğerliği ayrıca (ana dil TR)
   doğrulandı; burada YENİ simetrik davranış test edilir.
   =============================================================== */

const h = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  settings: {} as Record<string, unknown>,
  data: {} as Record<string, unknown>,
}));
const D = vi.hoisted(() => {
  (globalThis as unknown as { __f6calls: string[] }).__f6calls = [];
const V1 = "11111111-1111-4111-8111-111111111111";
const F1 = "22222222-2222-4222-8222-222222222221";
const F2 = "22222222-2222-4222-8222-222222222222";
const R1 = "33333333-3333-4333-8333-333333333331";
const P1 = "44444444-4444-4444-8444-444444444441";

const VILLA = {
  id: V1,
  slug: "deniz",
  title: "Deniz Villa",
  description: "<p>TR açıklama</p>",
  seo_title: "TR SEO başlık",
  seo_description: "",
  badge: "Yeni",
  noindex: false,
  location: "Kalkan",
  images: ["villas/deniz/cover.webp"],
  youtube_videos: [],
  latitude: 36.2,
  longitude: 29.4,
  guests: 8,
  bedrooms: 4,
  bathrooms: 3,
};
const PRICES = [
  { price: 12000, currency: "TRY" },
  { price: 9000, currency: "TRY" },
];
const DISCOUNTS = [{ id: "d1", discount_type: "percent", discount_value: 10 }];
const IMAGES = [{ image_url: "villas/deniz/1.webp" }, { image_url: "villas/deniz/2.webp" }];
const DISTANCES = [{ id: "x1", title: "Plaj", distance: "300 m" }];
const FEATURES = [
  { id: F1, name: "Havuz" },
  { id: F2, name: "Jakuzi" },
];
const RULES = [{ id: R1, title: "Sigara içilmez" }];
const INCLUDES = [{ id: P1, title: "Temizlik" }];
const EXTERNAL = { blockedStarts: ["2026-12-01"], blockedEnds: ["2026-12-05"] };
const REVIEWS = [{ id: "rv1", rating: 5 }];
const STATS = { count: 1, average: 5 };

const svc = (name: string, value: unknown) => async (...args: unknown[]) => {
  (globalThis as unknown as { __f6calls: string[] }).__f6calls.push(`${name}(${JSON.stringify(args)})`);
  return value;
};
  return { V1, F1, F2, R1, P1, VILLA, PRICES, DISCOUNTS, IMAGES, DISTANCES, FEATURES, RULES, INCLUDES, EXTERNAL, REVIEWS, STATS, svc };
});
const { V1, F1, F2, R1, P1 } = D;
const calls = (): string[] => (globalThis as unknown as { __f6calls: string[] }).__f6calls;
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
}));
vi.mock("@/lib/i18n/routing/context.server", () => ({ primeRoutingContext: async () => h.ctx }));
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({ requirePublicLocaleEnabled: async () => undefined }));
vi.mock("@/app/components/villa/VillaDetailBody", () => ({
  default: function VillaDetailBody() {
    return null;
  },
}));

vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: async (slug: string) => {
    (globalThis as unknown as { __f6calls: string[] }).__f6calls.push(`getVillaBySlug(${JSON.stringify([slug])})`);
    return slug === "deniz" ? D.VILLA : null;
  },
}));
vi.mock("@/app/services/villa-image/villa-image.read", () => ({ getVillaImages: D.svc("getVillaImages", D.IMAGES) }));
vi.mock("@/app/services/villa-price.service", () => ({ getVillaPrices: D.svc("getVillaPrices", D.PRICES) }));
vi.mock("@/app/services/villa-discount.service", () => ({ getVillaDiscounts: D.svc("getVillaDiscounts", D.DISCOUNTS) }));
vi.mock("@/app/services/villa-distance.service", () => ({ getVillaDistances: D.svc("getVillaDistances", D.DISTANCES) }));
vi.mock("@/app/services/villa-feature.service", () => ({ getVillaFeaturesByVilla: D.svc("getVillaFeaturesByVilla", D.FEATURES) }));
vi.mock("@/app/services/rule-item.service", () => ({ getRuleItemsByVilla: D.svc("getRuleItemsByVilla", D.RULES) }));
vi.mock("@/app/services/price-include-item.service", () => ({
  getPriceIncludeItemsByVilla: D.svc("getPriceIncludeItemsByVilla", D.INCLUDES),
}));
vi.mock("@/lib/external-calendar.public.helper", () => ({
  fetchExternalCalendarStringsForVilla: D.svc("fetchExternalCalendarStringsForVilla", D.EXTERNAL),
  EMPTY_EXTERNAL_STRING_ARRAYS: { blockedStarts: [], blockedEnds: [] },
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: async () => h.settings,
  getCachedVillaReviews: D.svc("getCachedVillaReviews", D.REVIEWS),
  getCachedVillaReviewStats: D.svc("getCachedVillaReviewStats", D.STATS),
}));

/* Eski okuyucular: EN/DE çeviri satırları aynı fikstürden; TR'de satır yok
   (eski sistem TR'de ana tabloyu okur). */
vi.mock("@/lib/i18n/get-translation.server", async (orig) => {
  const actual = await orig<typeof import("@/lib/i18n/get-translation.server")>();
  const rowOf = (entity: string, id: string, locale: string) =>
    locale === "tr" ? undefined : (h.data as never)[entity]?.[id]?.[locale];
  return {
    ...actual,
    getTranslation: async (entity: string, id: string, locale: string) => rowOf(entity, id, locale) ?? null,
    getTranslationsForParents: async (entity: string, ids: readonly string[], locale: string) => {
      const m = new Map();
      for (const id of ids) {
        const r = rowOf(entity, id, locale);
        if (r) m.set(id, r);
      }
      return m;
    },
  };
});

/* Merkezi servis: GERÇEK çekirdek + bellek içi depo. */
vi.mock("@/lib/i18n/content/content-read.server", async () => {
  const { fixtureReader } = await import("../fixtures/faz6/content-fixture");
  const r = fixtureReader(
    () => h.data as never,
    () => ({ root: h.ctx.root as never, enabled: h.ctx.enabled as never })
  );
  return { getContent: r.getContent, getContentMany: r.getContentMany };
});

import type { ComponentProps } from "react";
import type { Metadata } from "next";
import type VillaDetailBody from "@/app/components/villa/VillaDetailBody";
import type { Locale } from "@/lib/i18n/config";
import { setRoutingContext, type RoutingContext } from "@/lib/i18n/routing/context";
import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { villaRouteModule } from "@/app/(public)/_routes/villa";
import {
  contentText,
  labelItems,
  loadContentLabels,
  resolveCategoryName,
  villaRobots,
} from "@/lib/i18n/content/public-villa-content";
import { fixtureReader } from "../fixtures/faz6/content-fixture";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";

const L: Locale[] = ["tr", "en", "de"];
const ROOTS: Locale[] = ["tr", "en", "de"];
const SLUG: Record<Locale, string> = { tr: "deniz-tr", en: "sea-villa", de: "meer-villa" };
const TEXT: Record<Locale, { d: string; f1: string; r1: string; p1: string; badge: string; seo: string }> = {
  tr: { d: "<p>TR açıklama</p>", f1: "Havuz", r1: "Sigara içilmez", p1: "Temizlik", badge: "Yeni", seo: "TR SEO" },
  en: { d: "<p>EN description</p>", f1: "Pool", r1: "No smoking", p1: "Cleaning", badge: "New", seo: "EN SEO" },
  de: { d: "<p>DE Beschreibung</p>", f1: "Pool DE", r1: "Rauchen verboten", p1: "Reinigung", badge: "Neu", seo: "DE SEO" },
};

/* Tam çeviri; F2 yalnız ana dil dışındaki TEK bir dilde var (bkz. testler). */
function fullFixture() {
  const villa: Record<string, Record<string, string | null>> = {};
  const f1: Record<string, Record<string, string>> = {};
  const r1: Record<string, Record<string, string>> = {};
  const p1: Record<string, Record<string, string>> = {};
  for (const l of L) {
    villa[l] = { description: TEXT[l].d, badge: TEXT[l].badge, seo_title: TEXT[l].seo, seo_description: `${l} meta`, slug: SLUG[l] };
    f1[l] = { name: TEXT[l].f1 };
    r1[l] = { title: TEXT[l].r1 };
    p1[l] = { title: TEXT[l].p1 };
  }
  return {
    villa: { [V1]: villa },
    villa_feature: { [F1]: f1, [F2]: {} as Record<string, Record<string, string>> },
    rule_item: { [R1]: r1 },
    price_include_item: { [P1]: p1 },
  };
}

type Rows = Record<string, Record<string, Record<string, string | null>>>;
type FixtureData = { villa: Rows; villa_feature: Rows; rule_item: Rows; price_include_item: Rows };
const alt = (m: Metadata) => m.alternates as { canonical: string; languages: Record<string, string> };
const og = (m: Metadata) => m.openGraph as { locale?: string };

function setup(root: Locale, enabled: Locale[] = L) {
  h.ctx = {
    root,
    enabled,
    slugs: { villa: { deniz: Object.fromEntries(enabled.map((l) => [l, SLUG[l]])) } },
    redirects: {},
  };
  h.settings = {
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
  };
  setRoutingContext(h.ctx as RoutingContext);
}

type El = { type: unknown; props: ComponentProps<typeof VillaDetailBody> };
type R = { Page: (p: unknown) => Promise<unknown>; generateMetadata: (p: unknown) => Promise<Metadata> };
const route = () => localeRouteFor("villa", villaRouteModule) as unknown as R;
const props = (lang: string, slug: string, sp: Record<string, string> = {}) => ({
  params: Promise.resolve({ lang, slug }),
  searchParams: Promise.resolve(sp),
});
async function render(lang: Locale, slug = SLUG[lang]): Promise<El> {
  const outer = (await route().Page(props(lang, slug))) as El;
  return (await (outer.type as (p: unknown) => unknown)(outer.props)) as El;
}

beforeEach(() => {
  calls().length = 0;
  h.data = fullFixture();
});

for (const root of ROOTS) {
  describe(`ana dil ${root.toUpperCase()} — villa detay`, () => {
    beforeEach(() => setup(root));

    for (const l of L) {
      it(`${l}: içerik istenen dilde; teknik anahtar servise aynen gider; teknik veri değişmez`, async () => {
        const b = await render(l);
        expect(calls()).toContain(`getVillaBySlug(["deniz"])`);
        expect(calls().some((c) => c.includes(SLUG[l]) && SLUG[l] !== "deniz")).toBe(false);
        expect(b.props.displayDescription).toBe(TEXT[l].d);
        expect(b.props.features).toEqual([{ id: F1, displayName: TEXT[l].f1 }]);
        expect(b.props.rules).toEqual([{ id: R1, displayTitle: TEXT[l].r1 }]);
        expect(b.props.priceIncludes).toEqual([{ id: P1, displayTitle: TEXT[l].p1 }]);
        expect(b.props.villaTitle).toBe("Deniz Villa"); // özel isim
        expect(b.props.displayLocation).toBe("Kalkan"); // bölge özel isim
        expect(b.props.prices).toBe(D.PRICES);
        expect(b.props.discounts).toBe(D.DISCOUNTS);
        expect(b.props.externalBlocks).toBe(D.EXTERNAL);
        expect(b.props.imageUrls).toEqual(
          D.IMAGES.map((i) => resolveVillaImageUrl(i.image_url)).filter((u) => typeof u === "string" && u.length > 0)
        );
        expect(b.props.distances![0]).toMatchObject({ displayDistance: "300 m" });
        expect(b.props.bookingSidebarId).toBe(l === "tr" ? "booking-sidebar" : `booking-sidebar-${l}`);
        expect(b.props.locale).toBe(l);
        /* JSON-LD: dilin kanonik yolu + inLanguage. */
        expect(String((b.props.vacationRentalLd as { url: string }).url)).toMatch(new RegExp(`/villa(s)?/?|/kiralik-villa/`));
        expect(String((b.props.vacationRentalLd as { url: string }).url).endsWith(`/${SLUG[l]}`)).toBe(true);
      });

      it(`${l}: metadata — başlık/açıklama istenen dilde, canonical dilin URL'si, hreflang yalnız aktif diller`, async () => {
        const m = await route().generateMetadata(props(l, SLUG[l]));
        expect(m.title).toBe(TEXT[l].seo);
        expect(m.description).toBe(`${l} meta`);
        expect(m.robots).toBeUndefined();
        expect(String(alt(m).canonical).endsWith(`/${SLUG[l]}`)).toBe(true);
        expect(Object.keys(alt(m).languages).sort()).toEqual([...L, "x-default"].sort());
        expect(alt(m).languages["x-default"]).toBe(alt(m).languages[root]);
        expect(og(m).locale).toBeTruthy();
      });
    }

    it("eksik çeviri: ana dil zinciri (TR'ye özel değil); alan bazında yedek", async () => {
      const other = L.find((l) => l !== root)!;
      const data = h.data as FixtureData;
      data.villa[V1][other] = { description: null, badge: null, seo_title: null, seo_description: null, slug: SLUG[other] };
      delete data.villa_feature[F1][other];
      const b = await render(other);
      expect(b.props.displayDescription).toBe(TEXT[root].d);
      expect(b.props.features).toEqual([{ id: F1, displayName: TEXT[root].f1 }]);
      const m = await route().generateMetadata(props(other, SLUG[other]));
      expect(m.title).toBe(TEXT[root].seo);
      /* Yedek dilin seo_description'ı başka dile geçmez → kendi (yedek) açıklamasının özeti. */
      expect(m.description).toBe(TEXT[root].d.replace(/<[^>]+>/g, ""));
      /* Faz 3.1: villa için yedek dil noindex sebebi DEĞİL (mevcut kural korunur). */
      expect(m.robots).toBeUndefined();
      /* 🌐 Faz 6 Dalga 5 — yedek içerikli villa indexlenir → hreflang bütün aktif diller. */
      expect(Object.keys(alt(m).languages).sort()).toEqual([...L, "x-default"].sort());
    });

    it("hiçbir aktif dilde içerik yok: açıklama boş durumu + noindex,follow; özellik gizlenir", async () => {
      const data = h.data as FixtureData;
      for (const l of L) {
        data.villa[V1][l] = { description: null, badge: null, seo_title: null, seo_description: null, slug: SLUG[l] };
        data.villa_feature[F1] = {};
      }
      const b = await render(root);
      expect(b.props.displayDescription).toBeNull();
      expect(b.props.features).toEqual([]);
      const m = await route().generateMetadata(props(root, SLUG[root]));
      expect(m.robots).toEqual({ index: false, follow: true });
      expect(m.title).toBe("Deniz Villa");
      /* 🌐 Faz 6 Dalga 5 — içerik hiçbir aktif dilde yok → hreflang yok
         (sitemap'te de yok); canonical kendi URL'si. */
      expect(alt(m).languages).toBeUndefined();
      expect(String(alt(m).canonical).endsWith(`/${SLUG[root]}`)).toBe(true);
    });

    it("villa.noindex her dilde noindex,nofollow", async () => {
      const prev = D.VILLA.noindex;
      D.VILLA.noindex = true;
      try {
        for (const l of L) {
          const m = await route().generateMetadata(props(l, SLUG[l]));
          expect(m.robots).toEqual({ index: false, follow: false });
          /* Kayıt bayrağı: hreflang davranışı DEĞİŞMEDİ (Dalga 5). */
          expect(Object.keys(alt(m).languages ?? {}).sort()).toEqual([...L, "x-default"].sort());
        }
      } finally {
        D.VILLA.noindex = prev;
      }
    });

    it("öğe yalnız tek bir aktif dilde varsa diğer dillerde o dilden gösterilir; hiçbir aktif dilde yoksa gizlenir", async () => {
      const only = L.find((l) => l !== root)!;
      (h.data as FixtureData).villa_feature[F2] = { [only]: { name: `F2-${only}` } };
      const b = await render(root);
      expect(b.props.features).toEqual([
        { id: F1, displayName: TEXT[root].f1 },
        { id: F2, displayName: `F2-${only}` },
      ]);
      /* O dil pasifse zincire girmez → gizlenir. */
      setup(root, L.filter((l) => l !== only));
      const b2 = await render(root);
      expect(b2.props.features).toEqual([{ id: F1, displayName: TEXT[root].f1 }]);
    });

    it("pasif dil: önek 404; pasif dilin içeriği yedek olarak kullanılmaz", async () => {
      const passive = L.find((l) => l !== root)!;
      const rest = L.filter((l) => l !== passive);
      setup(root, rest);
      await expect(route().Page(props(passive, SLUG[passive]))).rejects.toThrow("NEXT_NOT_FOUND");
      const asked = rest.find((l) => l !== root)!;
      const data = h.data as FixtureData;
      data.villa[V1][asked] = { description: null, badge: null, seo_title: null, seo_description: null, slug: SLUG[asked] };
      data.villa[V1][root] = { ...data.villa[V1][root], description: null };
      /* İstenen + ana dil boş; değer yalnız PASİF dilde → kullanılmaz. */
      const b = await render(asked);
      expect(b.props.displayDescription).toBeNull();
    });

    it("başka dilin slug'ı → doğrulanmış eşleşmede o dilin slug'ına 308 (sorgu korunur)", async () => {
      const [a, b] = L.filter((l) => l !== root).concat(root).slice(0, 2);
      await expect(route().Page(props(a, SLUG[b], { start: "2026-12-10" }))).rejects.toThrow(
        /NEXT_REDIRECT:.*\/meer-villa\?start=2026-12-10$|NEXT_REDIRECT:.*\/sea-villa\?start=2026-12-10$|NEXT_REDIRECT:.*\/deniz-tr\?start=2026-12-10$/
      );
      expect(calls()).toEqual([]);
    });

    it("bilinmeyen slug: başka kayda yönlendirme yok; 'villa bulunamadı' + noindex,nofollow; teknik servis çağrılmaz", async () => {
      for (const l of L) {
        calls().length = 0;
        const m = await route().generateMetadata(props(l, "yok-boyle"));
        expect(m.robots).toEqual({ index: false, follow: false });
        const outer = (await route().Page(props(l, "yok-boyle"))) as El;
        const el = (await (outer.type as (p: unknown) => unknown)(outer.props)) as El;
        expect(el.type).toBe("section");
        expect(calls().every((c) => c.startsWith("getVillaBySlug"))).toBe(true);
        expect(calls()).toContain(`getVillaBySlug(["yok-boyle"])`);
      }
    });
  });
}

describe("saf yardımcılar", () => {
  it("contentText: boş/boşluk → null", () => {
    const c = { values: { a: "  ", b: "x", c: null }, sourceLocale: {}, missing: [], isFallback: false } as never;
    expect(contentText(c, "a")).toBeNull();
    expect(contentText(c, "b")).toBe("x");
    expect(contentText(c, "c")).toBeNull();
    expect(contentText(null, "b")).toBeNull();
  });
  it("villaRobots", () => {
    const full = { values: { description: "x" }, sourceLocale: {}, missing: [], isFallback: true } as never;
    const none = { values: { description: null }, sourceLocale: {}, missing: ["description"], isFallback: true } as never;
    expect(villaRobots(full, false)).toBeUndefined();
    expect(villaRobots(none, false)).toEqual({ index: false, follow: true });
    expect(villaRobots(null, false)).toEqual({ index: false, follow: true });
    expect(villaRobots(full, true)).toEqual({ index: false, follow: false });
  });
  it("labelItems sırayı korur, etiketsiz öğeyi gizler", () => {
    const out = labelItems([{ id: "a" }, { id: "b" }, { id: "c" }], new Map([["c", "C"], ["a", "A"]]), (x, l) => `${x.id}:${l}`);
    expect(out).toEqual(["a:A", "c:C"]);
  });
  it("resolveCategoryName: ad yoksa genel etiket (slug değil)", () => {
    expect(resolveCategoryName(new Map([["1", "Lüks"]]), 1, "Villa Kategorisi")).toEqual({ name: "Lüks", hasContent: true });
    expect(resolveCategoryName(new Map(), 2, "Villa Kategorisi")).toEqual({ name: "Villa Kategorisi", hasContent: false });
  });
  for (const root of ROOTS) {
    it(`loadContentLabels (ana dil ${root}): tek batch, pasif dil yok`, async () => {
      const passive = L.find((l) => l !== root && l !== "en")!;
      const data = { villa_type: { [F1]: { tr: { name: "Lüks" }, en: { name: "Luxury" } }, [F2]: { [passive]: { name: "Yalnız pasif" } } } };
      let n = 0;
      const enabled = Array.from(new Set([root, "en"])) as Locale[];
      const base = fixtureReader(() => data as never, () => ({ root, enabled }));
      const reader = { ...base, getContentMany: (...a: Parameters<typeof base.getContentMany>) => (n++, base.getContentMany(...a)) };
      const m = await loadContentLabels(reader, "villa_type", "name", [F1, F2, F1], "en");
      expect(n).toBe(1);
      expect(m.get(F1)).toBe("Luxury");
      expect(m.has(F2)).toBe(false); // yalnız pasif dilde → gizli
      const t = await loadContentLabels(reader, "villa_type", "name", [F1, F2], passive);
      expect(t.get(F1)).toBe(root === "tr" ? "Lüks" : "Luxury"); // pasif istenen → ana dil zinciri
      expect(t.has(F2)).toBe(false);
    });
  }
});
