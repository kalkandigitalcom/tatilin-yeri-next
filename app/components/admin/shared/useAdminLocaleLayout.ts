"use client";

import { useEffect, useState } from "react";

import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import { getAdminLocaleLayoutAction } from "@/app/(admin)/maki-admin/_content/content-layout.action";

/* 🌐 Faz 5 — admin dil düzeni (ana dil = settings.public_default_locale).
   Okunamazsa (oturum/ağ hatası, test ortamı) ana dil TR düzenine düşer —
   bugünkü davranış. */
export const DEFAULT_ADMIN_LOCALE_LAYOUT: AdminLocaleLayout = {
  root: "tr",
  translations: ["en", "de"],
  enabled: ["tr", "en", "de"],
  multilingual: true,
};

export function useAdminLocaleLayout(): AdminLocaleLayout {
  const [layout, setLayout] = useState<AdminLocaleLayout>(DEFAULT_ADMIN_LOCALE_LAYOUT);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const l = await getAdminLocaleLayoutAction();
        if (!cancelled && l && Array.isArray(l.translations)) setLayout(l);
      } catch {
        /* varsayılan düzen */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return layout;
}
