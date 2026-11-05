/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 1 — dil bazlı açma/kapama: SAF KURALLAR
   ===============================================================
   Hedef:
     lib/i18n/config.ts            getRootLocale / getEnabledPublicLocales /
                                   isPublicLocaleEnabled
     lib/i18n/site-locales.validation.ts
     lib/i18n/seo-alternates.ts    pickSeoAlternates / resolveSeoAlternates /
                                   filterLocaleLanguages
   Kombinasyonlar: ana dil (tr/en/de) × aktif dil setleri (üçü, ikisi,
   yalnız ana dil) × çoklu dil kapalı.
   =============================================================== */

import { describe, it, expect } from "vitest";

import {
  getEnabledPublicLocales,
  getRootLocale,
  isPublicLocaleEnabled,
  SUPPORTED_LOCALES,
  type Locale,
  type PublicLocaleState,
} from "@/lib/i18n/config";
import {
  isLocaleToggleLocked,
  validateEnabledLocalesInput,
} from "@/lib/i18n/site-locales.validation";
import {
  filterLocaleLanguages,
  pickSeoAlternates,
  resolveSeoAlternates,
} from "@/lib/i18n/seo-alternates";

function rows(enabled: Locale[]): PublicLocaleState[] {
  return SUPPORTED_LOCALES.map((code, i) => ({
    code,
    is_enabled: enabled.includes(code),
    sort_order: (i + 1) * 10,
  }));
}

function settings(
  root: Locale,
  enabled: Locale[] | null,
  multilingual = true
) {
  return {
    multilingual_enabled: multilingual,
    public_default_locale: root,
    public_locales: enabled ? rows(enabled) : undefined,
  };
}

const ROOTS: Locale[] = ["tr", "en", "de"];

describe("getRootLocale", () => {
  it("çoklu dil kapalı → her zaman TR (MOD A, ayar ne olursa olsun)", () => {
    for (const r of ROOTS) {
      expect(getRootLocale(settings(r, null, false))).toBe("tr");
    }
  });
  it("çoklu dil açık → public_default_locale", () => {
    for (const r of ROOTS) expect(getRootLocale(settings(r, null))).toBe(r);
  });
  it("settings null/geçersiz → TR (fail-safe)", () => {
    expect(getRootLocale(null)).toBe("tr");
    expect(
      getRootLocale({ multilingual_enabled: true, public_default_locale: "xx" })
    ).toBe("tr");
  });
});

describe("getEnabledPublicLocales — tüm kombinasyonlar", () => {
  it("çoklu dil kapalı → yalnız ana dil (TR); public_locales yok sayılır", () => {
    expect(getEnabledPublicLocales(settings("tr", ["tr", "en", "de"], false))).toEqual(["tr"]);
    expect(getEnabledPublicLocales(settings("de", ["tr", "en", "de"], false))).toEqual(["tr"]);
  });

  it("public_locales yok (migration 101 öncesi) → tüm diller (eski davranış)", () => {
    for (const r of ROOTS) {
      expect(getEnabledPublicLocales(settings(r, null))).toEqual(["tr", "en", "de"]);
    }
    expect(
      getEnabledPublicLocales({ multilingual_enabled: true, public_locales: [] })
    ).toEqual(["tr", "en", "de"]);
  });

  for (const root of ROOTS) {
    const others = SUPPORTED_LOCALES.filter((l) => l !== root);
    it(`ana dil ${root}: üç dil açık`, () => {
      expect(getEnabledPublicLocales(settings(root, ["tr", "en", "de"]))).toEqual([
        "tr",
        "en",
        "de",
      ]);
    });
    for (const other of others) {
      it(`ana dil ${root}: iki dil açık (${root}+${other})`, () => {
        const got = getEnabledPublicLocales(settings(root, [root, other]));
        expect(new Set(got)).toEqual(new Set([root, other]));
        expect(got).toHaveLength(2);
      });
    }
    it(`ana dil ${root}: yalnız ana dil`, () => {
      expect(getEnabledPublicLocales(settings(root, [root]))).toEqual([root]);
    });
    it(`ana dil ${root}: DB'de kapalı görünse bile ana dil daima dahil`, () => {
      expect(getEnabledPublicLocales(settings(root, []))).toEqual([root]);
    });
  }

  it("kodda desteklenmeyen DB satırı yok sayılır; satırı olmayan dil kapalı", () => {
    const s = {
      multilingual_enabled: true,
      public_default_locale: "tr",
      public_locales: [
        { code: "tr", is_enabled: true, sort_order: 10 },
        { code: "fr", is_enabled: true, sort_order: 15 },
        { code: "de", is_enabled: true, sort_order: 30 },
      ],
    };
    expect(getEnabledPublicLocales(s)).toEqual(["tr", "de"]);
  });

  it("sıra sort_order'a göre", () => {
    const s = {
      multilingual_enabled: true,
      public_default_locale: "tr",
      public_locales: [
        { code: "tr", is_enabled: true, sort_order: 30 },
        { code: "en", is_enabled: true, sort_order: 10 },
        { code: "de", is_enabled: true, sort_order: 20 },
      ],
    };
    expect(getEnabledPublicLocales(s)).toEqual(["en", "de", "tr"]);
  });

  it("isPublicLocaleEnabled", () => {
    const s = settings("tr", ["tr", "de"]);
    expect(isPublicLocaleEnabled(s, "tr")).toBe(true);
    expect(isPublicLocaleEnabled(s, "de")).toBe(true);
    expect(isPublicLocaleEnabled(s, "en")).toBe(false);
  });
});

