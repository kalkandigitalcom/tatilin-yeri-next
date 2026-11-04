import "server-only";

import { dbNative as db } from "./native";

/* ===============================================================
   🌐 SITE LOCALE REPOSITORY — migration 101 (server-only)
   ===============================================================
   `public.site_locales` için DAR repository. Tablo adı ve kolon
   projeksiyonu SABİT; yazma yalnız `set_site_locales_enabled` RPC'si
   üzerinden (tek UPDATE, atomik; ana dil kuralını DB trigger'ı zorlar).
   =============================================================== */

const TABLE = "site_locales";

export type SiteLocaleRow = {
  code: string;
  is_enabled: boolean;
  sort_order: number;
};

export const siteLocaleRepository = {
  async findAll() {
    return db
      .from<SiteLocaleRow>(TABLE)
      .select("code, is_enabled, sort_order")
      .order("sort_order", { ascending: true });
  },

  async setEnabled(enabledCodes: string[]) {
    return db.rpc("set_site_locales_enabled", { p_enabled: enabledCodes });
  },

  /** Faz 4 — ana dili atomik değiştirir (migration 104). `expected`
   *  DB'deki mevcut ana dil değilse `root_locale_conflict` hatası.
   *  `data` = ESKİ ana dil. */
  async changeRootLocale(expected: string, next: string) {
    return db.rpc<string>("change_public_root_locale", {
      p_expected: expected,
      p_new: next,
    });
  },
};
