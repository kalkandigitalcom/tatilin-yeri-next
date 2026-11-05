"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getVillaTypes as getVillaTypesService,
  deleteVillaType as deleteVillaTypeService,
  setVillaTypeCover as setVillaTypeCoverService,
  setVillaTypeHomepage as setVillaTypeHomepageService,
  setVillaTypeSortOrders as setVillaTypeSortOrdersService,
} from "@/app/services/villa-type.service";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { slugifyTr } from "@/lib/slug";
import { assignMissingTechnicalKey } from "@/lib/i18n/content/content-technical-key.server";
import { revalidateLocaleSlugs } from "@/lib/i18n/routing/slug-map.server";
import {
  createRootContent,
  localizeAdminRows,
  saveRootContent,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🛡️ VILLA TYPES — SERVER ACTIONS (thin wrapper)
   ===============================================================
   Admin `types/page.tsx` (client) → bu server action'lar →
   `villa-type.service` (server) → native repo.

   Kapak / ana sayfa / sıralama / silme eylemleri ince wrapper olarak
   kaldı. Ad ve oluşturma Faz 5'te merkezi içerik servisine geçti.
   =============================================================== */

/* 🌐 Faz 5 — villa tipi ADI merkezi içerik servisinden: liste ANA DİLİN
   değerini gösterir/düzenler. `slug` (ana tablo) TEKNİK ANAHTARDIR:
   yalnız oluşturmada ana dil adından üretilir, ad değişince DEĞİŞMEZ
   (eski "SEO URL KORUMASI" kuralıyla aynı sonuç). Dil URL slug'ları
   (TR dahil) çeviri satırlarında, "Çeviriler" panelinden.
   Eski yazma yolu (villa_types.name/slug doğrudan) bu modül için KAPALI. */
export async function getVillaTypesAction() {
  await requirePermission("villa_types");
  return localizeAdminRows("villa_type", await getVillaTypesService(), ["name"]);
}

export async function addVillaTypeAction(
  name: string,
  slug?: string | null
): Promise<boolean> {
  const caller = await requirePermission("villa_types");
  const value = (name ?? "").toString();
  if (!value.trim()) return false;
  const handle = (slug && slug.trim()) || slugifyTr(value) || null;
  if (!handle) return false;
  const { data: maxRow } = await villaTypeRepository.findMaxSortOrder();
  const nextSortOrder = (typeof maxRow?.sort_order === "number" ? maxRow.sort_order : -1) + 1;
  const r = await createRootContent(
    caller,
    "villa_type",
    { name: value },
    { slug: handle, sort_order: nextSortOrder },
    { title: value, route: "/maki-admin/types" }
  );
  return r.ok;
}

/** `slug` parametresi geriye uyumluluk için kabul edilir ama YOK SAYILIR:
 *  teknik anahtar ad güncellemesinde değişmez (yalnız BOŞSA bir kez atanır). */
export async function updateVillaTypeAction(
  id: string,
  name: string,
  _slug?: string | null
): Promise<boolean> {
  void _slug;
  const caller = await requirePermission("villa_types");
  const ok = await saveRootContent(caller, "villa_type", id, { name: (name ?? "").toString() }, {
    title: name,
    route: "/maki-admin/types",
  });
  /* 🌐 Faz 5 dalga 2 — eski (migration 008 öncesi) teknik anahtarı BOŞ
     kayıt: anahtar addan BİR KEZ üretilir (eski "Kaydet ile slug üret"
     davranışı). Dolu anahtar ASLA değişmez; dil URL slug'larına dokunulmaz.
     Böylece kapak yükleme / landing URL'i açılır. */
  if (ok) {
    const r = await assignMissingTechnicalKey("villa_type", id, (name ?? "").toString());
    if (r.ok && r.assigned) revalidateLocaleSlugs();
    if (!r.ok) console.error("❌ [villa_type] teknik anahtar atanamadı:", r.error);
  }
  return ok;
}

export async function deleteVillaTypeAction(id: string): Promise<boolean> {
  await requirePermission("villa_types");
  return deleteVillaTypeService(id);
}

export async function setVillaTypeCoverAction(
  id: string,
  path: string | null
): Promise<boolean> {
  await requirePermission("villa_types");
  return setVillaTypeCoverService(id, path);
}

export async function setVillaTypeHomepageAction(
  id: string,
  show: boolean
): Promise<boolean> {
  await requirePermission("villa_types");
  return setVillaTypeHomepageService(id, show);
}

export async function setVillaTypeSortOrdersAction(
  updates: Array<{ id: string; sort_order: number }>
): Promise<boolean> {
  await requirePermission("villa_types");
  return setVillaTypeSortOrdersService(updates);
}
