import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import {
  ownHistoryHasTechnicalKey,
  slugOwnerLocale,
  slugSource,
  type RoutingContext,
} from "@/lib/i18n/routing/context";
import { resolveIncomingPath } from "@/lib/i18n/routing/url";
import { REDIRECTS_SQL } from "@/lib/i18n/routing/sql";

/* ===============================================================
   Faz 7 R-B — 108 sonrası TR (dil) slug değişikliği: eski URL aynı
   dilin YENİ slug'ına KALICI 308; başka dile yanlış yönlendirme yok.
   Kayıtlar (teknik anahtar → dil slug'ları), 108 sonrası:
     blog kas-rehberi : tr "kas-rehberi-2026", en "kas-guide"  (DE yok)
     page hakkimizda  : tr "hakkimizda-2026"                   (EN/DE yok)
     villa deniz      : tr "deniz-villa-2026", en "sea-villa", de "meer-villa"
     villa kotu       : tr "kotu-yeni" (TR slug'ı eskiden NULL → geçmiş YOK)
   url_redirects (REDIRECTS_SQL, Faz 7: eski slug = kaydın kendi
   teknik anahtarı olan satırlar artık atlanmıyor): tr → teknik anahtar.
   =============================================================== */

const L: Locale[] = ["tr", "en", "de"];

function ctxFor(root: Locale, enabled: Locale[] = L, extra?: Partial<RoutingContext>): RoutingContext {
  return {
    root,
    enabled,
    slugs: {
      blog: { "kas-rehberi": { tr: "kas-rehberi-2026", en: "kas-guide" } },
      page: { hakkimizda: { tr: "hakkimizda-2026" } },
      villa: {
        "deniz-villa": { tr: "deniz-villa-2026", en: "sea-villa", de: "meer-villa" },
        kotu: { tr: "kotu-yeni" },
      },
    },
    redirects: {
      blog: { tr: { "kas-rehberi": "kas-rehberi" } },
      page: { tr: { hakkimizda: "hakkimizda" } },
      villa: { tr: { "deniz-villa": "deniz-villa" } },
    },
    live: {
      blog: new Set(["kas-rehberi"]),
      page: new Set(["hakkimizda"]),
      villa: new Set(["deniz-villa", "kotu"]),
    },
    ...extra,
  };
}

/** Yönlendirmeleri izler (en fazla 4 adım); son karar + adımlar. */
function follow(path: string, ctx: RoutingContext) {
  const hops: Array<{ path: string; status: number }> = [];
  let p = path;
  for (let i = 0; i < 4; i++) {
    const d = resolveIncomingPath(p, ctx);
    if (d.type !== "redirect") return { final: d, hops, path: p };
    hops.push({ path: d.path, status: d.status });
    p = d.path;
  }
  throw new Error(`döngü/zincir: ${path} → ${hops.map((h) => h.path).join(" → ")}`);
}

