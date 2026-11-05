import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 6 — DALGA 2: kategori (villaType) ve bölge (region) route'ları,
   ana dil TR / EN / DE. Gövde (TaxonomyLandingPageBody) sahte: hangi
   argümanlarla çağrıldığı kaydedilir. Kategori adı / noindex kuralları
   tests/unit/taxonomy-landing.test.tsx içinde (merkezi servis ile).
   =============================================================== */

const h = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  bodyCalls: [] as Record<string, unknown>[],
  metaCalls: [] as unknown[][],
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
}));
vi.mock("@/lib/i18n/routing/context.server", () => ({ primeRoutingContext: async () => h.ctx }));
vi.mock("@/app/components/search/TaxonomyLandingPageBody", () => ({
  default: function TaxonomyLandingPageBody(p: Record<string, unknown>) {
    h.bodyCalls.push(p);
    return null;
  },
  buildTaxonomyLandingMetadata: async (...a: unknown[]) => {
    h.metaCalls.push(a);
    return { title: "t", openGraph: { title: "t" } };
  },
}));

import type { Locale } from "@/lib/i18n/config";
import { setRoutingContext, type RoutingContext } from "@/lib/i18n/routing/context";
import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { villaTypeRouteModule } from "@/app/(public)/_routes/villa-type";
import { regionRouteModule } from "@/app/(public)/_routes/region";

const L: Locale[] = ["tr", "en", "de"];
const CAT: Record<Locale, string> = { tr: "lux-villalar", en: "luxury-villas", de: "luxus-villen" };

function setup(root: Locale, enabled: Locale[] = L) {
  h.ctx = {
    root,
    enabled,
    slugs: { villaType: { lux: Object.fromEntries(enabled.map((l) => [l, CAT[l]])) } },
    redirects: { villaType: { [root]: { "eski-lux": "lux" } } },
  };
  setRoutingContext(h.ctx as RoutingContext);
}
type El = { type: unknown; props: Record<string, unknown> };
type R = { Page: (p: unknown) => Promise<El>; generateMetadata: (p: unknown) => Promise<{ openGraph?: { locale?: string } }> };
const cat = () => localeRouteFor("villaType", villaTypeRouteModule) as unknown as R;
const props = (lang: string, slug: string, sp: Record<string, string> = {}) => ({
  params: Promise.resolve({ lang, slug }),
  searchParams: Promise.resolve(sp),
});
async function run(r: R, lang: string, slug: string, sp?: Record<string, string>) {
  const outer = await r.Page(props(lang, slug, sp));
  const el = (await (outer.type as (p: unknown) => unknown)(outer.props)) as { type: unknown; props: Record<string, unknown> };
  /* Modül gövdeyi element olarak döner; gövdeye giden prop'lar kaydedilir. */
  if (el && (el.type as { name?: string }).name === "TaxonomyLandingPageBody") h.bodyCalls.push(el.props);
  return el;
}

beforeEach(() => {
  h.bodyCalls.length = 0;
  h.metaCalls.length = 0;
});

