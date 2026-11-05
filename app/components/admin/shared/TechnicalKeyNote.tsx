"use client";

/* 🌐 Faz 5 dalga 2 — ana formdaki URL slug alanının altında: alanın ana
   dilin URL slug'ı olduğu, teknik anahtarın (ana tablo slug'ı) ayrı ve
   değişmez olduğu; TR slug kilidi (108 yokken) açıklaması. */

import type { Locale } from "@/lib/i18n/config";

export default function TechnicalKeyNote({
  technicalKey,
  rootLocale,
  locked,
  testId,
}: {
  technicalKey: string | null;
  rootLocale: Locale;
  locked?: boolean;
  testId?: string;
}) {
  return (
    <p className="text-[11px] text-[var(--color-stone-500)]" data-testid={testId ?? "technical-key-note"}>
      {rootLocale.toUpperCase()} (ana dil) URL slug&apos;ı. Teknik anahtar: <code>{technicalKey}</code> (değişmez);
      boş bırakılırsa teknik anahtar kullanılır.
      {locked ? " Türkçe URL slug'ı, teknik anahtar ayrımı (migration 108) uygulanana kadar düzenlenemez." : ""}
    </p>
  );
}

/** Yeni kayıt formunda slug alanının altı. */
export function NewTechnicalKeyNote() {
  return (
    <p className="text-[11px] text-[var(--color-stone-500)]">
      Teknik anahtar olarak kaydedilir; diğer dillerin URL slug&apos;ları Çeviriler bölümünden.
    </p>
  );
}
