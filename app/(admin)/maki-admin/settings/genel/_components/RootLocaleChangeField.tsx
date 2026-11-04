"use client";

import { useState } from "react";

import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/config";
import { LOCALE_META } from "@/lib/i18n/locale-registry";
import { PREVIEW_ROUTE_KEYS, validateRootLocaleChange } from "@/lib/i18n/root-locale-change";
import {
  applyRootLocaleChangeClient,
  previewRootLocaleChangeClient,
  type RootLocalePlan,
} from "@/app/services/site-locales.client";

/* ===============================================================
   🌐 ANA DİL DEĞİŞTİRME — Ayarlar > Genel > Çoklu Dil (Faz 4)
   ===============================================================
   Normal "Kaydet"ten AYRI, iki adımlı akış:
     1) Hedef dil seç → "Etkisini önizle": sunucu mevcut/hedef ana dili
        ve URL etki tablosunu hesaplar (yazma yok).
     2) "Etkileri anladım" onayı → "Ana dili değiştir": sunucu kuralları
        ve DB kilidiyle yeniden doğrular; başarısızsa eski ana dil korunur.
   Yalnız KAYDEDİLMİŞ aktif diller seçilebilir; kaydedilmemiş dil/çoklu
   dil değişikliği varken akış kilitlidir.
   =============================================================== */

const ROUTE_LABEL: Record<string, string> = {
  home: "Ana sayfa",
  villas: "Villa listesi",
  villa: "Villa detay",
  villaType: "Kategori",
  region: "Bölge",
  blog: "Blog",
  blogPost: "Blog yazısı",
  page: "CMS sayfası",
  contact: "İletişim",
};

const OUTCOME_LABEL: Record<string, string> = {
  same: "Değişmez",
  redirect: "Yönlenir",
  reassigned: "Aynı adres, yeni dil",
};

