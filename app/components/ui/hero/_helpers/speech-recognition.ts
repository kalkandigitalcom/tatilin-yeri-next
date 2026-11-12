import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🎙️ SESLİ ARAMA — TARAYICI KONUŞMA TANIMA YARDIMCILARI (SAF)
   ===============================================================
   Yalnız tarayıcının yerleşik Web Speech API'si kullanılır
   (`SpeechRecognition` / `webkitSpeechRecognition`). Ses dosyası
   oluşturulmaz, kaydedilmez, sunucumuza gönderilmez. Tarayıcı, sesi
   kendi konuşma tanıma hizmetine gönderebilir (Chrome: Google, Safari:
   Apple, Edge: Microsoft) — kullanıcıya arayüzde kısaca bildirilir.

   TypeScript 5.9 `lib.dom.d.ts` yalnız sonuç tiplerini içeriyor
   (`SpeechRecognitionResult…`); tanıyıcı sınıfı ve olay tipleri YOK.
   Aşağıdaki küçük, izole tipler yalnız bu özelliğin kullandığı yüzeyi
   tanımlar (yeni paket yok).
   =============================================================== */

export type SpeechRecognitionErrorCode =
  | "no-speech"
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "language-not-supported"
  | "bad-grammar"
  | "phrases-not-supported"
  | (string & {});

export type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

export type SpeechRecognitionErrorEventLike = { error: SpeechRecognitionErrorCode };

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null;
  onnomatch: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechWindow = {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
  isSecureContext?: boolean;
};

/** Tarayıcıdaki tanıyıcı sınıfı; yoksa / güvenli bağlam değilse `null`.
 *  Özellik algılama yapılır, user-agent'a bakılmaz. */
export function getSpeechRecognitionCtor(win?: unknown): SpeechRecognitionCtor | null {
  const w = (win ?? (typeof window !== "undefined" ? window : undefined)) as SpeechWindow | undefined;
  if (!w) return null;
  // Mikrofon yalnız güvenli bağlamda (HTTPS / localhost) kullanılabilir.
  if (w.isSecureContext === false) return null;
  const ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return typeof ctor === "function" ? ctor : null;
}

/** Site dili → konuşma tanıma dili. Kaynak her zaman SAYFA dilidir
 *  (`navigator.language` değil). */
const SPEECH_LANG: Record<Locale, string> = {
  tr: "tr-TR",
  en: "en-GB",
  de: "de-DE",
};
export function speechLangFor(locale: Locale): string {
  return SPEECH_LANG[locale] ?? SPEECH_LANG.tr;
}

/** Arayüzde gösterilen hata türleri (sözlük anahtarına eşlenir). */
export type VoiceErrorKind =
  | "no-speech"
  | "denied"
  | "service-off"
  | "mic-unavailable"
  | "network"
  | "language"
  | "unsupported"
  | "generic";

export function mapSpeechError(code: SpeechRecognitionErrorCode): VoiceErrorKind | null {
  switch (code) {
    case "aborted":
      return null; // iptal: kullanıcıya hata gösterilmez
    case "no-speech":
      return "no-speech";
    case "not-allowed":
      return "denied";
    case "service-not-allowed":
      return "service-off";
    case "audio-capture":
      return "mic-unavailable";
    case "network":
      return "network";
    case "language-not-supported":
      return "language";
    default:
      return "generic";
  }
}

/** Mevcut metin + konuşma metni: mevcut metin ASLA silinmez; konuşma
 *  sona tek boşlukla eklenir; alanın `maxLength` sınırı korunur. */
export function mergeVoiceText(base: string, spoken: string, maxLength: number): string {
  const b = base.replace(/\s+$/, "");
  const s = spoken.replace(/\s+/g, " ").trim();
  const merged = !s ? b : b ? `${b} ${s}` : s;
  return merged.slice(0, maxLength);
}

/** Bir sonuç olayından kesinleşen (final) ve ara (interim) metni çıkarır.
 *  Oturumun TÜM sonuç listesi baştan okunur (idempotent): aynı sonuç
 *  tekrar gelse de metin iki kez eklenmez. */
export function readResults(e: SpeechRecognitionResultEventLike): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let i = 0; i < e.results.length; i++) {
    const r = e.results[i];
    const text = r && r[0] ? r[0].transcript : "";
    if (r?.isFinal) final = `${final} ${text}`;
    else interim = `${interim} ${text}`;
  }
  return { final: final.replace(/\s+/g, " ").trim(), interim: interim.replace(/\s+/g, " ").trim() };
}
