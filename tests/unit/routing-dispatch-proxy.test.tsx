/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 2 — dispatcher, proxy, slug doğrulama
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  ctx: {
    root: "tr",
    enabled: ["tr", "en", "de"],
    slugs: { villa: { "deniz-villa": { en: "sea-villa" } } },
  } as {
    root: "tr" | "en" | "de";
    enabled: ("tr" | "en" | "de")[];
    slugs: Record<string, Record<string, Record<string, string>>>;
  },
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
vi.mock("@/lib/i18n/routing/context.server", () => ({
  primeRoutingContext: async () => h.ctx,
}));

import { localeRoute } from "@/lib/i18n/routing/locale-route";
import { checkLocalizedSlugFormat, normalizeLocalizedSlug } from "@/lib/i18n/routing/slug-validation";
import { rowsToSlugMap } from "@/lib/i18n/routing/slug-map.server";

function mod(name: string) {
  const seen: Record<string, string>[] = [];
  return {
    seen,
    module: {
      default: async ({ params }: { params: Promise<Record<string, string>> }) => {
        seen.push(await params);
        return name;
      },
      generateMetadata: async ({ params }: { params: Promise<Record<string, string>> }) => ({
        title: `${name}:${(await params).slug ?? ""}`,
      }),
    },
  };
}

function props(params: Record<string, string>, sp: Record<string, string> = {}) {
  return { params: Promise.resolve(params), searchParams: Promise.resolve(sp) };
}

beforeEach(() => {
  h.notFound.mockClear();
  h.permanentRedirect.mockClear();
  h.ctx = {
    root: "tr",
    enabled: ["tr", "en", "de"],
    slugs: { villa: { "deniz-villa": { en: "sea-villa" } } },
  };
});

describe("localeRoute dispatcher", () => {
  it("doğru dilin MEVCUT modülünü render eder; dil slug'ı TABAN slug'a çevrilir", async () => {
    const tr = mod("tr"), en = mod("en"), de = mod("de");
    const r = localeRoute("villa", { tr: tr.module, en: en.module, de: de.module });
    const el = (await r.Page(props({ lang: "en", slug: "sea-villa" }))) as { type: (p: unknown) => Promise<string>; props: unknown };
    expect(await el.type(el.props)).toBe("en");
    expect(en.seen).toEqual([{ slug: "deniz-villa" }]);
    expect((await r.generateMetadata(props({ lang: "en", slug: "sea-villa" }))).title).toBe("en:deniz-villa");
  });

  it("TR modülü TR slug'ıyla (bugünkü davranış)", async () => {
    const tr = mod("tr"), en = mod("en"), de = mod("de");
    const r = localeRoute("villa", { tr: tr.module, en: en.module, de: de.module });
    const el = (await r.Page(props({ lang: "tr", slug: "deniz-villa" }))) as { type: (p: unknown) => Promise<string>; props: unknown };
    expect(await el.type(el.props)).toBe("tr");
    expect(tr.seen).toEqual([{ slug: "deniz-villa" }]);
  });

  it("EN URL'sinde TR slug'ı → 308 kanonik EN slug'ı (query korunur)", async () => {
    const m = mod("x");
    const r = localeRoute("villa", { tr: m.module, en: m.module, de: m.module });
    await expect(r.Page(props({ lang: "en", slug: "deniz-villa" }, { start: "2026-07-01" }))).rejects.toThrow(
      "NEXT_REDIRECT:/en/villa/sea-villa?start=2026-07-01"
    );
  });

  it("kapalı dil → 404; desteklenmeyen dil → 404", async () => {
    h.ctx = { ...h.ctx, enabled: ["tr", "de"] };
    const m = mod("x");
    const r = localeRoute("villas", { tr: m.module, en: m.module, de: m.module });
    await expect(r.Page(props({ lang: "en" }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(r.Page(props({ lang: "fr" }))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(r.Page(props({ lang: "de" }))).resolves.toBeTruthy();
  });

  it("statik metadata (export const metadata) olan modül desteklenir", async () => {
    const r = localeRoute("favorites", {
      tr: { default: () => null, metadata: { title: "TR" } },
      en: { default: () => null, metadata: { title: "EN" } },
      de: { default: () => null, metadata: { title: "DE" } },
    });
    expect((await r.generateMetadata(props({ lang: "de" }))).title).toBe("DE");
  });
});

describe("slug biçimi + harita", () => {
  it("normalize: Türkçe/Almanca harfler, boşluk, büyük harf", () => {
    expect(normalizeLocalizedSlug("  Deniz Manzaralı Villa ")).toBe("deniz-manzarali-villa");
    expect(normalizeLocalizedSlug("Große Straße")).toBe("grosse-strasse");
    expect(normalizeLocalizedSlug("İstanbul Işık")).toBe("istanbul-isik");
  });
  it("biçim kontrolü: boş → null, geçersiz → hata, ayrılmış → hata", () => {
    expect(checkLocalizedSlugFormat("villa", "")).toEqual({ ok: true, slug: null });
    expect(checkLocalizedSlugFormat("villa", "sea-view")).toEqual({ ok: true, slug: "sea-view" });
    expect(checkLocalizedSlugFormat("villa", "a/b").ok).toBe(false);
    expect(checkLocalizedSlugFormat("villa", "success").ok).toBe(false);
    expect(checkLocalizedSlugFormat("blog", "x".repeat(161)).ok).toBe(false);
  });
  it("rowsToSlugMap: TR ve bilinmeyen diller atılır", () => {
    expect(
      rowsToSlugMap([
        { kind: "villa", base: "a", locale: "en", slug: "a-en" },
        { kind: "villa", base: "a", locale: "de", slug: "a-de" },
        { kind: "blog", base: "b", locale: "tr", slug: "x" },
        { kind: "blog", base: "b", locale: "fr", slug: "y" },
      ])
    ).toEqual({ villa: { a: { en: "a-en", de: "a-de" } } });
  });
});

describe("proxy.ts", () => {
  it("public istekleri rewrite/redirect eder; admin kapısı ayrı", async () => {
    vi.resetModules();
    vi.doMock("@/lib/i18n/routing/proxy-config", () => ({
      getProxyRoutingContext: async () => ({ root: "tr", enabled: ["tr", "en", "de"], slugs: {} }),
    }));
    vi.doMock("@/lib/auth/native/jwt", () => ({
      verifyAccessToken: async () => ({ ok: false, reason: "invalid" }),
    }));
    const { proxy, config } = await import("@/proxy");
    const { NextRequest } = await import("next/server");

    const rw = await proxy(new NextRequest("https://x.test/en/villas-for-rent?page=2"));
    expect(rw.headers.get("x-middleware-rewrite")).toBe("https://x.test/en/kiralik-villalar?page=2");

    const rd = await proxy(new NextRequest("https://x.test/en/kiralik-villalar?page=2"));
    expect(rd.status).toBe(308);
    expect(rd.headers.get("location")).toBe("https://x.test/en/villas-for-rent?page=2");

    const admin = await proxy(new NextRequest("https://x.test/maki-admin/villas"));
    expect(admin.status).toBe(307);
    expect(admin.headers.get("location")).toContain("/maki-admin/login");

    expect(config.matcher).toContain("/maki-admin/:path*");
  });
});
