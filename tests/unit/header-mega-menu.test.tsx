/* ===============================================================
   🧭 HEADER MEGA MENÜ — Bölgeler / Kategoriler
   ===============================================================
   Kilitlenen davranışlar:
     • Alt öğeleri bölge/kategori kaynaklı üst öğe → mega panel; diğer
       öğeler ESKİ dropdown (değişmedi).
     • Öne çıkan kartlar villa sayısına göre; kalan TÜM alt linkler
       panelde erişilebilir (link kaybı yok); href'ler menü ağacından
       AYNEN + `localeHref`.
     • Fare hover-intent (gecikmeli aç / kontrollü kapan, titreme yok),
       dokunmatik ilk dokunuş açar, ESC kapatır + odak geri döner,
       dışarı tıklama kapatır, ok butonu aria-expanded/aria-controls.
     • TR/EN/DE metinleri sözlükten.
     • HeaderWrapper: görsel + villa sayısı MEVCUT cache okumalarından,
       anasayfa koleksiyonlarıyla aynı kurallarla eklenir; okuma hatası
       menüyü bozmaz.
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, within } from "@testing-library/react";

/* jsdom'da PointerEvent yok → pointerType taşıyan küçük polyfill
   (React onPointerEnter/Leave'i pointerover/pointerout'tan türetir). */
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/app/components/layout/TopBar", () => ({ default: () => null }));
vi.mock("@/app/components/layout/VillaSearchBox", () => ({ default: () => null }));
vi.mock("@/app/components/favorites/HeaderFavoritesLink", () => ({ default: () => null }));

/* ---- HeaderWrapper seam'leri ---- */
const h = vi.hoisted(() => ({
  menu: [] as unknown[],
  locations: [] as unknown[],
  counts: {} as Record<string, number>,
  types: [] as unknown[],
  covers: {} as Record<string, { coverImageUrl: string | null; villaCount: number }>,
  failMeta: false,
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: async () => ({}),
  getCachedMenu: async () => h.menu,
  getCachedVillaLocations: async () => {
    if (h.failMeta) throw new Error("locations down");
    return h.locations;
  },
  getCachedLocationVillaCounts: async () => h.counts,
  getCachedVillaTypes: async () => h.types,
  getCachedCategoryCovers: async () => h.covers,
}));
vi.mock("@/lib/storage.helpers", async (orig) => {
  const real = await orig<typeof import("@/lib/storage.helpers")>();
  return {
    ...real,
    getLocationCoverPublicUrl: (p: string | null | undefined) => (p ? `https://cdn.test/${p}` : null),
    getCategoryCoverPublicUrl: (p: string | null | undefined) => (p ? `https://cdn.test/${p}` : null),
    resolveAssetUrlVersioned: () => null,
  };
});
vi.mock("@/lib/i18n/content/public-villa-content.server", () => ({ publicContentReader: {} }));
vi.mock("@/lib/i18n/content/public-shared-content", () => ({
  publicLocaleCtxFromSettings: () => ({ enabled: ["tr", "en", "de"] }),
  loadLabelMapsByLocale: async (_r: unknown, kind: string, _f: string, ids: string[]) => {
    const out: Record<string, { tr: string }> = {};
    for (const id of ids) out[id] = { tr: `${kind}:${id}` };
    return out;
  },
}));

import Header from "@/app/components/layout/Header";
import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
import { localeHref } from "@/lib/i18n/locale-href";

type Node = {
  id: string;
  name: string;
  href: string;
  source_type?: string;
  imageUrl?: string | null;
  villaCount?: number;
  nameByLocale?: Record<string, string>;
  children?: Node[];
};

const region = (slug: string, name: string, villaCount?: number): Node => ({
  id: `r-${slug}`,
  name,
  href: `/bolgeler/${slug}`,
  source_type: "region",
  imageUrl: `https://cdn.test/${slug}.jpg`,
  villaCount,
});
const category = (slug: string, tr: string, en: string, de: string, villaCount: number): Node => ({
  id: `c-${slug}`,
  name: tr,
  href: `/villa-turleri/${slug}`,
  source_type: "category",
  imageUrl: null,
  villaCount,
  nameByLocale: { tr, en, de },
});

