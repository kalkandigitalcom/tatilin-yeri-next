/* ===============================================================
   🛡️ REZERVASYON FORMU — ZORUNLU ALAN GÖSTERGELERİ + HATA GÖSTERİMİ
   ===============================================================
   - Zorunlu alanlarda görünür etiket + aria-hidden `*` + aria-required;
     isteğe bağlı alanlarda "İsteğe bağlı" etiketi, `*` YOK.
   - Göstergeler gerçek validasyon kurallarıyla birebir (Ad, E-posta,
     TC/Pasaport, Telefon 1/2, Ödeme yöntemi, Sözleşme).
   - Boş form gönderilebilir (buton pasif DEĞİL) → TÜM alan hataları
     alan altında, aria-invalid/aria-describedby, ilk hatalı alana focus,
     POST YOK.
   - Sözleşme hatası checkbox altında.
   - Sunucu telefon hatası ilgili alanın altında; 23P01 yarışı →
     "tarihler dolu"; ağ hatası → ham metin YOK.
   - Çift tıklama → tek POST.
=============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import { resolvePublicReservationServerError } from "@/app/components/reservation/_helpers/resolvePublicReservationServerError";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {}, setCurrency: vi.fn() }),
}));
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 20 })),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: vi.fn(async () => ({
    phone: "",
    whatsapp_link: "",
    updated_at: null,
  })),
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null | undefined) => u || null,
  resolveAssetUrlVersioned: (u: string | null | undefined) => u || null,
}));

import ReservationForm from "@/app/components/reservation/ReservationForm";

const LOCALES: Locale[] = ["tr", "en", "de"];

const VILLA = {
  id: "villa-1",
  slug: "test-villa",
  title: "Test Villa",
  cleaning_fee: 0,
  cleaning_currency: "TRY",
  cleaning_limit: 0,
  pool_heating_fee: 0,
  pool_heating_currency: "TRY",
  pool_heating_months: null,
};

function renderForm(locale: Locale = "tr") {
  const props: Record<string, unknown> = {
    villa: VILLA,
    prices: [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 1000, currency: "TRY" },
    ],
    discounts: [],
    start: "2026-06-01",
    end: "2026-06-08",
    image: "/cover.jpg",
    adults: "2",
    children: "0",
    poolHeatingSelected: false,
    locale,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ReservationForm {...(props as any)} />);
}

type PostResponder = () => Promise<unknown>;
let postResponder: PostResponder;

function okPost() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, reservation: { id: "r1" } }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  postResponder = async () => okPost();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/public/payment-methods")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            payment_methods: [
              { id: "pm-1", name: "Havale / EFT" },
              { id: "pm-2", name: "Kredi Kartı" },
            ],
          }),
        };
      }
      if (String(url) === "/api/public/reservations") return postResponder();
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }) as unknown as typeof fetch
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const postCalls = () =>
  (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(
    (c) => String(c[0]) === "/api/public/reservations"
  );

function submitButton(locale: Locale = "tr") {
  const d = getDictionary(locale).reservation;
  return screen.getByText(d.form.submit).closest("button") as HTMLButtonElement;
}

async function fillValid(locale: Locale = "tr") {
  const d = getDictionary(locale).reservation;
  await waitFor(() => expect(screen.getByText("Havale / EFT")).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText(d.form.namePlaceholder), {
    target: { value: "Ahmet Yılmaz" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.emailPlaceholder), {
    target: { value: "test@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.phonePlaceholder), {
    target: { value: "5551112233" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.phone2Placeholder), {
    target: { value: "5559998877" },
  });
  fireEvent.change(screen.getByPlaceholderText(d.form.identityPlaceholder), {
    target: { value: "12345678901" },
  });
  fireEvent.click(screen.getAllByRole("radio")[0]);
  fireEvent.click(document.getElementById("reservation-terms-accept")!);
}

const labelFor = (id: string) =>
  document.querySelector(`label[for="${id}"]`) as HTMLLabelElement | null;

describe("Zorunlu / isteğe bağlı göstergeleri", () => {
  it.each(LOCALES)("%s — zorunlu alanlar: görünür etiket + aria-hidden * + aria-required", (locale) => {
    renderForm(locale);
    const d = getDictionary(locale).reservation.form;
    const cases: Array<[string, string]> = [
      ["reservation-name", d.nameLabel],
      ["reservation-email", d.emailLabel],
      ["reservation-identity", d.identityLabel],
      ["reservation-phone", d.phoneLabel],
      ["reservation-phone2", d.phone2Label],
    ];
    for (const [id, text] of cases) {
      const label = labelFor(id);
      expect(label, id).toBeTruthy();
      expect(label!.textContent).toContain(text);
      const star = label!.querySelector('[aria-hidden="true"]');
      expect(star?.textContent).toBe("*");
      expect(document.getElementById(id)?.getAttribute("aria-required")).toBe("true");
    }
    /* Ödeme yöntemi grubu + sözleşme checkbox'ı da zorunlu. */
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-required")).toBe("true");
    expect(
      document.getElementById("reservation-terms-accept")?.getAttribute("aria-required")
    ).toBe("true");
    /* "* Zorunlu alan" açıklaması. */
    expect(screen.getByText(d.requiredLegend)).toBeInTheDocument();
  });

  it.each(LOCALES)("%s — isteğe bağlı alanlarda * YOK, 'İsteğe bağlı' etiketi VAR", (locale) => {
    renderForm(locale);
    const d = getDictionary(locale).reservation.form;
    for (const id of [
      "reservation-country",
      "reservation-city",
      "reservation-address",
      "reservation-note",
    ]) {
      const label = labelFor(id);
      expect(label, id).toBeTruthy();
      expect(label!.querySelector('[aria-hidden="true"]')).toBeNull();
      expect(label!.textContent).toContain(d.optionalTag);
      expect(document.getElementById(id)?.getAttribute("aria-required")).toBeNull();
    }
  });

  it("normal durumda hiçbir alan hatalı (kırmızı) gösterilmez", () => {
    renderForm("tr");
    expect(document.querySelectorAll('[aria-invalid="true"]').length).toBe(0);
  });
});

