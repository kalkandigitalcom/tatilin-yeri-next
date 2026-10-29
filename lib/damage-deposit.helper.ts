import { convertPrice } from "@/lib/currency";

/* ===============================================================
   🔥 DAMAGE DEPOSIT — TEK MERKEZİ HELPER
   ===============================================================
   Source-of-truth: villas.deposit (master)
   Snapshot:        reservations.damage_deposit (frozen on insert)

   Bu helper:
   - normalize: number / NaN / negative → 0
   - shouldDisplay: > 0 ise true (0/null/undefined render edilmez)
   - format: TRY tutarı + opsiyonel inline note

   PARA BİRİMİ (migration 099 + 100) — temizlik ücreti ile AYNI model:
     villa.deposit + villa.deposit_currency (TRY/USD/EUR/GBP; NULL → TRY)
       ↔ villa.cleaning_fee + villa.cleaning_currency
     reservations.original_damage_deposit(_currency)   (numeric / text)
       ↔ reservations.original_cleaning_fee(_currency)
     reservations.damage_deposit_try (numeric, 2 hane, convertPrice)
       ↔ reservations.cleaning_fee_try
     reservations.damage_deposit (ESKİ, INTEGER) → yalnız TRY depozitoda
       tutar (eski davranış); yabancı para biriminde 0.
   Eski kayıtlarda original_* / damage_deposit_try NULL → TRY.

   ÖNEMLİ:
   damage_deposit informational bir alandır;
   getPaymentDisplayValues / total / prepayment / remaining_payment
   hesaplarına HİÇ dahil edilmez. Yalnız ayrı info satırı/kartı
   olarak gösterilir.
   =============================================================== */

export const DAMAGE_DEPOSIT_NOTE =
  "Hasar olmadığı takdirde iade edilir";

export function normalizeDamageDeposit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

export function shouldDisplayDamageDeposit(value: unknown): boolean {
  return normalizeDamageDeposit(value) > 0;
}

/* TRY formatlı tutar — formatTRY ile aynı stil */
export function formatDamageDepositTRY(value: unknown): string {
  const n = normalizeDamageDeposit(value);
  return `₺${new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(n)}`;
}

/* ===============================================================
   🔥 DEPOZİTO PARA BİRİMİ (migration 099)
   =============================================================== */

export const DEPOSIT_CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
export type DepositCurrency = (typeof DEPOSIT_CURRENCIES)[number];

const DEPOSIT_CURRENCY_SYMBOLS: Record<DepositCurrency, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/** Desteklenmeyen / boş / NULL değer → "TRY" (eski kayıtlarla uyumlu). */
export function normalizeDepositCurrency(value: unknown): DepositCurrency {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (DEPOSIT_CURRENCIES as readonly string[]).includes(code)
    ? (code as DepositCurrency)
    : "TRY";
}

/** Para birimine göre formatlı tutar — formatDamageDepositTRY ile aynı
 *  stil (sembol + tr-TR sayı, küsuratsız). TRY'de BİREBİR aynı çıktı. */
export function formatDamageDeposit(value: unknown, currency: unknown): string {
  const n = normalizeDamageDeposit(value);
  const code = normalizeDepositCurrency(currency);
  return `${DEPOSIT_CURRENCY_SYMBOLS[code]}${new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(n)}`;
}

export type DamageDepositSnapshot = {
  /** Eski `reservations.damage_deposit` (INTEGER) kolonu — admin'in TL
   *  olarak girdiği depozito. YALNIZ TRY depozitoda dolu (eski formül
   *  `Number(deposit) || 0` BİREBİR); yabancı para biriminde 0 — TL
   *  cinsinden girilmiş bir depozito yoktur ve kuruşlu TRY karşılığı
   *  integer kolona yazılamaz (bkz. damage_deposit_try). */
  damage_deposit: number;
  /** TRY karşılığı — `cleaning_fee_try` / `pool_heating_total_try` ile
   *  AYNI yöntem: `convertPrice(amount, currency, "TRY", rates)`
   *  (2 hane, YUVARLAMA YOK). NUMERIC kolon (migration 100). TRY'de
   *  tutarın kendisi. */
  damage_deposit_try: number;
  /** Villanın kendi para birimindeki tutar. */
  original_damage_deposit: number;
  original_damage_deposit_currency: DepositCurrency;
  /** true → yabancı para birimli, pozitif depozito için geçerli kur yok.
   *  Çağıran rezervasyonu REDDETMELİDİR (TRY alanları bu durumda 0). */
  rateMissing: boolean;
};

