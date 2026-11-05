"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  listHomepageCollection as listHomepageCollectionService,
  addToHomepageCollection as addToHomepageCollectionService,
  removeFromHomepageCollection as removeFromHomepageCollectionService,
  toggleHomepageCollectionActive as toggleHomepageCollectionActiveService,
  updateHomepageCollectionItem as updateHomepageCollectionItemService,
  reorderHomepageCollection as reorderHomepageCollectionService,
  type HomepageCollectionItem,
} from "@/app/services/homepage-collection.service";
import {
  loadTranslationRows,
  localizeAdminRows,
  saveRootContent,
  saveTranslationRow,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ HOMEPAGE COLLECTION — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `homepage-collection/page.tsx` (client) → bu server action'lar →
   `homepage-collection.service` (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmzalar +
     dönüş tipleri service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function listHomepageCollectionAction(): Promise<
  HomepageCollectionItem[]
> {
  await requirePermission("homepage_collection");
  /* 🌐 Faz 5 — custom_title ANA DİLİN değeriyle (yoksa null → villa adı). */
  return localizeAdminRows("homepage_collection", await listHomepageCollectionService(), ["custom_title"], { missingValue: null });
}

export async function addToHomepageCollectionAction(
  villaId: string
): Promise<boolean> {
  await requirePermission("homepage_collection");
  return addToHomepageCollectionService(villaId);
}

export async function removeFromHomepageCollectionAction(
  id: string
): Promise<boolean> {
  await requirePermission("homepage_collection");
  return removeFromHomepageCollectionService(id);
}

export async function toggleHomepageCollectionActiveAction(
  id: string,
  isActive: boolean
): Promise<boolean> {
  await requirePermission("homepage_collection");
  return toggleHomepageCollectionActiveService(id, isActive);
}

export async function updateHomepageCollectionItemAction(
  id: string,
  fields: { custom_title?: string | null; custom_cover_image?: string | null }
): Promise<boolean> {
  const caller = await requirePermission("homepage_collection");
  /* 🌐 Faz 5 — custom_title (çevrilebilir, karar 6) merkezi içerik
     servisiyle ANA DİLDE; diğer alanlar (kapak, seçim) eski servisle.
     Eski custom_title doğrudan yazma yolu KAPALI. */
  const { custom_title, ...rest } = fields ?? {};
  if (custom_title !== undefined) {
    const v = custom_title === null ? null : String(custom_title).trim() || null;
    const ok = await saveRootContent(caller, "homepage_collection", id, { custom_title: v }, { route: "/maki-admin/homepage-collection" });
    if (!ok) return false;
  }
  if (Object.keys(rest).length === 0) return true;
  return updateHomepageCollectionItemService(id, rest);
}

export async function reorderHomepageCollectionAction(
  orderedIds: string[]
): Promise<boolean> {
  await requirePermission("homepage_collection");
  return reorderHomepageCollectionService(orderedIds);
}

/* ===============================================================
   🌐 Faz 5 — custom_title çevirileri (ana dil DIŞINDAKİ diller, karar 6)
   =============================================================== */
export async function loadHomepageCollectionTitleTranslationsAction(id: string) {
  await requirePermission("homepage_collection");
  return loadTranslationRows("homepage_collection", id, ["custom_title"]);
}

export async function saveHomepageCollectionTitleTranslationAction(input: {
  id: string;
  locale: Locale;
  custom_title: string;
}) {
  const caller = await requirePermission("homepage_collection");
  const v = (input?.custom_title ?? "").toString().trim();
  return saveTranslationRow(caller, "homepage_collection", input.id, input.locale, { custom_title: v || null }, {
    route: "/maki-admin/homepage-collection",
  });
}
