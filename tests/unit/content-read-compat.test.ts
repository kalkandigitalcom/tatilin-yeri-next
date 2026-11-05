import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import { createContentRepository, type QueryFn } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import type { ContentLocaleContext } from "@/lib/i18n/content/content-locale-context";
import {
  applyBaseSupplements,
  indexContentRows,
  resolveLocalizedContent,
  type ContentRow,
} from "@/lib/i18n/content/content-resolve";
import { resolveVillaSeoDescription } from "@/lib/i18n/content/content-derived";
import { decideContentPresence, type ContentModule } from "@/lib/i18n/content/content-presence";
import {
  diffLegacyVsNext,
  legacyTextAvailable,
  resolveLegacy,
} from "@/lib/i18n/content/content-legacy-compare";
import type { LocalizedContent } from "@/lib/i18n/content/content-contract";

/* Faz 3.1 — eski okuma davranışıyla uyumluluk düzeltmeleri. */

const P = "e0000000-0000-0000-0000-00000000000";
const pid = (n: number) => `${P}${n}`;

type TRow = Record<string, unknown> & { locale: Locale };
type Db = {
  pages: Record<string, { body?: string | null; content?: string | null }>;
  page_translations: Record<string, TRow[]>;
  villa_translations?: Record<string, TRow[]>;
  hasContentColumn: boolean;
};

/* Gerçek repository + SQL üretici; altta küçük sahte "DB". */
function fakeQuery(db: Db, log: string[]): QueryFn {
  return async ({ text, values }) => {
    if (text.includes("information_schema.columns")) {
      log.push("schema");
      return { rows: values[0] === "pages" && values[1] === "content" && db.hasContentColumn ? [{ ok: 1 }] : [] };
    }
    if (text.includes(`FROM "pages" WHERE "id"`)) {
      log.push("supplement");
      const ids = values[0] as string[];
      return { rows: ids.filter((id) => db.pages[id]).map((id) => ({ parent_id: id, body: db.pages[id].content ?? null })) };
    }
    const m = text.match(/FROM "([a-z_]+)" WHERE "([a-z_]+)" = ANY/);
    if (m) {
      log.push(`rows:${m[1]}`);
      const table = (db as unknown as Record<string, Record<string, TRow[]>>)[m[1]] ?? {};
      const ids = values[0] as string[];
      const locales = values[1] as string[];
      return {
        rows: ids.flatMap((id) => (table[id] ?? []).filter((r) => locales.includes(r.locale)).map((r) => ({ parent_id: id, ...r }))),
      };
    }
    throw new Error("beklenmeyen sorgu: " + text);
  };
}

function service(db: Db, ctx: ContentLocaleContext) {
  const log: string[] = [];
  const errors: unknown[] = [];
  const s = createContentReadService({
    repository: createContentRepository(fakeQuery(db, log)),
    getLocaleContext: () => ctx,
    onError: (e) => errors.push(e),
  });
  return { s, log, errors };
}

const ROOT_TR: ContentLocaleContext = { root: "tr", enabled: ["tr", "en", "de"] };
const ROOT_EN: ContentLocaleContext = { root: "en", enabled: ["en", "tr", "de"] };
const ROOT_DE: ContentLocaleContext = { root: "de", enabled: ["de", "tr", "en"] };
const TR_PASSIVE: ContentLocaleContext = { root: "en", enabled: ["en", "de"] };

