/* ===============================================================
   Kiraligim dolu aralık matematiği (saf, sunucu/istemci bağımsız)
   ===============================================================
   Gün = "YYYY-MM-DD" → UTC gün numarası (tam sayı). Saat dilimi / DST
   yok. Bütün aralıklar yarı açık [start, end).

   Değişiklik kuralı (Kiraligim sözleşmesi): bir değişiklik
   [start_date, end_date) aralığının TAM hâlidir → önce o aralıktaki
   yerel doluluk silinir, sonra busy_dates yazılır. Aralığın dışındaki
   doluluk korunur (kırpılarak). Aynı değişikliği iki kez uygulamak
   sonucu değiştirmez (idempotent).
=============================================================== */
import type { BusyRange } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

export function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** Geçerli, boş olmayan aralıkları sıralayıp çakışan VE bitişikleri birleştirir. */
export function normalizeRanges(ranges: readonly BusyRange[]): BusyRange[] {
  const xs = ranges
    .filter((r) => isIsoDate(r.start_date) && isIsoDate(r.end_date))
    .map((r) => [dayNumber(r.start_date), dayNumber(r.end_date)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: [number, number][] = [];
  for (const [a, b] of xs) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => ({ start_date: fromDayNumber(a), end_date: fromDayNumber(b) }));
}

/** Bir değişikliği mevcut aralık kümesine uygular. */
export function applyChange(
  current: readonly BusyRange[],
  change: { start_date: string; end_date: string; busy_dates: readonly BusyRange[] },
): BusyRange[] {
  if (!isIsoDate(change.start_date) || !isIsoDate(change.end_date)) {
    throw new Error("invalid_change_range");
  }
  const cs = dayNumber(change.start_date);
  const ce = dayNumber(change.end_date);
  if (ce <= cs) throw new Error("invalid_change_range");
  const kept: BusyRange[] = [];
  for (const r of normalizeRanges(current)) {
    const a = dayNumber(r.start_date);
    const b = dayNumber(r.end_date);
    if (b <= cs || a >= ce) {
      kept.push(r);
      continue;
    }
    if (a < cs) kept.push({ start_date: r.start_date, end_date: fromDayNumber(cs) });
    if (b > ce) kept.push({ start_date: fromDayNumber(ce), end_date: r.end_date });
  }
  // Değişikliğin busy_dates'i yalnız kendi aralığı içinde geçerlidir.
  const inside = normalizeRanges(change.busy_dates)
    .map((r) => [Math.max(dayNumber(r.start_date), cs), Math.min(dayNumber(r.end_date), ce)])
    .filter(([a, b]) => b > a)
    .map(([a, b]) => ({ start_date: fromDayNumber(a), end_date: fromDayNumber(b) }));
  return normalizeRanges([...kept, ...inside]);
}

/** Yerel etkinlik kimliği: aynı aralık her zaman aynı kimliği alır. */
export function externalUidFor(r: BusyRange): string {
  return `kiraligim:${r.start_date}:${r.end_date}`;
}
