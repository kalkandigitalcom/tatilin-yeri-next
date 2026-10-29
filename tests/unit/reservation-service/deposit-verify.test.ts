import { describe, it, expect, vi, beforeEach } from "vitest";

const findVillaCleaningConfig = vi.fn();
const getExchangeRatesMap = vi.fn();

vi.mock("@/lib/db/reservation.repository", () => ({
  reservationRepository: {
    findVillaCleaningConfig: (...a: unknown[]) => findVillaCleaningConfig(...a),
  },
}));
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: (...a: unknown[]) => getExchangeRatesMap(...a),
}));

import {
  resolveAuthoritativeDamageDeposit,
  DamageDepositRateUnavailableError,
} from "@/app/services/reservation/_helpers/deposit-verify";

/* 🛡️ Migration 099 — admin rezervasyon create depozito snapshot'ı. */

beforeEach(() => {
  vi.clearAllMocks();
  getExchangeRatesMap.mockResolvedValue({
    rates: { USD: 32.5, EUR: 35.1, GBP: 41.2 },
    updatedAt: null,
  });
});

describe("resolveAuthoritativeDamageDeposit", () => {
  it("TRY → eski formül, kur OKUNMAZ", async () => {
    findVillaCleaningConfig.mockResolvedValue({
      data: { deposit: 7500, deposit_currency: "TRY" },
      error: null,
    });
    await expect(resolveAuthoritativeDamageDeposit("v1")).resolves.toEqual({
      damage_deposit: 7500,
      original_damage_deposit: 7500,
      original_damage_deposit_currency: "TRY",
    });
    expect(getExchangeRatesMap).not.toHaveBeenCalled();
  });

  it("NULL para birimi (eski villa) → TRY", async () => {
    findVillaCleaningConfig.mockResolvedValue({
      data: { deposit: 3000, deposit_currency: null },
      error: null,
    });
    const r = await resolveAuthoritativeDamageDeposit("v1");
    expect(r.original_damage_deposit_currency).toBe("TRY");
    expect(r.damage_deposit).toBe(3000);
  });

  it("GBP → TRY karşılığı", async () => {
    findVillaCleaningConfig.mockResolvedValue({
      data: { deposit: 200, deposit_currency: "GBP" },
      error: null,
    });
    const r = await resolveAuthoritativeDamageDeposit("v1");
    expect(r).toEqual({
      damage_deposit: 8240,
      original_damage_deposit: 200,
      original_damage_deposit_currency: "GBP",
    });
  });

  it("yabancı para birimi + kur yok → DamageDepositRateUnavailableError", async () => {
    findVillaCleaningConfig.mockResolvedValue({
      data: { deposit: 500, deposit_currency: "EUR" },
      error: null,
    });
    getExchangeRatesMap.mockResolvedValue({ rates: {}, updatedAt: null });
    await expect(resolveAuthoritativeDamageDeposit("v1")).rejects.toBeInstanceOf(
      DamageDepositRateUnavailableError
    );
  });

  it("villa okunamazsa / yoksa throw (fail-closed)", async () => {
    findVillaCleaningConfig.mockResolvedValue({ data: null, error: { message: "x" } });
    await expect(resolveAuthoritativeDamageDeposit("v1")).rejects.toThrow();
    findVillaCleaningConfig.mockResolvedValue({ data: null, error: null });
    await expect(resolveAuthoritativeDamageDeposit("v1")).rejects.toThrow();
  });
});