for (const root of L) {
  describe(`ana dil ${root.toUpperCase()} — kategori route'u`, () => {
    beforeEach(() => setup(root));

    for (const l of L) {
      it(`${l}: dil slug'ı → TEKNİK ANAHTAR gövdeye; kind=category; dil açıkça geçer; searchParams aynen`, async () => {
        await run(cat(), l, CAT[l], { page: "2" });
        expect(h.bodyCalls).toHaveLength(1);
        const c = h.bodyCalls[0];
        expect(c.kind).toBe("category");
        expect(c.slug).toBe("lux");
        expect(c.locale).toBe(l);
        expect(await (c.searchParams as Promise<unknown>)).toEqual({ page: "2" });
        const m = await cat().generateMetadata(props(l, CAT[l]));
        expect(h.metaCalls[0].slice(0, 3)).toEqual(["category", "lux", l]);
        expect(m.openGraph?.locale).toBeTruthy();
      });
    }

    it("başka dilin slug'ı → doğrulanmış eşleşmede o dilin slug'ına 308 (sorgu korunur); gövde çalışmaz", async () => {
      const [a, b] = L.filter((x) => x !== root);
      await expect(run(cat(), a, CAT[b], { page: "3" })).rejects.toThrow(
        new RegExp(`NEXT_REDIRECT:.*/${CAT[a]}\\?page=3$`)
      );
      expect(h.bodyCalls).toHaveLength(0);
    });

    it("ana dilin slug geçmişi → güncel slug'a 308", async () => {
      await expect(run(cat(), root, "eski-lux")).rejects.toThrow(new RegExp(`NEXT_REDIRECT:.*/${CAT[root]}$`));
    });

    it("teknik anahtar, dilin kendi slug'ı varken → o slug'a 308 (teknik anahtar değişmez)", async () => {
      await expect(run(cat(), root, "lux")).rejects.toThrow(new RegExp(`NEXT_REDIRECT:.*/${CAT[root]}$`));
    });

    it("bilinmeyen slug başka kayda yönlenmez; gövdeye aynen gider (gövde notFound kararını verir)", async () => {
      await run(cat(), root, "yok-boyle");
      expect(h.bodyCalls[0].slug).toBe("yok-boyle");
    });

    it("pasif dil: önek 404, gövde/metadata çalışmaz; pasif dilin slug'ı yedek olmaz", async () => {
      const passive = L.find((x) => x !== root)!;
      const rest = L.filter((x) => x !== passive);
      setup(root, rest);
      await expect(run(cat(), passive, CAT[passive])).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(cat().generateMetadata(props(passive, CAT[passive]))).rejects.toThrow("NEXT_NOT_FOUND");
      expect(h.bodyCalls).toHaveLength(0);
      /* Aktif dilde pasif dilin slug'ı → çözülmez (teknik anahtara dönmez). */
      await run(cat(), root, CAT[passive]);
      expect(h.bodyCalls.at(-1)!.slug).toBe(CAT[passive]);
    });
  });
}

/* ---------------- BÖLGE ---------------- */
const REG_SEG: Record<Locale, string> = { tr: "bolgeler", en: "regions", de: "regionen" };
const reg = () => localeRouteFor("region", regionRouteModule) as unknown as R;

for (const root of L) {
  describe(`ana dil ${root.toUpperCase()} — bölge route'u`, () => {
    beforeEach(() => setup(root));

    for (const l of L) {
      it(`${l}: bölge slug'ı ÇEVRİLMEZ (özel isim) — her dilde aynı slug gövdeye; kind=region`, async () => {
        await run(reg(), l, "bodrum", { sort: "price-asc" });
        const c = h.bodyCalls.at(-1)!;
        expect(c).toMatchObject({ kind: "region", slug: "bodrum", locale: l });
        expect(await (c.searchParams as Promise<unknown>)).toEqual({ sort: "price-asc" });
        await reg().generateMetadata(props(l, "bodrum"));
        expect(h.metaCalls.at(-1)!.slice(0, 3)).toEqual(["region", "bodrum", l]);
      });
    }

    it("bölge URL'leri: dil segmenti route kaydından, slug aynı; ana dil kökte", async () => {
      const { buildRoutePath } = await import("@/lib/i18n/routing/url");
      for (const l of L) {
        const p = buildRoutePath("region", { slug: "bodrum" }, l, h.ctx as RoutingContext);
        expect(p).toBe(l === root ? `/${REG_SEG[l]}/bodrum` : `/${l}/${REG_SEG[l]}/bodrum`);
      }
    });

    it("pasif dil: önek 404; gövde çalışmaz", async () => {
      const passive = L.find((x) => x !== root)!;
      setup(root, L.filter((x) => x !== passive));
      await expect(run(reg(), passive, "bodrum")).rejects.toThrow("NEXT_NOT_FOUND");
      expect(h.bodyCalls).toHaveLength(0);
    });
  });
}
