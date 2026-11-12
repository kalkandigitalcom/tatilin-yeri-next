/* ===============================================================
   🧪 SESLİ ARAMA — SAF YARDIMCILAR
   ===============================================================
   Özellik algılama (önekli/öneksiz, güvenli bağlam), dil eşleme,
   hata eşleme, metin birleştirme (mevcut metin silinmez), sonuç okuma.
   =============================================================== */
import { describe, it, expect } from "vitest";

import {
  getSpeechRecognitionCtor,
  mapSpeechError,
  mergeVoiceText,
  readResults,
  speechLangFor,
} from "@/app/components/ui/hero/_helpers/speech-recognition";

class Fake {}

describe("özellik algılama", () => {
  it("API yoksa null", () => {
    expect(getSpeechRecognitionCtor({})).toBeNull();
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: "x" })).toBeNull();
  });
  it("öneksiz ve önekli sınıf bulunur", () => {
    expect(getSpeechRecognitionCtor({ SpeechRecognition: Fake })).toBe(Fake);
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: Fake })).toBe(Fake);
  });
  it("güvenli bağlam değilse (http) kullanılmaz", () => {
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: Fake, isSecureContext: false })).toBeNull();
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: Fake, isSecureContext: true })).toBe(Fake);
  });
});

describe("dil eşleme — sayfa dili", () => {
  it.each([
    ["tr", "tr-TR"],
    ["en", "en-GB"],
    ["de", "de-DE"],
  ] as const)("%s → %s", (locale, lang) => {
    expect(speechLangFor(locale)).toBe(lang);
  });
});

describe("hata eşleme", () => {
  it.each([
    ["aborted", null],
    ["no-speech", "no-speech"],
    ["not-allowed", "denied"],
    ["service-not-allowed", "service-off"],
    ["audio-capture", "mic-unavailable"],
    ["network", "network"],
    ["language-not-supported", "language"],
    ["bad-grammar", "generic"],
    ["bilinmeyen", "generic"],
  ])("%s → %s", (code, kind) => {
    expect(mapSpeechError(code)).toBe(kind);
  });
});

describe("metin birleştirme", () => {
  it("boş alana konuşma yazılır", () => {
    expect(mergeVoiceText("", "Kalkan'da villa", 300)).toBe("Kalkan'da villa");
  });
  it("mevcut metin SİLİNMEZ, sona tek boşlukla eklenir", () => {
    expect(mergeVoiceText("Kalkan", "6 kişilik jakuzili", 300)).toBe("Kalkan 6 kişilik jakuzili");
    expect(mergeVoiceText("Kalkan  ", "  6   kişilik ", 300)).toBe("Kalkan 6 kişilik");
  });
  it("konuşma boşsa mevcut metin aynen kalır", () => {
    expect(mergeVoiceText("Kalkan 4 kişi", "  ", 300)).toBe("Kalkan 4 kişi");
  });
  it("alan sınırı (300) korunur", () => {
    expect(mergeVoiceText("a".repeat(295), "bcdefgh", 300)).toHaveLength(300);
  });
});

describe("sonuç okuma", () => {
  const ev = (parts: Array<[string, boolean]>, resultIndex = 0) => ({
    resultIndex,
    results: parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })),
  });
  it("kesin ve ara metin ayrılır", () => {
    expect(readResults(ev([["Kalkan'da", true], [" 6 kişilik", false]]))).toEqual({
      final: "Kalkan'da",
      interim: "6 kişilik",
    });
  });
  it("aynı sonuç tekrar gelse de metin iki kez eklenmez (idempotent)", () => {
    const e = ev([["Kaş'ta villa", true]], 0);
    expect(readResults(e).final).toBe("Kaş'ta villa");
    expect(readResults(e).final).toBe("Kaş'ta villa");
  });
});
