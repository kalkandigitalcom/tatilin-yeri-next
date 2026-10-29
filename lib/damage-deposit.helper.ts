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

   PARA BİRİMİ (migration 099):
   villa.deposit_currency (TRY/USD/EUR/GBP; NULL → TRY).
   reservations.damage_deposit = TRY karşılığı (TRY'de tutarın kendisi),
   reservations.original_damage_deposit(_currency) = villanın kendi
   para birimindeki snapshot. Eski kayıtlarda original_* NULL → TRY.

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
  /** TRY karşılığı (TRY depozitoda tutarın kendisi). */
  damage_deposit: number;
  /** Villanın kendi para birimindeki tutar. */
  original_damage_deposit: number;
  original_damage_deposit_currency: DepositCurrency;
  /** true → yabancı para birimli, pozitif depozito için geçerli kur yok.
   *  Çağıran rezervasyonu REDDETMELİDİR (damage_deposit bu durumda 0). */
  rateMissing: boolean;
};

/** Villa depozitosundan rezervasyon snapshot'ı üretir.
 *  TRY (veya NULL para birimi) → damage_deposit = Number(deposit) || 0
 *  (eski formülle BİREBİR). Yabancı para birimi → convertPrice ile TRY
 *  karşılığı; kur geçersizse rateMissing=true. Toplam/ödeme hesaplarına
 *  DOKUNMAZ. */
export function computeDamageDepositSnapshot(
  deposit: unknown,
  currency: unknown,
  rates: Record<string, number> | null | undefined
): DamageDepositSnapshot {
  const amount = Number(deposit) || 0;
  const code = normalizeDepositCurrency(currency);

  if (code === "TRY" || amount <= 0) {
    return {
      damage_deposit: amount,
      original_damage_deposit: amount,
      original_damage_deposit_currency: code,
      rateMissing: false,
    };
  }

  const rate = Number(rates?.[code]);
  if (!(Number.isFinite(rate) && rate > 0)) {
    return {
      damage_deposit: 0,
      original_damage_deposit: amount,
      original_damage_deposit_currency: code,
      rateMissing: true,
    };
  }

  return {
    damage_deposit: convertPrice(amount, code, "TRY", rates as Record<string, number>),
    original_damage_deposit: amount,
    original_damage_deposit_currency: code,
    rateMissing: false,
  };
}

export type ReservationDamageDepositFields = {
  damage_deposit?: number | string | null;
  original_damage_deposit?: number | string | null;
  original_damage_deposit_currency?: string | null;
};

export type ResolvedReservationDamageDeposit = {
  /** Gösterilecek tutar (orijinal para biriminde). */
  amount: number;
  currency: DepositCurrency;
  /** TRY karşılığı (reservations.damage_deposit). */
  tryAmount: number;
};

/** Rezervasyon satırından depozitoyu çözer. Yabancı para birimli
 *  snapshot varsa onu, yoksa (eski kayıt / TRY) damage_deposit'i TRY
 *  olarak döner. */
export function resolveReservationDamageDeposit(
  row: ReservationDamageDepositFields | null | undefined
): ResolvedReservationDamageDeposit {
  const tryAmount = normalizeDamageDeposit(row?.damage_deposit);
  const code = normalizeDepositCurrency(row?.original_damage_deposit_currency);
  const original = normalizeDamageDeposit(row?.original_damage_deposit);

  if (code !== "TRY" && original > 0) {
    return { amount: original, currency: code, tryAmount };
  }
  return { amount: tryAmount, currency: "TRY", tryAmount };
}

export function shouldDisplayReservationDamageDeposit(
  row: ReservationDamageDepositFields | null | undefined
): boolean {
  return resolveReservationDamageDeposit(row).amount > 0;
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
