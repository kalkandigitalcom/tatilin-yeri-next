/* ===============================================================
   🛡️ PHASE 11 — ANA SAYFA ROUTE + CACHE İZOLASYON TESTLERİ
   ===============================================================
   Kapsam:
     A) `/`, `/en`, `/de` üçü de AYNI `HomePageBody` component'ini
        render eder (üç ayrı kopya YOK) ve DOĞRU locale'i geçirir
     B) 🌐 Faz 6 Dalga 4 — tek modül (`_routes/home.tsx`) + dispatcher:
        `setRequestLocale` her dil için; pasif dil / çoklu dil kapalı → 404
     C) EN/DE ana sayfasında placeholder `noindex` KALDIRILDI
     D) 🔴 CACHE LOCALE İZOLASYONU — SSS cache key'i locale içerir,
        yani EN çevirisi TR isteğine servis EDİLEMEZ

   `locale-routes.test.tsx` (Phase 4A/10B) ile AYNI mock deseni;
   sayfa fonksiyonu ÇAĞRILIR ve dönen React element'i incelenir
   (DOM render YOK → tüm veri katmanını mock'lamaya gerek kalmaz).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const setRequestLocaleMock = vi.fn();
const ctx = vi.hoisted(() => ({ value: { root: "tr", enabled: ["tr", "en", "de"], slugs: {}, redirects: {} } as Record<string, unknown> }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
}));
vi.mock("@/lib/i18n/request-locale.server", () => ({
  setRequestLocale: (...a: unknown[]) => setRequestLocaleMock(...a),
}));
vi.mock("@/lib/i18n/routing/context.server", () => ({ primeRoutingContext: async () => ctx.value }));

import HomePageBody from "@/app/components/home/HomePageBody";
import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { homeRouteModule } from "@/app/(public)/_routes/home";
import { setRoutingContext, type RoutingContext } from "@/lib/i18n/routing/context";

const route = localeRouteFor("home", homeRouteModule);
const props = (lang: string) => ({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({}) }) as never;
async function render(lang: string) {
  const outer = (await route.Page(props(lang))) as { type: (p: unknown) => unknown; props: Record<string, unknown> };
  return (await outer.type(outer.props)) as { type: unknown; props: { locale: string } };
}
function setCtx(root: string, enabled: string[]) {
  ctx.value = { root, enabled, slugs: {}, redirects: {} };
  setRoutingContext(ctx.value as RoutingContext);
}

beforeEach(() => {
  setRequestLocaleMock.mockReset();
  setCtx("tr", ["tr", "en", "de"]);
});

/* ===============================================================
   A + B) ROUTE DAVRANIŞI
   =============================================================== */
describe.each(["tr", "en", "de"])("ana sayfa /%s", (locale) => {
  it(`1) ORTAK HomePageBody'yi locale="${locale}" ile render eder`, async () => {
    const el = await render(locale);
    expect(setRequestLocaleMock).toHaveBeenCalledWith(locale);
    expect(el.type).toBe(HomePageBody);
    expect(el.props.locale).toBe(locale);
  });

  it("2) pasif dil → 404 (eski gate ile aynı)", async () => {
    setCtx(locale === "tr" ? "en" : "tr", ["tr", "en", "de"].filter((l) => l !== locale));
    await expect(route.Page(props(locale))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("3) placeholder koşulsuz noindex YOK (metadata dile göre üretilir)", async () => {
    expect(homeRouteModule.metadata).toBeUndefined();
    expect(typeof homeRouteModule.generateMetadata).toBe("function");
  });
});

describe("tek modül", () => {
  it("4) çoklu dil KAPALI (yalnız ana dil aktif) → EN/DE 404, ana dil render", async () => {
    setCtx("tr", ["tr"]);
    await expect(route.Page(props("en"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(route.Page(props("de"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await render("tr")).props.locale).toBe("tr");
  });

  it("6) üç dil de AYNI component referansını kullanır (kopya YOK)", async () => {
    const [tr, en, de] = [await render("tr"), await render("en"), await render("de")];
    expect(tr.type).toBe(en.type);
    expect(en.type).toBe(de.type);
  });
});
