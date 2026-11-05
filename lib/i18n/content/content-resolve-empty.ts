import type { ContentField } from "@/lib/i18n/content/content-registry";

/* Faz 3: genel boşluk kuralı (NULL, yalnız boşluk, jsonb null/[]/{}/""). Saf. */
export function isEmptyContentValue(value: unknown, kind: ContentField["kind"]): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (kind === "jsonb") {
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value as object).length === 0;
  }
  return false;
}
