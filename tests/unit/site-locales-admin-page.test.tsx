/* ===============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 1 — Ayarlar > Genel > Çoklu Dil kartı
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({
  settings: {
    id: "s1",
    site_name: "Site",
    multilingual_enabled: true,
    public_default_locale: "tr",
  } as Record<string, unknown>,
  locales: {
    ok: true,
    rootLocale: "tr",
    locales: [
      { code: "tr", is_enabled: true, sort_order: 10 },
      { code: "en", is_enabled: true, sort_order: 20 },
      { code: "de", is_enabled: true, sort_order: 30 },
    ],
  } as unknown,
  updateSettings: vi.fn(async (v: Record<string, unknown>) => {
    void v;
    return true;
  }),
  updateLocales: vi.fn(async (enabled: string[]) => ({
    ok: true,
    rootLocale: "tr",
    locales: ["tr", "en", "de"].map((code, i) => ({
      code,
      is_enabled: enabled.includes(code),
      sort_order: (i + 1) * 10,
    })),
  })),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  revalidate: vi.fn(async () => {}),
}));

vi.mock("@/app/services/settings.client", () => ({
  getSettingsClient: async () => h.settings,
  updateSettingsClient: (v: Record<string, unknown>) => h.updateSettings(v),
}));
vi.mock("@/app/services/site-locales.client", () => ({
  getSiteLocalesClient: async () => h.locales,
  updateSiteLocalesClient: (e: string[]) => h.updateLocales(e),
}));
vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateSettings: () => h.revalidate(),
}));
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({ error: h.toastError, success: h.toastSuccess }),
}));
vi.mock("@/lib/storage/use-site-asset-versions", () => ({
  useSiteAssetVersions: () => ({}),
}));

import SettingsGeneralPage from "@/app/(admin)/maki-admin/settings/genel/page";

beforeEach(() => {
  cleanup();
  h.updateSettings.mockClear();
  h.updateLocales.mockClear();
  h.toastError.mockClear();
  h.revalidate.mockClear();
  h.locales = {
    ok: true,
    rootLocale: "tr",
    locales: [
      { code: "tr", is_enabled: true, sort_order: 10 },
      { code: "en", is_enabled: true, sort_order: 20 },
      { code: "de", is_enabled: true, sort_order: 30 },
    ],
  };
});

async function ready() {
  render(<SettingsGeneralPage />);
  await waitFor(() =>
    expect((document.getElementById("locale-toggle-de") as HTMLInputElement).disabled).toBe(false)
  );
}

describe("Çoklu Dil kartı", () => {
  it("her dil için satır; ana dil (TR) kilitli, EN/DE açılıp kapanabilir", async () => {
    await ready();
    expect((document.getElementById("locale-toggle-tr") as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById("locale-toggle-en") as HTMLInputElement).disabled).toBe(false);
    expect(screen.getAllByText(/^Yayında/).length).toBe(3);
  });

  it("DE kapatılıp kaydedilir → dil API'si ['tr','en'] ile çağrılır, ana dil aynen gönderilir, cache yenilenir", async () => {
    await ready();
    fireEvent.click(document.getElementById("locale-toggle-de") as HTMLInputElement);
    expect(screen.getByText(/Kapalı — sayfaları 404 döner/)).toBeInTheDocument();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(h.updateLocales).toHaveBeenCalledWith(["tr", "en"]));
    expect(h.updateSettings.mock.calls[0][0]).toMatchObject({
      multilingual_enabled: true,
      public_default_locale: "tr",
    });
    await waitFor(() => expect(h.revalidate).toHaveBeenCalled());
  });

  it("dil listesi değişmediyse dil API'si çağrılmaz (mevcut kayıt akışı aynen)", async () => {
    await ready();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(h.updateSettings).toHaveBeenCalledTimes(1));
    expect(h.updateLocales).not.toHaveBeenCalled();
  });

  it("migration 101 yoksa uyarı gösterilir ve anahtarlar kilitlenir", async () => {
    h.locales = { ok: false, error: "x", migrationMissing: true };
    render(<SettingsGeneralPage />);
    expect(await screen.findByText(/migration 101/)).toBeInTheDocument();
    expect((document.getElementById("locale-toggle-de") as HTMLInputElement).disabled).toBe(true);
  });
});
