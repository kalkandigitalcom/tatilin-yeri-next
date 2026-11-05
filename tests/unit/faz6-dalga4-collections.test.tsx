import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type React from "react";

/* ===============================================================
   Faz 6 — DALGA 4 / A2: ANA SAYFA KOLEKSİYONU + İNDİRİM KOLEKSİYONU.
   Özel başlık (homepage_collection / discount_collection.custom_title)
   ve villa rozeti merkezi servisten (gerçek çekirdek + bellek içi depo).
   Kart kümesi, sıra, fiyat ve indirim verisi kaynak cache'ten AYNEN.
   =============================================================== */

const V = (n: number) => `bbbbbbbb-2222-4222-8222-00000000000${n}`;
const C = (n: number) => `cccccccc-3333-4333-8333-00000000000${n}`;
const D = (n: number) => `dddddddd-4444-4444-8444-00000000000${n}`;

const h = vi.hoisted(() => ({
  ctx: { root: "tr", enabled: ["tr", "en", "de"] } as { root: string; enabled: string[] },
  home: [] as Record<string, unknown>[],
  auto: [] as Record<string, unknown>[],
  discount: [] as Record<string, unknown>[],
  data: {} as Record<string, Record<string, Record<string, Record<string, string | null>>>>,
  reads: [] as string[],
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedHomepageCollectionVillas: async () => h.home,
  getCachedVillas: async () => h.auto,
  getCachedDiscountCollectionVillas: async () => h.discount,
}));
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (p: Record<string, unknown>) => (
    <article
      data-id={String(p.id)}
      data-title={String(p.title)}
      data-badge={p.badge === undefined ? "∅" : String(p.badge)}
      data-price={String(p.price)}
      data-discount={p.discount ? "1" : "0"}
    />
  ),
}));
vi.mock("@/app/components/villa/HorizontalCarousel", () => ({
  default: (p: { children?: React.ReactNode }) => <div data-carousel>{p.children}</div>,
}));
vi.mock("@/lib/i18n/content/content-read.server", async () => {
  const { fixtureReader } = await import("../fixtures/faz6/content-fixture");
  const r = fixtureReader(() => h.data as never, () => h.ctx as never);
  return {
    getContent: r.getContent,
    getContentMany: async (e: string, ids: readonly string[], l: string) => {
      h.reads.push(`${e}:${l}:${ids.length}`);
      return r.getContentMany(e as never, ids, l as never);
    },
  };
});

import type { Locale } from "@/lib/i18n/config";
import VillaList from "@/app/components/villa/VillaList";
import DiscountCollection from "@/app/components/home/DiscountCollection";

const L: Locale[] = ["tr", "en", "de"];
const card = (n: number, extra: Record<string, unknown> = {}) => ({
  id: V(n), slug: `villa-${n}`, title: `Villa ${n}`, display_title: `Villa ${n}`, location: "Kaş",
  price: 1000 * n, currency: "TRY", badge: `TR-ROZET-${n}`, bedrooms: 3, bathrooms: 2, guests: 6,
  images: [], cover_override_path: null, ...extra,
});
async function cards(el: Promise<unknown>) {
  const node = await el;
  if (!node) return [];
  const div = render(node as React.ReactElement).container;
  /* İndirim bileşeni kartları mobil carousel + masaüstü grid'de iki kez basar. */
  const seen = new Set<string>();
  return [...div.querySelectorAll("article")]
    .map((a) => ({ id: a.dataset.id!, title: a.dataset.title!, badge: a.dataset.badge!, price: a.dataset.price!, discount: a.dataset.discount! }))
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}
function setup(root: Locale, enabled: Locale[] = L) {
  h.ctx = { root, enabled };
}

beforeEach(() => {
  h.reads = [];
  h.home = [
    card(1, { collection_id: C(1), display_title: "TR Özel 1" }),
    card(2, { collection_id: C(2) }),
    card(3, { collection_id: C(3), display_title: "TR Özel 3", badge: null }),
  ];
  h.auto = [card(4), card(5)];
  h.discount = [
    card(1, { collection_id: D(1), display_title: "TR İndirim 1", discount: { start_date: "2026-06-01" } }),
    card(2, { collection_id: D(2), discount: { start_date: "2026-07-01" } }),
  ];
  /* TR satırları = ana tablo aynası (migration 107). */
  h.data = {
    homepage_collection: {
      [C(1)]: { tr: { custom_title: "TR Özel 1" }, en: { custom_title: "EN Custom 1" }, de: { custom_title: "DE Eigen 1" } },
      [C(2)]: { tr: { custom_title: null } },
      [C(3)]: { tr: { custom_title: "TR Özel 3" }, en: { custom_title: "  " } },
    },
    discount_collection: {
      [D(1)]: { tr: { custom_title: "TR İndirim 1" }, de: { custom_title: "DE Rabatt 1" } },
      [D(2)]: { tr: { custom_title: "" } },
    },
    villa: {
      [V(1)]: { tr: { badge: "TR-ROZET-1" }, en: { badge: "EN-BADGE-1" }, de: { badge: "DE-ABZ-1" } },
      [V(2)]: { tr: { badge: "TR-ROZET-2" } },
      [V(3)]: { tr: { badge: null } },
      [V(4)]: { tr: { badge: "TR-ROZET-4" }, de: { badge: "DE-ABZ-4" } },
      [V(5)]: {},
    },
  };
});