function pagesDb(hasContentColumn = true): Db {
  return {
    hasContentColumn,
    pages: {
      [pid(1)]: { body: null, content: "<p>TR content 1</p>" },
      [pid(2)]: { body: "  ", content: "<p>TR content 2</p>" },
      [pid(3)]: { body: "<p>TR body 3</p>", content: "<p>eski 3</p>" },
      [pid(4)]: { body: null, content: "<p>TR content 4 (tr satırı yok)</p>" },
      [pid(5)]: { body: null, content: null },
    },
    page_translations: {
      [pid(1)]: [
        { locale: "tr", title: "Bir", body: null, slug: "bir" },
        /* Faz 5 son kontroller: "çevrilmemiş gövde" = NULL (çeviri kartları
           boş alanı NULL yazar). "" artık BİLİNÇLİ BOŞ demektir ve zinciri
           durdurur — ayrı testler: faz5-son-kontroller.test.ts. */
        { locale: "en", title: "One", body: null, slug: "one" },
        { locale: "de", title: "Eins", body: null, slug: null },
      ],
      [pid(2)]: [{ locale: "tr", title: "İki", body: "  ", slug: "iki" }],
      [pid(3)]: [
        { locale: "tr", title: "Üç", body: "<p>TR body 3</p>", slug: "uc" },
        { locale: "en", title: null, body: "<p>EN body 3</p>", slug: "three" },
      ],
      [pid(5)]: [{ locale: "tr", title: "Beş", body: null, slug: "bes" }],
    },
  };
}

describe("Faz 3.1 — CMS body/content yedeği (eski: body ?? content)", () => {
  /* Faz 5 sözleşmesi: NULL = değer yok → eski content; "" / boşluk = BİLEREK
     boşaltıldı → eski content GERİ GELMEZ (eski `body ?? content` ile birebir;
     Faz 3.1'deki "boşluk → content" sapması kaldırıldı). */
  it("TR: body NULL → content; body boşluk → content GÖSTERİLMEZ; body dolu → body", async () => {
    const { s } = service(pagesDb(), ROOT_TR);
    const m = await s.getContentMany("page", [pid(1), pid(2), pid(3)], "tr");
    expect(m.get(pid(1))?.values.body).toBe("<p>TR content 1</p>");
    expect(m.get(pid(1))?.sourceLocale.body).toBe("tr");
    /* Faz 5 son kontroller: boş metin = bilinçli boş → "" döner (NULL değil),
       eski content GÖSTERİLMEZ, içerik yok sayılır (missing). */
    expect(m.get(pid(2))?.values.body).toBe("");
    expect(m.get(pid(2))?.explicitEmpty).toEqual(["body"]);
    expect(m.get(pid(2))?.missing).toContain("body");
    expect(m.get(pid(3))?.values.body).toBe("<p>TR body 3</p>");
  });

  it("EN (ana dil TR): EN body boş → TR (body ?? content) — eski resolveTranslatedField(row.body, canonicalBody)", async () => {
    const { s } = service(pagesDb(), ROOT_TR);
    const c = await s.getContent("page", pid(1), "en");
    expect(c?.values.body).toBe("<p>TR content 1</p>");
    expect(c?.values.title).toBe("One");
    expect(c?.isFallback).toBe(false); // EN başlık dolu → çeviri var
    expect(c?.slug).toBe("one"); // slug davranışı değişmedi
  });

  it("ana dil EN: DE body boş → önce EN (boş) → TR content", async () => {
    const { s } = service(pagesDb(), ROOT_EN);
    expect((await s.getContent("page", pid(1), "de"))?.values.body).toBe("<p>TR content 1</p>");
    expect((await s.getContent("page", pid(3), "de"))?.values.body).toBe("<p>EN body 3</p>");
  });

  it("ana dil DE: TR isteğinde content yine TR değeri olarak kullanılır", async () => {
    const { s } = service(pagesDb(), ROOT_DE);
    const c = await s.getContent("page", pid(1), "tr");
    expect(c?.values.body).toBe("<p>TR content 1</p>");
    expect(c?.slug).toBe("bir");
  });

  it("TR pasif: content (TR aynası) yedek olarak KULLANILMAZ", async () => {
    const { s } = service(pagesDb(), TR_PASSIVE);
    const c = await s.getContent("page", pid(1), "en");
    expect(c?.values.body).toBeNull();
    expect(c?.missing).toContain("body");
    expect(Object.values(c!.sourceLocale)).not.toContain("tr");
  });

  it("TR satırı yoksa content'ten sanal TR satırı (eski canonical gösterimiyle aynı); slug null", async () => {
    const { s } = service(pagesDb(), ROOT_TR);
    const c = await s.getContent("page", pid(4), "tr");
    expect(c?.values.body).toBe("<p>TR content 4 (tr satırı yok)</p>");
    expect(c?.slug).toBeNull();
  });

  it("body ve content ikisi de boş → missing; yanlış içerik uydurulmaz", async () => {
    const { s } = service(pagesDb(), ROOT_TR);
    const c = await s.getContent("page", pid(5), "tr");
    expect(c?.values.body).toBeNull();
    expect(c?.missing).toContain("body");
  });

  it("pages.content kolonu şemada yoksa ek sorgu atılmaz, hata yok", async () => {
    const { s, log, errors } = service(pagesDb(false), ROOT_TR);
    const c = await s.getContent("page", pid(1), "tr");
    expect(c?.values.body).toBeNull();
    expect([...log].sort()).toEqual(["rows:page_translations", "schema"]);
    expect(errors).toEqual([]);
  });

  it("sorgu sayısı: şema kontrolü süreç başına 1 kez; sayfa başına +1 sorgu; diğer varlıklarda ek sorgu yok", async () => {
    const db = { ...pagesDb(), villa_translations: { ["a0000000-0000-0000-0000-000000000001"]: [{ locale: "tr" as Locale, description: "x" }] } };
    const { s, log } = service(db, ROOT_TR);
    await s.getContentMany("page", [pid(1), pid(2), pid(3)], "tr");
    await s.getContentMany("page", [pid(1)], "en");
    await s.getContent("villa", "a0000000-0000-0000-0000-000000000001", "tr");
    expect(log.filter((x) => x === "schema")).toHaveLength(1);
    expect(log.filter((x) => x === "supplement")).toHaveLength(2);
    expect(log.filter((x) => x === "rows:villa_translations")).toHaveLength(1);
    expect(log).toHaveLength(6);
  });

  it("applyBaseSupplements: dolu TR body'ye dokunmaz, girdiyi değiştirmez", () => {
    const def = CONTENT_ENTITY_BY_KEY.page;
    const rows: ContentRow[] = [{ parentId: "x", locale: "tr", values: { body: "B" }, slug: "s" }];
    const out = applyBaseSupplements(def, rows, new Map([["x", { body: "C" }]]));
    expect(out[0].values.body).toBe("B");
    const out2 = applyBaseSupplements(def, [{ parentId: "x", locale: "tr", values: { body: null }, slug: "s" }], new Map([["x", { body: "C" }]]));
    expect(out2[0]).toMatchObject({ values: { body: "C" }, slug: "s" });
    expect(rows[0].values.body).toBe("B");
  });
});

