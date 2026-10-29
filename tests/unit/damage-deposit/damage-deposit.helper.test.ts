import { describe, it, expect } from "vitest";
import {
  normalizeDepositCurrency,
  formatDamageDeposit,
  formatDamageDepositTRY,
  computeDamageDepositSnapshot,
  resolveReservationDamageDeposit,
  shouldDisplayReservationDamageDeposit,
  formatReservationDamageDeposit,
  formatReservationDamageDepositWithTry,
} from "@/lib/damage-deposit.helper";

/* 🛡️ Migration 099 — depozito para birimi (tek tutar + para birimi). */

const RATES = { USD: 32.5, EUR: 35.1, GBP: 41.2 };

describe("normalizeDepositCurrency", () => {
  it("desteklenen kodları korur (büyük/küçük harf duyarsız)", () => {
    expect(normalizeDepositCurrency("EUR")).toBe("EUR");
    expect(normalizeDepositCurrency("usd")).toBe("USD");
    expect(normalizeDepositCurrency(" gbp ")).toBe("GBP");
    expect(normalizeDepositCurrency("TRY")).toBe("TRY");
  });
  it("NULL / boş / desteklenmeyen → TRY (eski kayıtlarla uyumlu)", () => {
    expect(normalizeDepositCurrency(null)).toBe("TRY");
    expect(normalizeDepositCurrency(undefined)).toBe("TRY");
    expect(normalizeDepositCurrency("")).toBe("TRY");
    expect(normalizeDepositCurrency("JPY")).toBe("TRY");
    expect(normalizeDepositCurrency(5)).toBe("TRY");
  });
});

describe("formatDamageDeposit", () => {
  it("TRY çıktısı formatDamageDepositTRY ile BİREBİR aynı", () => {
    for (const v of [0, 5000, 12500.4, "7500", null, -10]) {
      expect(formatDamageDeposit(v, "TRY")).toBe(formatDamageDepositTRY(v));
      expect(formatDamageDeposit(v, null)).toBe(formatDamageDepositTRY(v));
    }
  });
  it("yabancı para birimini kendi sembolüyle gösterir", () => {
    expect(formatDamageDeposit(500, "EUR")).toBe("€500");
    expect(formatDamageDeposit(1500, "USD")).toBe("$1.500");
    expect(formatDamageDeposit(300, "GBP")).toBe("£300");
  });
});

describe("computeDamageDepositSnapshot", () => {
  it("TRY → damage_deposit = Number(deposit) || 0 (eski formül), kur gerekmez", () => {
    expect(computeDamageDepositSnapshot(7500, "TRY", {})).toEqual({
      damage_deposit: 7500,
      original_damage_deposit: 7500,
      original_damage_deposit_currency: "TRY",
      rateMissing: false,
    });
    expect(computeDamageDepositSnapshot("5000", null, null).damage_deposit).toBe(5000);
    expect(computeDamageDepositSnapshot(null, undefined, null).damage_deposit).toBe(0);
  });
  it("EUR → TRY karşılığı convertPrice (amount × kur)", () => {
    const s = computeDamageDepositSnapshot(500, "EUR", RATES);
    expect(s.damage_deposit).toBe(17550);
    expect(s.original_damage_deposit).toBe(500);
    expect(s.original_damage_deposit_currency).toBe("EUR");
    expect(s.rateMissing).toBe(false);
  });
  it("yabancı para birimi + kur yok / 0 / NaN → rateMissing, damage_deposit 0", () => {
    for (const rates of [{}, { EUR: 0 }, { EUR: Number.NaN }, null]) {
      const s = computeDamageDepositSnapshot(500, "EUR", rates as never);
      expect(s.rateMissing).toBe(true);
      expect(s.damage_deposit).toBe(0);
      expect(s.original_damage_deposit_currency).toBe("EUR");
    }
  });
  it("yabancı para birimi ama tutar 0 → kur aranmaz, reddedilmez", () => {
    const s = computeDamageDepositSnapshot(0, "EUR", {});
    expect(s.rateMissing).toBe(false);
    expect(s.damage_deposit).toBe(0);
  });
});

describe("resolveReservationDamageDeposit / format", () => {
  it("eski kayıt (original_* NULL) → TRY, değer damage_deposit", () => {
    const row = { damage_deposit: 5000 };
    expect(resolveReservationDamageDeposit(row)).toEqual({
      amount: 5000,
      currency: "TRY",
      tryAmount: 5000,
    });
    expect(formatReservationDamageDeposit(row)).toBe(formatDamageDepositTRY(5000));
    expect(formatReservationDamageDepositWithTry(row)).toBe(formatDamageDepositTRY(5000));
    expect(shouldDisplayReservationDamageDeposit(row)).toBe(true);
  });
  it("yeni EUR kaydı → orijinal tutar + para birimi; admin'de ₺ karşılığı", () => {
    const row = {
      damage_deposit: 17550,
      original_damage_deposit: 500,
      original_damage_deposit_currency: "EUR",
    };
    expect(resolveReservationDamageDeposit(row)).toEqual({
      amount: 500,
      currency: "EUR",
      tryAmount: 17550,
    });
    expect(formatReservationDamageDeposit(row)).toBe("€500");
    expect(formatReservationDamageDepositWithTry(row)).toBe("€500 (≈ ₺17.550)");
  });
  it("TRY snapshot'lı yeni kayıt eskisiyle aynı görünür", () => {
    const row = {
      damage_deposit: 7500,
      original_damage_deposit: 7500,
      original_damage_deposit_currency: "TRY",
    };
    expect(formatReservationDamageDeposit(row)).toBe(formatDamageDepositTRY(7500));
  });
  it("depozito yok → gösterilmez", () => {
    expect(shouldDisplayReservationDamageDeposit({ damage_deposit: 0 })).toBe(false);
    expect(shouldDisplayReservationDamageDeposit(null)).toBe(false);
    expect(
      shouldDisplayReservationDamageDeposit({
        damage_deposit: 0,
        original_damage_deposit: 0,
        original_damage_deposit_currency: "EUR",
      })
    ).toBe(false);
  });
});
