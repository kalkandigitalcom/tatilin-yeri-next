import { isSupportedLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🌐 AKTİF DİL LİSTESİ DOĞRULAMASI — Faz 1 (saf, client+server)
   ===============================================================
   Admin arayüzü ve `/api/admin/settings/locales` PUT AYNI kuralı
   kullanır (tek kaynak). DB tarafında ayrıca trigger vardır.

   KURALLAR:
     1) Dizi olmalı; yalnız desteklenen dil kodları (tekrarlar atılır).
     2) En az bir dil aktif olmalı.
     3) Ana dil (settings.public_default_locale) mutlaka aktif olmalı.
     4) (Faz 6 Dalga 1'de kaldırıldı) Eski FAZ 1 kısıtı "Türkçe
        kapatılamaz" artık yok: bütün diller dil kapısından ([lang]
        dispatcher + proxy) geçiyor; TR'ye özel istisna bulunmaz.
   =============================================================== */

/** Faz 1'de kapatılamayan diller (ana dile EK olarak).
 *  🌐 Faz 6 Dalga 1 — TR'ye özel istisna KALDIRILDI: TR de EN/DE gibi
 *  kapatılabilir. Tek zorunlu kural: ana dil (public_default_locale)
 *  daima aktiftir (aşağıdaki kural + DB trigger'ı 101). */
export const ALWAYS_ENABLED_LOCALES: readonly Locale[] = [];

export type EnabledLocalesValidation =
  | { ok: true; enabled: Locale[] }
  | { ok: false; error: string };

export function validateEnabledLocalesInput(
  input: unknown,
  rootLocale: Locale
): EnabledLocalesValidation {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Aktif dil listesi geçersiz." };
  }
  for (const v of input) {
    if (!isSupportedLocale(v)) {
      return { ok: false, error: `Desteklenmeyen dil kodu: ${String(v)}` };
    }
  }
  const set = new Set<Locale>(input as Locale[]);
  const enabled = SUPPORTED_LOCALES.filter((l) => set.has(l));

  if (enabled.length === 0) {
    return { ok: false, error: "En az bir dil aktif olmalıdır." };
  }
  if (!set.has(rootLocale)) {
    return { ok: false, error: "Ana dil kapatılamaz." };
  }
  for (const l of ALWAYS_ENABLED_LOCALES) {
    if (!set.has(l)) {
      return {
        ok: false,
        error: "Türkçe bu sürümde kapatılamaz (öneksiz kök URL'lerde çalışıyor).",
      };
    }
  }
  return { ok: true, enabled };
}

/** Admin arayüzünde bir dilin anahtarının kilitli olup olmadığı. */
export function isLocaleToggleLocked(locale: Locale, rootLocale: Locale): boolean {
  return locale === rootLocale || ALWAYS_ENABLED_LOCALES.includes(locale);
}
