import "server-only";

import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import { isSupportedLocale } from "@/lib/i18n/config";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import {
  adminCreateContent,
  adminSaveContent,
  getAdminContent,
  getAdminContentRows,
  getAdminLocaleLayout,
} from "@/lib/i18n/content/content-admin.server";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";

/* ===============================================================
   🌐 TEK ALANLI İÇERİK MODÜLLERİ — Faz 5 ortak sunucu yardımcıları
   ===============================================================
   Özellik, kural, fiyata dahil, ödeme yöntemi, menü, villa tipi, SSS,
   koleksiyon başlıkları. YETKİ KONTROLÜ ÇAĞIRAN "use server" eyleminde
   (requirePermission / callerHasPermission) yapılır; bu dosya yalnız
   yetkili çağrıdan sonra çalışır.
     • liste: ana tablo satırlarındaki içerik alanı ANA DİLİN değeriyle
       değiştirilir (ana form ana dili düzenler); + eksik dil bilgisi
     • ana form kaydı: saveContent(ana dil)
     • yeni kayıt: createContent(ana dil) — tek transaction
     • çeviri paneli: ana dil DIŞINDAKİ diller
   =============================================================== */

export type LocalizedAdminRow<T> = T & {
  /** Faz 5: bu satırda içeriği boş olan diller. */
  missing_locales?: Locale[];
};

export async function localizeAdminRows<T extends object>(
  entity: ContentEntityKey,
  rows: readonly T[],
  fields: readonly string[],
  opts?: {
    /** Ana dilde değer yokken: "" (varsayılan; zorunlu adlar) veya null
     *  (opsiyonel override, ör. koleksiyon custom_title → villa adı). */
    missingValue?: "" | null;
  }
): Promise<LocalizedAdminRow<T>[]> {
  const missingValue = opts?.missingValue === null ? null : "";
  if (rows.length === 0) return [];
  const layout = await getAdminLocaleLayout();
  const idOf = (r: T) => String((r as { id?: unknown }).id ?? "");
  const content = await getAdminContentRows(entity, rows.map(idOf));
  return rows.map((r) => {
    const byLocale = content.get(idOf(r)) ?? {};
    const rootValues = byLocale[layout.root] ?? {};
    const out: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const f of fields) {
      const v = rootValues[f];
      if (typeof v === "string" && (missingValue === "" || v.trim() !== "")) out[f] = v;
      else if (v !== undefined && v !== null && typeof v !== "string") out[f] = v;
      else out[f] = missingValue;
    }
    const missing = (["tr", "en", "de"] as Locale[]).filter((l) =>
      fields.every((f) => {
        const v = byLocale[l]?.[f];
        return typeof v !== "string" || v.trim() === "";
      })
    );
    if (missing.length) out.missing_locales = missing;
    return out as LocalizedAdminRow<T>;
  });
}

export async function saveRootContent(
  caller: AuthorizedAdminCaller,
  entity: ContentEntityKey,
  id: string,
  patch: Record<string, unknown>,
  opts?: { title?: string | null; route?: string }
): Promise<boolean> {
  const layout = await getAdminLocaleLayout();
  const r = await adminSaveContent(caller, {
    entity,
    parentId: id,
    locale: layout.root,
    patch,
    title: opts?.title,
    route: opts?.route,
  });
  if (!r.ok) console.error(`❌ [content-admin] ${entity} kaydedilemedi:`, r.error);
  return r.ok;
}

export async function createRootContent(
  caller: AuthorizedAdminCaller,
  entity: ContentEntityKey,
  patch: Record<string, unknown>,
  technical: Record<string, unknown> = {},
  opts?: { title?: string | null; route?: string }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const layout = await getAdminLocaleLayout();
  const r = await adminCreateContent(caller, {
    entity,
    technical,
    locales: [{ locale: layout.root, patch }],
    title: opts?.title,
    route: opts?.route,
  });
  if (!r.ok) {
    console.error(`❌ [content-admin] ${entity} oluşturulamadı:`, r.error);
    return { ok: false, error: r.error };
  }
  return { ok: true, id: r.id };
}

export async function loadTranslationRows(
  entity: ContentEntityKey,
  id: string,
  fields: readonly string[]
): Promise<{ ok: true; rows: Array<{ locale: Locale } & Record<string, unknown>>; layout: AdminLocaleLayout } | { ok: false; error: string }> {
  const parentId = (id ?? "").toString().trim();
  if (!parentId) return { ok: false, error: "Geçersiz kayıt" };
  try {
    const layout = await getAdminLocaleLayout();
    const byLocale = await getAdminContent(entity, parentId);
    const rows = layout.translations
      .filter((l) => byLocale[l])
      .map((l) => {
        const row: { locale: Locale } & Record<string, unknown> = { locale: l };
        for (const f of fields) row[f] = byLocale[l]?.[f] ?? null;
        if (byLocale[l] && "slug" in byLocale[l]!) row.slug = byLocale[l]!.slug ?? null;
        return row;
      });
    return { ok: true, rows, layout };
  } catch {
    return { ok: false, error: "Çeviriler okunamadı" };
  }
}

/** Çeviri paneli kaydı: YALNIZ ana dil DIŞINDAKİ diller. */
export async function saveTranslationRow(
  caller: AuthorizedAdminCaller,
  entity: ContentEntityKey,
  id: string,
  locale: unknown,
  patch: Record<string, unknown>,
  opts?: { title?: string | null; route?: string }
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const parentId = (id ?? "").toString().trim();
  if (!parentId) return { ok: false, error: "Geçersiz kayıt" };
  const layout = await getAdminLocaleLayout();
  if (!isSupportedLocale(locale) || !layout.translations.includes(locale)) {
    return { ok: false, error: "Geçersiz dil — ana dil ana formdan düzenlenir" };
  }
  const r = await adminSaveContent(caller, { entity, parentId, locale, patch, title: opts?.title, route: opts?.route });
  if (!r.ok) return { ok: false, error: r.error };
  const fresh = (await getAdminContent(entity, parentId))[locale] ?? {};
  return { ok: true, row: { locale, ...fresh } };
}
