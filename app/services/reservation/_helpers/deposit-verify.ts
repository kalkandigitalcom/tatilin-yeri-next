import "server-only";

import { reservationRepository } from "@/lib/db/reservation.repository";
import { getExchangeRatesMap } from "@/app/services/exchange-rate.service";
import {
  computeDamageDepositSnapshot,
  normalizeDepositCurrency,
} from "@/lib/damage-deposit.helper";

/* ===============================================================
   🛡️ DEPOZİTO — SERVER-AUTHORITATIVE SNAPSHOT (migration 099)
   ===============================================================
   Admin rezervasyon oluşturma (`/api/admin/reservations` POST) için.
   Public akış aynı hesabı `price-verify.ts` içinde yapar.

   - Villa'nın KENDİ `deposit` + `deposit_currency` değerinden
     snapshot üretilir; client'ın gönderdiği damage_deposit alanları
     YOK SAYILIR.
   - TRY (veya NULL para birimi) → damage_deposit = Number(deposit) || 0
     (eski client formülüyle BİREBİR). Kur okunmaz.
   - Yabancı para birimi + pozitif tutar → güncel kur okunur. Kur yoksa
     `DamageDepositRateUnavailableError` → route rezervasyonu REDDEDER.
   - Toplam / ön ödeme / kalan ödeme alanlarına DOKUNMAZ.
   =============================================================== */

export class DamageDepositRateUnavailableError extends Error {
  constructor(currency: string) {
    super(
      `Depozito para birimi (${currency}) için güncel kur bulunamadı. Rezervasyon oluşturulamadı.`
    );
    this.name = "DamageDepositRateUnavailableError";
  }
}

export type AuthoritativeDamageDeposit = {
  damage_deposit: number;
  original_damage_deposit: number;
  original_damage_deposit_currency: string;
};

export async function resolveAuthoritativeDamageDeposit(
  villaId: string
): Promise<AuthoritativeDamageDeposit> {
  const res = await reservationRepository.findVillaCleaningConfig(villaId);
  if (res?.error) {
    throw new Error("Villa depozito bilgisi okunamadı.");
  }
  const row = (res?.data as Record<string, unknown> | null) || null;
  if (!row) {
    throw new Error("Villa bulunamadı.");
  }

  const amount = Number(row.deposit) || 0;
  const currency = normalizeDepositCurrency(row.deposit_currency);
  const needsRate = currency !== "TRY" && amount > 0;
  const rates = needsRate ? (await getExchangeRatesMap()).rates : {};

  const snap = computeDamageDepositSnapshot(
    amount,
    currency,
    rates as Record<string, number>
  );
  if (snap.rateMissing) {
    throw new DamageDepositRateUnavailableError(currency);
  }

  return {
    damage_deposit: snap.damage_deposit,
    original_damage_deposit: snap.original_damage_deposit,
    original_damage_deposit_currency: snap.original_damage_deposit_currency,
  };
}