/** Villa depozitosundan rezervasyon snapshot'ı üretir — temizlik ücreti
 *  ile AYNI veri modeli: orijinal tutar + orijinal para birimi + NUMERIC
 *  TRY karşılığı. Dönüşüm `convertPrice` (temizlik/havuz ısıtma ile aynı
 *  fonksiyon, aynı 2 hane). Yuvarlama YALNIZ gösterimde yapılır
 *  (formatDamageDeposit*). Toplam / ön ödeme / kalan ödemeye DOKUNMAZ. */
export function computeDamageDepositSnapshot(
  deposit: unknown,
  currency: unknown,
  rates: Record<string, number> | null | undefined
): DamageDepositSnapshot {
  const amount = Number(deposit) || 0;
  const code = normalizeDepositCurrency(currency);

  if (code === "TRY" || amount <= 0) {
    return {
      damage_deposit: code === "TRY" ? amount : 0,
      damage_deposit_try: amount,
      original_damage_deposit: amount,
      original_damage_deposit_currency: code,
      rateMissing: false,
    };
  }

  const rate = Number(rates?.[code]);
  if (!(Number.isFinite(rate) && rate > 0)) {
    return {
      damage_deposit: 0,
      damage_deposit_try: 0,
      original_damage_deposit: amount,
      original_damage_deposit_currency: code,
      rateMissing: true,
    };
  }

  return {
    damage_deposit: 0,
    damage_deposit_try: convertPrice(
      amount,
      code,
      "TRY",
      rates as Record<string, number>
    ),
    original_damage_deposit: amount,
    original_damage_deposit_currency: code,
    rateMissing: false,
  };
}

export type ReservationDamageDepositFields = {
  damage_deposit?: number | string | null;
  /** Migration 100 — NUMERIC TRY karşılığı. Eski kayıtlarda NULL. */
  damage_deposit_try?: number | string | null;
  original_damage_deposit?: number | string | null;
  original_damage_deposit_currency?: string | null;
};

export type ResolvedReservationDamageDeposit = {
  /** Gösterilecek tutar (orijinal para biriminde, ham — yuvarlama
   *  gösterim fonksiyonlarında). */
  amount: number;
  currency: DepositCurrency;
  /** TRY karşılığı: damage_deposit_try (varsa), yoksa damage_deposit. */
  tryAmount: number;
};

function positiveOrZero(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Rezervasyon satırından depozitoyu çözer. Yabancı para birimli
 *  snapshot varsa onu, yoksa (eski kayıt / TRY) damage_deposit'i TRY
 *  olarak döner. */
export function resolveReservationDamageDeposit(
  row: ReservationDamageDepositFields | null | undefined
): ResolvedReservationDamageDeposit {
  const legacyTry = positiveOrZero(row?.damage_deposit);
  const hasTryColumn =
    row?.damage_deposit_try !== null && row?.damage_deposit_try !== undefined;
  const tryAmount = hasTryColumn
    ? positiveOrZero(row?.damage_deposit_try)
    : legacyTry;
  const code = normalizeDepositCurrency(row?.original_damage_deposit_currency);
  const original = positiveOrZero(row?.original_damage_deposit);

  if (code !== "TRY" && original > 0) {
    return { amount: original, currency: code, tryAmount };
  }
  /* TRY: eski kayıtlar (yalnız damage_deposit) BİREBİR; yeni TRY
     kayıtlarında damage_deposit === damage_deposit_try. */
  const tryDisplay = legacyTry > 0 ? legacyTry : tryAmount;
  return { amount: tryDisplay, currency: "TRY", tryAmount: tryDisplay };
}

export function shouldDisplayReservationDamageDeposit(
  row: ReservationDamageDepositFields | null | undefined
): boolean {
  return normalizeDamageDeposit(resolveReservationDamageDeposit(row).amount) > 0;
}

/** Müşteriye giden metinler (mail, voucher) — orijinal para biriminde.
 *  Eski / TRY kayıtlarda formatDamageDepositTRY ile BİREBİR aynı. */
export function formatReservationDamageDeposit(
  row: ReservationDamageDepositFields | null | undefined
): string {
  const r = resolveReservationDamageDeposit(row);
  return formatDamageDeposit(r.amount, r.currency);
}

/** Admin gösterimi — yabancı para biriminde TRY karşılığı da eklenir:
 *  "€500 (≈ ₺21.500)". TRY'de formatDamageDepositTRY ile aynı. */
export function formatReservationDamageDepositWithTry(
  row: ReservationDamageDepositFields | null | undefined
): string {
  const r = resolveReservationDamageDeposit(row);
  const main = formatDamageDeposit(r.amount, r.currency);
  if (r.currency === "TRY" || r.tryAmount <= 0) return main;
  return `${main} (≈ ${formatDamageDepositTRY(r.tryAmount)})`;
}
