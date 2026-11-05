import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

/* ===============================================================
   Faz 6 — DALGA 4 / A4: ORTAK BİLEŞENLER (header, footer, popup,
   iletişim çalışma saatleri). Ana dil TR / EN / DE; pasif dil.
   Merkezi okuma: tablo tabanlı sahte (gerçek alan kuralları).
   =============================================================== */

const h = vi.hoisted(() => ({
  path: "/",
  settings: {} as Record<string, unknown>,
  menu: [] as Record<string, unknown>[],
  types: [] as Record<string, unknown>[],
  pages: [] as Record<string, unknown>[],
  settingsRows: {} as Record<string, Record<string, unknown>>,
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));
vi.mock("next/navigation", () => ({ usePathname: () => h.path, useRouter: () => ({ push: () => {} }) }));
vi.mock("@/app/components/layout/TopBar", () => ({ default: () => null }));
vi.mock("@/app/components/layout/VillaSearchBox", () => ({ default: () => null }));
vi.mock("@/app/components/favorites/HeaderFavoritesLink", () => ({ default: () => null }));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: async () => h.settings,
  getCachedMenu: async () => h.menu,
}));
vi.mock("@/lib/db/menu.repository", () => ({
  menuRepository: {
    findAllVillaLocations: async () => ({ data: [{ id: "loc-1", name: "Kalkan", slug: "kalkan" }] }),
    findAllVillaTypes: async () => ({ data: h.types }),
  },
}));
vi.mock("@/lib/db/pages.repository", () => ({ pagesRepository: { findActivePages: async () => ({ data: h.pages }) } }));
vi.mock("@/lib/storage/site-asset-version.server", () => ({ getSiteAssetVersion: async () => null }));
vi.mock("@/app/components/ui/PageHero", () => ({ default: (p: { title?: string }) => <h1>{p.title}</h1> }));
vi.mock("@/lib/i18n/content/content-read.server", async () => {
  const m = (await import("../fixtures/faz6/content-table-mock")).contentReadServerMock();
  return { ...m, getAllLocales: async (e: string) => (e === "settings" ? structuredClone(h.settingsRows) : {}) };
});

import type { Locale } from "@/lib/i18n/config";
import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
import FooterWrapper from "@/app/components/layout/FooterWrapper";
import ContactPageBody from "@/app/components/contact/ContactPageBody";
import { contentCtx, contentTables, resetContentTables } from "../fixtures/faz6/content-table-mock";
import { setRoutingContext, type RoutingContext } from "@/lib/i18n/routing/context";
import { localizeSitePopup, toPublicSitePopup, type SitePopupRow, type SitePopupTranslationRow } from "@/lib/site-popup";

const L: Locale[] = ["tr", "en", "de"];
const pathOf = (l: Locale, root: Locale) => (l === root ? "/" : `/${l}`);

function setup(root: Locale, enabled: Locale[] = L) {
  resetContentTables();
  contentCtx.root = root;
  contentCtx.enabled = [...enabled];
  /* İstemci bileşenleri dili yoldan + yönlendirme bağlamından türetir. */
  setRoutingContext({ root, enabled, slugs: {}, redirects: {} } as unknown as RoutingContext);
  h.settings = {
    id: "s-1",
    site_name: "Tatilin Yeri",
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
    footer_copyright: "© {year} TR telif",
    business_hours: "TR saatler",
  };
}

beforeEach(() => {
  h.menu = [
    { id: "m1", name: "Kiralık Villalar", href: "/kiralik-villalar", source_type: "manual", source_id: null,
      children: [{ id: "m2", name: "Alt Menü", href: "/alt", source_type: "manual", source_id: null }] },
    { id: "m3", name: "Lüks", href: "/arama?villa-turleri=luks", source_type: "category", source_id: "t1" },
    { id: "m4", name: "Hakkımızda", href: "/p/hakkimizda", source_type: "page", source_id: "p1" },
    { id: "m5", name: "Kalkan", href: "/arama?bolgeler=kalkan", source_type: "region", source_id: "loc-1" },
  ];
  h.types = Array.from({ length: 9 }, (_, i) => ({ id: `t${i + 1}`, name: `TR Tip ${i + 1}`, slug: `tip-${i + 1}` }));
  h.pages = [
    { id: "p1", title: "Hakkımızda", slug: "hakkimizda", menu_order: 1 },
    { id: "p2", title: "Gizlilik", slug: "gizlilik", menu_order: 2 },
  ];
});

