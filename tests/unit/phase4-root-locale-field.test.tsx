/* ===============================================================
   🌐 FAZ 4 — Ayarlar > Genel > Ana dil değiştirme alanı (UI)
   Önizleme olmadan / onay olmadan değişiklik yapılamaz; kapalı dil
   seçilemez; çakışma mesajı; başarıda üst bileşene yeni ana dil.
   =============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const h = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("@/app/services/site-locales.client", () => ({
  previewRootLocaleChangeClient: (...a: unknown[]) => h.preview(...a),
  applyRootLocaleChangeClient: (...a: unknown[]) => h.apply(...a),
}));

import RootLocaleChangeField from "@/app/(admin)/maki-admin/settings/genel/_components/RootLocaleChangeField";

const PLAN = {
  from: "tr",
  to: "en",
  issues: [],
  summary: { redirected: 4, reassigned: 1, unchanged: 3, redirectStatus: 307 },
  rows: [
    { route: "villas", locale: "tr", before: "/kiralik-villalar", after: "/tr/kiralik-villalar", outcome: "redirect", status: 307 },
    { route: "villas", locale: "en", before: "/en/villas-for-rent", after: "/villas-for-rent", outcome: "redirect", status: 307 },
    { route: "villas", locale: "de", before: "/de/ferienvillen", after: "/de/ferienvillen", outcome: "same" },
  ],
};

beforeEach(() => {
  h.preview.mockReset();
  h.apply.mockReset();
});
afterEach(cleanup);

function setup(over: Partial<Parameters<typeof RootLocaleChangeField>[0]> = {}) {
  const onChanged = vi.fn();
  render(
    <RootLocaleChangeField
      currentRoot="tr"
      savedEnabled={["tr", "en", "de"]}
      savedMultilingual
      onChanged={onChanged}
      {...over}
    />
  );
  return { onChanged };
}

describe("RootLocaleChangeField", () => {
  it("önizle → etki tablosu; onay kutusu olmadan uygulanamaz; onayla → uygulanır", async () => {
    h.preview.mockResolvedValue({ ok: true, current: "tr", valid: true, plan: PLAN });
    h.apply.mockResolvedValue({ ok: true, previous: "tr", current: "en", plan: PLAN });
    const { onChanged } = setup();
    fireEvent.change(screen.getByLabelText("Yeni ana dil"), { target: { value: "en" } });
    fireEvent.click(screen.getByText("Etkisini önizle"));
    await screen.findByText("/tr/kiralik-villalar");
    expect(h.preview).toHaveBeenCalledWith("en");
    const applyBtn = screen.getByRole("button", { name: /Ana dili .* yap/ });
    expect(applyBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("en"));
    expect(h.apply).toHaveBeenCalledWith("tr", "en");
  });

  it("kapalı dil seçenekte devre dışı; çoklu dil kapalıyken TR dışı hedef önizlenemez", () => {
    setup({ savedEnabled: ["tr", "en"] });
    const de = screen.getByRole("option", { name: /kapalı/ }) as HTMLOptionElement;
    expect(de.disabled).toBe(true);
    cleanup();
    setup({ savedMultilingual: false });
    fireEvent.change(screen.getByLabelText("Yeni ana dil"), { target: { value: "en" } });
    expect(screen.getByRole("alert").textContent).toMatch(/Çoklu Dil/);
    expect(screen.getByText("Etkisini önizle")).toBeDisabled();
  });

  it("kaydedilmemiş değişiklik varken akış kilitli", () => {
    setup({ blockedReason: "Kaydedilmemiş çoklu dil değişiklikleri var." });
    expect(screen.queryByLabelText("Yeni ana dil")).toBeNull();
    expect(screen.getByText(/Kaydedilmemiş/)).toBeTruthy();
  });

  it("çakışma → hata mesajı, ana dil değişmez", async () => {
    h.preview.mockResolvedValue({ ok: true, current: "tr", valid: true, plan: PLAN });
    h.apply.mockResolvedValue({ ok: false, conflict: true, error: "Ana dil bu sırada başka bir oturumda değiştirildi.", current: "de" });
    const { onChanged } = setup();
    fireEvent.change(screen.getByLabelText("Yeni ana dil"), { target: { value: "en" } });
    fireEvent.click(screen.getByText("Etkisini önizle"));
    await screen.findByText("/tr/kiralik-villalar");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Ana dili .* yap/ }));
    await screen.findByText(/başka bir oturumda/);
    expect(onChanged).not.toHaveBeenCalled();
  });
});