const REGIONS: Node = {
  id: "m-regions",
  name: "Bölgeler",
  href: "/bolgeler/kalkan",
  source_type: "manual",
  nameByLocale: { tr: "Bölgeler", en: "Regions", de: "Regionen" },
  children: [
    region("fethiye", "Fethiye", 22),
    region("kas", "Kaş", 493),
    region("demre", "Demre", 5),
    region("islamlar", "İslamlar", 1),
    region("seydikemer", "Seydikemer", 4),
    region("uzumlu", "Üzümlü", 0),
  ],
};
const CATEGORIES: Node = {
  id: "m-cats",
  name: "Kategoriler",
  href: "/villa-turleri/balayi-villalari",
  source_type: "manual",
  nameByLocale: { tr: "Kategoriler", en: "Categories", de: "Kategorien" },
  children: [
    category("balayi", "Balayı Villaları", "Honeymoon Villas", "Flitterwochen-Villen", 40),
    category("muhafazakar", "Muhafazakar Villalar", "Conservative Villas", "Konservative Villen", 80),
    category("deniz", "Deniz Manzaralı", "Sea View", "Meerblick", 120),
    category("ekonomik", "Ekonomik Villalar", "Budget Villas", "Günstige Villen", 10),
    category("havuz", "Korunaklı Havuzlu", "Private Pool", "Privatpool", 60),
    category("cocuk", "Çocuk Havuzlu", "Kids Pool", "Kinderbecken", 30),
    category("evcil", "Evcil Hayvan", "Pet Friendly", "Haustierfreundlich", 3),
  ],
};
const PLAIN: Node = {
  id: "m-plain",
  name: "Kurumsal",
  href: "/p/kurumsal",
  source_type: "manual",
  children: [{ id: "m-about", name: "Hakkımızda", href: "/p/hakkimizda", source_type: "page" }],
};
const MENU = [REGIONS, CATEGORIES, PLAIN];

function renderHeader(path = "/") {
  usePathnameMock.mockReturnValue(path);
  return render(<Header menu={MENU as never} siteLogo={null} />);
}
const panel = (kind: "regions" | "categories") =>
  document.querySelector<HTMLElement>(`[data-mega-panel="${kind}"]`)!;
const toggle = (kind: "regions" | "categories") =>
  document.getElementById(panel(kind).id)!.parentElement!.querySelector<HTMLButtonElement>("[data-mega-toggle]")!;