describe("Faz 3.1 — alan doluluğu eski kurallarla aynı", () => {
  it("page.sections: geçersiz bölüm dizisi boş sayılır → yedek (eski resolveTranslatedSections)", async () => {
    const db = pagesDb();
    db.page_translations[pid(3)][0].sections = [{ type: "richtext", content: "<p>TR</p>" }];
    db.page_translations[pid(3)][1].sections = [{ type: "richtext", content: "   " }, { type: "bilinmeyen" }];
    const { s } = service(db, ROOT_TR);
    const c = await s.getContent("page", pid(3), "en");
    expect(c?.values.sections).toEqual([{ type: "richtext", content: "<p>TR</p>" }]);
    expect(c?.sourceLocale.sections).toBe("tr");
  });

  it("site_popup: etiketli boş metin, güvensiz URL ve boş stats → yedek (eski popupTranslationText/mergePopupText)", () => {
    const def = CONTENT_ENTITY_BY_KEY.site_popup;
    const rows: ContentRow[] = [
      { parentId: "1", locale: "tr", values: { title: "TR", description: "TR d", highlight_text: null, stats: ["10 yıl"], button_text: "Git", button_url: "/kampanya" } },
      { parentId: "1", locale: "en", values: { title: "<b> </b>", description: "EN d", highlight_text: null, stats: ["   "], button_text: "Go", button_url: "javascript:alert(1)" } },
    ];
    const idx = indexContentRows(rows);
    const legacy = resolveLegacy(def, { title: "TR", description: "TR d", highlight_text: null, stats: ["10 yıl"], button_text: "Git", button_url: "/kampanya" }, idx.get("1")!, "en");
    expect(legacy.values).toMatchObject({ title: "TR", description: "EN d", stats: ["10 yıl"], button_text: "Go", button_url: "/kampanya" });
  });
});

