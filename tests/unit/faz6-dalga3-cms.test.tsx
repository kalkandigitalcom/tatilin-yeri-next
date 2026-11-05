import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 6 — DALGA 3: CMS sayfaları (/p/:slug), ana dil TR / EN / DE.
   Merkezi okuma (gerçek çekirdek + bellek içi depo + pages.content ek
   yedeği). Dispatcher ve metadata GERÇEK; CmsPageBody'ye giden prop'lar
   kaydedilir (render bileşeni değişmedi).
   =============================================================== */

const C1 = "cccccccc-1111-4111-8111-000000000001";
const C2 = "cccccccc-1111-4111-8111-000000000002";

const h = vi.hoisted(() => ({
  ctx: { root: "tr", enabled: ["tr", "en", "de"], slugs: {}, redirects: {} } as Record<string, unknown>,
  settings: { multilingual_enabled: true, public_default_locale: "tr", public_locales: null } as Record<string, unknown>,
  pages: [] as Record<string, unknown>[],
  data: {} as Record<string, Record<string, Record<string, Record<string, unknown>>>>,
  supp: {} as Record<string, Record<string, Record<string, string | null>>>,
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
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({ requirePublicLocaleEnabled: async () => undefined }));
vi.mock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => h.settings }));
vi.mock("@/lib/storage/site-asset-version.server", () => ({
  getSiteAssetVersions: async (paths: unknown[]) =>
    Object.fromEntries((paths ?? []).filter(Boolean).map((p) => [String(p), "v1"])),
}));
vi.mock("@/app/components/cms/CmsPageBody", () => ({
  default: function CmsPageBody() {
    return null;
  },
}));
vi.mock("@/app/services/page.service", () => ({
  getPageBySlug: async (slug: string) => h.pages.find((p) => p.slug === slug) ?? null,
}));
vi.mock("@/lib/i18n/get-translation.server", async (orig) => {
  const actual = await orig<typeof import("@/lib/i18n/get-translation.server")>();
  const row = (e: string, id: string, l: string) => (l === "tr" ? undefined : h.data[e]?.[id]?.[l]);
  return {
    ...actual,
    getTranslation: async (e: string, id: string, l: string) => row(e, id, l) ?? null,
    getTranslationsForParents: async (e: string, ids: readonly string[], l: string) => {
      const m = new Map();
      for (const id of ids) if (row(e, id, l)) m.set(id, row(e, id, l));
      return m;
    },
  };
});
vi.mock("@/lib/i18n/content/content-read.server", async () => {
  const { fixtureReader } = await import("../fixtures/faz6/content-fixture");
  const r = fixtureReader(
    () => h.data as never,
    () => ({ root: h.ctx.root as never, enabled: h.ctx.enabled as never }),
    () => h.supp as never
  );
  return { getContent: r.getContent, getContentMany: r.getContentMany };
});

import type { Locale } from "@/lib/i18n/config";
import type { Metadata } from "next";
import { setRoutingContext, type RoutingContext } from "@/lib/i18n/routing/context";
import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { cmsPageRouteModule } from "@/app/(public)/_routes/cms-page";
import { buildCmsPageMetadata } from "@/app/components/cms/cms-page-metadata";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const L: Locale[] = ["tr", "en", "de"];
const ROOTS: Locale[] = ["tr", "en", "de"];
const SLUG: Record<Locale, string> = { tr: "hakkimizda", en: "about-us", de: "ueber-uns" };
const SEC = (l: Locale) => [{ type: "richtext", content: `${l} bölüm` }];
const T = (l: Locale) => ({ title: `${l} başlık`, excerpt: `${l} özet`, body: `<p>${l} gövde</p>`, seo_title: null, seo_description: `${l} meta`, sections: SEC(l) });

function setup(root: Locale, enabled: Locale[] = L) {
  h.ctx = {
    root,
    enabled,
    slugs: { page: { kurumsal: Object.fromEntries(enabled.map((l) => [l, SLUG[l]])) } },
    redirects: { page: { [root]: { "eski-sayfa": "kurumsal" } } },
  };
  h.settings = {
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
  };
  setRoutingContext(h.ctx as RoutingContext);
}
type El = { type: unknown; props: Record<string, unknown> };
const route = () => localeRouteFor("page", cmsPageRouteModule);
const props = (lang: string, slug: string) => ({ params: Promise.resolve({ lang, slug }), searchParams: Promise.resolve({}) });
async function view(lang: Locale, slug = SLUG[lang]): Promise<Record<string, unknown>> {
  const o = (await route().Page(props(lang, slug) as never)) as El;
  return ((await (o.type as (x: unknown) => unknown)(o.props)) as El).props;
}
const meta = (l: Locale, key = "kurumsal") => buildCmsPageMetadata(key, l) as Promise<Metadata>;
const alt = (m: Metadata) => m.alternates as { canonical: string; languages?: Record<string, string> };

beforeEach(() => {
  h.pages = [
    { id: C1, slug: "kurumsal", is_active: true, noindex: false, cover_image: null, content: "<p>ESKİ-CONTENT</p>", title: "BASE", body: "BASE", sections: [] },
    { id: C2, slug: "pasif", is_active: true, noindex: false, cover_image: null, content: null, title: "BASE", body: null, sections: [] },
  ];
  h.data = { page: { [C1]: { tr: T("tr"), en: T("en"), de: T("de") }, [C2]: {} } };
  h.supp = { page: { [C1]: { body: "<p>ESKİ-CONTENT</p>" }, [C2]: { body: null } } };
});

