"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getVillaFeatures as getVillaFeaturesService,
  deleteVillaFeature as deleteVillaFeatureService,
  type Feature,
} from "@/app/services/villa-feature.service";
import {
  createRootContent,
  localizeAdminRows,
  saveRootContent,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🛡️ VILLA FEATURES — SERVER ACTIONS
   ===============================================================
   🌐 Faz 5 — simetrik çoklu dil: olanak ADI artık merkezi içerik
   servisinden okunur/yazılır (lib/i18n/content). Liste satırı ANA DİLİN
   (settings.public_default_locale) değerini gösterir ve düzenler; diğer
   diller "Çeviriler" panelinden. Eski yazma yolu (villa_features.name'e
   doğrudan UPDATE/INSERT) bu modül için KAPALI — iki yol aynı anda
   çalışmaz (lib/i18n/content/content-write-modules.ts).
   Silme (ilişki temizliği dahil) mevcut servis üzerinden, değişmedi.
   İmzalar ve dönüş tipleri eskisiyle aynı.
   =============================================================== */

export async function getVillaFeaturesAction(): Promise<Feature[]> {
  await requirePermission("features");
  return localizeAdminRows("villa_feature", await getVillaFeaturesService(), ["name"]);
}

export async function addVillaFeatureAction(name: string): Promise<boolean> {
  const caller = await requirePermission("features");
  const value = (name ?? "").toString();
  if (!value.trim()) return false;
  const r = await createRootContent(caller, "villa_feature", { name: value }, {}, {
    title: value,
    route: "/maki-admin/features",
  });
  return r.ok;
}

export async function updateVillaFeatureAction(
  id: string,
  name: string
): Promise<boolean> {
  const caller = await requirePermission("features");
  return saveRootContent(caller, "villa_feature", id, { name: (name ?? "").toString() }, {
    title: name,
    route: "/maki-admin/features",
  });
}

export async function deleteVillaFeatureAction(id: string): Promise<boolean> {
  await requirePermission("features");
  return deleteVillaFeatureService(id);
}
