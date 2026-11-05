import { describe, expect, it } from "vitest";

import type { RoutingContext } from "@/lib/i18n/routing/context";
import { ownLocaleSlugBase, slugSource, toBaseSlug, toLocalizedSlug } from "@/lib/i18n/routing/context";
import { rowsToSlugMap } from "@/lib/i18n/routing/sql";

/* Faz 5 — teknik anahtar ile dil (TR/EN/DE) URL slug'larının ayrımı: routing. */

function ctx(rows: Parameters<typeof rowsToSlugMap>[0]): RoutingContext {
  return { root: "tr", enabled: ["tr", "en", "de"], slugs: rowsToSlugMap(rows), redirects: {} } as unknown as RoutingContext;
}

describe("Faz 5 — TR dil slug'ı routing'de çeviri satırından okunur", () => {
  it("tr.slug = teknik anahtar (107 sonrası bugünkü durum): URL'ler değişmez", () => {
    const c = ctx([
      { kind: "villa", base: "deniz-villa", locale: "tr", slug: "deniz-villa" },
      { kind: "villa", base: "deniz-villa", locale: "en", slug: "sea-villa" },
    ]);
    expect(toLocalizedSlug(c, "villa", "deniz-villa", "tr")).toBe("deniz-villa");
    expect(toLocalizedSlug(c, "villa", "deniz-villa", "en")).toBe("sea-villa");
    expect(slugSource(c, "villa", "deniz-villa", "tr")).toBe("own");
    expect(toBaseSlug(c, "villa", "deniz-villa", "tr")).toBe("deniz-villa");
  });
  it("TR slug'ı teknik anahtardan farklı (108 sonrası): TR URL kendi slug'ı, teknik anahtar 'base' (kanonik yönlendirme)", () => {
    const c = ctx([{ kind: "villa", base: "v-123", locale: "tr", slug: "deniz-manzarali-villa" }]);
    expect(toLocalizedSlug(c, "villa", "v-123", "tr")).toBe("deniz-manzarali-villa");
    expect(toBaseSlug(c, "villa", "deniz-manzarali-villa", "tr")).toBe("v-123");
    expect(slugSource(c, "villa", "deniz-manzarali-villa", "tr")).toBe("own");
    expect(slugSource(c, "villa", "v-123", "tr")).toBe("base");
    expect(ownLocaleSlugBase(c, "villa", "deniz-manzarali-villa", "tr")).toBe("v-123");
    expect(ownLocaleSlugBase(c, "villa", "v-123", "tr")).toBeNull();
  });
  it("TR slug'ı yok (NULL): TR URL teknik anahtar, 'own'", () => {
    const c = ctx([{ kind: "villa", base: "v-9", locale: "en", slug: "v-nine" }]);
    expect(toLocalizedSlug(c, "villa", "v-9", "tr")).toBe("v-9");
    expect(slugSource(c, "villa", "v-9", "tr")).toBe("own");
  });
});
