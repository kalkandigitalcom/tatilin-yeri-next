import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { createContentWriteService, type TransactionRunner } from "@/lib/i18n/content/content-write-core";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { createContentReadService } from "@/lib/i18n/content/content-read-core";
import { CONTENT_ENTITY_BY_KEY } from "@/lib/i18n/content/content-registry";
import type { PublicContentReader } from "@/lib/i18n/content/public-villa-content";
import {
  loadCollectionCardTexts,
  loadLabelMapsByLocale,
  localizeFaqs,
  resolveSingletonFields,
  withBaseTrRow,
  type SingletonRows,
} from "@/lib/i18n/content/public-shared-content";
import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";
import { localizeSitePopup, toPublicSitePopup, type SitePopupRow, type SitePopupTranslationRow } from "@/lib/site-popup";

/* ===============================================================
   Faz 6 DALGA 4 — İZOLE PostgreSQL: ana sayfa (ayar metinleri),
   koleksiyon özel başlıkları, SSS, ortak bileşen etiketleri ve popup
   merkezi okuma ile (gerçek SQL + çekirdek), ana dil TR / EN / DE.
   CONTENT_F6D4_PG_URL_108   : m108clean'in TEK KULLANIMLIK kopyası
   CONTENT_F6D4_PG_URL_NO108 : m106'nın TEK KULLANIMLIK kopyası
   Testler veri YAZAR. Şablonlarda ÇALIŞTIRILMAZ.
   =============================================================== */

type Pool = {
  query: (t: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<{ query: Pool["query"]; release: () => void }>;
  end: () => Promise<void>;
};
const ACTOR = { actorId: "faz6-dalga4" };
const L: Locale[] = ["tr", "en", "de"];
const SETTINGS_FIELDS = ["hero_title", "footer_copyright", "business_hours", "default_meta_title", "hero_badge_text"] as const;

async function mkPool(url: string): Promise<Pool> {
  const pg = (await import("pg")).default;
  return new pg.Pool({ connectionString: url, max: 8 }) as unknown as Pool;
}
function writer(pool: Pool) {
  const transaction: TransactionRunner = async (fn) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = await fn((t, v) => c.query(t, v as unknown[]));
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };
  return createContentWriteService({ transaction, enabled: () => true, lockTimeoutMs: 10_000 });
}
function service(pool: Pool, root: Locale, enabled: Locale[]) {
  return createContentReadService({
    repository: createContentRepository((q) => pool.query(q.text, q.values)),
    getLocaleContext: () => ({ root, enabled: [root, ...enabled.filter((l) => l !== root)] }),
  });
}
function reader(pool: Pool, root: Locale, enabled: Locale[]): PublicContentReader {
  const s = service(pool, root, enabled);
  return { getContent: s.getContent, getContentMany: s.getContentMany };
}
const ctxOf = (root: Locale, enabled: Locale[]) => ({ root, enabled: [root, ...enabled.filter((l) => l !== root)] });

const CONFIGS = [
  { name: "108 SONRASI (m108clean kopyası)", url: process.env.CONTENT_F6D4_PG_URL_108, has108: true },
  { name: "108 ÖNCESİ (m106 kopyası)", url: process.env.CONTENT_F6D4_PG_URL_NO108, has108: false },
];