describe("validateEnabledLocalesInput", () => {
  it("geçerli liste → normalize (tekrar atılır, sabit sıra)", () => {
    expect(validateEnabledLocalesInput(["de", "tr", "de"], "tr")).toEqual({
      ok: true,
      enabled: ["tr", "de"],
    });
  });
  it("dizi değil / bilinmeyen kod / boş → hata", () => {
    expect(validateEnabledLocalesInput("tr", "tr").ok).toBe(false);
    expect(validateEnabledLocalesInput(["tr", "fr"], "tr").ok).toBe(false);
    expect(validateEnabledLocalesInput([], "tr").ok).toBe(false);
  });
  it("ana dil listede yoksa → 'Ana dil kapatılamaz.'", () => {
    expect(validateEnabledLocalesInput(["tr", "en"], "de")).toEqual({
      ok: false,
      error: "Ana dil kapatılamaz.",
    });
  });
  /* Faz 6 Dalga 1 (karar K4): TR'ye özel kilit KALDIRILDI. Tek kural: ana
     dil kapatılamaz — bu kural her dil için aynı ve aşağıda 3 ana dille
     doğrulanıyor. */
  it("TR ana dil değilken kapatılabilir; ana dil (hangisi olursa) kapatılamaz", () => {
    expect(validateEnabledLocalesInput(["en", "de"], "en")).toEqual({ ok: true, enabled: ["en", "de"] });
    expect(validateEnabledLocalesInput(["de"], "de")).toEqual({ ok: true, enabled: ["de"] });
    for (const root of ["tr", "en", "de"] as const) {
      const others = (["tr", "en", "de"] as const).filter((l) => l !== root);
      expect(validateEnabledLocalesInput([...others], root)).toEqual({ ok: false, error: "Ana dil kapatılamaz." });
    }
  });
  it("anahtar kilidi: YALNIZ ana dil kilitli (TR dahil hiçbir dile özel kilit yok)", () => {
    for (const root of ["tr", "en", "de"] as const) {
      for (const l of ["tr", "en", "de"] as const) {
        expect({ root, l, locked: isLocaleToggleLocked(l, root) }).toEqual({ root, l, locked: l === root });
      }
    }
  });
});

describe("SEO alternates — kapalı dil hiçbir hreflang'de görünmez", () => {
  it("filterLocaleLanguages yalnız aktif dilleri + x-default bırakır", () => {
    expect(
      filterLocaleLanguages(
        { tr: "/a", en: "/en/a", de: "/de/a", "x-default": "/a" },
        ["tr", "de"]
      )
    ).toEqual({ tr: "/a", de: "/de/a", "x-default": "/a" });
  });

  it("çoklu dil kapalı → yalnız canonical (hreflang YOK)", () => {
    expect(resolveSeoAlternates(settings("tr", null, false), "/iletisim", "tr")).toEqual({
      canonical: "/iletisim",
    });
  });

  it("tek aktif dil → yalnız canonical", () => {
    expect(resolveSeoAlternates(settings("tr", ["tr"]), "/iletisim", "tr")).toEqual({
      canonical: "/iletisim",
    });
  });

  it("üç dil açık → eski çıktı ile BİREBİR aynı", () => {
    expect(resolveSeoAlternates(settings("tr", ["tr", "en", "de"]), "/iletisim", "en")).toEqual({
      canonical: "/en/contact",
      languages: {
        tr: "/iletisim",
        en: "/en/contact",
        de: "/de/kontakt",
        "x-default": "/iletisim",
      },
    });
  });

  it("EN kapalı → hreflang'de en yok; canonical değişmez", () => {
    expect(resolveSeoAlternates(settings("tr", ["tr", "de"]), "/blog/x", "de")).toEqual({
      canonical: "/de/blog/x",
      languages: { tr: "/blog/x", de: "/de/blog/x", "x-default": "/blog/x" },
    });
  });

  it("migration öncesi (public_locales yok) + çoklu dil açık → eski davranış", () => {
    const out = pickSeoAlternates(settings("tr", null), "/x", {
      tr: "/x",
      en: "/en/x",
      de: "/de/x",
      "x-default": "/x",
    });
    expect(Object.keys(out.languages ?? {})).toEqual(["tr", "en", "de", "x-default"]);
  });
});
