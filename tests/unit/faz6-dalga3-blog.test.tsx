import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type React from "react";

/* ===============================================================
   Faz 6 — DALGA 3: BLOG listeleme + detay, ana dil TR / EN / DE.
   Merkezi okuma (gerçek çekirdek + bellek içi depo). Gövde ve metadata
   GERÇEK; dispatcher GERÇEK (dil slug'ı, 308, pasif dil).
   =============================================================== */

const P1 = "aaaaaaaa-1111-4111-8111-000000000001"; // tam çeviri
const P2 = "aaaaaaaa-1111-4111-8111-000000000002"; // yalnız TR (EN/DE yedek)
const P3 = "aaaaaaaa-1111-4111-8111-000000000003"; // EN kısmi (yalnız başlık)

const h = vi.hoisted(() => ({
  ctx: { root: "tr", enabled: ["tr", "en", "de"], slugs: {}, redirects: {} } as Record<string, unknown>,
  settings: { multilingual_enabled: true, public_default_locale: "tr", public_locales: null } as Record<string, unknown>,
  posts: [] as Record<string, unknown>[],
  data: {} as Record<string, Record<string, Record<string, Record<string, string | null>>>>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ push: () => {} }),
}));
vi.mock("next/image", () => ({
  default: (p: Record<string, unknown>) => <span data-img={String(p.src)} aria-label={String(p.alt)} />,
}));
/* PageHero async server bileşeni (jsdom'da render edilmez) → bütün
   prop'larını yazan senkron sahte; böylece başlık/özet/breadcrumb DOM'da. */
vi.mock("@/app/components/ui/PageHero", () => ({
  default: (p: { breadcrumb?: { name: string; href?: string }[]; eyebrow?: string; title?: string; description?: string }) => (
    <header data-hero>
      <nav>{(p.breadcrumb ?? []).map((b, i) => <a key={i} href={b.href ?? "#"}>{b.name}</a>)}</nav>
      <small>{p.eyebrow}</small>
      <h1>{p.title}</h1>
      <p>{p.description}</p>
    </header>
  ),
}));
vi.mock("@/lib/i18n/routing/context.server", () => ({ primeRoutingContext: async () => h.ctx }));
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({ requirePublicLocaleEnabled: async () => undefined }));
vi.mock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => h.settings }));
vi.mock("@/lib/storage/site-asset-version.server", () => ({ getSiteAssetVersions: async () => ({}) }));
vi.mock("@/app/services/blog.service", () => ({
  getBlogPosts: async () => h.posts,
  getBlogPostBySlug: async (slug: string) => h.posts.find((p) => p.slug === slug) ?? null,
}));
/* Eski okuyucu: EN/DE satırları fikstürden; TR'de satır yok (ana tablo). */
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
/* Merkezi servis: GERÇEK çekirdek + bellek içi depo. */
vi.mock("@/lib/i18n/content/content-read.server", async () => {
  const { fixtureReader } = await import("../fixtures/faz6/content-fixture");
  const r = fixtureReader(
    () => h.data as never,
    () => ({ root: h.ctx.root as never, enabled: h.ctx.enabled as never })
  );
  return { getContent: r.getContent, getContentMany: r.getContentMany };
});

import type { Locale } from "@/lib/i18n/config";
import type { Metadata } from "next";
import { setRoutingContext, type RoutingContext } from "@/lib/i18n/routing/context";
import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { blogIndexRouteModule, blogPostRouteModule } from "@/app/(public)/_routes/blog";
import BlogIndexPageBody from "@/app/components/blog/BlogIndexPageBody";
import BlogDetailPageBody from "@/app/components/blog/BlogDetailPageBody";
import { buildBlogDetailMetadata } from "@/app/components/blog/blog-metadata";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const L: Locale[] = ["tr", "en", "de"];
const ROOTS: Locale[] = ["tr", "en", "de"];
const SLUG: Record<Locale, string> = { tr: "yazi-bir", en: "post-one", de: "beitrag-eins" };
const T = (l: Locale) => ({ title: `${l} başlık`, excerpt: `${l} özet`, body: `<p>${l} gövde</p>`, seo_title: `${l} seo`, seo_description: `${l} meta` });
const post = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
  id, slug, is_active: true, noindex: false, category: "Rehber", author: "Ekip",
  published_at: "2026-05-01T10:00:00Z", updated_at: "2026-05-02T10:00:00Z",
  cover_image: null, og_image: null, title: "BASE-TR", excerpt: "BASE-TR", body: "BASE-TR",
  seo_title: null, seo_description: null, ...extra,
});

