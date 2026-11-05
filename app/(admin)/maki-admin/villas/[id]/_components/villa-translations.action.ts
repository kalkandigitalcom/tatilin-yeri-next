"use server";

import { revalidateLocaleSlugs } from "@/lib/i18n/routing/slug-map.server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getVillaTranslations,
  upsertVillaTranslation,
  type VillaTranslationInput,
} from "@/app/services/villa-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { isContentWriteMigrated } from "@/lib/i18n/content/content-write-modules";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import {
  loadVillaTranslationsCentral,
  saveVillaRootSlugCentral,
  saveVillaTranslationCentral,
} from "@/app/services/villa-admin/_helpers/content.server";

/* ===============================================================
   🛡️ Admin Villa Çeviri UI Server Actions
   ===============================================================
   Okuma: requirePermission("villas"). Yazma: authorizeAdminSession()
   İLK kontrol + callerHasPermission("villas").

   🌐 Faz 5 dalga 2 — "villa" merkezi yazmadayken kart ANA DİL
   DIŞINDAKİ iki dili (TR dahil olabilir) düzenler; ana dilin URL
   slug'ı ayrı eylemle (teknik anahtar DEĞİŞMEZ). Eski
   villa-translation.service yazma yolu KAPALI.
   =============================================================== */

export type VillaTranslationsLoad =
  | {
      ok: true;
      rows: Array<Record<string, unknown> & { locale: string }>;
      layout?: AdminLocaleLayout;
      technicalKey?: string | null;
      slugSeparated?: boolean;
      rootSlug?: string | null;
    }
  | { ok: false; error: string };

export type VillaTranslationSave =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

export async function loadVillaTranslationsAction(villaId: string): Promise<VillaTranslationsLoad> {
  await requirePermission("villas");
  if (isContentWriteMigrated("villa")) return loadVillaTranslationsCentral(villaId);
  return getVillaTranslations(villaId) as Promise<VillaTranslationsLoad>;
}

export async function saveVillaTranslationAction(
  input: Omit<VillaTranslationInput, "locale"> & { locale: string }
): Promise<VillaTranslationSave> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  const result = isContentWriteMigrated("villa")
    ? await saveVillaTranslationCentral(auth.caller, input)
    : ((await upsertVillaTranslation(input as VillaTranslationInput)) as VillaTranslationSave);
  if (result.ok && input.slug !== undefined) revalidateLocaleSlugs();
  return result;
}

/** 🌐 Faz 5 dalga 2 — ana dilin URL slug'ı (teknik anahtar değişmez). */
export async function saveVillaRootSlugAction(input: {
  villaId: string;
  slug: string | null;
}): Promise<{ ok: true; slug: string | null } | { ok: false; error: string }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  if (!isContentWriteMigrated("villa")) return { ok: false, error: "Bu işlem henüz etkin değil" };
  const r = await saveVillaRootSlugCentral(auth.caller, (input?.villaId ?? "").toString(), input?.slug ?? null);
  if (r.ok) revalidateLocaleSlugs();
  return r;
}