describe("Faz 7 R-B — ana dil TR: eski TR URL → yeni TR URL (308)", () => {
  const ctx = ctxFor("tr");

  it("blog: eski TR slug'ı (= teknik anahtar) → yeni TR slug'ı 308; DE'ye GİTMEZ", () => {
    expect(resolveIncomingPath("/blog/kas-rehberi", ctx)).toEqual({
      type: "redirect",
      path: "/blog/kas-rehberi-2026",
      status: 308,
    });
    expect(resolveIncomingPath("/blog/kas-rehberi-2026", ctx).type).toBe("rewrite");
  });

  it("CMS: eski TR slug'ı → yeni TR slug'ı 308; EN/DE'ye GİTMEZ", () => {
    expect(resolveIncomingPath("/p/hakkimizda", ctx)).toEqual({
      type: "redirect",
      path: "/p/hakkimizda-2026",
      status: 308,
    });
    expect(resolveIncomingPath("/p/hakkimizda-2026", ctx).type).toBe("rewrite");
  });

  it("villa: eski TR slug'ı → yeni TR slug'ı artık KALICI 308 (önceden 307)", () => {
    expect(resolveIncomingPath("/kiralik-villa/deniz-villa", ctx)).toEqual({
      type: "redirect",
      path: "/kiralik-villa/deniz-villa-2026",
      status: 308,
    });
  });

  it("villa: TR geçmişi olmasa da (eski TR slug'ı NULL idi) teknik anahtar → aynı dilin kanoniği 308", () => {
    expect(resolveIncomingPath("/kiralik-villa/kotu", ctx)).toEqual({
      type: "redirect",
      path: "/kiralik-villa/kotu-yeni",
      status: 308,
    });
  });

  it("EN/DE URL'leri değişmez: DE teknik anahtarı kanonik kullanır; EN kendi slug'ı", () => {
    expect(resolveIncomingPath("/de/blog/kas-rehberi", ctx).type).toBe("rewrite");
    expect(resolveIncomingPath("/en/blog/kas-guide", ctx).type).toBe("rewrite");
    expect(resolveIncomingPath("/en/blog/kas-rehberi", ctx)).toEqual({ type: "redirect", path: "/en/blog/kas-guide", status: 308 });
    // TR'nin yeni slug'ı önekli DE yolunda → DE kanoniği (önceki kural, 308)
    expect(resolveIncomingPath("/de/blog/kas-rehberi-2026", ctx)).toEqual({ type: "redirect", path: "/de/blog/kas-rehberi", status: 308 });
  });

  it("ikinci değişiklik: bütün eski TR slug'ları TEK adımda en yeni TR slug'ına (zincir yok)", () => {
    const c = ctxFor("tr", L, {
      slugs: { blog: { "kas-rehberi": { tr: "kas-rehberi-v3", en: "kas-guide" } } },
      redirects: { blog: { tr: { "kas-rehberi": "kas-rehberi", "kas-rehberi-2026": "kas-rehberi" } } },
    });
    for (const old of ["/blog/kas-rehberi", "/blog/kas-rehberi-2026"]) {
      const r = follow(old, c);
      expect(r.hops).toEqual([{ path: "/blog/kas-rehberi-v3", status: 308 }]);
      expect(r.final.type).toBe("rewrite");
    }
  });
});