for (const root of ROOTS) {
  describe(`ana dil ${root.toUpperCase()} — CMS`, () => {
    beforeEach(() => setup(root));

    for (const l of L) {
      it(`${l}: başlık/özet/gövde/BÖLÜMLER istenen dilde; dil slug'ı → teknik anahtar; ana tablo kullanılmaz`, async () => {
        const p = await view(l);
        expect(p).toMatchObject({ locale: l, slug: "kurumsal", title: `${l} başlık`, resolvedExcerpt: `${l} özet`, body: `<p>${l} gövde</p>` });
        expect(p.resolvedSections).toEqual(SEC(l));
        const m = await meta(l);
        expect(m.title).toBe(`${l} başlık`);
        expect(m.description).toBe(`${l} meta`);
        expect(m.robots).toEqual({ index: true, follow: true });
        expect(alt(m).canonical.endsWith(`/${SLUG[l]}`)).toBe(true);
        expect(Object.keys(alt(m).languages ?? {}).sort()).toEqual([...L, "x-default"].sort());
        expect(alt(m).languages!["x-default"]).toBe(alt(m).languages![root]);
      });
    }

    it("eksik çeviri: alan bazında ana dil zinciri; noindex,follow; hreflang dışı", async () => {
      const other = L.find((x) => x !== root && x !== "tr")!;
      delete h.data.page[C1][other];
      const p = await view(other);
      expect(p.title).toBe(`${root} başlık`);
      expect(p.resolvedSections).toEqual(SEC(root));
      const m = await meta(other);
      expect(m.robots).toEqual({ index: false, follow: true });
      expect(alt(m).languages).toBeUndefined();
    });

    it("TR satırı yoksa bile pages.content (TR'nin eski gövdesi) TR'yi 'çevrili' sayar (Faz 3.1 ek yedeği; ana dil TR değilken)", async () => {
      if (root === "tr") return;
      delete h.data.page[C1].tr;
      const p = await view("tr");
      expect(p.body).toBe("<p>ESKİ-CONTENT</p>");
      expect(p.title).toBe(`${root} başlık`);
      expect((await meta("tr")).robots).toEqual({ index: true, follow: true });
    });

    it("bölümler istenen dilde geçersizse yedeğe düşer; gövde kendi dilinde kalır (alan bazında)", async () => {
      const other = L.find((x) => x !== root)!;
      h.data.page[C1][other] = { ...T(other), sections: [{ type: "bilinmeyen" }] };
      const p = await view(other);
      expect(p.body).toBe(`<p>${other} gövde</p>`);
      expect(p.resolvedSections).toEqual(SEC(root));
      expect((await meta(other)).robots).toEqual({ index: true, follow: true });
    });

    it("pages.content ek yedeği YALNIZ TR satırı için (ana dilden bağımsız); bilinçli boş gövde zinciri durdurur", async () => {
      h.data.page[C1].tr = { ...T("tr"), body: null };
      expect((await view("tr")).body).toBe("<p>ESKİ-CONTENT</p>");
      if (root !== "tr") expect((await view(root)).body).toBe(`<p>${root} gövde</p>`);
      h.data.page[C1][root] = { ...T(root), body: "" };
      const other = L.find((x) => x !== root && x !== "tr") ?? L.find((x) => x !== root)!;
      h.data.page[C1][other] = { ...T(other), body: null };
      expect((await view(other)).body).toBe(other === "tr" ? "<p>ESKİ-CONTENT</p>" : "");
    });

    it("page.noindex her dilde noindex,nofollow", async () => {
      h.pages[0] = { ...h.pages[0], noindex: true };
      for (const l of L) expect((await meta(l)).robots).toEqual({ index: false, follow: false });
    });

    it("içerik yalnız pasif dilde → BÜTÜN aktif dillerde 404 + 'bulunamadı' metadata; pasif dil öneki 404", async () => {
      const passive = L.find((x) => x !== root)!;
      setup(root, L.filter((x) => x !== passive));
      h.data.page[C2] = { [passive]: { title: "yalnız pasif", excerpt: null, body: "<p>x</p>", seo_title: null, seo_description: null, sections: null } };
      for (const l of L.filter((x) => x !== passive)) {
        await expect(view(l, "pasif")).rejects.toThrow("NEXT_NOT_FOUND");
        const m = await meta(l, "pasif");
        expect(m.title).toBe(getDictionary(l).cms.notFoundMetaTitle);
        expect(m.robots).toEqual({ index: false, follow: false });
      }
      await expect(view(passive)).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("dispatcher: başka dilin slug'ı → o dilin slug'ına 308; geçmiş 308; kayıt yoksa 404 (her dilde)", async () => {
      const [a, b] = L.filter((x) => x !== root);
      await expect(route().Page(props(a, SLUG[b]) as never)).rejects.toThrow(new RegExp(`NEXT_REDIRECT:.*/${SLUG[a]}$`));
      await expect(route().Page(props(root, "eski-sayfa") as never)).rejects.toThrow(new RegExp(`NEXT_REDIRECT:.*/${SLUG[root]}$`));
      for (const l of L) await expect(view(l, "yok-boyle")).rejects.toThrow("NEXT_NOT_FOUND");
    });
  });
}
