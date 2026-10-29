/* ===============================================================
   🛡️ PUBLIC REZERVASYON — SUNUCU HATASI → UI EŞLEŞTİRMESİ (PURE)
   ===============================================================
   `POST /api/public/reservations` hata gövdesindeki metin kullanıcıya
   ASLA olduğu gibi gösterilmez (locale dışı / ham DB metni sızıntısı).
   Bu helper yalnız BİLİNEN, sabit sunucu mesajlarını bir "tür"e
   çevirir; ReservationForm bu türe göre kendi dictionary metnini
   gösterir. Bilinmeyen her şey → "generic".

   Sunucu kaynakları (metinler BİREBİR):
     - route.ts telefon guard'ı:
         "Geçerli bir telefon numarası gir"           → phone
         "Geçerli bir ikinci telefon numarası gir"    → phone2
     - conflict.ts:   "Bu tarihler dolu" (409)        → dates
     - errors.ts:     "Bu tarihler artık müsait değil" (400, 23P01
                      yarışı)                         → dates
     - rate-limit:    HTTP 429                        → rateLimited

   PURE: IO yok; testten doğrudan import edilebilir.
=============================================================== */

export type PublicReservationServerErrorKind =
  | "phone"
  | "phone2"
  | "dates"
  | "rateLimited"
  | "generic";

const PHONE_MESSAGE = "Geçerli bir telefon numarası gir";
const PHONE2_MESSAGE = "Geçerli bir ikinci telefon numarası gir";
const DATES_MESSAGES = new Set([
  "Bu tarihler dolu",
  "Bu tarihler artık müsait değil",
]);

export function resolvePublicReservationServerError(
  status: number,
  body: unknown
): PublicReservationServerErrorKind {
  if (status === 409) return "dates";
  if (status === 429) return "rateLimited";

  const message =
    body && typeof body === "object" && "error" in body
      ? String((body as { error?: unknown }).error ?? "").trim()
      : "";

  if (message === PHONE_MESSAGE) return "phone";
  if (message === PHONE2_MESSAGE) return "phone2";
  if (DATES_MESSAGES.has(message)) return "dates";
  return "generic";
}
