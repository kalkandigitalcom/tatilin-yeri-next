import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ===============================================================
   Faz 6 — DALGA 4 / son düzeltme: KÖK LAYOUT varsayılan başlığı.
   Kendi başlığını vermeyen sayfaların miras aldığı title/description:
   ayarda değer varsa AYNEN; yoksa ANA DİLİN sözlük yedeği. Sabit
   Türkçe metin yok; pasif dil metni kullanılmaz.
   =============================================================== */

const h = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  fail: false,
  rows: {} as Record<string, Record<string, unknown>>,
}));
/* 🌐 Faz 6 Dalga 5 — kayıtlı değer merkezi servisten (dil satırları). */
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));
vi.mock("@/lib/i18n/content/content-read.server", () => ({ getAllLocales: async () => structuredClone(h.rows) }));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => (h.fail ? Promise.reject(new Error("down")) : Promise.resolve(h.settings)),
}));
vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "--font-outfit" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

import type { Locale } from "@/lib/i18n/config";
import { buildRootMetadata } from "@/app/_root/root-document";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const L: Locale[] = ["tr", "en", "de"];
const OLD_TR_TITLE = "Villa Kiralama — Lüks Villa Deneyimi";
const OLD_TR_DESC =
  "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Hayalindeki tatili keşfet.";

function settings(root: Locale, enabled: Locale[] = L, extra: Record<string, unknown> = {}) {
  return {
    id: "5e771e65-0000-4000-8000-0000000000aa",
    multilingual_enabled: true,
    public_default_locale: root,
    public_locales: L.map((code, i) => ({ code, is_enabled: enabled.includes(code), sort_order: i })),
    default_meta_title: null,
    default_meta_description: null,
    ...extra,
  };
}
const tw = (m: Awaited<ReturnType<typeof buildRootMetadata>>) => m.twitter as { title?: string; description?: string };

beforeEach(() => {
  h.settings = null;
  h.fail = false;
  h.rows = {};
});

describe("eşdeğerlik — ana dil TR (eski sabitlerle birebir)", () => {
  it("ayarda değer yok → eski Türkçe metin (artık sözlükten)", async () => {
    h.settings = settings("tr");
    const m = await buildRootMetadata();
    expect(m.title).toBe(OLD_TR_TITLE);
    expect(m.description).toBe(OLD_TR_DESC);
    expect(m.openGraph?.title).toBe(OLD_TR_TITLE);
    expect(tw(m).description).toBe(OLD_TR_DESC);
  });
  it("ayar okunamaz / boş → varsayılan bağlam (TR) → eski metin", async () => {
    h.fail = true;
    expect((await buildRootMetadata()).title).toBe(OLD_TR_TITLE);
    h.fail = false;
    h.settings = null;
    expect((await buildRootMetadata()).description).toBe(OLD_TR_DESC);
  });
  it("çoklu dil kapalı (ana dil TR'ye düşer) → Türkçe", async () => {
    h.settings = { ...settings("de"), multilingual_enabled: false };
    expect((await buildRootMetadata()).title).toBe(OLD_TR_TITLE);
  });
});

for (const root of L) {
  describe(`ana dil ${root.toUpperCase()}`, () => {
    it("ayarda değer yoksa ANA DİLİN sözlük yedeği (title, description, og, twitter)", async () => {
      h.settings = settings(root);
      const seo = getDictionary(root).home.seo;
      const m = await buildRootMetadata();
      expect(m.title).toBe(seo.metaTitleFallback);
      expect(m.description).toBe(seo.metaDescriptionFallback);
      expect(m.openGraph?.title).toBe(seo.metaTitleFallback);
      expect(tw(m).title).toBe(seo.metaTitleFallback);
    });

    it("ayarda değer varsa AYNEN kullanılır (mevcut metadata değişmez); yalnız eksik alan yedeğe düşer", async () => {
      h.settings = settings(root, L, { default_meta_title: "Kayıtlı Başlık" });
      /* Ana dilin kayıtlı değeri (Dalga 5: ana dil satırından; TR'de ana kolon aynası). */
      h.rows = { [root]: { default_meta_title: "Kayıtlı Başlık", default_meta_description: null } };
      const m = await buildRootMetadata();
      expect(m.title).toBe("Kayıtlı Başlık");
      expect(m.description).toBe(getDictionary(root).home.seo.metaDescriptionFallback);
      h.settings = settings(root, L, { default_meta_title: "  ", default_meta_description: "Kayıtlı Açıklama" });
      h.rows = { [root]: { default_meta_title: "  ", default_meta_description: "Kayıtlı Açıklama" } };
      const m2 = await buildRootMetadata();
      expect(m2.title).toBe(getDictionary(root).home.seo.metaTitleFallback);
      expect(m2.description).toBe("Kayıtlı Açıklama");
    });

    it("pasif dilin sözlük metni kullanılmaz", async () => {
      for (const passive of L.filter((x) => x !== root)) {
        h.settings = settings(root, L.filter((x) => x !== passive));
        const m = await buildRootMetadata();
        expect(m.title).toBe(getDictionary(root).home.seo.metaTitleFallback);
        expect(m.title).not.toBe(getDictionary(passive).home.seo.metaTitleFallback);
      }
    });

    it("diğer metadata alanları (robots, metadataBase) değişmedi", async () => {
      h.settings = settings(root);
      const m = await buildRootMetadata();
      expect(m.robots).toEqual({ index: true, follow: true });
    });
  });
}

it("kaynak kilidi: kök layout ve ana sayfa metadata'sında sabit Türkçe varsayılan yok", () => {
  for (const f of ["app/_root/root-document.tsx", "app/components/home/home-metadata.ts"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    expect(src, f).not.toContain("Lüks Villa Deneyimi");
    expect(src, f).not.toContain("Hayalindeki tatili keşfet");
    /* Yalnız kod (yorumlar hariç): istek dili okunmuyor (statik/ISR). */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code, f).not.toMatch(/\bheaders\(\)|\bcookies\(\)/);
  }
});
