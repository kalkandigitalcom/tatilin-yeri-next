import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import { applyBaseSupplements, resolveLocalizedContent, type ContentRow } from "@/lib/i18n/content/content-resolve";
import { diffLegacyVsNext, resolveLegacy } from "@/lib/i18n/content/content-legacy-compare";
import { isExplicitEmptyContent } from "@/lib/i18n/content/content-field-rules";

/* ===============================================================
   Faz 5 son kontroller — BİLİNÇLİ BOŞ GÖVDE ("")
   Blog ve CMS sayfası gövdesi bir dilde "" ise yedek zinciri durur;
   NULL'da zincir (ve sayfada eski content yedeği) aynen devam eder.
   Diğer alanların ve diğer türlerin yedek davranışı değişmez; noindex
   (isFallback) kuralı korunur.
   =============================================================== */

const ID = "c2000000-0000-0000-0000-000000000001";
const chainOf = (requested: Locale, root: Locale): Locale[] =>
  [requested, root, ...(["tr", "en", "de"] as Locale[])].filter((l, i, a) => a.indexOf(l) === i);

function rows(entity: ContentEntityKey, spec: Partial<Record<Locale, Record<string, unknown>>>) {
  const def = CONTENT_ENTITY_BY_KEY[entity];
  const out: Partial<Record<Locale, ContentRow>> = {};
  for (const [l, v] of Object.entries(spec) as [Locale, Record<string, unknown>][]) {
    const values: Record<string, unknown> = {};
    for (const f of def.fields) values[f.name] = v[f.name] ?? null;
    out[l] = { parentId: ID, locale: l, values, slug: null };
  }
  return out;
}

for (const entity of ["blog_post", "page"] as const) {
  const def = CONTENT_ENTITY_BY_KEY[entity];
  describe(`${entity} — bilinçli boş gövde`, () => {
    for (const root of ["tr", "en", "de"] as Locale[]) {
      it(`ana dil ${root}: istenen dilde gövde "" → başka dilin gövdesi GÖSTERİLMEZ; başlık kendi dilinden`, () => {
        const byLocale = rows(entity, {
          tr: { title: "TR", body: root === "tr" ? "" : "<p>TR</p>" },
          en: { title: "EN", body: root === "en" ? "" : "<p>EN</p>" },
          de: { title: "DE", body: root === "de" ? "" : "<p>DE</p>" },
        });
        const c = resolveLocalizedContent(def, byLocale, root, chainOf(root, root))!;
        expect(c.values.body).toBe("");
        expect(c.sourceLocale.body).toBe(root);
        expect(c.explicitEmpty).toEqual(["body"]);
        expect(c.missing).toContain("body");
        expect(c.values.title).toBe(root.toUpperCase());
        expect(c.isFallback).toBe(false); // başlık istenen dilde → index (eski kural)
      });
    }

    it("NULL gövde → zincir devam eder (ana dile / diğer dile düşer) — eski davranış", () => {
      const byLocale = rows(entity, { tr: { title: "TR", body: "<p>TR</p>" }, en: { title: "EN", body: null } });
      const c = resolveLocalizedContent(def, byLocale, "en", chainOf("en", "tr"))!;
      expect(c.values.body).toBe("<p>TR</p>");
      expect(c.sourceLocale.body).toBe("tr");
      expect(c.fallbackFields).toContain("body");
      expect(c.explicitEmpty).toBeUndefined();
    });

    it("istenen dilde gövde NULL, ana dilde \"\" → ana dilde durur (DE'ye geçilmez)", () => {
      const byLocale = rows(entity, {
        tr: { title: "TR", body: "" },
        en: { title: "EN", body: null },
        de: { title: "DE", body: "<p>DE</p>" },
      });
      const c = resolveLocalizedContent(def, byLocale, "en", chainOf("en", "tr"))!;
      expect(c.values.body).toBe("");
      expect(c.sourceLocale.body).toBe("tr");
      expect(c.values.body).not.toBe("<p>DE</p>");
    });

    it("yalnız boşluk da bilinçli boş sayılır (1. dalga content kuralıyla tutarlı)", () => {
      const c = resolveLocalizedContent(def, rows(entity, { tr: { title: "TR", body: "   " }, en: { body: "<p>EN</p>" } }), "tr", chainOf("tr", "tr"))!;
      expect(c.values.body).toBe("");
      expect(isExplicitEmptyContent(def, { name: "body" }, "  ")).toBe(true);
    });

    it("diğer alanların yedeği BOZULMAZ: gövde \"\" iken özet/SEO/başlık ana dile düşer", () => {
      const byLocale = rows(entity, {
        tr: { title: "TR", body: "<p>TR</p>", excerpt: "Özet", seo_title: "SEO TR" },
        en: { title: null, body: "", excerpt: null, seo_title: null },
      });
      const c = resolveLocalizedContent(def, byLocale, "en", chainOf("en", "tr"))!;
      expect(c.values.body).toBe("");
      expect(c.values.title).toBe("TR");
      expect(c.values.excerpt).toBe("Özet");
      expect(c.values.seo_title).toBe("SEO TR");
      expect(c.sourceLocale.title).toBe("tr");
    });

    it("noindex KORUNUR: istenen dilde yalnız bilinçli boş gövde varsa çeviri SAYILMAZ (isFallback)", () => {
      const byLocale = rows(entity, { tr: { title: "TR", body: "<p>TR</p>" }, en: { title: null, body: "" } });
      const c = resolveLocalizedContent(def, byLocale, "en", chainOf("en", "tr"))!;
      expect(c.isFallback).toBe(true);
      // satırı hiç olmayan dil: eski kural aynen
      const d = resolveLocalizedContent(def, rows(entity, { tr: { title: "TR", body: "" } }), "de", chainOf("de", "tr"))!;
      expect(d.isFallback).toBe(true);
      expect(d.values.body).toBe("");
    });

    it("eski ↔ yeni karşılaştırma: TR gövdesi \"\" iken TR ve çevirisiz EN isteğinde FARK YOK", () => {
      const byLocale = rows(entity, { tr: { title: "TR", body: "" }, de: { title: "DE", body: "<p>DE</p>" } });
      const base = { title: "TR", body: "", slug: "x" } as Record<string, unknown>;
      for (const req of ["tr", "en"] as Locale[]) {
        const legacy = resolveLegacy(def, base as never, byLocale, req);
        const next = resolveLocalizedContent(def, byLocale, req, chainOf(req, "tr"));
        const bodyDiff = diffLegacyVsNext(def, legacy, next, byLocale).filter((d) => d.field === "body");
        expect({ req, bodyDiff }).toEqual({ req, bodyDiff: [] });
      }
    });
  });
}

