/* ===============================================================
   🌐 FAZ 3 — DİNAMİK <html lang> (çoklu root layout)
   ===============================================================
   ÖNCEKİ DURUM (Phase 7E kilidi): tek root layout (`app/layout.tsx`)
   dil parametresini bilemediği için <html lang="tr"> TÜM sayfalarda
   sabitti; bu dosya o sabitliği kilitliyordu. Phase 7E notunun
   öngördüğü çözüm (`[locale]` dinamik segmentinin root layout'un
   ÜSTÜNDE olması) Faz 2'de kuruldu (`app/(public)/[lang]`).

   FAZ 3: public ağacın ROOT layout'u `app/(public)/[lang]/layout.tsx`
   → <html lang> sayfanın gerçek dili; admin ağacının root layout'u
   `app/(admin)/layout.tsx` → <html lang="tr">. `headers()` KULLANILMAZ
   (statik/ISR korunur).

   `next/font/google` ham Vitest'te çalışmadığı için YEREL mock'lanır.
   =============================================================== */

import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => Promise.resolve(null),
}));
vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "--font-outfit" }),
  Inter: () => ({ variable: "--font-inter" }),
  Fraunces: () => ({ variable: "--font-fraunces" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
vi.mock("@/app/(public)/_shell/PublicShell", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

type El = { type: unknown; props: { lang?: string; children?: unknown } };

async function renderLocaleLayout(lang: string): Promise<El> {
  const mod = await import("@/app/(public)/[lang]/layout");
  const doc = (await mod.default({
    children: null,
    params: Promise.resolve({ lang }),
  })) as El;
  /* <RootDocument lang=…> → fonksiyon bileşeni; çağırıp <html>'i al. */
  return (doc.type as (p: unknown) => El)(doc.props);
}

describe("A) <html lang> sayfanın gerçek dili", () => {
  it.each([
    ["tr", "tr"],
    ["en", "en"],
    ["de", "de"],
  ])("/[lang]=%s → <html lang=\"%s\">", async (lang, expected) => {
    const html = await renderLocaleLayout(lang);
    expect(html.type).toBe("html");
    expect(html.props.lang).toBe(expected);
  });

  it("geçersiz dil parametresi → varsayılan 'tr' (fail-safe)", async () => {
    const html = await renderLocaleLayout("xx");
    expect(html.props.lang).toBe("tr");
  });

  it("admin root layout'u <html lang=\"tr\">", () => {
    const src = readFileSync(join(process.cwd(), "app/(admin)/layout.tsx"), "utf8");
    expect(src).toContain('<RootDocument lang="tr">');
  });

  it("tek root layout (app/layout.tsx) KALDIRILDI; global 404 ayrı", () => {
    expect(existsSync(join(process.cwd(), "app/layout.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "app/global-not-found.tsx"))).toBe(true);
    const cfg = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(cfg).toMatch(/globalNotFound:\s*true/);
  });

  it("root layout'lar headers()/cookies() KULLANMAZ (ISR korunur)", () => {
    for (const f of [
      "app/(public)/[lang]/layout.tsx",
      "app/(admin)/layout.tsx",
      "app/_root/root-document.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(src, f).not.toMatch(/\bheaders\(\)|\bcookies\(\)/);
    }
  });
});

describe("B) og:locale + og:locale:alternate", () => {
  it("layout metadata: dilin og:locale'i + yalnız aktif diğer diller", async () => {
    vi.resetModules();
    vi.doMock("@/lib/cache.helpers", () => ({
      getCachedSettings: () =>
        Promise.resolve({
          multilingual_enabled: true,
          public_default_locale: "tr",
          public_locales: [
            { code: "tr", is_enabled: true, sort_order: 10 },
            { code: "en", is_enabled: true, sort_order: 20 },
            { code: "de", is_enabled: false, sort_order: 30 },
          ],
        }),
    }));
    const mod = await import("@/app/(public)/[lang]/layout");
    const md = await mod.generateMetadata({ params: Promise.resolve({ lang: "en" }) });
    expect(md.openGraph).toMatchObject({ locale: "en_US", alternateLocale: ["tr_TR"] });
  });

  it("sayfa kendi openGraph'ını verirse dispatcher aynı alanları ekler", async () => {
    const { withOpenGraphLocale } = await import("@/lib/i18n/routing/locale-route");
    const md = withOpenGraphLocale({ openGraph: { title: "X" } }, "de", ["tr", "en", "de"]);
    expect(md.openGraph).toEqual({ title: "X", locale: "de_DE", alternateLocale: ["tr_TR", "en_US"] });
    expect(withOpenGraphLocale({ title: "Y" }, "de", ["tr", "de"])).toEqual({ title: "Y" });
  });
});