describe("Boş / hatalı gönderim", () => {
  it("buton boş formda da tıklanabilir; TÜM hatalar alan altında, POST YOK, ilk alana focus", async () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    renderForm("tr");
    const v = getDictionary("tr").reservation.validation;
    await waitFor(() => expect(screen.getByText("Havale / EFT")).toBeInTheDocument());
    const btn = submitButton("tr");
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);

    for (const msg of [
      v.nameRequired,
      v.emailRequired,
      v.identityRequired,
      v.phoneRequired,
      v.phone2Required,
      v.paymentMethodRequired,
    ]) {
      expect(screen.getByText(msg)).toBeInTheDocument();
    }
    for (const key of ["name", "email", "identity", "phone", "phone2"]) {
      const input = document.getElementById(`reservation-${key}`)!;
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe(`reservation-${key}-error`);
      expect(document.getElementById(`reservation-${key}-error`)).toBeTruthy();
    }
    expect(screen.getByRole("radiogroup").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.id).toBe("reservation-name");
    expect(postCalls().length).toBe(0);
    raf.mockRestore();
  });

  it("alan düzeltilince yalnız o alanın hatası kalkar; ödeme seçilince ödeme hatası kalkar", async () => {
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await waitFor(() => expect(screen.getByText("Havale / EFT")).toBeInTheDocument());
    fireEvent.click(submitButton("tr"));
    expect(screen.getByText(d.validation.nameRequired)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(d.form.namePlaceholder), {
      target: { value: "Ahmet" },
    });
    expect(screen.queryByText(d.validation.nameRequired)).toBeNull();
    expect(screen.getByText(d.validation.emailRequired)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(screen.queryByText(d.validation.paymentMethodRequired)).toBeNull();
  });

  it("geçersiz e-posta ve kimlik → biçim mesajları", async () => {
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await fillValid("tr");
    fireEvent.change(screen.getByPlaceholderText(d.form.emailPlaceholder), {
      target: { value: "yanlis" },
    });
    fireEvent.change(screen.getByPlaceholderText(d.form.identityPlaceholder), {
      target: { value: "123" },
    });
    fireEvent.click(submitButton("tr"));
    expect(screen.getByText(d.validation.emailInvalid)).toBeInTheDocument();
    expect(screen.getByText(d.validation.identityInvalid)).toBeInTheDocument();
    expect(postCalls().length).toBe(0);
  });

  it("sözleşme işaretsiz → uyarı checkbox ALTINDA, aria-invalid, POST YOK", async () => {
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await fillValid("tr");
    const box = document.getElementById("reservation-terms-accept") as HTMLInputElement;
    fireEvent.click(box); // işareti kaldır
    fireEvent.click(submitButton("tr"));
    const err = document.getElementById("reservation-terms-error");
    expect(err?.textContent).toBe(d.form.termsRequired);
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(postCalls().length).toBe(0);
  });
});