describe("Faz 7 R-B — çakışan slug senaryoları", () => {
  it("eski TR slug'ını artık BAŞKA bir kaydın TR slug'ı kullanıyor → o kayıt açılır (yönlendirme yok)", () => {
    const c = ctxFor("tr", L, {
      slugs: {
        blog: {
          "kas-rehberi": { tr: "kas-rehberi-2026", en: "kas-guide" },
          "yeni-yazi": { tr: "kas-rehberi" },
        },
      },
      live: { blog: new Set(["kas-rehberi", "yeni-yazi"]) },
    });
    expect(resolveIncomingPath("/blog/kas-rehberi", c).type).toBe("rewrite");
    expect(slugSource(c, "blog", "kas-rehberi", "tr")).toBe("own");
  });

  it("DE'nin GERÇEK slug'ı teknik anahtara eşit + TR değişti → TR kök URL'si yine TR'ye (kendi geçmişi önce)", () => {
    const c = ctxFor("tr", L, {
      slugs: { blog: { "kas-rehberi": { tr: "kas-rehberi-2026", en: "kas-guide", de: "kas-rehberi" } } },
    });
    expect(resolveIncomingPath("/blog/kas-rehberi", c)).toEqual({ type: "redirect", path: "/blog/kas-rehberi-2026", status: 308 });
    expect(resolveIncomingPath("/de/blog/kas-rehberi", c).type).toBe("rewrite");
  });

  it("başka dilin slug'ı birden fazla kayda işaret ediyorsa çözülmez (önceki kural korunur)", () => {
    const c = ctxFor("tr", L, {
      slugs: {
        villa: {
          "deniz-villa": { tr: "deniz-villa-2026", en: "sea-villa", de: "meer-villa" },
          koy: { tr: "koy-villa", en: "bay-villa", de: "sea-villa" },
        },
      },
      live: { villa: new Set(["deniz-villa", "koy"]) },
    });
    // Çözülmeyen slug canlı teknik anahtar değil → proxy 404 (yanlış kayda yönlendirme YOK).
    expect(resolveIncomingPath("/kiralik-villa/sea-villa", c)).toMatchObject({ type: "notFound", reason: "noContent" });
  });

  it("REDIRECTS_SQL: eski slug yalnız BAŞKA bir kaydın teknik anahtarıysa atlanır (aynı kayıt artık atlanmaz)", () => {
    expect(REDIRECTS_SQL).not.toMatch(/p\.slug <> r\.old_slug/);
    expect(REDIRECTS_SQL.match(/x\.slug = r\.old_slug AND x\.id <> p\.id/g)?.length).toBe(4);
    expect(REDIRECTS_SQL).toMatch(/^\s*WITH r AS/);
    expect(REDIRECTS_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
});

describe("Faz 7 R-B — ana dil EN / DE ve pasif dil", () => {
  for (const root of ["en", "de"] as const) {
    it(`ana dil ${root}: eski TR kök URL'si (TR değişmiş) → TR'nin GÜNCEL sayfası (307, ana dile bağlı); yanlış dile gitmez`, () => {
      const c = ctxFor(root);
      const d = resolveIncomingPath("/blog/kas-rehberi", c);
      if (root === "en") {
        expect(d).toEqual({ type: "redirect", path: "/tr/blog/kas-rehberi-2026", status: 307 });
      } else {
        // DE'nin kanoniği teknik anahtar → öneksiz /blog/kas-rehberi DE sayfasıdır.
        expect(d.type).toBe("rewrite");
      }
      expect(resolveIncomingPath("/tr/blog/kas-rehberi", c)).toEqual({
        type: "redirect",
        path: "/tr/blog/kas-rehberi-2026",
        status: 308,
      });
    });
  }

  it("TR PASİF iken TR geçmişi kullanılmaz; teknik anahtar TR'ye gönderilmez", () => {
    const c = ctxFor("en", ["en", "de"]);
    const d = resolveIncomingPath("/blog/kas-rehberi", c);
    expect(d.type === "redirect" ? d.path.startsWith("/tr") : false).toBe(false);
    expect(slugOwnerLocale(c, "blog", "kas-rehberi", "en")).toBe("de");
  });

  it("sahip önceliği: gerçek dil slug'ı > dilin kendi geçmişi > teknik anahtarı yedek kullanan dil", () => {
    const c = ctxFor("en");
    // TR'nin geçmişinde teknik anahtar var, DE yalnız yedek kullanıyor → TR
    expect(slugOwnerLocale(c, "blog", "kas-rehberi", "en")).toBe("tr");
    // DE'nin gerçek slug'ı teknik anahtar → DE
    const c2 = ctxFor("en", L, { slugs: { blog: { "kas-rehberi": { tr: "kas-rehberi-2026", en: "kas-guide", de: "kas-rehberi" } } } });
    expect(slugOwnerLocale(c2, "blog", "kas-rehberi", "en")).toBe("de");
    expect(ownHistoryHasTechnicalKey(c, "blog", "kas-rehberi", "tr")).toBe(true);
    expect(ownHistoryHasTechnicalKey(c, "blog", "kas-rehberi", "en")).toBe(false);
  });

  it("108 öncesi (TR slug = teknik anahtar, geçmiş yok): davranış DEĞİŞMEDİ", () => {
    const pre = ctxFor("tr", L, {
      slugs: { blog: { "kas-rehberi": { tr: "kas-rehberi", en: "kas-guide" } } },
      redirects: {},
    });
    expect(resolveIncomingPath("/blog/kas-rehberi", pre).type).toBe("rewrite");
    expect(resolveIncomingPath("/blog/kas-guide", pre)).toEqual({ type: "redirect", path: "/en/blog/kas-guide", status: 307 });
  });
});

describe("Faz 7 R-B — döngü yok: her senaryoda en fazla 1 yönlendirme, sonra rewrite", () => {
  const paths = [
    "/blog/kas-rehberi", "/blog/kas-rehberi-2026", "/p/hakkimizda", "/p/hakkimizda-2026",
    "/kiralik-villa/deniz-villa", "/kiralik-villa/kotu", "/en/blog/kas-rehberi", "/de/blog/kas-rehberi-2026",
    "/tr/blog/kas-rehberi", "/en/villa/deniz-villa", "/de/p/hakkimizda-2026",
  ];
  for (const root of L) {
    it(`ana dil ${root}`, () => {
      const c = ctxFor(root);
      for (const p of paths) {
        const r = follow(p, c);
        expect(r.hops.length, `${p} → ${r.hops.map((h) => h.path).join(" → ")}`).toBeLessThanOrEqual(2);
        expect(r.final.type).not.toBe("redirect");
      }
    });
  }
});
