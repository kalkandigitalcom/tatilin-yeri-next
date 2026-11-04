/* ===============================================================
   🛡️ PUBLIC VARSAYILAN DİL — ANA SAYFA GİRİŞ DAVRANIŞI
   ===============================================================
   BUG: Admin'de "Çoklu Dil → Varsayılan Dil = Deutsch" seçilmesine ve
   `settings.public_default_locale = "de"` olarak DB'ye yazılmasına
   rağmen public "/" her zaman Türkçe açılıyordu. Kök neden:
   `app/(public)/locale-page.tsx` locale'i `"tr"` HARDCODED geçiyordu ve
   `getPublicDefaultLocale()` production'da HİÇ çağrılmıyordu.

   Bu dosya hem SAF kuralı (lib/i18n/public-home.ts) hem de iki
   sayfanın (`/` ve `/tr`) yönlendirme davranışını kilitler.

   ⚠️ EN KRİTİK SENARYO (test 10/11): varsayılan DE iken dil
   değiştiriciden TÜRKÇE seçmek kullanıcıyı tekrar DE'ye DÜŞÜRMEMELİ.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";

const redirectMock = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const getCachedSettingsMock = vi.fn();

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
  notFound: () => notFoundMock(),
}));

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => getCachedSettingsMock(),
}));

/* Ana sayfa gövdesi/metadata'sı bu testin konusu DEĞİL — render
   edilmemeleri için devre dışı bırakılır (yalnız yönlendirme kararı
   test edilir; aynı desen: public-locale-gate.test.ts). */
vi.mock("@/app/components/home/HomePageBody", () => ({
  default: () => null,
}));
vi.mock("@/app/components/home/home-metadata", () => ({
  buildHomeMetadata: async () => ({}),
}));

beforeEach(() => {
  redirectMock.mockClear();
  notFoundMock.mockClear();
  getCachedSettingsMock.mockReset();
});

const ML_OFF_DE = { multilingual_enabled: false, public_default_locale: "de" };
const ML_ON_TR = { multilingual_enabled: true, public_default_locale: "tr" };
const ML_ON_DE = { multilingual_enabled: true, public_default_locale: "de" };
const ML_ON_EN = { multilingual_enabled: true, public_default_locale: "en" };
const ML_ON_INVALID = { multilingual_enabled: true, public_default_locale: "fr" };

async function renderRoot() {
  const mod = await import("@/app/(public)/locale-page");
  return mod.default();
}

/* ---------------------------------------------------------------
   SAF KURAL — lib/i18n/public-home.ts
--------------------------------------------------------------- */
describe("resolvePublicHome (saf kural)", () => {
  it("MOD A: multilingual KAPALI → varsayılan 'de' olsa bile redirect YOK", async () => {
    const { resolvePublicHome } = await import("@/lib/i18n/public-home");
    expect(resolvePublicHome(ML_OFF_DE)).toEqual({
      defaultLocale: "tr",
      redirectsFromRoot: false,
      trHomeHref: "/",
    });
  });

  it("MOD A: multilingual AÇIK + varsayılan 'tr' → redirect YOK", async () => {
    const { resolvePublicHome } = await import("@/lib/i18n/public-home");
    expect(resolvePublicHome(ML_ON_TR).redirectsFromRoot).toBe(false);
    expect(resolvePublicHome(ML_ON_TR).trHomeHref).toBe("/");
  });

  /* 🌐 Faz 2 — ana dil kökte DOĞRUDAN render edilir; "/" artık
     yönlendirici DEĞİL. TR ana sayfa ana dil TR değilse "/tr". */
  it("ana dil 'de' → yönlendirme YOK, TR ana sayfa /tr", async () => {
    const { resolvePublicHome } = await import("@/lib/i18n/public-home");
    expect(resolvePublicHome(ML_ON_DE)).toEqual({
      defaultLocale: "de",
      redirectsFromRoot: false,
      trHomeHref: "/tr",
    });
  });

  it("MOD B: 'en' → defaultLocale 'en'", async () => {
    const { resolvePublicHome } = await import("@/lib/i18n/public-home");
    expect(resolvePublicHome(ML_ON_EN).defaultLocale).toBe("en");
  });

  it("FAIL-SAFE: geçersiz ('fr') / null / undefined → MOD A", async () => {
    const { resolvePublicHome } = await import("@/lib/i18n/public-home");
    for (const input of [ML_ON_INVALID, null, undefined, {}]) {
      const r = resolvePublicHome(input);
      expect(r.redirectsFromRoot).toBe(false);
      expect(r.defaultLocale).toBe("tr");
      expect(r.trHomeHref).toBe("/");
    }
  });

  it("DEFAULT_LOCALE hâlâ 'tr' (mimari sabiti DEĞİŞMEDİ)", async () => {
    const { DEFAULT_LOCALE } = await import("@/lib/i18n/config");
    expect(DEFAULT_LOCALE).toBe("tr");
  });
});