describe("Sunucu / ağ hataları", () => {
  it("sunucu telefon 2 hatası → Telefon 2 alanının altında; banner genel uyarı", async () => {
    postResponder = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error: "Geçerli bir ikinci telefon numarası gir" }),
    });
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await fillValid("tr");
    fireEvent.click(submitButton("tr"));
    await waitFor(() =>
      expect(screen.getByText(d.validation.phone2Invalid)).toBeInTheDocument()
    );
    expect(
      document.getElementById("reservation-phone2")?.getAttribute("aria-invalid")
    ).toBe("true");
    expect(screen.getByText(d.form.errorCheckFields)).toBeInTheDocument();
    expect(screen.queryByText("Geçerli bir ikinci telefon numarası gir")).toBeNull();
  });

  it("23P01 yarışı ('artık müsait değil', 400) → 'tarihler dolu' mesajı", async () => {
    postResponder = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error: "Bu tarihler artık müsait değil" }),
    });
    renderForm("tr");
    const d = getDictionary("tr").reservation;
    await fillValid("tr");
    fireEvent.click(submitButton("tr"));
    await waitFor(() =>
      expect(screen.getByText(d.form.errorDatesUnavailable)).toBeInTheDocument()
    );
  });

  it.each(LOCALES)("%s — ağ hatası → ham 'Failed to fetch' YOK, generic mesaj; form verisi korunur", async (locale) => {
    postResponder = async () => {
      throw new TypeError("Failed to fetch");
    };
    renderForm(locale);
    const d = getDictionary(locale).reservation;
    await fillValid(locale);
    fireEvent.click(submitButton(locale));
    await waitFor(() =>
      expect(screen.getByText(d.form.errorGeneric)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(
      (screen.getByPlaceholderText(d.form.namePlaceholder) as HTMLInputElement).value
    ).toBe("Ahmet Yılmaz");
    expect(submitButton(locale).disabled).toBe(false);
  });
});

describe("Çift gönderim + başarı akışı", () => {
  it("hızlı çift tıklama → TEK POST; başarıda yönlendirme aynen", async () => {
    let resolvePost: (v: unknown) => void = () => {};
    postResponder = () =>
      new Promise((r) => {
        resolvePost = r;
      });
    renderForm("tr");
    await fillValid("tr");
    const btn = submitButton("tr");
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(postCalls().length).toBe(1));
    await act(async () => {
      resolvePost(okPost());
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    expect(String(pushMock.mock.calls[0][0])).toContain("/rezervasyon/basarili");
    expect(postCalls().length).toBe(1);
  });
});

describe("resolvePublicReservationServerError (pure)", () => {
  it("bilinen sunucu durumlarını eşler, gerisi generic", () => {
    expect(resolvePublicReservationServerError(409, { error: "x" })).toBe("dates");
    expect(resolvePublicReservationServerError(429, { error: "Too many requests" })).toBe("rateLimited");
    expect(
      resolvePublicReservationServerError(400, { error: "Geçerli bir telefon numarası gir" })
    ).toBe("phone");
    expect(
      resolvePublicReservationServerError(400, { error: "Geçerli bir ikinci telefon numarası gir" })
    ).toBe("phone2");
    expect(
      resolvePublicReservationServerError(400, { error: "Bu tarihler artık müsait değil" })
    ).toBe("dates");
    expect(resolvePublicReservationServerError(400, { error: "Ad ve telefon zorunlu" })).toBe("generic");
    expect(resolvePublicReservationServerError(500, null)).toBe("generic");
    expect(resolvePublicReservationServerError(500, "html")).toBe("generic");
  });
});
