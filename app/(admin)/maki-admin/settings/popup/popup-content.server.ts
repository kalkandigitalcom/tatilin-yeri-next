import "server-only";

import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import { sitePopupRepository } from "@/lib/db/site-popup.repository.server";
import { removeServer } from "@/lib/storage/server";
import { SITE_ASSETS_BUCKET_NAME } from "@/lib/storage.helpers";
import {
  POPUP_IMAGE_FOLDER,
  POPUP_LIMITS,
  cleanPopupText,
  isPopupDismissDuration,
  isPopupDisplayScope,
  isSafePopupUrl,
  normalizePopupStats,
  popupDateToIso,
  popupIsoToDate,
  type PopupDismissDuration,
  type PopupDisplayScope,
  type SitePopupRow,
} from "@/lib/site-popup";
import type { Locale } from "@/lib/i18n/config";
import { CONTENT_LOCALES } from "@/lib/i18n/content/content-registry";
import { ADMIN_LOCALE_LABELS, type AdminContentLocales } from "@/lib/i18n/content/content-admin";
import {
  adminSaveContentMany,
  getAdminContent,
  getAdminLocaleLayout,
} from "@/lib/i18n/content/content-admin.server";
import type { SitePopupTextValues } from "@/app/services/site-popup.service";

/* ===============================================================
   🌐 Faz 5 dalga 2 — Açılış popup'ı (merkezi içerik servisi)
   ===============================================================
   Eski `saveSitePopup` ile AYNI doğrulama ve temizleme kuralları
   (cleanPopupText, normalizePopupStats, isSafePopupUrl, tarih/kapsam,
   "açmak için görsel veya başlık", buton URL zorunluluğu) — tek fark:
   "Türkçe" yerine ANA DİL (settings.public_default_locale):
     • ana form = ana dil metinleri; diğer iki dil çeviri sekmeleri
     • bir dilde buton metni varsa URL o dilden ya da ANA DİLDEN gelmeli
     • "aktif popup için başlık" kuralı ana dile bakar
   İçerik (6 alan × 3 dil) + teknik kolonlar (durum, görsel, kapsam,
   tarihler, updated_at) TEK transaction'da yazılır. Eski
   site_popup.title… / site_popup_translations doğrudan yazma yolu KAPALI.
   =============================================================== */

const IMAGE_PATH_RE = new RegExp(`^${POPUP_IMAGE_FOLDER}/[a-z0-9-]{1,64}\\.webp$`);
const POPUP_ID = "1";

export type SitePopupAdminValuesV2 = {
  isEnabled: boolean;
  imagePath: string | null;
  title: string;
  description: string;
  highlight: string;
  stats: string[];
  buttonText: string;
  buttonUrl: string;
  showButton: boolean;
  scope: PopupDisplayScope;
  dismiss: PopupDismissDuration;
  startDate: string;
  endDate: string;
  updatedAt: string | null;
  /** Ana dil DIŞINDAKİ diller. */
  translations: Partial<Record<Locale, SitePopupTextValues>>;
  rootLocale: Locale;
  translationLocales: Locale[];
};

function textOf(v: AdminContentLocales[Locale] | undefined): SitePopupTextValues {
  return {
    title: typeof v?.title === "string" ? v.title : "",
    description: typeof v?.description === "string" ? v.description : "",
    highlight: typeof v?.highlight_text === "string" ? v.highlight_text : "",
    stats: normalizePopupStats(v?.stats),
    buttonText: typeof v?.button_text === "string" ? v.button_text : "",
    buttonUrl: typeof v?.button_url === "string" ? v.button_url : "",
  };
}