describe("sayfa — eski pages.content yedeği ile birlikte", () => {
  const def = CONTENT_ENTITY_BY_KEY.page;
  it("TR gövdesi \"\" → content GELMEZ ve zincir durur; NULL → content gelir", () => {
    const sup = new Map([[ID, { body: "<p>ESKİ</p>" }]]);
    const withEmpty = applyBaseSupplements(def, Object.values(rows("page", { tr: { title: "TR", body: "" }, en: { body: "<p>EN</p>" } })) as ContentRow[], sup);
    const idx = Object.fromEntries(withEmpty.map((r) => [r.locale, r])) as Partial<Record<Locale, ContentRow>>;
    expect(resolveLocalizedContent(def, idx, "tr", chainOf("tr", "tr"))!.values.body).toBe("");
    const withNull = applyBaseSupplements(def, Object.values(rows("page", { tr: { title: "TR", body: null }, en: { body: "<p>EN</p>" } })) as ContentRow[], sup);
    const idx2 = Object.fromEntries(withNull.map((r) => [r.locale, r])) as Partial<Record<Locale, ContentRow>>;
    expect(resolveLocalizedContent(def, idx2, "tr", chainOf("tr", "tr"))!.values.body).toBe("<p>ESKİ</p>");
  });
});

describe("diğer türler ve alanlar DEĞİŞMEZ", () => {
  it("villa açıklaması \"\" → eskisi gibi ana dile düşer", () => {
    const def = CONTENT_ENTITY_BY_KEY.villa;
    const c = resolveLocalizedContent(def, rows("villa", { tr: { description: "TR" }, en: { description: "" } }), "en", chainOf("en", "tr"))!;
    expect(c.values.description).toBe("TR");
    expect(c.explicitEmpty).toBeUndefined();
  });
  it("blog başlığı/özeti \"\" → eskisi gibi yedek", () => {
    const def = CONTENT_ENTITY_BY_KEY.blog_post;
    const c = resolveLocalizedContent(def, rows("blog_post", { tr: { title: "TR", excerpt: "Ö" }, en: { title: "", excerpt: "" } }), "en", chainOf("en", "tr"))!;
    expect(c.values.title).toBe("TR");
    expect(c.values.excerpt).toBe("Ö");
  });
  it("yalnız gövde kuralı: isExplicitEmptyContent başka alan/türde false", () => {
    expect(isExplicitEmptyContent(CONTENT_ENTITY_BY_KEY.page, { name: "title" }, "")).toBe(false);
    expect(isExplicitEmptyContent(CONTENT_ENTITY_BY_KEY.faq, { name: "answer" }, "")).toBe(false);
    expect(isExplicitEmptyContent(CONTENT_ENTITY_BY_KEY.page, { name: "body" }, null)).toBe(false);
  });
});

describe("eski ↔ yeni: KASITLI tek fark", () => {
  it("ÇEVİRİ satırında gövde \"\": eski katman TR'ye düşerdi, yeni servis bilinçli boş sayar (yalnız gövde)", () => {
    const def = CONTENT_ENTITY_BY_KEY.page;
    const byLocale = rows("page", { tr: { title: "TR", body: "<p>TR</p>" }, en: { title: "EN", body: "" } });
    const base = { title: "TR", body: "<p>TR</p>", slug: "x" } as Record<string, unknown>;
    const legacy = resolveLegacy(def, base as never, byLocale, "en");
    const next = resolveLocalizedContent(def, byLocale, "en", chainOf("en", "tr"));
    expect(legacy.values.body).toBe("<p>TR</p>");
    expect(next?.values.body).toBe("");
    const diffs = diffLegacyVsNext(def, legacy, next, byLocale);
    expect(diffs.map((d) => d.field)).toEqual(["body"]);
    // NULL'da fark YOK (eski çeviri servisleri boşu NULL yazıyordu)
    const byNull = rows("page", { tr: { title: "TR", body: "<p>TR</p>" }, en: { title: "EN", body: null } });
    expect(diffLegacyVsNext(def, resolveLegacy(def, base as never, byNull, "en"), resolveLocalizedContent(def, byNull, "en", chainOf("en", "tr")), byNull)).toEqual([]);
  });
});
