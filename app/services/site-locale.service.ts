import "server-only";

import { siteLocaleRepository } from "@/lib/db/site-locale.repository.server";
import type { PublicLocaleState } from "@/lib/i18n/config";

/* ===============================================================
   🌐 SITE LOCALE SERVICE — migration 101
   ===============================================================
   Public okuma: hata/tablo yok → null (çağıran "tüm diller aktif"
   eski davranışına düşer; public site ÇÖKMEZ).
   =============================================================== */

export async function getPublicLocaleStates(): Promise<
  PublicLocaleState[] | null
> {
  try {
    const { data, error } = await siteLocaleRepository.findAll();
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data
      .filter((r) => r && typeof r.code === "string")
      .map((r) => ({
        code: r.code,
        is_enabled: r.is_enabled === true,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
      }));
  } catch {
    return null;
  }
}
