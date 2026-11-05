"use server";

import { revalidateLocaleSlugs } from "@/lib/i18n/routing/slug-map.server";
import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { Locale } from "@/lib/i18n/config";
import {
  getAdminLocaleLayout,
  getSlugSeparationCapability,
  getTechnicalKey,
  adminSaveContent,
  getAdminContent,
} from "@/lib/i18n/content/content-admin.server";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import {
  loadTranslationRows,
  saveTranslationRow,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🌐 Faz 5 — Villa tipi çevirileri + dil URL slug'ları
   ===============================================================
   • Ad + slug, ana dil DIŞINDAKİ diller (panel sekmeleri).
   • Ana dilin URL slug'ı ayrı eylemle (saveTypeRootSlugAction).
   • Teknik anahtar (villa_types.slug) salt okunur; hiçbir eylem yazmaz.
   • base modunda TR URL slug'ı migration 108 (dil slug ayrımı) ister;
     yoksa servis `guard` döner, panel alanı kilitli gösterir.
   Yetki: okuma requirePermission; yazma authorizeAdminSession +
   callerHasPermission. Eski villa-type-translation.service yazması KAPALI.
   =============================================================== */

export type TypeTranslationInput = { typeId: string; locale: Locale; name: string; slug?: string | null };

export type TypeTranslationsLoad =
  | {
      ok: true;
      rows: Array<{ locale: Locale; name?: unknown; slug?: unknown }>;
      layout?: AdminLocaleLayout;
      technicalKey?: string | null;
      rootSlug?: string | null;
      slugSeparated?: boolean;
    }
  | { ok: false; error: string };

export async function loadTypeTranslationsAction(typeId: string): Promise<TypeTranslationsLoad> {
  await requirePermission("villa_types");
  const r = await loadTranslationRows("villa_type", typeId, ["name"]);
  if (!r.ok) return r;
  const [technicalKey, slugSeparated, all] = await Promise.all([
    getTechnicalKey("villa_type", typeId),
    getSlugSeparationCapability(),
    getAdminContent("villa_type", typeId),
  ]);
  return {
    ...r,
    technicalKey,
    slugSeparated,
    rootSlug: (all[r.layout.root]?.slug as string | null | undefined) ?? null,
  };
}

export async function saveTypeTranslationAction(
  input: TypeTranslationInput
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; error: string }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "villa_types"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const name = (input?.name ?? "").toString();
  if (!name.trim()) return { ok: false, error: "İsim gerekli" };
  const patch: Record<string, unknown> = { name };
  if (input.slug !== undefined) patch.slug = input.slug;
  const result = await saveTranslationRow(auth.caller, "villa_type", input.typeId, input.locale, patch, {
    route: "/maki-admin/types",
  });
  if (result.ok && input.slug !== undefined) revalidateLocaleSlugs();
  return result;
}

/** Ana dilin URL slug'ı (ad ana formda düzenlenir). */
export async function saveTypeRootSlugAction(input: {
  typeId: string;
  slug: string | null;
}): Promise<{ ok: true; slug: string | null } | { ok: false; error: string }> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "villa_types"))) {
    return { ok: false, error: "Yetkisiz" };
  }
  const layout = await getAdminLocaleLayout();
  const r = await adminSaveContent(auth.caller, {
    entity: "villa_type",
    parentId: input.typeId,
    locale: layout.root,
    patch: { slug: input.slug },
    route: "/maki-admin/types",
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidateLocaleSlugs();
  return { ok: true, slug: r.ok ? (r.slug ?? null) : null };
}