export default function RootLocaleChangeField({
  currentRoot,
  savedEnabled,
  savedMultilingual,
  blockedReason,
  onChanged,
}: {
  currentRoot: Locale;
  /** DB'de KAYITLI aktif diller. */
  savedEnabled: readonly Locale[];
  savedMultilingual: boolean;
  /** Doluysa akış kilitli (ör. kaydedilmemiş değişiklik var). */
  blockedReason?: string | null;
  onChanged: (next: Locale) => void;
}) {
  const candidates = SUPPORTED_LOCALES.filter((l) => l !== currentRoot);
  const [target, setTarget] = useState<Locale | "">("");
  const [plan, setPlan] = useState<RootLocalePlan | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const state = { current: currentRoot, enabled: savedEnabled, multilingualEnabled: savedMultilingual };
  const check = target ? validateRootLocaleChange({ to: target }, state) : null;

  function reset(next: Locale | "") {
    setTarget(next);
    setPlan(null);
    setConfirmed(false);
    setMessage(null);
  }

  async function preview() {
    if (!target || !check?.ok) return;
    setBusy(true);
    setMessage(null);
    const r = await previewRootLocaleChangeClient(target);
    setBusy(false);
    if (!r.ok) return setMessage({ kind: "error", text: r.error });
    if (r.current !== currentRoot) {
      return setMessage({
        kind: "error",
        text: "Ana dil başka bir oturumda değiştirilmiş. Sayfayı yenileyin.",
      });
    }
    if (!r.valid) return setMessage({ kind: "error", text: r.error });
    setPlan(r.plan);
  }

  async function apply() {
    if (!target || !plan || !confirmed) return;
    setBusy(true);
    const r = await applyRootLocaleChangeClient(currentRoot, target);
    setBusy(false);
    if (!r.ok) {
      setConfirmed(false);
      return setMessage({
        kind: "error",
        text: r.conflict
          ? `${r.error}${r.current ? ` (Güncel ana dil: ${LOCALE_META[r.current].adminLabel})` : ""}`
          : r.error,
      });
    }
    onChanged(r.current);
    reset("");
    setMessage({
      kind: "ok",
      text: `Ana dil ${LOCALE_META[r.current].adminLabel} olarak değiştirildi. Eski URL'ler yeni adreslerine yönleniyor.`,
    });
  }

  const visibleRows = plan
    ? plan.rows.filter((r) => (PREVIEW_ROUTE_KEYS as readonly string[]).includes(r.route))
    : [];

  return (
    <div className="space-y-3 rounded-xl border border-[var(--color-stone-200)] p-4" data-testid="root-locale-change">
      <div className="text-sm text-[var(--color-stone-700)]">
        Mevcut ana dil: <strong>{LOCALE_META[currentRoot].adminLabel}</strong> (kök URL <code>/</code>)
      </div>

      {blockedReason ? (
        <p className="text-[12px] text-[var(--color-stone-500)]">{blockedReason}</p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select
              aria-label="Yeni ana dil"
              className="input sm:max-w-xs"
              value={target}
              disabled={busy}
              onChange={(e) => reset((e.target.value as Locale) || "")}
            >
              <option value="">Yeni ana dil seçin…</option>
              {candidates.map((l) => (
                <option key={l} value={l} disabled={!savedEnabled.includes(l)}>
                  {LOCALE_META[l].adminLabel}
                  {!savedEnabled.includes(l) ? " (kapalı)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy || !check?.ok}
              onClick={preview}
            >
              Etkisini önizle
            </button>
          </div>
          {check && !check.ok && (
            <p role="alert" className="text-[12px] text-red-600">{check.error}</p>
          )}
        </>
      )}

      {plan && (
        <div className="space-y-3">
          <ul className="text-[12.5px] text-[var(--color-stone-700)] list-disc pl-5 space-y-1">
            <li>
              <strong>{LOCALE_META[plan.to].adminLabel}</strong> kök URL&apos;ye (<code>/</code>) taşınır;{" "}
              <strong>{LOCALE_META[plan.from].adminLabel}</strong> <code>/{plan.from}</code> önekini alır.
              Diğer aktif dillerin URL&apos;leri değişmez.
            </li>
            <li>
              {plan.summary.redirected} örnek URL tek adımda yeni adresine yönlenir (HTTP{" "}
              {plan.summary.redirectStatus}, geçici: geri dönüşte tarayıcı döngüsü oluşmaz). Query
              parametreleri korunur.
            </li>
            {plan.summary.reassigned > 0 && (
              <li>
                {plan.summary.reassigned} adres (ör. <code>/</code>, <code>/blog</code>) dillerde ortak
                olduğu için yönlenemez; artık yeni ana dilin sayfasını gösterir.
              </li>
            )}
            <li>
              Canonical, hreflang, x-default ve sitemap yeni yapıyla üretilir. Arama motorlarında
              geçiş süresince sıralama dalgalanması beklenebilir; Search Console&apos;a sitemap yeniden
              gönderilmeli.
            </li>
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[var(--color-stone-500)]">
                  <th className="py-1 pr-2">Sayfa</th>
                  <th className="py-1 pr-2">Dil</th>
                  <th className="py-1 pr-2">Şimdi</th>
                  <th className="py-1 pr-2">Sonra</th>
                  <th className="py-1">Eski URL</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={`${r.route}-${r.locale}`} className="border-t border-[var(--color-stone-100)]">
                    <td className="py-1 pr-2">{ROUTE_LABEL[r.route] ?? r.route}</td>
                    <td className="py-1 pr-2 uppercase">{r.locale}</td>
                    <td className="py-1 pr-2"><code>{r.before}</code></td>
                    <td className="py-1 pr-2"><code>{r.after}</code></td>
                    <td className="py-1">
                      {OUTCOME_LABEL[r.outcome]}
                      {r.status ? ` (${r.status})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.issues.length > 0 ? (
            <p role="alert" className="text-[12px] text-red-600">
              URL geçiş planında sorun bulundu; değişiklik yapılamaz.
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                URL ve SEO etkilerini inceledim; ana dili değiştirmek istiyorum.
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={!confirmed || busy}
                onClick={apply}
              >
                Ana dili {LOCALE_META[plan.to].adminLabel} yap
              </button>
            </>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-[12.5px] ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