describe("Faz 3.1 — 'çeviri var' kararı (noindex) eski content-availability ile aynı", () => {
  const cases: { name: string; en: Record<string, unknown> | null }[] = [
    { name: "EN satırı yok", en: null },
    { name: "EN yalnız seo_title", en: { seo_title: "SEO", title: null, body: null, excerpt: null } },
    { name: "EN yalnız sections", en: { sections: [{ type: "richtext", content: "<p>EN</p>" }] } },
    { name: "EN yalnız excerpt", en: { excerpt: "Özet" } },
    { name: "EN body boşluk", en: { body: "   " } },
    { name: "EN title dolu", en: { title: "About" } },
  ];
  for (const k of ["page", "blog_post"] as const) {
    for (const c of cases) {
      it(`${k}: ${c.name}`, async () => {
        const db = pagesDb();
        const table = k === "page" ? "page_translations" : "blog_post_translations";
        const id = pid(3);
        const rows: TRow[] = [{ locale: "tr", title: "TR", body: "<p>TR</p>", excerpt: null, slug: "tr-slug" }];
        if (c.en) rows.push({ locale: "en", ...c.en });
        (db as unknown as Record<string, unknown>)[table] = { [id]: rows };
        const { s } = service(db, ROOT_TR);
        const next = await s.getContent(k, id, "en");
        const legacyAvailable = legacyTextAvailable(
          { en: c.en ? ({ parentId: id, locale: "en", values: c.en } as ContentRow) : undefined },
          "en"
        );
        expect(next?.isFallback).toBe(!legacyAvailable);
      });
    }
  }
});

describe("Faz 3.1 — türetilmiş alan: villa.seo_description", () => {
  const content = (over: Partial<LocalizedContent>): LocalizedContent => ({
    values: {}, sourceLocale: {}, missing: [], isFallback: false, requestedLocale: "en", ...over,
  });
  it("istenen dilin seo_description'ı varsa o", () => {
    expect(resolveVillaSeoDescription(content({ values: { seo_description: " EN SEO ", description: "x" }, sourceLocale: { seo_description: "en" } }))).toBe("EN SEO");
  });
  it("seo_description başka dilden geliyorsa: istenen dildeki açıklama özeti (eski getVillaTranslatedSeoDescription)", () => {
    const c = content({
      values: { seo_description: "TR SEO", description: "<p>EN <b>açıklama</b></p>" },
      sourceLocale: { seo_description: "tr", description: "en" },
    });
    expect(resolveVillaSeoDescription(c)).toBe("EN açıklama");
  });
  it("160 karakter sınırı ve içerik yoksa boş", () => {
    const long = "a".repeat(300);
    expect(resolveVillaSeoDescription(content({ values: { description: long }, sourceLocale: { description: "en" } }))).toHaveLength(160);
    expect(resolveVillaSeoDescription(null)).toBe("");
  });
});

