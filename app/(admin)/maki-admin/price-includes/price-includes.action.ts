"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getPriceIncludeItems as getPriceIncludeItemsService,
  deletePriceIncludeItem as deletePriceIncludeItemService,
  type PriceIncludeItem,
} from "@/app/services/price-include-item.service";
import {
  createRootContent,
  localizeAdminRows,
  saveRootContent,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🛡️ FİYATA DAHİL OLANLAR — SERVER ACTIONS
   ===============================================================
   🌐 Faz 5 — simetrik çoklu dil: `title` merkezi içerik servisinden
   okunur/yazılır. Liste satırı ANA DİLİN (settings.public_default_locale)
   değerini gösterir ve düzenler; diğer diller "Çeviriler" panelinden.
   Eski yazma yolu (ana tabloya doğrudan title UPDATE/INSERT) bu modül
   için KAPALI (lib/i18n/content/content-write-modules.ts). Silme mevcut
   servis üzerinden, değişmedi. İmzalar ve dönüş tipleri eskisiyle aynı.
   =============================================================== */

export async function getPriceIncludeItemsAction(): Promise<PriceIncludeItem[]> {
  await requirePermission("price_includes");
  return localizeAdminRows("price_include_item", await getPriceIncludeItemsService(), ["title"]);
}

export async function addPriceIncludeItemAction(title: string): Promise<boolean> {
  const caller = await requirePermission("price_includes");
  const value = (title ?? "").toString();
  if (!value.trim()) return false;
  const r = await createRootContent(caller, "price_include_item", { title: value }, {}, {
    title: value,
    route: "/maki-admin/price-includes",
  });
  return r.ok;
}

export async function updatePriceIncludeItemAction(
  id: string,
  title: string
): Promise<boolean> {
  const caller = await requirePermission("price_includes");
  return saveRootContent(caller, "price_include_item", id, { title: (title ?? "").toString() }, {
    title: title,
    route: "/maki-admin/price-includes",
  });
}

export async function deletePriceIncludeItemAction(id: string): Promise<boolean> {
  await requirePermission("price_includes");
  return deletePriceIncludeItemService(id);
}