function toValues(row: SitePopupRow | null, content: AdminContentLocales, root: Locale, others: Locale[]): SitePopupAdminValuesV2 {
  /* TR satırı (ayna) yoksa ana tablo değerleri = TR (karar 1). */
  const rootText =
    content[root] || root !== "tr" || !row
      ? textOf(content[root])
      : textOf({
          title: row.title,
          description: row.description,
          highlight_text: row.highlight_text,
          stats: row.stats as unknown,
          button_text: row.button_text,
          button_url: row.button_url,
        });
  return {
    isEnabled: row?.is_enabled === true,
    imagePath: row?.image_path || null,
    ...rootText,
    showButton: row ? row.show_button !== false : true,
    scope: row && isPopupDisplayScope(row.display_scope) ? row.display_scope : "home",
    dismiss: row && isPopupDismissDuration(row.dismiss_duration) ? row.dismiss_duration : "session",
    startDate: row ? popupIsoToDate(row.starts_at, "start") : "",
    endDate: row ? popupIsoToDate(row.ends_at, "end") : "",
    updatedAt: row?.updated_at || null,
    translations: Object.fromEntries(others.map((l) => [l, textOf(content[l])])),
    rootLocale: root,
    translationLocales: others,
  };
}

export async function getSitePopupForAdminCentral(): Promise<SitePopupAdminValuesV2 | null> {
  const { data, error } = await sitePopupRepository.find();
  if (error) {
    console.error("[site-popup.admin.read] FAILED", error.message);
    return null;
  }
  const layout = await getAdminLocaleLayout();
  const content = await getAdminContent("site_popup", POPUP_ID);
  return toValues((data as SitePopupRow | null) ?? null, content, layout.root, layout.translations);
}

type Cleaned = {
  title: string | null;
  description: string | null;
  highlight_text: string | null;
  stats: string[];
  button_text: string | null;
  button_url: string | null;
};

function cleanText(t: Record<string, unknown>): Cleaned {
  const url = typeof t.buttonUrl === "string" ? t.buttonUrl.trim() : "";
  return {
    title: cleanPopupText(t.title, POPUP_LIMITS.title),
    description: cleanPopupText(t.description, POPUP_LIMITS.description, { multiline: true }),
    highlight_text: cleanPopupText(t.highlight, POPUP_LIMITS.highlight),
    stats: normalizePopupStats(t.stats),
    button_text: cleanPopupText(t.buttonText, POPUP_LIMITS.buttonText),
    button_url: url || null,
  };
}

