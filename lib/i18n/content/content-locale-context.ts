import {
  DEFAULT_LOCALE,
  getEnabledPublicLocales,
  getRootLocale,
  isSupportedLocale,
  type Locale,
} from "@/lib/i18n/config";

/* ===============================================================
   🌐 MERKEZİ İÇERİK OKUMA — DİL BAĞLAMI (Seçenek D, Faz 3, SAF)
   ===============================================================
   Ana dil = settings.public_default_locale (çoklu dil kapalıysa TR —
   mevcut getRootLocale kuralı; içerik katmanı kendi kuralını UYDURMAZ).
   Aktif diller = getEnabledPublicLocales (site_locales sırası; ana dil
   daima dahil). Pasif diller yedek zincirine ASLA girmez.
   =============================================================== */

export type ContentLocaleContext = { root: Locale; enabled: readonly Locale[] };

type SettingsLike = Parameters<typeof getRootLocale>[0];

export function contentLocaleContextFromSettings(settings: SettingsLike): ContentLocaleContext {
  return sanitizeContentLocaleContext({
    root: getRootLocale(settings),
    enabled: getEnabledPublicLocales(settings),
  });
}

/** Savunmacı: desteklenmeyen/tekrarlı dilleri at, ana dili daima dahil et. */
export function sanitizeContentLocaleContext(ctx: {
  root: unknown;
  enabled: readonly unknown[];
}): ContentLocaleContext {
  const root: Locale = isSupportedLocale(ctx.root) ? ctx.root : DEFAULT_LOCALE;
  const enabled: Locale[] = [];
  for (const l of ctx.enabled ?? []) {
    if (isSupportedLocale(l) && !enabled.includes(l)) enabled.push(l);
  }
  if (!enabled.includes(root)) enabled.unshift(root);
  return { root, enabled };
}