function seedLabels(root: Locale) {
  const R = root.toUpperCase();
  contentTables.menu = {
    m1: { [root]: { name: `${R} Villalar` }, tr: { name: "Kiralık Villalar" } },
    m2: { [root]: { name: `${R} Alt` } },
  };
  contentTables.villa_type = Object.fromEntries(h.types.map((t, i) => [t.id, { [root]: { name: `${R} Tip ${i + 1}` } }]));
  contentTables.page = { p1: { [root]: { title: `${R} Hakkında` }, de: { title: "DE Über" } }, p2: { [root]: { title: `${R} Gizlilik` } } };
}

for (const root of L) {
  const R = root.toUpperCase();
  describe(`ana dil ${R} — header / footer / iletişim`, () => {
    it("header: istenen dil → ana dil zinciri; bölge canonical; sıra korunur", async () => {
      setup(root);
      seedLabels(root);
      for (const l of L) {
        h.path = pathOf(l, root);
        const { container, unmount } = render(await HeaderWrapper());
        const text = container.textContent ?? "";
        /* m1: kendi TR satırı + ana dil satırı; p1: kendi DE satırı + ana dil. */
        const rootVillas = root === "tr" ? "Kiralık Villalar" : `${R} Villalar`;
        expect(text).toContain(l === "tr" ? "Kiralık Villalar" : rootVillas);
        expect(text).toContain(`${R} Tip 1`);
        expect(text).toContain(l === "de" || root === "de" ? "DE Über" : `${R} Hakkında`);
        expect(text).toContain("Kalkan");
        expect(text.indexOf(`${R} Tip 1`)).toBeLessThan(text.indexOf("Kalkan"));
        unmount();
      }
    });

    it("header: hiçbir aktif dilde etiketi olmayan düğüm (alt ağacıyla) gizlenir; pasif dil kullanılmaz", async () => {
      const passive = L.find((x) => x !== root)!;
      setup(root, L.filter((x) => x !== passive));
      seedLabels(root);
      contentTables.menu.m1 = { [passive]: { name: "PASİF menü" } };
      h.path = "/";
      const { container } = render(await HeaderWrapper());
      const text = container.textContent ?? "";
      expect(text).not.toContain("PASİF menü");
      expect(text).not.toContain("Kiralık Villalar");
      expect(text).not.toContain(`${R} Alt`);
      expect(text).toContain(`${R} Tip 1`);
    });

    it("footer: tip adı merkezi; etiketsiz tip gizlenir ve 7'lik kırpma SONRA; telif ana dil kuralı", async () => {
      setup(root);
      seedLabels(root);
      delete contentTables.villa_type.t2;
      h.settingsRows = {
        [root]: { footer_copyright: `© {year} ${R} telif` },
        ...(root !== "tr" ? { tr: { footer_copyright: "© {year} TR telif" } } : {}),
      };
      for (const l of L) {
        h.path = pathOf(l, root);
        const { container, unmount } = render(await FooterWrapper());
        const text = container.textContent ?? "";
        for (const n of [1, 3, 4, 5, 6, 7, 8]) expect(text).toContain(`${R} Tip ${n}`);
        expect(text).not.toContain(`${R} Tip 2`);
        expect(text).not.toContain(`${R} Tip 9`);
        expect(text).toContain(l === "de" || root === "de" ? "DE Über" : `${R} Hakkında`);
        const own = l === "tr" && root !== "tr" ? "TR telif" : `${R} telif`;
        expect(text).toContain(own);
        unmount();
      }
    });

    it("iletişim: çalışma saatleri tekil kayıt kuralı (eksik dil → ana dil; ana dilde boş → gizli)", async () => {
      setup(root);
      h.settingsRows = { [root]: { business_hours: `${R} saatler` }, ...(root !== "tr" ? { tr: { business_hours: "TR saatler" } } : {}) };
      const missing = L.find((x) => x !== root && !h.settingsRows[x])!;
      const first = render(await ContactPageBody({ locale: missing }));
      expect(first.container.textContent).toContain(`${R} saatler`);
      first.unmount();
      h.settingsRows[root] = { business_hours: "" };
      const { container } = render(await ContactPageBody({ locale: missing }));
      expect(container.textContent).not.toContain("saatler");
    });
  });
}

/* ---------------------------------------------------------------
   POPUP — tekil kayıt kuralı (toPublicSitePopup + localizeSitePopup)
   --------------------------------------------------------------- */