export async function saveSitePopupCentral(
  caller: AuthorizedAdminCaller,
  input: unknown
): Promise<{ ok: true; values: SitePopupAdminValuesV2 } | { ok: false; error: string }> {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const layout = await getAdminLocaleLayout();
  const root = layout.root;
  const rootLabel = ADMIN_LOCALE_LABELS[root];

  const rootText = cleanText(v);
  const showButton = v.showButton !== false;
  const isEnabled = v.isEnabled === true;
  const imagePath = typeof v.imagePath === "string" && v.imagePath.trim() ? v.imagePath.trim() : null;
  if (imagePath && !IMAGE_PATH_RE.test(imagePath)) return { ok: false, error: "Geçersiz görsel yolu" };
  if (rootText.button_url && !isSafePopupUrl(rootText.button_url)) {
    return { ok: false, error: "Buton URL'i '/' ile başlayan bir site adresi veya https:// ile başlayan bir bağlantı olmalı" };
  }
  if (showButton && rootText.button_text && !rootText.button_url) {
    return { ok: false, error: "Buton gösterilecekse buton URL'i zorunlu" };
  }
  const scope = isPopupDisplayScope(v.scope) ? v.scope : null;
  const dismiss = isPopupDismissDuration(v.dismiss) ? v.dismiss : null;
  if (!scope || !dismiss) return { ok: false, error: "Geçersiz gösterim ayarı" };
  const startDate = typeof v.startDate === "string" ? v.startDate.trim() : "";
  const endDate = typeof v.endDate === "string" ? v.endDate.trim() : "";
  const startsAt = startDate ? popupDateToIso(startDate, "start") : null;
  const endsAt = endDate ? popupDateToIso(endDate, "end") : null;
  if ((startDate && !startsAt) || (endDate && !endsAt)) return { ok: false, error: "Geçersiz tarih" };
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) {
    return { ok: false, error: "Bitiş tarihi başlangıç tarihinden önce olamaz" };
  }
  if (isEnabled && !imagePath && !rootText.title && !rootText.highlight_text && !rootText.description) {
    return { ok: false, error: "Popup'ı açmak için en az bir görsel veya başlık ekleyin" };
  }

  /* Çeviriler: `translations` anahtarı yoksa diğer dillere DOKUNULMAZ (eski sözleşme). */
  const rawTr = v.translations;
  const others: Partial<Record<Locale, Cleaned>> = {};
  if (rawTr !== undefined) {
    const obj = (rawTr && typeof rawTr === "object" ? rawTr : {}) as Record<string, unknown>;
    for (const l of layout.translations) {
      const t = (obj[l] && typeof obj[l] === "object" ? obj[l] : {}) as Record<string, unknown>;
      const c = cleanText(t);
      if (c.button_url && !isSafePopupUrl(c.button_url)) {
        return { ok: false, error: `${ADMIN_LOCALE_LABELS[l]}: buton URL'i '/' ile başlayan bir site adresi veya https:// ile başlayan bir bağlantı olmalı` };
      }
      if (showButton && c.button_text && !c.button_url && !rootText.button_url) {
        return { ok: false, error: `${ADMIN_LOCALE_LABELS[l]}: buton URL'i zorunlu (bu dilde veya ${rootLabel})` };
      }
      others[l] = c;
    }
  }

  const prev = await sitePopupRepository.find();
  if (prev.error) return { ok: false, error: "Kaydedilemedi" };
  const prevRow = (prev.data as SitePopupRow | null) ?? null;
  if (!prevRow) return { ok: false, error: "Kaydedilemedi (migration 095?)" };
  const prevImage = prevRow.image_path || null;
  const before = await getAdminContent("site_popup", POPUP_ID);

  const items = [
    { entity: "site_popup" as const, parentId: POPUP_ID, locale: root, patch: rootText },
    ...(Object.entries(others) as [Locale, Cleaned][]).map(([locale, patch]) => ({
      entity: "site_popup" as const,
      parentId: POPUP_ID,
      locale,
      patch,
    })),
  ];
  const r = await adminSaveContentMany(caller, {
    entity: "site_popup",
    entityId: POPUP_ID,
    action: "content.update",
    title: "Açılış popup",
    route: "/maki-admin/settings/popup",
    before,
    items,
    technical: [
      {
        entity: "site_popup",
        parentId: POPUP_ID,
        values: {
          is_enabled: isEnabled,
          image_path: imagePath,
          show_button: showButton,
          display_scope: scope,
          dismiss_duration: dismiss,
          starts_at: startsAt,
          ends_at: endsAt,
          updated_at: new Date().toISOString(),
        },
      },
    ],
  });
  if (!r.ok) {
    console.error("[site-popup.save] FAILED", r.error);
    return { ok: false, error: r.error || "Kaydedilemedi" };
  }

  if (prevImage && prevImage !== imagePath && IMAGE_PATH_RE.test(prevImage)) {
    try {
      const res = await removeServer(SITE_ASSETS_BUCKET_NAME, [prevImage]);
      if (!res.ok) console.warn("[site-popup.save] STORAGE_ORPHAN", { path: prevImage });
    } catch (e) {
      console.warn("[site-popup.save] STORAGE_ORPHAN", { path: prevImage, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const fresh = await sitePopupRepository.find();
  const content = await getAdminContent("site_popup", POPUP_ID);
  return { ok: true, values: toValues((fresh.data as SitePopupRow | null) ?? prevRow, content, root, layout.translations) };
}

export const POPUP_ALL_LOCALES = CONTENT_LOCALES;