for (const cfg of CONFIGS) {
  const d = cfg.url ? describe : describe.skip;
  d(`Faz 6 Dalga 4 — izole PG (${cfg.name})`, () => {
    let pool: Pool;
    let settingsId = "";
    let base: Record<string, unknown> = {};
    let popupRow: SitePopupRow;
    let hc = "";
    let dc = "";
    let villa = "";
    let faq = "";
    let menuId = "";
    let typeId = "";
    let pageId = "";
    const save = async (entity: Parameters<ReturnType<typeof writer>["saveContent"]>[0], id: string, l: Locale, patch: Record<string, unknown>) => {
      const r = await writer(pool).saveContent(entity, id, l, patch, ACTOR);
      expect(r.ok ? true : r).toBe(true);
    };
    const settingsRows = async (root: Locale, enabled: Locale[]) =>
      withBaseTrRow(
        (await service(pool, root, enabled).getAllLocales("settings", settingsId)) as SingletonRows,
        base,
        CONTENT_ENTITY_BY_KEY.settings.fields,
        ctxOf(root, enabled)
      );
    const popupTranslations = async () =>
      (await pool.query("SELECT popup_id, locale, title, description, highlight_text, stats, button_text, button_url FROM site_popup_translations"))
        .rows as unknown as SitePopupTranslationRow[];

    beforeAll(async () => {
      pool = await mkPool(cfg.url!);
      expect((await pool.query("SELECT content_mirror_mode() AS m")).rows[0].m).toBe("base");
      const cap = (await pool.query("SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok")).rows[0].ok;
      expect(cap).toBe(cfg.has108);
      const one = async (sql: string) => (await pool.query(sql)).rows[0] as Record<string, unknown>;
      base = await one("SELECT * FROM settings LIMIT 1");
      settingsId = String(base.id);
      popupRow = { ...(await one("SELECT * FROM site_popup WHERE id = 1")), is_enabled: true } as unknown as SitePopupRow;
      hc = String((await one("SELECT id FROM homepage_collections LIMIT 1")).id);
      const dcr = await one("SELECT id, villa_id FROM discount_collections LIMIT 1");
      dc = String(dcr.id);
      villa = String(dcr.villa_id);
      faq = String((await one("SELECT id FROM faqs LIMIT 1")).id);
      menuId = String((await one("SELECT id FROM menu LIMIT 1")).id);
      typeId = String((await one("SELECT id FROM villa_types ORDER BY id LIMIT 1")).id);
      pageId = String((await one("SELECT id FROM pages LIMIT 1")).id);

      /* Test verisi (yalnız bu kopyada): EN/DE çevirileri + bilinçli boşlar. */
      await save("settings", settingsId, "en", { hero_title: "EN hoş geldin", footer_copyright: "© EN", business_hours: "", hero_badge_text: "  " });
      await save("site_popup", "1", "de", { title: "Popup DE", description: null });
      await save("homepage_collection", hc, "en", { custom_title: "EN Özel" });
      await save("faq", faq, "en", { question: "Question?", answer: "Answer" });
      await save("faq", faq, "de", { question: "Frage?", answer: "   " });
      await save("villa", villa, "de", { badge: "DE Neu" });
      await save("menu", menuId, "de", { name: "Villen" });
    });
    afterAll(async () => {
      await pool?.end();
    });

    it("eşdeğerlik — ana dil TR: ayar metinleri eski resolveSettingsText ile birebir", async () => {
      const rows = await settingsRows("tr", L);
      const translations = { en: rows.en ?? null, de: rows.de ?? null } as never;
      for (const l of L) {
        const now = resolveSingletonFields(CONTENT_ENTITY_BY_KEY.settings, rows, l, ctxOf("tr", L));
        for (const f of SETTINGS_FIELDS) {
          expect(now[f] ?? null, `${l}.${f}`).toEqual(resolveSettingsText(base[f] as string | null, translations, l, f) ?? null);
        }
      }
    });

    it("eşdeğerlik — ana dil TR: popup 3 dilde eski projeksiyonla birebir", async () => {
      const tx = await popupTranslations();
      const legacy = toPublicSitePopup(popupRow, () => null, 0, tx)!;
      const central = toPublicSitePopup(popupRow, () => null, 0, tx, ctxOf("tr", L))!;
      const pick = (p: typeof legacy, l: Locale) => {
        const c = localizeSitePopup(p, l);
        return [c.title, c.description, c.highlight, c.stats, c.button];
      };
      for (const l of L) expect(pick(central, l)).toEqual(pick(legacy, l));
    });

    for (const root of L) {
      describe(`ana dil ${root.toUpperCase()}`, () => {
        it("ayar metinleri: istenen dil → ana dil satırı AYNEN (boş = gizli) → aktif diller", async () => {
          const rows = await settingsRows(root, L);
          const at = (l: Locale) => resolveSingletonFields(CONTENT_ENTITY_BY_KEY.settings, rows, l, ctxOf(root, L));
          expect(at("en").hero_title).toBe("EN hoş geldin");
          expect(at("tr").hero_title).toBe(base.hero_title);
          /* DE satırı yok → ana dil. */
          expect(at("de").hero_title).toBe(root === "en" ? "EN hoş geldin" : base.hero_title);
          expect(at("de").footer_copyright).toBe(root === "en" ? "© EN" : base.footer_copyright);
          /* EN'de bilinçli boş çalışma saati: ana dil EN iken DE'de de gizli; TR kökte EN'e TR. */
          expect(at("de").business_hours).toBe(root === "en" ? "" : base.business_hours);
          expect(at("en").business_hours).toBe(root === "en" ? "" : base.business_hours);
        });

        it("pasif dil satırı hiçbir dile yedek olmaz", async () => {
          for (const passive of L.filter((x) => x !== root)) {
            const enabled = L.filter((x) => x !== passive);
            const rows = await settingsRows(root, enabled);
            for (const l of enabled) {
              const v = resolveSingletonFields(CONTENT_ENTITY_BY_KEY.settings, rows, l, ctxOf(root, enabled));
              if (passive === "en") expect(v.hero_title).not.toBe("EN hoş geldin");
            }
            const p = toPublicSitePopup(popupRow, () => null, 0, await popupTranslations(), ctxOf(root, enabled));
            if (p) {
              expect(Object.keys(p.translations).sort()).toEqual([...enabled].sort());
              for (const l of enabled) if (passive === "de") expect(localizeSitePopup(p, l).title).not.toBe("Popup DE");
            }
          }
        });

        it("popup: eksik dil ana dile düşer (TR'ye sabit değil)", async () => {
          const p = toPublicSitePopup(popupRow, () => null, 0, await popupTranslations(), ctxOf(root, L))!;
          expect(localizeSitePopup(p, "de").title).toBe("Popup DE");
          expect(localizeSitePopup(p, "en").title).toBe("Popup EN");
          expect(localizeSitePopup(p, "tr").title).toBe("Popup TR");
          /* DE açıklaması bilinçli NULL değil "yok" → ana dil satırının değeri. */
          const rootDesc = localizeSitePopup(p, root).description;
          expect(localizeSitePopup(p, "de").description).toBe(root === "de" ? null : rootDesc);
        });

        it("koleksiyon özel başlığı + rozet: istenen → ana dil → aktif diller; yoksa villa adı; tek batch", async () => {
          const r = reader(pool, root, L);
          const card = { id: villa, collection_id: hc, title: "Villa Adı", display_title: "eski" };
          const dcard = { id: villa, collection_id: dc, title: "Villa Adı", display_title: "eski" };
          for (const l of L) {
            const t = await loadCollectionCardTexts(r, "homepage_collection", [card], l);
            const own = { tr: "Özel Başlık", en: "EN Özel", de: undefined }[l];
            const rootTitle = { tr: "Özel Başlık", en: "EN Özel", de: "Özel Başlık" }[root];
            expect(t.title(card)).toBe(own ?? rootTitle);
            /* indirim koleksiyonu TR özel başlığı boş → her dilde villa adı. */
            const dt = await loadCollectionCardTexts(r, "discount_collection", [dcard], l);
            expect(dt.title(dcard)).toBe("Villa Adı");
            /* Rozet: TR "Yeni", EN boş (yok), DE "DE Neu" → EN ana dile düşer. */
            const badge = { tr: "Yeni", de: "DE Neu", en: root === "de" ? "DE Neu" : "Yeni" }[l];
            expect(t.badge(villa)).toBe(badge);
          }
        });

        it("SSS: soru/cevap zinciri; cevabı hiçbir aktif dilde yoksa gizli; pasif dil yok", async () => {
          const base = (await pool.query("SELECT id, question, answer FROM faqs ORDER BY id")).rows as { id: string; question: string; answer: string }[];
          const r = reader(pool, root, L);
          const en = await localizeFaqs(r, base, "en");
          expect(en.find((f) => f.id === faq)).toMatchObject({ question: "Question?", answer: "Answer" });
          const de = await localizeFaqs(r, base, "de");
          const rootAnswer = root === "en" ? "Answer" : "Cevap";
          expect(de.find((f) => f.id === faq)).toMatchObject({ question: "Frage?", answer: rootAnswer });
          const tr = await localizeFaqs(r, base, "tr");
          expect(tr.find((f) => f.id === faq)).toMatchObject({ question: "Soru?", answer: "Cevap" });
          if (root !== "en") {
            const rp = reader(pool, root, L.filter((x) => x !== "en"));
            const dep = await localizeFaqs(rp, base, "de");
            expect(dep.find((f) => f.id === faq)?.answer).toBe("Cevap");
          }
        });

        it("header/footer etiket haritaları: aktif dil başına zincir; pasif dil haritada yok", async () => {
          const r = reader(pool, root, L);
          const types = await loadLabelMapsByLocale(r, "villa_type", "name", [typeId], L);
          expect(types[typeId]).toEqual({
            tr: "Balayı",
            en: "Honeymoon",
            de: root === "en" ? "Honeymoon" : "Balayı",
          });
          const menu = await loadLabelMapsByLocale(r, "menu", "name", [menuId], L);
          expect(menu[menuId]).toEqual({ tr: "Villalar", en: root === "de" ? "Villen" : "Villalar", de: "Villen" });
          const pages = await loadLabelMapsByLocale(r, "page", "title", [pageId], L);
          expect(pages[pageId]).toEqual({ tr: "Hakkımızda", en: "Hakkımızda", de: "Hakkımızda" });
          const passive = L.find((x) => x !== root)!;
          const enabled = L.filter((x) => x !== passive);
          const rp = reader(pool, root, enabled);
          const tp = await loadLabelMapsByLocale(rp, "villa_type", "name", [typeId], enabled);
          expect(Object.keys(tp[typeId] ?? {}).sort()).toEqual([...enabled].sort());
          if (passive === "en") for (const v of Object.values(tp[typeId] ?? {})) expect(v).not.toBe("Honeymoon");
        });
      });
    }
  });
}