describe("eşdeğerlik — ana dil TR, TR sayfası eski çıktıyla birebir", () => {
  it("ana sayfa koleksiyonu: eski `custom_title.trim() || villa.title` + ana tablo rozeti", async () => {
    setup("tr");
    const out = await cards(VillaList({ locale: "tr" }));
    /* Eski çıktı: başlık = display_title, rozet = ana tablo `villa.badge`. */
    const legacy = h.home.map((c) => [c.id, c.display_title, (c.badge as string | null) ?? "∅"]);
    expect(out.map((c) => [c.id, c.title, c.badge])).toEqual(legacy);
    expect(out.map((c) => c.price)).toEqual(["1000", "2000", "3000"]);
  });
  it("indirim koleksiyonu: başlık/rozet/fiyat/indirim aynı", async () => {
    setup("tr");
    const out = await cards(DiscountCollection({ locale: "tr" }));
    expect(out).toEqual([
      { id: V(1), title: "TR İndirim 1", badge: "TR-ROZET-1", price: "1000", discount: "1" },
      { id: V(2), title: "Villa 2", badge: "TR-ROZET-2", price: "2000", discount: "1" },
    ]);
  });
});

for (const root of L) {
  describe(`ana dil ${root.toUpperCase()} — koleksiyonlar`, () => {
    it("her dil kendi özel başlığı; yoksa ana dil; hiçbirinde yoksa villa adı; sıra AYNEN; tek batch", async () => {
      setup(root);
      for (const l of L) {
        h.reads = [];
        const out = await cards(VillaList({ locale: l }));
        expect(out.map((c) => c.id)).toEqual([V(1), V(2), V(3)]);
        const own1 = { tr: "TR Özel 1", en: "EN Custom 1", de: "DE Eigen 1" }[l];
        expect(out[0].title).toBe(own1);
        expect(out[1].title).toBe("Villa 2");
        /* C3: EN boşluk → yok sayılır; zincir: ana dil → diğer aktifler (TR). */
        expect(out[2].title).toBe("TR Özel 3");
        const badge1 = { tr: "TR-ROZET-1", en: "EN-BADGE-1", de: "DE-ABZ-1" }[l];
        expect(out[0].badge).toBe(badge1);
        expect(out[2].badge).toBe("∅");
        expect(h.reads.sort()).toEqual([`homepage_collection:${l}:3`, `villa:${l}:3`].sort());
      }
    });

    it("ana dilin özel başlığı istenen dilde eksikse ANA DİLE düşer (TR'ye sabit değil)", async () => {
      setup(root);
      h.data.discount_collection[D(1)] = { [root]: { custom_title: `${root} indirim` } };
      for (const l of L.filter((x) => x !== root)) {
        const out = await cards(DiscountCollection({ locale: l }));
        expect(out[0].title).toBe(`${root} indirim`);
      }
    });

    it("pasif dilin başlığı/rozeti hiçbir dile yedek olmaz", async () => {
      const passive = L.find((x) => x !== root)!;
      setup(root, L.filter((x) => x !== passive));
      h.data.homepage_collection[C(2)] = { [passive]: { custom_title: "PASİF başlık" } };
      h.data.villa[V(2)] = { [passive]: { badge: "PASİF rozet" } };
      for (const l of L.filter((x) => x !== passive)) {
        const out = await cards(VillaList({ locale: l }));
        expect(out[1].title).toBe("Villa 2");
        expect(out[1].badge).toBe("∅");
      }
    });

    it("otomatik liste (koleksiyon boş): villa adı canonical, rozet merkezi", async () => {
      setup(root);
      h.home = [];
      const out = await cards(VillaList({ locale: "de" }));
      expect(out.map((c) => c.title)).toEqual(["Villa 4", "Villa 5"]);
      expect(out[0].badge).toBe("DE-ABZ-4");
      expect(out[1].badge).toBe("∅");
    });
  });
}

it("eski cache girdisi (collection_id yok) → kaydedilmiş display_title korunur", async () => {
  setup("tr");
  h.discount = [card(1, { display_title: "Eski Özel" })];
  const out = await cards(DiscountCollection({ locale: "en" }));
  expect(out[0].title).toBe("Eski Özel");
});
