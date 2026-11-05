import { beforeEach, describe, expect, it, vi } from "vitest";

/* ===============================================================
   Faz 6 — DALGA 4 / A1: ANA SAYFA (route + hero + metadata).
   Merkezi okuma: `getAllLocales` (bellek içi satırlar) → tekil kayıt
   kuralı (public-shared-content). Eşdeğerlik: ana dil TR'de eski
   `resolveSettingsText` yoluyla birebir; ana dil EN/DE simetrik.
   =============================================================== */

const SID = "5e771e65-0000-4000-8000-000000000001";
type Row = Record<string, string | null>;
const h = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  rows: {} as Record<string, Record<string, string | null>>,
  ctx: { root: "tr", enabled: ["tr", "en", "de"], slugs: {}, redirects: {} } as Record<string, unknown>,
  readCalls: 0,
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
  redirect: (u: string) => {
    throw new Error(`NEXT_REDIRECT:${u}`);
  },
}));
vi.mock("@/lib/cache.helpers", () => ({ getCachedSettings: async () => h.settings }));
vi.mock("@/lib/i18n/routing/context.server", () => ({ primeRoutingContext: async () => h.ctx }));
vi.mock("@/lib/i18n/public-locale-gate.server", () => ({ requirePublicLocaleEnabled: async () => undefined }));
vi.mock("@/lib/i18n/public-home.server", () => ({
  getPublicHomeResolution: async () => ({ redirectsFromRoot: false, defaultLocale: "tr" }),
}));
vi.mock("@/lib/i18n/content/content-read.server", () => ({
  getAllLocales: async (entity: string, id: string) => {
    h.readCalls++;
    return entity === "settings" && id === SID ? structuredClone(h.rows) : {};
  },
}));

