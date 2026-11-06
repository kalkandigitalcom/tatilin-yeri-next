/* ===============================================================
   🧪 HERO — "Tarihle Ara" | "Yapay Zekâ ile Ara" ARAYÜZ TESTLERİ
   ===============================================================
   • Varsayılan sekme "Tarihle Ara"; panel (children) değişmeden
     render edilir ve AI sekmesine geçince unmount EDİLMEZ.
   • AI modu doğrudan arama yapmaz: önce "Bulunan kriterler" kartı,
     kullanıcı onayı → mevcut /arama URL'si (router.push).
   • Çoklu villa tipi → seçim yapılmadan arama düğmesi pasif.
   • Hiç kriter yoksa "Tarihle Ara'ya geç" önerilir.
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";

import { TAXONOMY } from "./ai-search-fixtures";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

const dict = getDictionary("tr").home.aiSearch;

function DatePanelStub() {
  const [n, setN] = useState(0);
  return (
    <div className="relative mt-12 md:mt-16 hero-panel-in" data-testid="date-panel">
      <button type="button" onClick={() => setN((x) => x + 1)}>
        count {n}
      </button>
    </div>
  );
}

beforeEach(() => {
  pushMock.mockReset();
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      expect(url).toBe("/api/public/taxonomies");
      return { ok: true, status: 200, json: async () => TAXONOMY } as Response;
    })
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function renderModes() {
  const { default: HeroSearchModes } = await import("@/app/components/ui/hero/_components/HeroSearchModes");
  render(
    <HeroSearchModes locale="tr">
      <DatePanelStub />
    </HeroSearchModes>
  );
}

async function openAi() {
  fireEvent.click(screen.getByRole("tab", { name: dict.tabAi }));
  return await screen.findByPlaceholderText(dict.placeholder);
}

async function ask(text: string) {
  const input = await openAi();
  fireEvent.change(input, { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: dict.submit }));
  });
  await screen.findByText(dict.reviewTitle);
}

describe("HeroSearchModes", () => {
  it("varsayılan: Tarihle Ara seçili, panel görünür", async () => {
    await renderModes();
    expect(screen.getByRole("tab", { name: dict.tabDate })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: dict.tabAi })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("date-panel")).toBeVisible();
    expect(screen.queryByPlaceholderText(dict.placeholder)).not.toBeInTheDocument();
  });

  it("AI sekmesine geçiş Tarihle Ara panelini unmount etmez (state korunur)", async () => {
    await renderModes();
    fireEvent.click(screen.getByText("count 0"));
    await openAi();
    expect(screen.getByTestId("date-panel")).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: dict.tabDate }));
    expect(screen.getByText("count 1")).toBeVisible();
  });
});

describe("HeroAiSearch — onay akışı", () => {
  it("doğrudan aramaz; kriterleri gösterir, onayla /arama'ya gider", async () => {
    await renderModes();
    await ask("Kalkan'da 6 kişilik, korunaklı havuzlu ve jakuzili villa arıyorum.");
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByText("Kalkan")).toBeInTheDocument();
    expect(screen.getByText("Korunaklı Havuz")).toBeInTheDocument();
    expect(screen.getByText("Jakuzi")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: dict.guestsLabel })).toHaveValue(6);

    fireEvent.click(screen.getByRole("button", { name: dict.confirm }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan&guests=6&ozellikler=f-kor%2Cf-jak");
  });

  it("onay ekranında düzenleme: kriter kaldırma ve kişi değiştirme URL'ye yansır", async () => {
    await renderModes();
    await ask("Kalkan'da 6 kişilik jakuzili villa");
    fireEvent.click(screen.getByRole("button", { name: "Jakuzi kaldır" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: dict.guestsLabel }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: dict.confirm }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan&guests=4");
  });

  it("çoklu villa tipi → seçim yapılana kadar arama pasif", async () => {
    await renderModes();
    await ask("muhafazakar balayı villası 2 kişi");
    const confirm = screen.getByRole("button", { name: dict.confirm });
    expect(confirm).toBeDisabled();
    expect(screen.getByText(dict.resolveChoicesFirst)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Balayı Villaları" }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(pushMock).toHaveBeenCalledWith("/arama?villa-turleri=balayi-villalari&guests=2");
  });

  it("desteklenmeyen ve anlaşılamayan ifadeler listelenir, URL'ye girmez", async () => {
    await renderModes();
    await ask("Kalkan 3 yatak odalı denize yakın sessiz villa");
    expect(screen.getByText(dict.notFoundTitle)).toBeInTheDocument();
    expect(screen.getByText("3 yatak odalı")).toBeInTheDocument();
    expect(screen.getByText("denize yakın")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "LI" && /sessiz/.test(el.textContent ?? ""))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: dict.confirm }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan");
  });

  it("yalnız ay verilirse tarih atanmaz, uyarı gösterilir", async () => {
    await renderModes();
    await ask("Ağustos ayında Kalkan");
    expect(screen.getByText(/Gün aralığı atamadık/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: dict.confirm }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kalkan");
  });

  it("tarih aralığı URL'ye YYYY-MM-DD olarak yazılır", async () => {
    await renderModes();
    await ask("2-8 Ağustos Kaş'ta 4 kişilik");
    fireEvent.click(screen.getByRole("button", { name: dict.confirm }));
    expect(pushMock).toHaveBeenCalledWith("/arama?bolgeler=kas&start=2027-08-02&end=2027-08-08&guests=4");
  });

  it("hiç kriter yoksa arama pasif ve Tarihle Ara önerilir", async () => {
    await renderModes();
    await ask("asdf qwerty");
    expect(screen.getByText(dict.nothingParsed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: dict.confirm })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: dict.switchToDate }));
    expect(screen.getByRole("tab", { name: dict.tabDate })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("date-panel")).toBeVisible();
  });

  it("EN arayüz: etiketler İngilizce, URL Tarihle Ara ile aynı localeHref hedefi", async () => {
    const { default: HeroSearchModes } = await import("@/app/components/ui/hero/_components/HeroSearchModes");
    const en = getDictionary("en").home.aiSearch;
    render(
      <HeroSearchModes locale="en">
        <DatePanelStub />
      </HeroSearchModes>
    );
    fireEvent.click(screen.getByRole("tab", { name: en.tabAi }));
    const input = await screen.findByPlaceholderText(en.placeholder);
    fireEvent.change(input, { target: { value: "Conservative villa in Kas for 2 people" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: en.submit }));
    });
    await screen.findByText(en.reviewTitle);
    expect(screen.getByRole("combobox", { name: en.chooseType })).toHaveDisplayValue("Conservative Villas");
    fireEvent.click(screen.getByRole("button", { name: en.confirm }));
    expect(pushMock).toHaveBeenCalledWith(
      localeHref("/arama?villa-turleri=muhafazakar-villalar&bolgeler=kas&guests=2", "en")
    );
  });

  it("kullanıcı metni taksonomi isteği dışında hiçbir yere gönderilmez", async () => {
    await renderModes();
    await ask("Kalkan 6 kişilik gizli-metin-123");
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.every(([u]) => u === "/api/public/taxonomies")).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("gizli");
  });
});
