/* ===============================================================
   🛡️ VİLLA GALERİSİ — TAM EKRANA YAKIN LIGHTBOX
   ===============================================================
   - Kapalıyken ok tuşları galeriyi AÇMAZ.
   - Açılış: role=dialog + aria-modal + başlık, odak kapatma düğmesinde,
     görsel sayaç + ekran okuyucu sayacı.
   - ← → / Escape, Tab odak tuzağı, form alanında kısayol yok.
   - Kaydırma kilidi önceki değerleri AYNEN geri yükler; mount'ta
     overflow yazılmaz.
   - Kapanınca odak açan öğeye döner.
   - Foto object-contain (kırpma yok); filigran foto sarmalayıcısında.
   - Dokunmatik: yatay = foto değiştir, aşağı = kapat, çakışmaz.
   - Küçük resim seçimi + ön yükleme.
=============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import Gallery from "@/app/components/villa/Gallery";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, @typescript-eslint/no-explicit-any
  default: ({ src, alt, onError }: any) => <img data-next-image src={src} alt={alt ?? ""} onError={onError} />,
}));

const IMAGES = [
  "https://cdn.example.com/v/1.webp",
  "https://cdn.example.com/v/2.webp",
  "https://cdn.example.com/v/3.webp",
  "https://cdn.example.com/v/4.webp",
  "https://cdn.example.com/v/5.webp",
];

const WATERMARK = {
  logo: "https://cdn.example.com/logo.png",
  enabled: true,
  opacity: 0.3,
  position: "bottom-right" as const,
  size: 20,
};

function renderGallery(locale: Locale = "tr") {
  return render(
    <Gallery images={IMAGES} villaTitle="Villa Pelit" watermark={WATERMARK} locale={locale} />
  );
}

const dialog = () => screen.queryByRole("dialog");
const dict = (l: Locale = "tr") => getDictionary(l).gallery;

function openFromHero(l: Locale = "tr") {
  const d = dict(l);
  const hero = screen.getAllByRole("button", {
    name: formatDictionaryString(d.coverPhotoAlt, { title: "Villa Pelit" }),
  })[0];
  hero.focus();
  fireEvent.click(hero);
  return hero;
}

const visibleCounter = () =>
  dialog()!.querySelector('p[aria-hidden="true"]')!.textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => {
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Kapalı durum", () => {
  it("ok tuşları ve Escape galeriyi AÇMAZ", () => {
    renderGallery();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog()).toBeNull();
  });

  it("mount sırasında body overflow YAZILMAZ (başka modal kilidi korunur)", () => {
    document.body.style.overflow = "hidden";
    renderGallery();
    expect(document.body.style.overflow).toBe("hidden");
  });
});

describe("Açılış + erişilebilirlik", () => {
  it.each(["tr", "en", "de"] as Locale[])("%s — dialog, başlık, sayaç, kontrol etiketleri", (l) => {
    renderGallery(l);
    openFromHero(l);
    const d = dict(l);
    const dlg = dialog()!;
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    const titleId = dlg.getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)?.textContent).toBe(
      formatDictionaryString(d.lightboxTitleWithTitle, { title: "Villa Pelit" })
    );
    expect(visibleCounter()).toBe("1 / 5");
    expect(
      screen.getByText(formatDictionaryString(d.photoCounterAriaLabel, { index: 1, total: 5 }))
        .getAttribute("aria-live")
    ).toBe("polite");
    expect(screen.getByRole("button", { name: d.closeGalleryAriaLabel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.prevPhotoAriaLabel })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.nextPhotoAriaLabel })).toBeInTheDocument();
    expect(document.activeElement?.getAttribute("aria-label")).toBe(d.closeGalleryAriaLabel);
  });

  it("'Tüm Fotoğraflar' butonu ve Enter ile kolaj karesi de açar", () => {
    renderGallery();
    const d = dict();
    fireEvent.click(
      screen.getByRole("button", {
        name: formatDictionaryString(d.viewAllPhotosAriaLabel, { count: 5 }),
      })
    );
    expect(visibleCounter()).toBe("1 / 5");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog()).toBeNull();

    const second = screen.getAllByRole("button", {
      name: formatDictionaryString(d.photoAltWithTotal, { title: "Villa Pelit", index: 2, total: 5 }),
    })[0];
    fireEvent.keyDown(second, { key: "Enter" });
    expect(visibleCounter()).toBe("2 / 5");
  });
});

describe("Gezinme + klavye", () => {
  it("← → sayaç ve fotoğrafı değiştirir, başa/sona sarar", () => {
    renderGallery();
    openFromHero();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(visibleCounter()).toBe("2 / 5");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(visibleCounter()).toBe("5 / 5");
    const main = dialog()!.querySelector<HTMLImageElement>("img:not([data-next-image]):not([alt=''])")!;
    expect(main.getAttribute("src")).toBe(IMAGES[4]);
  });

  it("form alanında ok tuşu galeriye etki ETMEZ", () => {
    renderGallery();
    const input = document.createElement("input");
    document.body.appendChild(input);
    openFromHero();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(visibleCounter()).toBe("1 / 5");
    input.remove();
  });

  it("önceki/sonraki butonları + küçük resim seçimi (aria-current)", () => {
    renderGallery();
    openFromHero();
    const d = dict();
    fireEvent.click(screen.getByRole("button", { name: d.nextPhotoAriaLabel }));
    expect(visibleCounter()).toBe("2 / 5");
    fireEvent.click(screen.getByRole("button", { name: d.prevPhotoAriaLabel }));
    expect(visibleCounter()).toBe("1 / 5");
    const thumb4 = screen.getByRole("button", {
      name: formatDictionaryString(d.photoAriaLabel, { index: 4 }),
    });
    fireEvent.click(thumb4);
    expect(visibleCounter()).toBe("4 / 5");
    expect(thumb4.getAttribute("aria-current")).toBe("true");
    expect(dialog()).not.toBeNull();
  });

  it("Tab odağı dialog içinde tutar", () => {
    renderGallery();
    openFromHero();
    const d = dict();
    const lastThumb = screen.getByRole("button", {
      name: formatDictionaryString(d.photoAriaLabel, { index: 5 }),
    });
    lastThumb.focus();
    fireEvent.keyDown(lastThumb, { key: "Tab" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe(d.closeGalleryAriaLabel);
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastThumb);
  });
});

describe("Kapatma, kaydırma kilidi, odak geri dönüşü", () => {
  it("Escape kapatır; overflow değerleri AYNEN geri yüklenir; odak açan kareye döner", () => {
    document.body.style.overflow = "scroll";
    document.documentElement.style.overflow = "clip";
    renderGallery();
    const hero = openFromHero();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.activeElement).toBe(hero);
  });

  it("kapat düğmesi ve boş sahne alanına tıklama kapatır; fotoğrafa tıklama kapatmaz", () => {
    renderGallery();
    openFromHero();
    const main = dialog()!.querySelector<HTMLImageElement>("img[decoding='async']:not([data-next-image])")!;
    fireEvent.click(main);
    expect(dialog()).not.toBeNull();
    const stageLayer = main.parentElement!.parentElement!;
    fireEvent.click(stageLayer);
    expect(dialog()).toBeNull();

    openFromHero();
    fireEvent.click(screen.getByRole("button", { name: dict().closeGalleryAriaLabel }));
    expect(dialog()).toBeNull();
  });
});

describe("Kırpmasız görüntü + filigran", () => {
  it("ana foto object-contain + viewport sınırları; filigran FOTO sarmalayıcısında", () => {
    renderGallery();
    openFromHero();
    const main = dialog()!.querySelector<HTMLImageElement>("img[decoding='async']:not([data-next-image])")!;
    expect(main.className).toContain("object-contain");
    expect(main.className).not.toContain("object-cover");
    expect(main.style.maxHeight).toContain("100dvh");
    expect(main.style.maxWidth).toContain("100vw");
    const wrapper = main.parentElement!;
    const wm = wrapper.querySelector(`img[src="${WATERMARK.logo}"]`);
    expect(wm).toBeTruthy();
    expect(wrapper.className).toContain("relative");
    expect(wrapper.className).toContain("overflow-hidden");
  });
});

describe("Dokunmatik hareketler", () => {
  function stage() {
    const main = dialog()!.querySelector<HTMLImageElement>("img[decoding='async']:not([data-next-image])")!;
    return main.parentElement!.parentElement!.parentElement!; // sahne (touch handler'lı)
  }
  const t = (x: number, y: number) => ({ clientX: x, clientY: y });

  it("yatay kaydırma foto değiştirir, kapatmaz", () => {
    renderGallery();
    openFromHero();
    const s = stage();
    fireEvent.touchStart(s, { touches: [t(300, 300)] });
    fireEvent.touchMove(s, { touches: [t(240, 304)] });
    fireEvent.touchEnd(s, { changedTouches: [t(150, 310)] });
    expect(visibleCounter()).toBe("2 / 5");
    expect(dialog()).not.toBeNull();
  });

  it("aşağı kaydırma (eşik üstü) kapatır", () => {
    renderGallery();
    openFromHero();
    const s = stage();
    fireEvent.touchStart(s, { touches: [t(200, 100)] });
    fireEvent.touchMove(s, { touches: [t(202, 160)] });
    fireEvent.touchEnd(s, { changedTouches: [t(204, 260)] });
    expect(dialog()).toBeNull();
  });

  it("kısa aşağı hareket KAPATMAZ; yatay kilitli harekette büyük dikey sapma KAPATMAZ", () => {
    renderGallery();
    openFromHero();
    let s = stage();
    fireEvent.touchStart(s, { touches: [t(200, 100)] });
    fireEvent.touchMove(s, { touches: [t(201, 140)] });
    fireEvent.touchEnd(s, { changedTouches: [t(201, 170)] });
    expect(dialog()).not.toBeNull();

    s = stage();
    fireEvent.touchStart(s, { touches: [t(300, 100)] });
    fireEvent.touchMove(s, { touches: [t(260, 104)] }); // eksen: yatay
    fireEvent.touchEnd(s, { changedTouches: [t(140, 300)] });
    expect(dialog()).not.toBeNull();
    expect(visibleCounter()).toBe("2 / 5");
  });

  it("iki parmak (pinch) hareketi iptal eder", () => {
    renderGallery();
    openFromHero();
    const s = stage();
    fireEvent.touchStart(s, { touches: [t(100, 100), t(200, 200)] });
    fireEvent.touchEnd(s, { changedTouches: [t(100, 400)] });
    expect(dialog()).not.toBeNull();
    expect(visibleCounter()).toBe("1 / 5");
  });
});

describe("Ön yükleme", () => {
  it("açılışta sonraki ve önceki fotoğraf önceden yüklenir", () => {
    const loaded: string[] = [];
    class FakeImage {
      decoding = "";
      set src(v: string) {
        loaded.push(v);
      }
    }
    const orig = window.Image;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Image = FakeImage;
    try {
      renderGallery();
      act(() => {
        openFromHero();
      });
      expect(loaded).toEqual(expect.arrayContaining([IMAGES[1], IMAGES[4]]));
      expect(loaded).not.toContain(IMAGES[0]);
    } finally {
      window.Image = orig;
    }
  });
});

describe("Sözlükler", () => {
  it("yeni galeri metinleri TR/EN/DE'de dolu ve çevrilmiş", () => {
    const keys = [
      "lightboxTitleWithTitle",
      "lightboxTitle",
      "closeGalleryAriaLabel",
      "prevPhotoAriaLabel",
      "nextPhotoAriaLabel",
      "photoCounterAriaLabel",
      "thumbnailsAriaLabel",
    ] as const;
    const tr = dict("tr");
    const en = dict("en");
    const de = dict("de");
    for (const k of keys) {
      for (const d of [tr, en, de]) expect(d[k].trim().length).toBeGreaterThan(0);
      expect(en[k]).not.toBe(tr[k]);
      expect(de[k]).not.toBe(tr[k]);
    }
    for (const d of [tr, en, de]) {
      expect(d.photoCounterAriaLabel).toContain("{index}");
      expect(d.photoCounterAriaLabel).toContain("{total}");
      expect(d.lightboxTitleWithTitle).toContain("{title}");
    }
  });
});
