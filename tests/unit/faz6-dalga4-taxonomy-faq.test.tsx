import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type React from "react";

/* ===============================================================
   Faz 6 — DALGA 4 / A3: ANA SAYFA VİLLA TİPİ ŞERİDİ + SSS.
   Merkezi okuma (gerçek çekirdek + bellek içi depo). Eşdeğerlik:
   ana dil TR'de eski `applyFaqTranslations` / `resolveTaxonomyName`
   yollarıyla (eski okuyucu aynı fikstürden) birebir.
   =============================================================== */

const T = (n: number) => `eeeeeeee-5555-4555-8555-00000000000${n}`;
const F = (n: number) => `ffffffff-6666-4666-8666-00000000000${n}`;

const h = vi.hoisted(() => ({
  ctx: { root: "tr", enabled: ["tr", "en", "de"] } as { root: string; enabled: string[] },
  types: [] as Record<string, unknown>[],
  covers: {} as Record<string, { coverImageUrl: string | null; villaCount: number }>,
  faqs: [] as { id: string; question: string; answer: string }[],
  data: {} as Record<string, Record<string, Record<string, Record<string, string | null>>>>,
  reads: [] as string[],
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));
vi.mock("next/image", () => ({ default: (p: Record<string, unknown>) => <span data-img={String(p.src)} /> }));
vi.mock("next/link", () => ({ default: (p: { href: string; children?: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
vi.mock("@/app/components/villa/HorizontalCarousel", () => ({
  default: (p: { children?: React.ReactNode }) => <div data-carousel>{p.children}</div>,
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedVillaTypes: async () => h.types,
  getCachedCategoryCovers: async () => h.covers,
  getCachedFaqs: async () => h.faqs,
  getCachedSettings: async () => null,
}));
/* Eski okuyucu: EN/DE satırları fikstürden; TR'de satır yok (ana tablo). */
vi.mock("@/lib/i18n/get-translation.server", async (orig) => {
  const actual = await orig<typeof import("@/lib/i18n/get-translation.server")>();
  const row = (e: string, id: string, l: string) => (l === "tr" ? undefined : h.data[e]?.[id]?.[l]);
  return {
    ...actual,
    getTranslationsForParents: async (e: string, ids: readonly string[], l: string) => {
      const m = new Map();
      for (const id of ids) if (row(e, id, l)) m.set(id, row(e, id, l));
      return m;
    },
  };
});
vi.mock("@/lib/i18n/content/content-read.server", async () => {
  const { fixtureReader } = await import("../fixtures/faz6/content-fixture");
  const r = fixtureReader(() => h.data as never, () => h.ctx as never);
  return {
    getContent: r.getContent,
    getContentMany: async (e: string, ids: readonly string[], l: string) => {
      h.reads.push(`${e}:${l}:${ids.length}`);
      return r.getContentMany(e as never, ids, l as never);
    },
    getAllLocales: async () => ({}),
  };
});

import type { Locale } from "@/lib/i18n/config";
import VillaTypeCarousel from "@/app/components/villa/VillaTypeCarousel";
import { getPublicFaqs } from "@/lib/i18n/content/public-shared-content.server";
import { applyFaqTranslations } from "@/lib/i18n/get-faq-translations.server";

const L: Locale[] = ["tr", "en", "de"];
async function typeNames(l: Locale) {
  const node = await VillaTypeCarousel({ locale: l });
  if (!node) return [];
  const div = render(node as React.ReactElement).container;
  /* Kart adı: her kartta görünen tek başlık metni (h3). */
  return [...div.querySelectorAll("a")].map((a) => a.querySelector("h3")?.textContent ?? a.textContent ?? "");
}
function setup(root: Locale, enabled: Locale[] = L) {
  h.ctx = { root, enabled };
}

beforeEach(() => {
  h.reads = [];
  h.types = [1, 2, 3, 4].map((n) => ({ id: T(n), slug: `tip-${n}`, name: `TR Tip ${n}`, cover_image: null, show_on_homepage: n !== 4 }));
  h.covers = Object.fromEntries([1, 2, 3, 4].map((n) => [T(n), { coverImageUrl: null, villaCount: n === 3 ? 0 : 5 }]));
  h.faqs = [1, 2, 3].map((n) => ({ id: F(n), question: `TR Soru ${n}`, answer: `TR Cevap ${n}` }));
  /* TR satırları = ana tablo aynası (migration 107). */
  h.data = {
    villa_type: {
      [T(1)]: { tr: { name: "TR Tip 1" }, en: { name: "EN Type 1" }, de: { name: "DE Typ 1" } },
      [T(2)]: { tr: { name: "TR Tip 2" } },
      [T(3)]: { tr: { name: "TR Tip 3" }, en: { name: "EN Type 3" } },
      [T(4)]: { tr: { name: "TR Tip 4" } },
    },
    faq: {
      [F(1)]: { tr: { question: "TR Soru 1", answer: "TR Cevap 1" }, en: { question: "EN Q 1", answer: "EN A 1" }, de: { question: "DE F 1", answer: "DE A 1" } },
      [F(2)]: { tr: { question: "TR Soru 2", answer: "TR Cevap 2" }, en: { question: "EN Q 2", answer: "  " } },
      [F(3)]: { tr: { question: "TR Soru 3", answer: "TR Cevap 3" } },
    },
  };
});

describe("eşdeğerlik — ana dil TR (eski yollar ile birebir)", () => {
  it("SSS: 3 dilde eski applyFaqTranslations çıktısı", async () => {
    setup("tr");
    for (const l of L) expect(await getPublicFaqs(l)).toEqual(await applyFaqTranslations(h.faqs, l));
  });
  it("villa tipi şeridi: sıra, gizleme kuralları (sayaç 0, ana sayfada değil) ve adlar", async () => {
    setup("tr");
    expect(await typeNames("tr")).toEqual(["TR Tip 1", "TR Tip 2"]);
    expect(await typeNames("en")).toEqual(["EN Type 1", "TR Tip 2"]);
    expect(await typeNames("de")).toEqual(["DE Typ 1", "TR Tip 2"]);
  });
});

for (const root of L) {
  describe(`ana dil ${root.toUpperCase()} — villa tipi + SSS`, () => {
    const others = L.filter((x) => x !== root);

    it("eksik dil ANA DİLE düşer (TR'ye sabit değil); tek batch", async () => {
      setup(root);
      h.data.villa_type[T(2)] = { [root]: { name: `${root} tip 2` } };
      h.data.faq[F(3)] = { [root]: { question: `${root} soru 3`, answer: `${root} cevap 3` } };
      for (const l of others) {
        h.reads = [];
        expect((await typeNames(l))[1]).toBe(`${root} tip 2`);
        expect(h.reads).toEqual([`villa_type:${l}:4`]);
        h.reads = [];
        const faqs = await getPublicFaqs(l);
        expect(faqs.map((f) => f.id)).toEqual([F(1), F(2), F(3)]);
        expect(faqs[2]).toEqual({ id: F(3), question: `${root} soru 3`, answer: `${root} cevap 3` });
        expect(h.reads).toEqual([`faq:${l}:3`]);
      }
    });

    it("hiçbir aktif dilde adı/sorusu olmayan öğe gizlenir; pasif dil yedek olmaz", async () => {
      const passive = others[0];
      setup(root, L.filter((x) => x !== passive));
      h.data.villa_type[T(2)] = { [passive]: { name: "PASİF tip" } };
      h.data.faq[F(2)] = { [passive]: { question: "PASİF soru", answer: "PASİF cevap" } };
      for (const l of L.filter((x) => x !== passive)) {
        const names = await typeNames(l);
        expect(names).not.toContain("PASİF tip");
        expect(names.length).toBe(1);
        const faqs = await getPublicFaqs(l);
        /* F3 yalnız TR satırına sahip → TR pasifse o da gizlenir. */
        expect(faqs.map((f) => f.id)).toEqual(passive === "tr" ? [F(1)] : [F(1), F(3)]);
      }
    });

    it("SSS cevabı hiçbir aktif dilde yoksa öğe gizlenir (yarım FAQPage yok)", async () => {
      setup(root);
      h.data.faq[F(3)] = { [root]: { question: `${root} soru 3`, answer: null } };
      for (const l of L) expect((await getPublicFaqs(l)).map((f) => f.id)).not.toContain(F(3));
    });
  });
}

it("okuma hatası → SSS boş liste (bölüm render edilmez, sayfa çökmez)", async () => {
  setup("tr");
  h.faqs = [{ id: "not-a-uuid", question: "x", answer: "y" }];
  await expect(getPublicFaqs("en")).resolves.toEqual([]);
});
