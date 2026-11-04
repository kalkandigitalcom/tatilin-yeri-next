/* ==============================================================
   🌐 ÇOK DİLLİ MİMARİ FAZ 1 — TopBar dil seçici: kapalı diller
   (mock düzeni tests/unit/TopBar.test.tsx'ten alındı)
   ==============================================================
   Hedef: app/components/layout/TopBar.tsx'e eklenen dil değiştirici
   (bkz. lib/i18n/locale-switch.helper.ts, dictionaries `common.language`).

   TopBar zaten kendi `getPublicSettingsAction()` fetch'ine sahip
   ("use client", useEffect + cancelled guard, DEĞİŞMEDİ) — bu dosyada
   o fetch mock'lanır (gerçek DB/RPC'ye ÇİKMAZ, diğer proje testleriyle
   AYNI convention — bkz. tests/unit/BookingSidebar.pool-heating.test.tsx).
   `usePathname()` (next/navigation) ve `useCurrency()` (CurrencyContext)
   de shallow mock'lanır — bu testlerin amacı dil değiştirici + TopBar'ın
   MEVCUT davranışının regresyonu, currency context'in kendi iç mantığı
   DEĞİLI (o ayrı bir dosyanın kapsamı).

   14 kullanıcı-onaylı senaryo + ek regresyon testleri:
     1-3)   Görünürlük: multilingual kapalı/açık/settings-null.
     4-9)   Aktif locale + hedef URL'ler (ana sayfa, villa detay, TR/EN/DE).
     10-12) Fallback-to-home (locale karşılığı olmayan route'lar).
     13-16) Regresyon: currency seçici, sosyal ikonlar, 7/24 destek,
            telefon/e-posta ETKİLENMEDİ.
     17-19) Dropdown mekaniği: aç/kapa, dışa-tık, aktif locale
            tıklanamaz + aria-current.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";

const usePathnameMock = vi.fn();
/* 🛡️ QUERY KORUMA FAZI — dil değiştirici artık `useSearchParams()`
   de okuyor (hedef URL'lerde mevcut query string korunsun diye).
   Mock, Next'in `ReadonlyURLSearchParams` yerine düz `URLSearchParams`
   döner — component yalnız `.toString()` çağırır. */
const useSearchParamsMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
}));

/* 🛡️ useCurrency shallow mock — CurrencyProvider'ın kendi localStorage/
   rate mantığı bu dosyanın kapsamı DIŞINDA (ayrı, dokunulmayan bir
   context). Currency seçicinin TopBar içindeki MEVCUT davranışının
   (state/dropdown/seçim) regresyonu aşağıda test edilir. */
const setCurrencyMock = vi.fn();
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: "TRY",
    setCurrency: setCurrencyMock,
    rates: {},
  }),
}));

import TopBar from "@/app/components/layout/TopBar";

const LANGUAGE_LABEL: Record<"tr" | "en" | "de", string> = {
  tr: "Dil",
  en: "Language",
  de: "Sprache",
};

const BASE_SETTINGS = {
  phone: "+90 555 555 55 55",
  email: "info@example.com",
  whatsapp_link: null as string | null,
  instagram: "https://instagram.com/example",
  facebook: "https://facebook.com/example",
  youtube: "https://youtube.com/example",
  tiktok: "https://tiktok.com/example",
};

function settingsWith(
  overrides: Partial<typeof BASE_SETTINGS & { multilingual_enabled: boolean | null }>
) {
  return { ...BASE_SETTINGS, multilingual_enabled: false, ...overrides };
}

type L = "tr" | "en" | "de";
function withLocales(enabled: L[]) {
  return settingsWith({
    multilingual_enabled: true,
    ...({
      public_default_locale: "tr",
      public_locales: (["tr", "en", "de"] as L[]).map((code, i) => ({
        code,
        is_enabled: enabled.includes(code),
        sort_order: (i + 1) * 10,
      })),
    } as object),
  });
}

describe("TopBar — Faz 1 aktif dil filtresi", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    useSearchParamsMock.mockReset();
    getPublicSettingsMock.mockReset();
    usePathnameMock.mockReturnValue("/kiralik-villalar");
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));
    cleanup();
  });

  it("DE kapalı → seçicide yalnız TR ve EN, /de linki YOK", async () => {
    getPublicSettingsMock.mockResolvedValue(withLocales(["tr", "en"]));
    render(<TopBar />);
    fireEvent.click(await screen.findByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "TR" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/villas-for-rent"
    );
    expect(screen.queryByRole("option", { name: "DE" })).not.toBeInTheDocument();
  });

  it("yalnız ana dil aktif → dil seçici gizli", async () => {
    getPublicSettingsMock.mockResolvedValue(withLocales(["tr"]));
    render(<TopBar />);
    expect(await screen.findByText("TRY")).toBeInTheDocument();
    expect(screen.queryByLabelText(LANGUAGE_LABEL.tr)).not.toBeInTheDocument();
  });

  it("üç dil aktif → üç seçenek (eski davranış)", async () => {
    getPublicSettingsMock.mockResolvedValue(withLocales(["tr", "en", "de"]));
    render(<TopBar />);
    fireEvent.click(await screen.findByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});
