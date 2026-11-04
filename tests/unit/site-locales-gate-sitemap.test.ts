/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 1 — kapalı dil: GATE (404) + SITEMAP
   =============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const getCachedSettingsMock = vi.fn();
const listPublicSlugsMock = vi.fn();
const findActivePagesMock = vi.fn();
const findActiveSlugsMock = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...a: unknown[]) => getCachedSettingsMock(...a),
  getCachedVillaTypes: async () => [],
  getCachedVillaLocations: async () => [],
}));
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    listPublicSlugs: (...a: unknown[]) => listPublicSlugsMock(...a),
  },
}));
vi.mock("@/lib/db/pages.repository", () => ({
  pagesRepository: {
    findActivePages: (...a: unknown[]) => findActivePagesMock(...a),
  },
}));
vi.mock("@/lib/db/blog.repository", () => ({
  blogRepository: {
    findActiveSlugs: (...a: unknown[]) => findActiveSlugsMock(...a),
  },
}));

type L = "tr" | "en" | "de";
function settings(enabled: L[] | null, multilingual = true, root: L = "tr") {
  return {
    multilingual_enabled: multilingual,
    public_default_locale: root,
    ...(enabled
      ? {
          public_locales: (["tr", "en", "de"] as L[]).map((code, i) => ({
            code,
            is_enabled: enabled.includes(code),
            sort_order: (i + 1) * 10,
          })),
        }
      : {}),
  };
}

beforeEach(() => {
  vi.resetModules();
  notFoundMock.mockClear();
  getCachedSettingsMock.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
  listPublicSlugsMock.mockResolvedValue([
    { slug: "villa-in-love", created_at: "2024-01-01T00:00:00.000Z" },
  ]);
  findActivePagesMock.mockResolvedValue({
    data: [{ slug: "hakkimizda", created_at: "2024-01-01T00:00:00.000Z" }],
    error: null,
  });
  findActiveSlugsMock.mockResolvedValue({
    data: [{ slug: "ilk-yazi", published_at: "2024-01-01T00:00:00.000Z", updated_at: null }],
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requirePublicLocaleEnabled(locale)", () => {
  async function gate() {
    return (await import("@/lib/i18n/public-locale-gate.server"))
      .requirePublicLocaleEnabled;
  }

  it("üç dil açık → en/de geçer", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr", "en", "de"]));
    const g = await gate();
    await expect(g("en")).resolves.toBeUndefined();
    await expect(g("de")).resolves.toBeUndefined();
  });

  it("EN kapalı → /en/* 404, /de/* açık", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr", "de"]));
    const g = await gate();
    await expect(g("en")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(g("de")).resolves.toBeUndefined();
  });

  it("yalnız ana dil → en ve de 404", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr"]));
    const g = await gate();
    await expect(g("en")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(g("de")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("çoklu dil kapalı → hepsi 404 (eski davranış), locale'siz çağrı da 404", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr", "en", "de"], false));
    const g = await gate();
    await expect(g("en")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(g()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("migration öncesi (public_locales yok) + açık → geçer (eski davranış)", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(null));
    const g = await gate();
    await expect(g("en")).resolves.toBeUndefined();
  });

  it("ana dil DE (MOD B) + EN kapalı → de geçer, en 404", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr", "de"], true, "de"));
    const g = await gate();
    await expect(g("de")).resolves.toBeUndefined();
    await expect(g("en")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("sitemap() — kapalı dil hreflang'de görünmez", () => {
  async function run() {
    return (await import("@/app/sitemap")).default();
  }
  type Entry = { url: string; alternates?: { languages?: Record<string, string> } };

  it("DE kapalı → hiçbir entry'de 'de' alternate yok, TR loc'lar aynen", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr", "en"]));
    const entries = (await run()) as Entry[];
    expect(entries.length).toBeGreaterThan(3);
    for (const e of entries) {
      expect(e.url.includes("/de/")).toBe(false);
      if (e.alternates?.languages) {
        expect(Object.keys(e.alternates.languages)).not.toContain("de");
        expect(Object.keys(e.alternates.languages)).toContain("en");
      }
    }
    const villa = entries.find((e) => e.url === "https://example.com/kiralik-villa/villa-in-love");
    expect(villa?.alternates?.languages).toEqual({
      tr: "https://example.com/kiralik-villa/villa-in-love",
      en: "https://example.com/en/villa/villa-in-love",
      "x-default": "https://example.com/kiralik-villa/villa-in-love",
    });
  });

  it("yalnız ana dil açık → hiçbir entry'de alternates yok", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr"]));
    const entries = (await run()) as Entry[];
    expect(entries.every((e) => !e.alternates)).toBe(true);
  });

  it("üç dil açık → eski çıktı (tr/en/de/x-default)", async () => {
    getCachedSettingsMock.mockResolvedValue(settings(["tr", "en", "de"]));
    const entries = (await run()) as Entry[];
    const villa = entries.find((e) => e.url === "https://example.com/kiralik-villa/villa-in-love");
    expect(Object.keys(villa?.alternates?.languages ?? {})).toEqual(["tr", "en", "de", "x-default"]);
  });
});
