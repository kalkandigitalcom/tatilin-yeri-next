"use server";

import { requirePermission } from "@/lib/auth/action-authz";
import {
  getRuleItems as getRuleItemsService,
  deleteRuleItem as deleteRuleItemService,
  type RuleItem,
} from "@/app/services/rule-item.service";
import {
  createRootContent,
  localizeAdminRows,
  saveRootContent,
} from "@/app/(admin)/maki-admin/_content/simple-content.server";

/* ===============================================================
   🛡️ KURALLAR — SERVER ACTIONS
   ===============================================================
   🌐 Faz 5 — simetrik çoklu dil: `title` merkezi içerik servisinden
   okunur/yazılır. Liste satırı ANA DİLİN (settings.public_default_locale)
   değerini gösterir ve düzenler; diğer diller "Çeviriler" panelinden.
   Eski yazma yolu (ana tabloya doğrudan title UPDATE/INSERT) bu modül
   için KAPALI (lib/i18n/content/content-write-modules.ts). Silme mevcut
   servis üzerinden, değişmedi. İmzalar ve dönüş tipleri eskisiyle aynı.
   =============================================================== */

export async function getRuleItemsAction(): Promise<RuleItem[]> {
  await requirePermission("rules");
  return localizeAdminRows("rule_item", await getRuleItemsService(), ["title"]);
}

export async function addRuleItemAction(title: string): Promise<boolean> {
  const caller = await requirePermission("rules");
  const value = (title ?? "").toString();
  if (!value.trim()) return false;
  const r = await createRootContent(caller, "rule_item", { title: value }, {}, {
    title: value,
    route: "/maki-admin/rules",
  });
  return r.ok;
}

export async function updateRuleItemAction(
  id: string,
  title: string
): Promise<boolean> {
  const caller = await requirePermission("rules");
  return saveRootContent(caller, "rule_item", id, { title: (title ?? "").toString() }, {
    title: title,
    route: "/maki-admin/rules",
  });
}

export async function deleteRuleItemAction(id: string): Promise<boolean> {
  await requirePermission("rules");
  return deleteRuleItemService(id);
}