/* ---------------------------------------------------------------
   "/" ROUTE'U — senaryo 1-6
--------------------------------------------------------------- */
describe('"/" giriş davranışı', () => {
  it("1) multilingual=false + default=de → redirect YOK (TR render)", async () => {
    getCachedSettingsMock.mockResolvedValue(ML_OFF_DE);
    await renderRoot();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("2) multilingual=true + default=tr → redirect YOK (TR render)", async () => {
    getCachedSettingsMock.mockResolvedValue(ML_ON_TR);
    await renderRoot();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  /* 🌐 Faz 2 — "/" proxy'de ana dilin iç yoluna REWRITE edilir;
     TR ana sayfa modülü hiçbir koşulda yönlendirmez. */
  it("3) ana dil 'de' → '/' DE ana sayfaya rewrite (yönlendirme YOK)", async () => {
    getCachedSettingsMock.mockResolvedValue(ML_ON_DE);
    await expect(renderRoot()).resolves.not.toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
    const { resolveIncomingPath } = await import("@/lib/i18n/routing/url");
    expect(
      resolveIncomingPath("/", { root: "de", enabled: ["tr", "en", "de"], slugs: {} })
    ).toEqual({ type: "rewrite", path: "/de" });
  });

  it("4) ana dil 'en' → '/' EN ana sayfaya rewrite", async () => {
    const { resolveIncomingPath } = await import("@/lib/i18n/routing/url");
    expect(
      resolveIncomingPath("/", { root: "en", enabled: ["tr", "en", "de"], slugs: {} })
    ).toEqual({ type: "rewrite", path: "/en" });
  });

  it("5) settings okunamıyor → redirect YOK, sayfa ÇÖKMEZ", async () => {
    getCachedSettingsMock.mockRejectedValue(new Error("db unreachable"));
    await expect(renderRoot()).resolves.not.toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("6) geçersiz locale (default=fr) → redirect YOK (TR)", async () => {
    getCachedSettingsMock.mockResolvedValue(ML_ON_INVALID);
    await renderRoot();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------
   "/tr" ROUTE'U — tek kanonik TR ana sayfa garantisi
--------------------------------------------------------------- */
describe('"/tr" davranışı (Faz 2: proxy kuralı)', () => {
  const C = (root: "tr" | "en" | "de") => ({ root, enabled: ["tr", "en", "de"] as const, slugs: {} });

  it("ana dil 'de' → /tr TR ana sayfaya rewrite (yönlenmez)", async () => {
    const { resolveIncomingPath } = await import("@/lib/i18n/routing/url");
    expect(resolveIncomingPath("/tr", C("de"))).toEqual({ type: "rewrite", path: "/tr" });
  });

  it("çoklu dil kapalı (ana dil TR'ye düşer) → /tr, '/'ye yönlenir", async () => {
    const { resolveIncomingPath } = await import("@/lib/i18n/routing/url");
    const { getRootLocale } = await import("@/lib/i18n/config");
    const root = getRootLocale(ML_OFF_DE);
    expect(root).toBe("tr");
    expect(resolveIncomingPath("/tr", C(root))).toEqual({ type: "redirect", path: "/", status: 307 });
  });

  it("ayar okunamıyor → varsayılan bağlam (TR kök) → /tr, '/'ye yönlenir", async () => {
    const { resolveIncomingPath } = await import("@/lib/i18n/routing/url");
    const { DEFAULT_ROUTING_CONTEXT } = await import("@/lib/i18n/routing/context");
    expect(resolveIncomingPath("/tr", DEFAULT_ROUTING_CONTEXT)).toEqual({
      type: "redirect",
      path: "/",
      status: 307,
    });
  });

  it("ana dil 'tr' → /tr, '/'ye yönlenir (duplicate TR ana sayfa YOK)", async () => {
    const { resolveIncomingPath } = await import("@/lib/i18n/routing/url");
    expect(resolveIncomingPath("/tr", C("tr"))).toEqual({ type: "redirect", path: "/", status: 307 });
  });
});

/* ---------------------------------------------------------------
   7-8) /de ve /en DOĞRUDAN açıldığında BAŞKA YERE YÖNLENMEZ
   ---------------------------------------------------------------
   Bu sayfaların page.tsx'lerine DOKUNULMADI; test o sözleşmeyi
   kilitler (varsayılan dil ne olursa olsun kendi locale'lerinde
   kalırlar; tek gate `requirePublicLocaleEnabled`).
--------------------------------------------------------------- */
describe("/de ve /en doğrudan erişim", () => {
  it("7) multilingual AÇIK + varsayılan 'en' iken /de yönlenmez", async () => {
    getCachedSettingsMock.mockResolvedValue(ML_ON_EN);
    const mod = await import("@/app/(public)/de/locale-page");
    await expect(mod.default()).resolves.not.toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("8) multilingual AÇIK + varsayılan 'de' iken /en yönlenmez", async () => {
    getCachedSettingsMock.mockResolvedValue(ML_ON_DE);
    const mod = await import("@/app/(public)/en/locale-page");
    await expect(mod.default()).resolves.not.toThrow();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("multilingual KAPALI iken /de hâlâ 404 (mevcut gate DEĞİŞMEDİ)", async () => {
    getCachedSettingsMock.mockResolvedValue(ML_OFF_DE);
    const mod = await import("@/app/(public)/de/locale-page");
    await expect(mod.default()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
