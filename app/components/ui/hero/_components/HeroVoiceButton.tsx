"use client";

import type { MouseEvent } from "react";
import { Mic, MicOff, Square } from "lucide-react";

import type { VoiceStatus } from "../_hooks/useSpeechRecognition";
import type { VoiceErrorKind } from "../_helpers/speech-recognition";

/* ===============================================================
   🎙️ HERO — SESLİ ARAMA BUTONU (yalnız görünüm)
   ===============================================================
   • Tarayıcı desteklemiyorsa HİÇ render edilmez → yazılı arama aynen.
   • 44×44 px dokunma alanı (mobil), görsel daire 36 px.
   • Hazır: lacivert mikrofon · Dinleniyor: turkuaz zemin + nefes alan
     halka (konuşma algılanınca turuncuya yakın ve hızlı) · İzin yok /
     kullanılamıyor: üstü çizili mikrofon.
   • `aria-pressed` + sözlükten gelen etiketler; durum duyurusu üst
     bileşendeki aria-live satırında.
   • Metin alanının <label>'ı içinde durduğu için tıklamada label'ın
     varsayılan davranışı (textarea'ya odak → mobilde klavye açılması)
     `preventDefault` ile engellenir.
   • prefers-reduced-motion: animasyon yok, yalnız renk/ikon değişir.
   =============================================================== */

export type HeroVoiceButtonLabels = {
  start: string;
  stop: string;
};

export type HeroVoiceButtonProps = {
  status: VoiceStatus;
  error: VoiceErrorKind | null;
  speaking: boolean;
  labels: HeroVoiceButtonLabels;
  describedBy?: string;
  onToggle: () => void;
};

export default function HeroVoiceButton({ status, error, speaking, labels, describedBy, onToggle }: HeroVoiceButtonProps) {
  if (status === "unsupported") return null;

  const listening = status === "listening";
  const starting = status === "starting";
  const active = listening || starting;
  const blocked = status === "error" && (error === "denied" || error === "service-off" || error === "unsupported");

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // label → textarea odağı (mobil klavye) engellenir
    e.stopPropagation();
    onToggle();
  };

  return (
    <span className="relative -my-2.5 -mr-2 inline-flex shrink-0">
      {active && (
        <span
          aria-hidden
          data-speaking={speaking ? "true" : "false"}
          className="hero-voice-ring pointer-events-none absolute inset-1 rounded-full"
        />
      )}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={active ? labels.stop : labels.start}
        aria-describedby={describedBy}
        title={active ? labels.stop : labels.start}
        data-voice-status={status}
        className={[
          "relative inline-flex h-11 w-11 items-center justify-center rounded-full",
          "transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#02AAE5] focus-visible:ring-offset-1",
          active
            ? "!bg-[#02AAE5] !text-white shadow-[0_6px_18px_-6px_rgba(2,170,229,0.65)]"
            : blocked
              ? "!bg-transparent !text-[#94a3b8] hover:!bg-[#f1f5f9]"
              : "!bg-transparent !text-[#0b1f3a] hover:!bg-[#eef7fc] hover:!text-[#0973BA]",
          starting ? "opacity-80" : "",
        ].join(" ")}
      >
        {active ? (
          listening ? (
            <Square size={15} aria-hidden fill="currentColor" strokeWidth={0} />
          ) : (
            <Mic size={19} aria-hidden />
          )
        ) : blocked ? (
          <MicOff size={19} aria-hidden />
        ) : (
          <Mic size={19} aria-hidden />
        )}
      </button>
      <style>{`
        .hero-voice-ring {
          box-shadow: 0 0 0 0 rgba(2,170,229,0.45);
          animation: heroVoicePulse 1.6s ease-out infinite;
        }
        .hero-voice-ring[data-speaking="true"] {
          box-shadow: 0 0 0 0 rgba(237,121,38,0.5);
          animation: heroVoicePulseSpeak 1.05s ease-out infinite;
        }
        @keyframes heroVoicePulse {
          0% { box-shadow: 0 0 0 0 rgba(2,170,229,0.45); }
          100% { box-shadow: 0 0 0 12px rgba(2,170,229,0); }
        }
        @keyframes heroVoicePulseSpeak {
          0% { box-shadow: 0 0 0 0 rgba(237,121,38,0.5); }
          100% { box-shadow: 0 0 0 14px rgba(237,121,38,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-voice-ring, .hero-voice-ring[data-speaking="true"] { animation: none; box-shadow: 0 0 0 3px rgba(2,170,229,0.35); }
        }
      `}</style>
    </span>
  );
}
