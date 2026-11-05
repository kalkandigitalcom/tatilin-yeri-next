"use server";

import { requireAdminAction } from "@/lib/auth/action-authz";
import { getAdminLocaleLayout } from "@/lib/i18n/content/content-admin.server";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";

/* 🌐 Faz 5 — admin formlarının dil düzeni (ana dil + çeviri dilleri).
   Gizli veri yok; yine de yalnız aktif admin çağırabilir. */
export async function getAdminLocaleLayoutAction(): Promise<AdminLocaleLayout> {
  await requireAdminAction();
  return getAdminLocaleLayout();
}