const ROW: SitePopupRow = {
  id: 1, is_enabled: true, image_path: null, title: "TR Başlık", description: "TR Açıklama", highlight_text: "TR %20",
  stats: ["TR 1"], button_text: "TR Buton", button_url: "/kampanya", show_button: true, display_scope: "home",
  dismiss_duration: "session", starts_at: null, ends_at: null, updated_at: "2026-01-01",
};
const tRow = (locale: string, v: Partial<SitePopupTranslationRow> = {}): SitePopupTranslationRow => ({
  popup_id: 1, locale, title: null, description: null, highlight_text: null, stats: null, button_text: null, button_url: null, ...v,
});
const img = () => null;
const pick = (p: ReturnType<typeof toPublicSitePopup>, l: Locale) => {
  const c = localizeSitePopup(p!, l);
  return { title: c.title, description: c.description, highlight: c.highlight, stats: c.stats, button: c.button };
};

describe("popup — eşdeğerlik (ana dil TR)", () => {
  const cases: Array<[string, SitePopupTranslationRow[]]> = [
    ["çeviri yok", []],
    ["EN tam, DE kısmi", [tRow("en", { title: "EN T", description: "EN D", highlight_text: "EN H", stats: ["EN 1"], button_text: "EN B", button_url: "/en/k" }), tRow("de", { title: "DE T" })]],
    ["EN boş satır", [tRow("en")]],
    ["TR aynası + EN", [tRow("tr", { title: "TR Başlık", description: "TR Açıklama", highlight_text: "TR %20", stats: ["TR 1"], button_text: "TR Buton", button_url: "/kampanya" }), tRow("en", { title: "EN T" })]],
  ];
  for (const [name, rows] of cases) {
    it(`${name}: 3 dilde eski çıktıyla aynı`, () => {
      const legacy = toPublicSitePopup(ROW, img, 0, rows);
      const central = toPublicSitePopup(ROW, img, 0, rows, { root: "tr", enabled: ["tr", "en", "de"] });
      for (const l of L) expect(pick(central, l)).toEqual(pick(legacy, l));
    });
  }
  it("TR içeriği boş + görsel yok → eskisi gibi popup YOK", () => {
    const empty = { ...ROW, title: null, description: null, highlight_text: null, stats: [], button_text: null };
    expect(toPublicSitePopup(empty, img, 0, [tRow("en", { title: "EN T" })], { root: "tr", enabled: ["tr", "en", "de"] })).toBeNull();
  });
});

for (const root of ["en", "de"] as const) {
  describe(`popup — ana dil ${root.toUpperCase()}`, () => {
    const other = root === "en" ? "de" : "en";
    it("eksik dil ANA DİLE düşer (TR'ye değil); TR kendi satırını kullanır", () => {
      const rows = [tRow(root, { title: `${root} T`, button_text: `${root} B`, button_url: "/x" })];
      const p = toPublicSitePopup(ROW, img, 0, rows, { root, enabled: ["tr", "en", "de"] })!;
      expect(pick(p, other).title).toBe(`${root} T`);
      expect(pick(p, other).button?.text).toBe(`${root} B`);
      expect(pick(p, other).description).toBeNull();
      expect(pick(p, "tr").title).toBe("TR Başlık");
    });
    it("ana dilde bilinçli boş başlık → eksik dilde de gizli (TR'den doldurulmaz)", () => {
      const rows = [tRow(root, { title: null, description: `${root} D` })];
      const p = toPublicSitePopup(ROW, img, 0, rows, { root, enabled: ["tr", "en", "de"] })!;
      expect(pick(p, other).title).toBeNull();
      expect(pick(p, other).description).toBe(`${root} D`);
    });
    it("pasif dil satırı hiçbir dile yedek olmaz; haritada yalnız aktif diller", () => {
      const rows = [tRow(root, { title: `${root} T` }), tRow(other, { highlight_text: "PASİF" })];
      const p = toPublicSitePopup(ROW, img, 0, rows, { root, enabled: [root, "tr"] })!;
      expect(Object.keys(p.translations).sort()).toEqual([root, "tr"].sort());
      expect(pick(p, root).highlight).toBeNull();
    });
    it("ana dil içeriği boş + görsel yok → popup YOK (TR dolu olsa bile)", () => {
      expect(toPublicSitePopup(ROW, img, 0, [tRow(root)], { root, enabled: ["tr", "en", "de"] })).toBeNull();
    });
  });
}