import type { Locale } from "@/lib/i18n/config";
import { resolveHeroContent } from "@/lib/hero.helpers";
import { buildHomeMetadata } from "@/app/components/home/home-metadata";
import HomePageBody from "@/app/components/home/HomePageBody";
import { getPublicSettingsTexts, getPublicSettingsTextsByLocale } from "@/lib/i18n/content/public-shared-content.server";
import { resolveSingletonFields } from "@/lib/i18n/content/public-shared-content";
import { CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import { setRoutingContext, type RoutingContext } from "@/lib/i18n/routing/context";
import { localeRouteFor } from "@/lib/i18n/routing/locale-route";
import { homeRouteModule } from "@/app/(public)/_routes/home";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const L: Locale[] = ["tr", "en", "de"];
const FIELDS = CONTENT_ENTITY_BY_KEY.settings.fields.map((f) => f.name);
const full = (l: string): Row => Object.fromEntries(FIELDS.map((f) => [f, `${l} ${f}`]));
const empty = (): Row => Object.fromEntries(FIELDS.map((f) => [f, null]));

function setup(root: Locale, enabled: Locale[] = L, multilingual = true) {
  h.ctx = { root, enabled: multilingual ? enabled : [root], slugs: {}, redirects: {} };
  setRoutingContext(h.ctx as RoutingContext);
  h.settings = {
    ...h.settings,
    id: SID,
    multilingual_enabled: multilingual,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
    hero_enabled: true,
    hero_primary_cta_href: "/villalar",
    hero_secondary_cta_href: "/iletisim",
  };
}
function baseSettings(tr: Row) {
  h.settings = { ...h.settings, ...tr };
}

beforeEach(() => {
  h.settings = {};
  h.rows = {};
  h.readCalls = 0;
});

/* ---------------------------------------------------------------
   1) EŞDEĞERLİK — ana dil TR: eski yol (canonical + translations)
      ile yeni yol (merkezi satırlar: TR = ana tablo aynası) aynı.
   --------------------------------------------------------------- */
describe("eşdeğerlik — ana dil TR (eski resolveSettingsText yolu ile birebir)", () => {
  const scenarios: Array<[string, Row, Partial<Record<"en" | "de", Row>>]> = [
    ["tam çeviri", full("tr"), { en: full("en"), de: full("de") }],
    ["çeviri yok", full("tr"), {}],
    ["EN boş/boşluk → TR", full("tr"), { en: { ...full("en"), hero_title: "  ", hero_subtitle: "" } }],
    ["TR bilinçli boş hero başlığı + CTA", { ...full("tr"), hero_title: "", hero_primary_cta_text: "" }, { de: empty() }],
    ["TR NULL alanlar", { ...empty(), hero_title: "tr başlık" }, { en: { ...empty(), hero_badge_text: "en rozet" } }],
  ];
  for (const [name, tr, tx] of scenarios) {
    it(`${name}: hero + meta 3 dilde aynı`, async () => {
      setup("tr");
      baseSettings(tr);
      h.rows = { tr: { ...tr }, ...(tx as Record<string, Row>) };
      const translations = Object.fromEntries(Object.entries(tx)) as never;
      for (const l of L) {
        const legacy = resolveHeroContent(h.settings as never, { cacheKey: 1, locale: l, translations });
        const now = resolveHeroContent(h.settings as never, { cacheKey: 1, locale: l, texts: await getPublicSettingsTexts(l) });
        expect(now).toEqual(legacy);
      }
    });
  }

  it("TR satırı henüz yok (migration 107 öncesi) → ana tablo TR satırı sayılır; sonuç aynı", async () => {
    setup("tr");
    baseSettings({ ...full("tr"), hero_badge_text: "" });
    h.rows = { en: full("en") };
    for (const l of L) {
      const legacy = resolveHeroContent(h.settings as never, { locale: l, translations: { en: full("en") } as never });
      const now = resolveHeroContent(h.settings as never, { locale: l, texts: await getPublicSettingsTexts(l) });
      expect(now).toEqual(legacy);
    }
  });

  it("metadata başlık/açıklama 3 dilde eski davranışla aynı", async () => {
    setup("tr");
    baseSettings(full("tr"));
    h.rows = { tr: full("tr"), en: { ...empty(), default_meta_title: "EN T" } };
    expect((await buildHomeMetadata("tr")).title).toBe("tr default_meta_title");
    expect((await buildHomeMetadata("en")).title).toBe("EN T");
    expect((await buildHomeMetadata("en")).description).toBe("tr default_meta_description");
    expect((await buildHomeMetadata("de")).title).toBe("tr default_meta_title");
  });
});

/* ---------------------------------------------------------------
   2) DİL SİMETRİSİ — ana dil TR / EN / DE
   --------------------------------------------------------------- */
for (const root of L) {
  describe(`ana dil ${root.toUpperCase()} — hero/meta tekil kayıt kuralı`, () => {
    const others = L.filter((x) => x !== root);

    it("her dil kendi metnini alır; eksik dil ANA DİLE düşer (TR'ye değil)", async () => {
      setup(root);
      baseSettings(full("tr"));
      h.rows = { [root]: full(root), [others[0]]: full(others[0]) };
      if (root !== "tr") h.rows.tr = full("tr");
      for (const l of L) {
        const t = await getPublicSettingsTexts(l);
        const expected = h.rows[l] ? l : root;
        expect(t.hero_title).toBe(`${expected} hero_title`);
        const hero = resolveHeroContent(h.settings as never, { locale: l, texts: t });
        expect(hero.title).toBe(`${expected} hero_title`);
        expect(hero.primaryCta).toEqual({ text: `${expected} hero_primary_cta_text`, href: "/villalar" });
        const m = await buildHomeMetadata(l);
        expect(m.title).toBe(`${expected} default_meta_title`);
      }
    });

    it("ana dilde bilinçli boş hero başlığı → çevirisi olmayan dilde de GİZLİ (başka dilden doldurulmaz)", async () => {
      setup(root);
      baseSettings(full("tr"));
      h.rows = { [root]: { ...full(root), hero_title: "", hero_secondary_cta_text: "" } };
      if (root !== "tr") h.rows.tr = full("tr");
      const missing = others.find((l) => !h.rows[l])!;
      const hero = resolveHeroContent(h.settings as never, { locale: missing, texts: await getPublicSettingsTexts(missing) });
      expect(hero.title).toBe("");
      expect(hero.secondaryCta).toBeNull();
      expect(hero.subtitle).toBe(`${root} hero_subtitle`);
    });

    it("pasif dil satırı hiçbir dile yedek olmaz; ana dil satırı yoksa yalnız AKTİF diller", async () => {
      const passive = others[1];
      const active = others[0];
      setup(root, L.filter((x) => x !== passive));
      baseSettings(empty());
      h.rows = { [passive]: full(passive), [active]: { ...empty(), hero_title: `${active} hero_title` } };
      const t = await getPublicSettingsTexts(root);
      expect(t.hero_title).toBe(root === "tr" ? null : `${active} hero_title`);
      expect(Object.values(t).some((v) => typeof v === "string" && v.startsWith(passive))).toBe(false);
      /* İstemci haritası yalnız aktif dilleri içerir. */
      const by = await getPublicSettingsTextsByLocale();
      expect(Object.keys(by).sort()).toEqual(L.filter((x) => x !== passive).sort());
    });

    it("dispatcher: aktif diller HomePageBody'yi doğru dille; pasif dil 404", async () => {
      const r = localeRouteFor("home", homeRouteModule);
      const p = (lang: string) => ({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({}) });
      setup(root);
      for (const l of L) {
        const outer = (await r.Page(p(l) as never)) as { type: (x: unknown) => unknown; props: Record<string, unknown> };
        const el = (await outer.type(outer.props)) as { type: unknown; props: { locale: Locale } };
        expect(el.type).toBe(HomePageBody);
        expect(el.props.locale).toBe(l);
      }
      setup(root, L.filter((x) => x !== others[0]));
      await expect(r.Page(p(others[0]) as never)).rejects.toThrow("NEXT_NOT_FOUND");
      await expect(r.generateMetadata(p(others[0]) as never)).rejects.toThrow("NEXT_NOT_FOUND");
      setup(root, L, false);
      for (const o of others) await expect(r.Page(p(o) as never)).rejects.toThrow("NEXT_NOT_FOUND");
      const outer = (await r.Page(p(root) as never)) as { type: (x: unknown) => unknown; props: Record<string, unknown> };
      expect(((await outer.type(outer.props)) as { props: { locale: Locale } }).props.locale).toBe(root);
    });

    it("metadata: canonical/hreflang dispatcher üzerinden; og:locale istenen dil", async () => {
      setup(root);
      baseSettings(full("tr"));
      h.rows = { tr: full("tr"), en: full("en"), de: full("de") };
      const r = localeRouteFor("home", homeRouteModule);
      for (const l of L) {
        const m = await r.generateMetadata({ params: Promise.resolve({ lang: l }), searchParams: Promise.resolve({}) } as never);
        expect(m.title).toBe(`${l} default_meta_title`);
        expect(m.robots).toBeUndefined();
        expect((m.openGraph as { locale?: string }).locale).toBeTruthy();
      }
    });
  });
}

/* ---------------------------------------------------------------
   3) META YEDEĞİ — sabit Türkçe metin yok; ANA DİLİN sözlüğü
   --------------------------------------------------------------- */
describe("ana sayfa meta yedeği (default_meta_* hiçbir aktif dilde yok)", () => {
  const OLD_TR_TITLE = "Villa Kiralama — Lüks Villa Deneyimi";
  const OLD_TR_DESC =
    "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Hayalindeki tatili keşfet.";

  it("TR sözlük değerleri kaldırılan eski sabitlerle BİREBİR", () => {
    expect(getDictionary("tr").home.seo.metaTitleFallback).toBe(OLD_TR_TITLE);
    expect(getDictionary("tr").home.seo.metaDescriptionFallback).toBe(OLD_TR_DESC);
  });

  it("EN/DE yedekleri gerçekten çevrili ve dolu (TR'den farklı)", () => {
    for (const l of ["en", "de"] as const) {
      const seo = getDictionary(l).home.seo;
      expect(seo.metaTitleFallback.trim()).not.toBe("");
      expect(seo.metaDescriptionFallback.trim()).not.toBe("");
      expect(seo.metaTitleFallback).not.toBe(OLD_TR_TITLE);
      expect(seo.metaDescriptionFallback).not.toBe(OLD_TR_DESC);
    }
  });

  for (const root of L) {
    it(`ana dil ${root.toUpperCase()}: her sayfa dilinde ANA DİLİN sözlük yedeği; og/twitter aynı`, async () => {
      setup(root);
      baseSettings(empty());
      h.rows = Object.fromEntries(L.map((l) => [l, empty()]));
      const seo = getDictionary(root).home.seo;
      for (const l of L) {
        const m = await buildHomeMetadata(l);
        expect(m.title).toBe(seo.metaTitleFallback);
        expect(m.description).toBe(seo.metaDescriptionFallback);
        expect(m.openGraph?.title).toBe(seo.metaTitleFallback);
        expect((m.twitter as { title?: string }).title).toBe(seo.metaTitleFallback);
      }
    });

    it(`ana dil ${root.toUpperCase()}: pasif dilin değeri ve sözlüğü kullanılmaz`, async () => {
      const passive = L.find((x) => x !== root)!;
      setup(root, L.filter((x) => x !== passive));
      baseSettings(empty());
      h.rows = { [passive]: { ...empty(), default_meta_title: "PASİF başlık" } };
      for (const l of L.filter((x) => x !== passive)) {
        const m = await buildHomeMetadata(l);
        expect(m.title).toBe(getDictionary(root).home.seo.metaTitleFallback);
        expect(m.title).not.toBe(getDictionary(passive).home.seo.metaTitleFallback);
      }
    });

    it(`ana dil ${root.toUpperCase()}: değer varken yedek kullanılmaz; yalnız eksik alan yedeğe düşer`, async () => {
      setup(root);
      baseSettings(empty());
      h.rows = { [root]: { ...empty(), default_meta_title: `${root} başlık` } };
      if (root !== "tr") h.rows.tr = empty();
      const m = await buildHomeMetadata(root);
      expect(m.title).toBe(`${root} başlık`);
      expect(m.description).toBe(getDictionary(root).home.seo.metaDescriptionFallback);
    });
  }

  it("ayar okunamazsa varsayılan bağlam (ana dil TR) → Türkçe yedek (eskisi gibi)", async () => {
    h.settings = null as unknown as Record<string, unknown>;
    h.rows = {};
    const m = await buildHomeMetadata("en");
    expect(m.title).toBe(OLD_TR_TITLE);
  });
});

describe("saf kural — resolveSingletonFields", () => {
  const def = CONTENT_ENTITY_BY_KEY.settings;
  it("istenen dil pasifse kendi satırı kullanılmaz", () => {
    const out = resolveSingletonFields(def, { tr: full("tr"), de: full("de") }, "de", { root: "tr", enabled: ["tr", "en"] });
    expect(out.hero_title).toBe("tr hero_title");
  });
  it("ana dil satırında NULL → zincir durur (NULL; sözlük varsayılanı çağırana kalır)", () => {
    const out = resolveSingletonFields(def, { en: empty(), de: full("de") }, "tr", { root: "en", enabled: ["tr", "en", "de"] });
    expect(out.hero_title).toBeNull();
  });
  it("ana dil satırı yoksa diğer aktif dillerden ilk dolu (dil sırası)", () => {
    const out = resolveSingletonFields(def, { de: full("de") }, "tr", { root: "en", enabled: ["en", "tr", "de"] });
    expect(out.hero_title).toBe("de hero_title");
  });
});