function setup(root: Locale, enabled: Locale[] = L) {
  h.ctx = {
    root,
    enabled,
    slugs: { blog: { "yazi-1": Object.fromEntries(enabled.map((l) => [l, SLUG[l]])) } },
    redirects: { blog: { [root]: { "eski-yazi": "yazi-1" } } },
  };
  h.settings = {
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
  };
  setRoutingContext(h.ctx as RoutingContext);
}
const html = (el: unknown) => render(el as React.ReactElement).container.innerHTML;
const detail = (l: Locale, slug = "yazi-1") => BlogDetailPageBody({ params: Promise.resolve({ slug }), locale: l });
const meta = (l: Locale, slug = "yazi-1") => buildBlogDetailMetadata(Promise.resolve({ slug }), l) as Promise<Metadata>;
const alt = (m: Metadata) => m.alternates as { canonical: string; languages?: Record<string, string> };

beforeEach(() => {
  h.posts = [post(P1, "yazi-1"), post(P2, "yazi-2"), post(P3, "yazi-3")];
  h.data = {
    blog_post: {
      [P1]: { tr: T("tr"), en: T("en"), de: T("de") },
      [P2]: { tr: { title: "yalnız tr", excerpt: null, body: "<p>yalnız tr gövde</p>", seo_title: null, seo_description: null } },
      [P3]: { de: { title: "yalnız de", excerpt: null, body: null, seo_title: null, seo_description: null } },
    },
  };
});

