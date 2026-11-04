import { adminFetch } from "@/lib/admin-fetch";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🌐 SITE LOCALES — ADMIN CLIENT (Faz 1)
   ===============================================================
   `/api/admin/settings/locales` için oku/yaz. Hata durumunda throw
   ETMEZ; çağıran sayfa `ok:false` + mesaj ile kullanıcıyı bilgilendirir.
   =============================================================== */

export type AdminSiteLocaleRow = {
  code: string;
  is_enabled: boolean;
  sort_order: number;
};

export type AdminSiteLocalesResult =
  | { ok: true; rootLocale: Locale; locales: AdminSiteLocaleRow[] }
  | { ok: false; error: string; migrationMissing?: boolean };

type Envelope = {
  ok?: boolean;
  error?: string;
  migrationMissing?: boolean;
  rootLocale?: Locale;
  locales?: AdminSiteLocaleRow[];
};

function toResult(res: Response, json: Envelope | null): AdminSiteLocalesResult {
  if (res.ok && json?.ok && json.rootLocale && Array.isArray(json.locales)) {
    return { ok: true, rootLocale: json.rootLocale, locales: json.locales };
  }
  return {
    ok: false,
    error: json?.error || "Dil ayarları alınamadı",
    migrationMissing: !!json?.migrationMissing,
  };
}

export async function getSiteLocalesClient(): Promise<AdminSiteLocalesResult> {
  try {
    const res = await adminFetch("/api/admin/settings/locales");
    const json = (await res.json().catch(() => null)) as Envelope | null;
    return toResult(res, json);
  } catch {
    return { ok: false, error: "Dil ayarları alınamadı" };
  }
}

export async function updateSiteLocalesClient(
  enabled: Locale[]
): Promise<AdminSiteLocalesResult> {
  try {
    const res = await adminFetch("/api/admin/settings/locales", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const json = (await res.json().catch(() => null)) as Envelope | null;
    return toResult(res, json);
  } catch {
    return { ok: false, error: "Dil ayarları kaydedilemedi" };
  }
}

/* ===============================================================
   🌐 ANA DİL DEĞİŞİMİ — ADMIN CLIENT (Faz 4)
   `/api/admin/settings/root-locale`: GET önizleme, POST uygulama.
   =============================================================== */

export type RootLocalePlanRow = {
  route: string;
  locale: Locale;
  before: string;
  after: string;
  outcome: "same" | "redirect" | "reassigned";
  status?: number;
};

export type RootLocalePlan = {
  from: Locale;
  to: Locale;
  rows: RootLocalePlanRow[];
  issues: string[];
  summary: { redirected: number; reassigned: number; unchanged: number; redirectStatus: number };
};

export type RootLocalePreviewResult =
  | { ok: true; current: Locale; valid: true; plan: RootLocalePlan }
  | { ok: true; current: Locale; valid: false; error: string }
  | { ok: false; error: string };

export type RootLocaleApplyResult =
  | { ok: true; previous: Locale; current: Locale; plan: RootLocalePlan }
  | { ok: false; error: string; conflict?: boolean; current?: Locale };

export async function previewRootLocaleChangeClient(
  to: Locale
): Promise<RootLocalePreviewResult> {
  try {
    const res = await adminFetch(
      `/api/admin/settings/root-locale?to=${encodeURIComponent(to)}`
    );
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      current?: Locale;
      valid?: boolean;
      plan?: RootLocalePlan;
      error?: string;
    } | null;
    if (!res.ok || !json?.ok || !json.current) {
      return { ok: false, error: json?.error || "Önizleme hazırlanamadı" };
    }
    if (json.valid && json.plan) {
      return { ok: true, current: json.current, valid: true, plan: json.plan };
    }
    return { ok: true, current: json.current, valid: false, error: json.error || "Geçersiz seçim" };
  } catch {
    return { ok: false, error: "Önizleme hazırlanamadı" };
  }
}

export async function applyRootLocaleChangeClient(
  expected: Locale,
  to: Locale
): Promise<RootLocaleApplyResult> {
  try {
    const res = await adminFetch("/api/admin/settings/root-locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected, to, confirm: true }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      previous?: Locale;
      current?: Locale;
      plan?: RootLocalePlan;
      error?: string;
    } | null;
    if (res.ok && json?.ok && json.previous && json.current && json.plan) {
      return { ok: true, previous: json.previous, current: json.current, plan: json.plan };
    }
    return {
      ok: false,
      error: json?.error || "Ana dil değiştirilemedi",
      conflict: res.status === 409,
      current: json?.current,
    };
  } catch {
    return { ok: false, error: "Ana dil değiştirilemedi" };
  }
}