describe("Faz 3.1 — hiçbir aktif dilde içerik yok: modül bazında 404 / noindex", () => {
  const filled = (isFallback: boolean): LocalizedContent => ({
    values: { title: "T", body: "B" }, sourceLocale: { title: "tr", body: "tr" }, missing: [], isFallback,
  });
  const empty: LocalizedContent = { values: { title: null }, sourceLocale: { title: null }, missing: ["title"], isFallback: true };
  const table: [ContentModule, Parameters<typeof decideContentPresence>[1], string][] = [
    ["villa", { recordExists: false, content: filled(false) }, "not-found"],
    ["villa", { recordExists: true, content: null }, "render:noindex-follow:empty"],
    ["villa", { recordExists: true, content: filled(true) }, "render:index"],
    ["page", { recordExists: false, content: filled(false) }, "not-found"],
    ["page", { recordExists: true, content: null }, "not-found"],
    ["page", { recordExists: true, content: empty }, "not-found"],
    ["page", { recordExists: true, content: filled(true) }, "render:noindex-follow"],
    ["page", { recordExists: true, recordNoindex: true, content: filled(false) }, "render:noindex-nofollow"],
    ["page", { recordExists: true, content: filled(false) }, "render:index"],
    ["blog", { recordExists: true, published: false, content: filled(false) }, "not-found"],
    ["blog", { recordExists: true, content: null }, "not-found"],
    ["blog", { recordExists: true, content: filled(true) }, "render:noindex-follow"],
    ["blog", { recordExists: true, content: filled(false) }, "render:index"],
    ["category", { recordExists: false, content: null }, "not-found"],
    ["category", { recordExists: true, content: null }, "render:noindex-follow:empty"],
    ["category", { recordExists: true, content: filled(true) }, "render:index"],
    ["region", { recordExists: true, content: null }, "render:index"],
    ["region", { recordExists: false, content: null }, "not-found"],
    ["list", { recordExists: true, content: null }, "omit"],
    ["list", { recordExists: true, content: empty }, "omit"],
    ["list", { recordExists: true, content: filled(true) }, "render:index"],
    ["singleton", { recordExists: true, content: null }, "defaults"],
  ];
  for (const [module, input, expected] of table) {
    it(`${module} ${JSON.stringify({ ...input, content: input.content ? (input.content.missing.length ? "boş" : input.content.isFallback ? "yedek" : "dolu") : null })} → ${expected}`, () => {
      const d = decideContentPresence(module, input);
      const got =
        d.kind === "render" ? `render:${d.robots}${d.useEmptyState ? ":empty" : ""}` : d.kind;
      expect(got).toBe(expected);
    });
  }

  it("ana dil TR (bugünkü durum): eski ↔ yeni SEO kararı birebir (page/blog, EN/DE)", () => {
    const def = CONTENT_ENTITY_BY_KEY.page;
    const base = { title: "TR", body: "<p>TR</p>", excerpt: null, seo_title: null, seo_description: null, sections: [], slug: "tr" };
    const variants: Record<string, unknown>[] = [{}, { title: "EN" }, { seo_title: "x" }, { body: " " }, { excerpt: "e" }];
    for (const v of variants) {
      for (const l of ["en", "de"] as Locale[]) {
        const rows: ContentRow[] = [{ parentId: "p", locale: "tr", values: { ...base }, slug: "tr" }];
        if (Object.keys(v).length) rows.push({ parentId: "p", locale: l, values: v, slug: null });
        const byLocale = indexContentRows(rows).get("p")!;
        const legacyRobots = legacyTextAvailable(byLocale, l) ? "index" : "noindex-follow";
        const chain: Locale[] = [l, "tr", l === "en" ? "de" : "en"];
        const svcContent = resolveLocalizedContent(def, byLocale, l, chain);
        const d = decideContentPresence("page", { recordExists: true, content: svcContent });
        expect(d.kind === "render" ? d.robots : d.kind).toBe(legacyRobots);
        const diffs = diffLegacyVsNext(def, resolveLegacy(def, base, byLocale, l), svcContent, byLocale);
        expect(diffs.filter((x) => x.reason === "mirror-drift" || x.reason === "other")).toEqual([]);
      }
    }
  });
});