for (const root of ROOTS) {
  describe(`ana dil ${root.toUpperCase()} — blog`, () => {
    beforeEach(() => setup(root));

    for (const l of L) {
      it(`${l}: detay istenen dilde; yayın tarihi/kategori aynen; ana tablo (TR) kolonu kullanılmaz`, async () => {
        const out = html(await detail(l));
        expect(out).toContain(`${l} başlık`);
        expect(out).toContain(`${l} gövde`);
        expect(out).toContain("Rehber");
        expect(out).toContain('"datePublished":"2026-05-01T10:00:00Z"');
        expect(out).not.toContain("BASE-TR");
        const m = await meta(l);
        expect(m.title).toBe(`${l} seo`);
        expect(m.description).toBe(`${l} meta`);
        expect(m.robots).toBeUndefined();
        expect(alt(m).canonical.endsWith(`/${SLUG[l]}`)).toBe(true);
        expect(Object.keys(alt(m).languages ?? {}).sort()).toEqual([...L, "x-default"].sort());
        expect(alt(m).languages!["x-default"]).toBe(alt(m).languages![root]);
      });
    }

    it("eksik çeviri: ana dil zinciri + noindex,follow + hreflang dışı (canonical kendi URL'si)", async () => {
      const other = L.find((x) => x !== root)!;
      delete h.data.blog_post[P1][other];
      const out = html(await detail(other));
      expect(out).toContain(`${root} başlık`);
      const m = await meta(other);
      expect(m.robots).toEqual({ index: false, follow: true });
      expect(alt(m).languages).toBeUndefined();
      expect(alt(m).canonical.endsWith(`/${SLUG[other]}`)).toBe(true);
      /* Çevrili dilde hreflang yalnız çevrili diller. */
      const mr = await meta(root);
      expect(Object.keys(alt(mr).languages ?? {}).sort()).toEqual(
        [...L.filter((x) => x !== other), "x-default"].sort()
      );
    });

    it("ana dilde bilinçli boş gövde zinciri durdurur (Faz 5): diğer dilde de gövde boş; özet gösterilir", async () => {
      const other = L.find((x) => x !== root)!;
      h.data.blog_post[P1][root] = { ...T(root), body: "" };
      h.data.blog_post[P1][other] = { title: `${other} başlık`, excerpt: null, body: null, seo_title: null, seo_description: null };
      const out = html(await detail(other));
      expect(out).not.toContain(`${root} gövde`);
      expect(out).toContain(`${root} özet`);
    });

    it("hiçbir aktif dilde içerik yok → 404 + metadata 'bulunamadı' noindex; listede yok", async () => {
      const passive = root === "de" ? "en" : "de";
      setup(root, L.filter((x) => x !== passive));
      h.data.blog_post[P3] = { [passive]: { title: "yalnız pasif", excerpt: null, body: "<p>x</p>", seo_title: null, seo_description: null } };
      const asked = root;
      await expect(detail(asked, "yazi-3")).rejects.toThrow("NEXT_NOT_FOUND");
      const m = await meta(asked, "yazi-3");
      expect(m.title).toBe(getDictionary(asked).blog.detailNotFoundTitle);
      expect(m.robots).toEqual({ index: false, follow: false });
      const list = html(await BlogIndexPageBody({ locale: asked }));
      expect(list).not.toContain("yalnız pasif");
      expect(list).not.toContain("/yazi-3");
    });

    it("post.noindex her dilde noindex,nofollow", async () => {
      h.posts[0] = post(P1, "yazi-1", { noindex: true });
      for (const l of L) expect((await meta(l)).robots).toEqual({ index: false, follow: false });
    });

    it("liste: yayın sırası korunur; başlıklar istenen dilde / zincirde; tek batch", async () => {
      for (const l of L) {
        const out = html(await BlogIndexPageBody({ locale: l }));
        const i1 = out.indexOf(`${l} başlık`);
        const i2 = out.indexOf("yalnız tr");
        expect(i1).toBeGreaterThan(-1);
        if (root === "tr" || l === "tr") expect(i2).toBeGreaterThan(i1);
      }
    });

    it("dispatcher: dil slug'ı → teknik anahtar; başka dilin slug'ı 308; geçmiş 308; pasif dil 404", async () => {
      const r = localeRouteFor("blogPost", blogPostRouteModule);
      const p = (lang: string, slug: string) => ({ params: Promise.resolve({ lang, slug }), searchParams: Promise.resolve({}) });
      for (const l of L) {
        const outer = (await r.Page(p(l, SLUG[l]) as never)) as { type: (x: unknown) => unknown; props: Record<string, unknown> };
        const el = (await outer.type(outer.props)) as { props: { params: Promise<{ slug: string }>; locale: Locale } };
        expect(await el.props.params).toEqual({ slug: "yazi-1" });
        expect(el.props.locale).toBe(l);
      }
      const [a, b] = L.filter((x) => x !== root);
      await expect(r.Page(p(a, SLUG[b]) as never)).rejects.toThrow(new RegExp(`NEXT_REDIRECT:.*/${SLUG[a]}$`));
      await expect(r.Page(p(root, "eski-yazi") as never)).rejects.toThrow(new RegExp(`NEXT_REDIRECT:.*/${SLUG[root]}$`));
      setup(root, L.filter((x) => x !== a));
      await expect(r.Page(p(a, SLUG[a]) as never)).rejects.toThrow("NEXT_NOT_FOUND");
      const idx = localeRouteFor("blog", blogIndexRouteModule);
      await expect(idx.Page({ params: Promise.resolve({ lang: a }), searchParams: Promise.resolve({}) } as never)).rejects.toThrow("NEXT_NOT_FOUND");
    });
  });
}
