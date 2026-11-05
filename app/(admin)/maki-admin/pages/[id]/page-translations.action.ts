"use server";

import { revalidateLocaleSlugs } from "@/lib/i18n/routing/slug-map.server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getPageTranslations,
  upsertPageTranslation,
  type PageTranslationInput,
} from "@/app/services/page-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { isContentWriteMigrated } from "@/lib/i18n/content/content-write-modules";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import {
  loadPageTranslationsCentral,
  savePageTranslationCentral,
} from "../_content/page-content.server";

/* ===============================================================
   🛡️ PHASE 12C — Admin Sayfa Çeviri UI Server Actions
   ===============================================================
   Okuma: requirePermission("pages"). Yazma: authorizeAdminSession() İLK
   kontrol + callerHasPermission("pages").

   🌐 Faz 5 dalga 2 — "page" merkezi yazmadayken kart ANA DİL DIŞINDAKİ
   iki dili (TR dahil olabilir) düzenler (loadTranslationRows /
   saveTranslationRow). Eski page-translation.service yazması KAPALI.
   =============================================================== */

export type PageTranslationsLoad =
  | {
      ok: true;
      rows: Array<Record<string, unknown> & { locale: string }>;
      layout?: AdminLocaleLayout;
      technicalKey?: string | null;
      slugSeparated?: boolean;
      rootSections?: unknown;
    }
  | { ok: false; error: string };

export type PageTranslationSave =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

export async function loadPageTranslationsAction(pageId: string): Promise<PageTranslationsLoad> {
  await requirePermission("pages");
  if (isContentWriteMigrated("page")) return loadPageTranslationsCentral(pageId);
  return getPageTranslations(pageId) as Promise<PageTranslationsLoad>;
}

export async function savePageTranslationAction(
  input: Omit<PageTranslationInput, "locale"> & { locale: string }
): Promise<PageTranslationSave> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "pages"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  const result = isContentWriteMigrated("page")
    ? await savePageTranslationCentral(auth.caller, input)
    : ((await upsertPageTranslation(input as PageTranslationInput)) as PageTranslationSave);
  /* 🌐 Faz 2 — dil slug'ı değiştiyse URL haritası + sayfalar yenilenir. */
  if (result.ok && input.slug !== undefined) revalidateLocaleSlugs();
  return result;
}