beforeEach(() => {
  usePathnameMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Header mega menü — render ve linkler", () => {
  it("1) bölge öğesi mega panel; başlık + toplam bölge sayısı (TR)", () => {
    renderHeader("/");
    const p = panel("regions");
    expect(p).toBeTruthy();
    expect(p.dataset.open).toBe("false");
    expect(within(p).getByText("Öne Çıkan Bölgeler")).toBeTruthy();
    expect(within(p).getByText("6 Bölge")).toBeTruthy();
  });

  it("2) büyük kart en çok villalı bölge; 4 küçük kart; sayı biçimi", () => {
    renderHeader("/");
    const p = panel("regions");
    const hero = p.querySelector<HTMLAnchorElement>('[data-mega-card="hero"]')!;
    expect(hero.getAttribute("href")).toBe("/bolgeler/kas");
    expect(hero.textContent).toContain("Kaş");
    expect(hero.textContent).toContain("493 villa");
    const tiles = [...p.querySelectorAll<HTMLAnchorElement>('[data-mega-card="tile"]')].map((a) => a.getAttribute("href"));
    expect(tiles).toEqual(["/bolgeler/fethiye", "/bolgeler/demre", "/bolgeler/seydikemer", "/bolgeler/islamlar"]);
    expect(hero.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/kas.jpg");
  });

  it("3) öne çıkmayan alt linkler kaybolmaz; 'Tüm Bölgeleri Gör' üst öğenin linki", () => {
    renderHeader("/");
    const p = panel("regions");
    const hrefs = [...p.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    for (const c of REGIONS.children!) expect(hrefs).toContain(c.href);
    const all = within(p).getByText("Tüm Bölgeleri Gör").closest("a")!;
    expect(all.getAttribute("href")).toBe("/bolgeler/kalkan");
  });

  it("4) EN: linkler locale önekli, metinler sözlükten", () => {
    renderHeader("/en");
    const p = panel("regions");
    expect(within(p).getByText("Featured Regions")).toBeTruthy();
    expect(within(p).getByText("6 Regions")).toBeTruthy();
    expect(p.querySelector('[data-mega-card="hero"]')!.getAttribute("href")).toBe(localeHref("/bolgeler/kas", "en"));
    expect(p.querySelector('[data-mega-card="hero"]')!.textContent).toContain("493 villas");
    expect(within(p).getByText("View All Regions").closest("a")!.getAttribute("href")).toBe(
      localeHref("/bolgeler/kalkan", "en")
    );
  });

  it("5) kategori paneli: 6 kart (sayıya göre), çevrilmiş adlar, kalan link, DE metinleri", () => {
    renderHeader("/de");
    const p = panel("categories");
    expect(within(p).getByText("Beliebte Kategorien")).toBeTruthy();
    expect(within(p).getByText("7 Kategorien")).toBeTruthy();
    const cards = [...p.querySelectorAll<HTMLAnchorElement>('[data-mega-card="category"]')];
    expect(cards).toHaveLength(6);
    expect(cards[0].getAttribute("href")).toBe(localeHref("/villa-turleri/deniz", "de"));
    expect(cards[0].textContent).toContain("Meerblick");
    expect(cards[0].textContent).toContain("120 Villen");
    const hrefs = [...p.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(localeHref("/villa-turleri/evcil", "de"));
    expect(within(p).getByText("Alle Kategorien ansehen")).toBeTruthy();
    /* görsel yoksa baş harf yer tutucusu */
    expect(cards[0].querySelector("img")).toBeNull();
  });

  it("6) bölge/kategori olmayan öğe ESKİ dropdown ile kalır", () => {
    renderHeader("/");
    expect(document.querySelectorAll("[data-mega-panel]")).toHaveLength(2);
    const nav = document.querySelector("nav")!;
    expect(within(nav).getByText("Hakkımızda").closest("a")!.getAttribute("href")).toBe("/p/hakkimizda");
  });
});

describe("Header mega menü — etkileşim", () => {
  it("7) ok butonu: aria-expanded/aria-controls; tıklama aç/kapa", () => {
    renderHeader("/");
    const btn = toggle("regions");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.getAttribute("aria-controls")).toBe(panel("regions").id);
    expect(btn.getAttribute("aria-label")).toBe("Aç: Bölgeler alt menüsü");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(panel("regions").dataset.open).toBe("true");
    fireEvent.click(btn);
    expect(panel("regions").dataset.open).toBe("false");
  });

  it("8) ESC kapatır ve odağı ok butonuna döndürür", () => {
    renderHeader("/");
    const btn = toggle("regions");
    fireEvent.click(btn);
    const card = panel("regions").querySelector<HTMLAnchorElement>('[data-mega-card="hero"]')!;
    card.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(panel("regions").dataset.open).toBe("false");
    expect(document.activeElement).toBe(btn);
  });

  it("9) dışarı tıklama kapatır; aynı anda tek panel açık", () => {
    renderHeader("/");
    fireEvent.click(toggle("regions"));
    fireEvent.click(toggle("categories"));
    expect(panel("regions").dataset.open).toBe("false");
    expect(panel("categories").dataset.open).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(panel("categories").dataset.open).toBe("false");
  });

  it("10) fare: gecikmeli açılır, kısa çıkış-giriş titretmez, ayrılınca kapanır", () => {
    vi.useFakeTimers();
    renderHeader("/");
    const root = document.querySelector<HTMLElement>('[data-mega-root="m-regions"]')!;
    fireEvent.pointerOver(root, { pointerType: "mouse" });
    expect(panel("regions").dataset.open).toBe("false");
    act(() => vi.advanceTimersByTime(120));
    expect(panel("regions").dataset.open).toBe("true");
    fireEvent.pointerOut(root, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerOver(root, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));
    expect(panel("regions").dataset.open).toBe("true");
    fireEvent.pointerOut(root, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(300));
    expect(panel("regions").dataset.open).toBe("false");
  });

  it("11) dokunmatik: ilk dokunuş paneli açar (navigasyon yok), ikincisi linke gider", () => {
    renderHeader("/");
    const root = document.querySelector<HTMLElement>('[data-mega-root="m-regions"]')!;
    const link = within(root).getAllByText("Bölgeler")[0].closest("a")!;
    fireEvent.pointerOver(root, { pointerType: "touch" });
    fireEvent.pointerDown(link, { pointerType: "touch" });
    const first = fireEvent.click(link);
    expect(first).toBe(false); // preventDefault
    expect(panel("regions").dataset.open).toBe("true");
    fireEvent.pointerDown(link, { pointerType: "touch" });
    const second = fireEvent.click(link);
    expect(second).toBe(true);
  });

  it("12) ArrowDown paneli açar ve ilk karta odaklar", async () => {
    renderHeader("/");
    const btn = toggle("categories");
    fireEvent.keyDown(btn, { key: "ArrowDown" });
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(panel("categories").dataset.open).toBe("true");
    expect(document.activeElement).toBe(panel("categories").querySelector("a[href]"));
  });

  it("13) mobil hamburger menüsü alt linkleri aynen listeler", () => {
    renderHeader("/");
    const mobileLinks = [...document.querySelectorAll("a")].filter((a) => !a.closest("nav") && !a.closest("[data-mega-panel]"));
    const hrefs = mobileLinks.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/bolgeler/kas");
    expect(hrefs).toContain("/villa-turleri/evcil");
  });
});

describe("HeaderWrapper — mega kart verisi (mevcut cache okumaları)", () => {
  beforeEach(() => {
    h.failMeta = false;
    h.menu = [
      {
        id: "m-reg",
        name: "Bölgeler",
        href: "/bolgeler/kalkan",
        source_type: "manual",
        source_id: null,
        children: [
          { id: "n1", name: "Kalkan", href: "/bolgeler/kalkan", source_type: "region", source_id: "L1", children: [] },
          { id: "n2", name: "Kaş / Uğrar", href: "/arama?bolgeler=kas-ugrar", source_type: "region", source_id: "L3", children: [] },
          { id: "n3", name: "Balayı", href: "/villa-turleri/balayi", source_type: "category", source_id: "T1", children: [] },
          { id: "n4", name: "Deniz", href: "/villa-turleri/deniz", source_type: "category", source_id: "T2", children: [] },
        ],
      },
    ];
    h.locations = [
      { id: "L1", name: "Kalkan", filter_group_name: "Kalkan", cover_image: null, cover_v: 7 },
      { id: "L2", name: "Kalkan / Kalamar", filter_group_name: "Kalkan", cover_image: "kalamar.jpg", cover_v: 7 },
      { id: "L3", name: "Kaş / Uğrar", filter_group_name: "Kaş", cover_image: "ugrar.jpg", cover_v: 7 },
    ];
    h.counts = { L1: 3, L2: 4, L3: 9 };
    h.types = [
      { id: "T1", cover_image: "balayi.jpg", cover_v: 5 },
      { id: "T2", cover_image: null, cover_v: 5 },
    ];
    h.covers = {
      T1: { coverImageUrl: "https://villa/1.jpg", villaCount: 11 },
      T2: { coverImageUrl: "https://villa/2.jpg", villaCount: 6 },
    };
  });

  it("14) grup kökü: üyelerin toplamı + ilk kapaklı üye; kök olmayan: kendi değeri", async () => {
    const el = await HeaderWrapper();
    const kids = el.props.menu[0].children;
    expect(kids[0]).toMatchObject({ villaCount: 7, imageUrl: "https://cdn.test/kalamar.jpg?v=7" });
    expect(kids[1]).toMatchObject({ villaCount: 9, imageUrl: "https://cdn.test/ugrar.jpg?v=7" });
  });

  it("15) kategori: admin kapağı öncelikli, yoksa villa görseli; sayı covers'tan", async () => {
    const el = await HeaderWrapper();
    const kids = el.props.menu[0].children;
    expect(kids[2]).toMatchObject({ villaCount: 11, imageUrl: "https://cdn.test/balayi.jpg?v=5" });
    expect(kids[3]).toMatchObject({ villaCount: 6, imageUrl: "https://villa/2.jpg" });
    /* href / ad / kaynak alanları DEĞİŞMEDİ */
    expect(kids[0].href).toBe("/bolgeler/kalkan");
    expect(kids[1].href).toBe("/arama?bolgeler=kas-ugrar");
  });

  it("16) kart verisi okunamazsa menü aynen döner (görsel/sayı yok)", async () => {
    h.failMeta = true;
    const el = await HeaderWrapper();
    const kids = el.props.menu[0].children;
    expect(kids).toHaveLength(4);
    expect(kids[0].villaCount).toBeUndefined();
    expect(kids[0].href).toBe("/bolgeler/kalkan");
  });
});
