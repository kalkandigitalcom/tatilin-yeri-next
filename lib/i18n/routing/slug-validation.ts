import type { SlugKind } from "@/lib/i18n/routing/route-registry";

/* ===============================================================
   🌐 DİL SLUG'I — biçim kuralları (saf; admin UI + servis)
   ===============================================================
   DB CHECK'i ile AYNI kural (migration 102):
     küçük harf, rakam ve tek tire; 1–160 karakter.
   Normalizasyon yalnız güvenli dönüşümler yapar (trim, küçük harf,
   Türkçe/Almanca harflerin ASCII karşılığı, boşluk → tire); sonuç
   kurala uymuyorsa hata döner (sessizce düzeltilmez).
   =============================================================== */

export const LOCALIZED_SLUG_MAX_LEN = 160;
export const LOCALIZED_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Bu türde dil slug'ı olarak kullanılamayan değerler (statik route
 *  segmentleriyle çakışır: ör. /en/booking/success). */
export const RESERVED_SLUGS: Readonly<Record<SlugKind, readonly string[]>> = {
  villa: ["success", "erfolg", "basarili"],
  villaType: [],
  blog: [],
  page: [],
};

const CHAR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u",
  ä: "ae", ß: "ss",
};

export function normalizeLocalizedSlug(input: string | null | undefined): string {
  let s = (input ?? "").toString().trim().toLocaleLowerCase("tr");
  s = s.replace(/[çğıöşüäß]|i̇/g, (c) => CHAR_MAP[c] ?? c);
  s = s.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s;
}

export type SlugFormatResult =
  | { ok: true; slug: string | null }
  | { ok: false; error: string };

/** Boş → null (o dilde TR slug'ı kullanılır). */
export function checkLocalizedSlugFormat(
  kind: SlugKind,
  input: string | null | undefined
): SlugFormatResult {
  const slug = normalizeLocalizedSlug(input);
  if (!slug) return { ok: true, slug: null };
  if (slug.length > LOCALIZED_SLUG_MAX_LEN) {
    return { ok: false, error: `URL slug'ı ${LOCALIZED_SLUG_MAX_LEN} karakteri geçemez` };
  }
  if (!LOCALIZED_SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: "URL slug'ı yalnız küçük harf, rakam ve tire içerebilir (ör. sea-view-villa)",
    };
  }
  if (RESERVED_SLUGS[kind].includes(slug)) {
    return { ok: false, error: `"${slug}" ayrılmış bir adres, kullanılamaz` };
  }
  return { ok: true, slug };
}
