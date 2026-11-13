"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  Loader2,
  RefreshCcw,
  Unlink,
  Webhook,
  XCircle,
} from "lucide-react";

import { useConfirm, useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import type { KiraligimProperty } from "@/lib/plugins/kiraligim/core/types";
import type { LocalVilla } from "@/lib/plugins/kiraligim/store.server";

import {
  connectKiraligimVillaAction,
  deleteKiraligimWebhookAction,
  disconnectKiraligimVillaAction,
  getKiraligimOverviewAction,
  listKiraligimMappingDataAction,
  registerKiraligimWebhookAction,
  resnapshotKiraligimAction,
  rotateKiraligimWebhookAction,
  syncKiraligimNowAction,
  testKiraligimConnectionAction,
  type KiraligimOverview,
} from "./kiraligim.action";

/* ===============================================================
   Eklentiler → Kiraligim
   ===============================================================
   Bu sayfa hiçbir gizli bilgiyi görmez: API anahtarı, şifreleme
   anahtarı ve webhook secret'ı yalnız sunucuda kalır; burada yalnız
   "tanımlı / tanımsız" durumu gösterilir.
=============================================================== */

const ERROR_TEXT: Record<string, string> = {
  not_configured: "Sunucu ortam değişkenleri eksik (KIRALIGIM_API_KEY / KIRALIGIM_API_BASE).",
  encryption_key_missing: "KIRALIGIM_ENCRYPTION_KEY tanımlı değil veya geçersiz.",
  site_url_invalid: "NEXT_PUBLIC_SITE_URL https adresi değil; webhook adresi oluşturulamadı.",
  unauthorized: "Kiraligim API anahtarı geçersiz veya geri alınmış.",
  account_disabled: "Kiraligim API hesabı pasif.",
  rate_limited: "Kiraligim istek sınırı aşıldı; biraz sonra tekrar deneyin.",
  not_found: "Kiraligim'de bulunamadı ya da bu villa için izin yok.",
  already_connected: "Bu Kiraligim villası başka bir kimlikle zaten bağlı.",
  external_id_in_use: "Bu yerel villa başka bir Kiraligim bağlantısında kullanılıyor.",
  villa_not_found: "Yerel villa bulunamadı.",
  webhooks_unavailable: "Kiraligim webhook servisi şu an kullanılamıyor.",
  network: "Kiraligim'e ulaşılamadı.",
  timeout: "Kiraligim yanıt vermedi (zaman aşımı).",
  connection_disconnected: "Bağlantı Kiraligim tarafında kesilmiş.",
  connection_revoked: "Villa sahibi izni kaldırmış.",
  connection_paused: "Villa Kiraligim'de geçici olarak pasif; aktif olunca senkron kendiliğinden sürer.",
  db_23505: "Bu villa zaten başka bir Kiraligim villasına bağlı.",
};
const errText = (code: string | null | undefined) =>
  code ? (ERROR_TEXT[code] ?? `İşlem tamamlanamadı (${code}).`) : "";

const STATUS_LABEL: Record<string, string> = {
  active: "Aktif",
  paused: "Duraklatıldı",
  disconnected: "Kesildi",
  revoked: "İzin kaldırıldı",
};

const fmt = (v: string | Date | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Istanbul",
      }).format(new Date(v))
    : "—";

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-[16px] text-[var(--color-stone-900)]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border " +
        (ok
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200")
      }
    >
      {ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

export default function KiraligimPluginPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [data, setData] = useState<KiraligimOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapping, setMapping] = useState<{ properties: KiraligimProperty[]; villas: LocalVilla[] } | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getKiraligimOverviewAction());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getKiraligimOverviewAction()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run<T extends { ok: boolean; code?: string }>(key: string, fn: () => Promise<T>, okText: string) {
    if (busy) return null;
    setBusy(key);
    try {
      const r = await fn();
      if (r.ok) toast.success(okText);
      else toast.error(errText((r as { code?: string }).code));
      await reload();
      return r;
    } catch {
      toast.error("İşlem tamamlanamadı.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const configured = !!data && data.config.apiKey === "ok" && data.config.apiBaseValid;
  const current = useMemo(
    () => (data?.connections ?? []).filter((c) => c.status === "active" || c.status === "paused"),
    [data],
  );
  const ended = useMemo(
    () => (data?.connections ?? []).filter((c) => c.status === "disconnected" || c.status === "revoked"),
    [data],
  );
  const connectedProperty = new Set(current.map((c) => c.property_id));
  const connectedVilla = new Set(current.map((c) => c.villa_id));

  async function loadMapping() {
    if (busy) return;
    setBusy("mapping");
    try {
      const r = await listKiraligimMappingDataAction();
      if (r.ok && r.data) setMapping(r.data);
      else toast.error(errText(r.ok ? null : r.code));
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-stone-500)]">
        <Loader2 size={14} className="animate-spin" /> Yükleniyor…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/maki-admin/eklentiler" className="text-[13px] text-[var(--color-stone-500)] hover:underline">
          ← Eklentiler
        </Link>
        <h1 className="font-display text-2xl text-[var(--color-stone-900)] mt-1">Kiraligim</h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-1">
          Villaların doluluğu merkezi Kiraligim takviminden gelir ve iCal rezervasyonlarıyla aynı şekilde takvimi
          kapatır. Kiraligim dolulukları yalnız Kiraligim üzerinden değiştirilebilir; burada elle düzenlenemez.
        </p>
      </div>

      {/* 1. Bağlantı ve yapılandırma */}
      <Card
        title="Bağlantı"
        right={
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={!configured || !!busy}
            onClick={() =>
              run("test", testKiraligimConnectionAction, "Kiraligim bağlantısı çalışıyor.")
            }
          >
            {busy === "test" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
            Bağlantıyı test et
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Flag ok={data.config.apiKey === "ok"} label={`API anahtarı: ${data.config.apiKey === "ok" ? "tanımlı" : data.config.apiKey === "missing" ? "tanımsız" : "geçersiz"}`} />
          <Flag ok={data.config.apiBaseValid} label={`API adresi: ${data.config.apiBaseValid ? data.config.apiBase : "geçersiz"}`} />
          <Flag ok={data.config.encryptionKey === "ok"} label={`Şifreleme anahtarı: ${data.config.encryptionKey === "ok" ? "tanımlı" : data.config.encryptionKey === "missing" ? "tanımsız" : "geçersiz"}`} />
        </div>
        <p className="text-[13px] text-[var(--color-stone-600)]">
          Hesap: <strong>{data.account.name ?? "henüz doğrulanmadı"}</strong>
        </p>
        {!configured && (
          <p className="text-[13px] text-amber-700">
            Sunucu ortam değişkenleri (KIRALIGIM_API_KEY, KIRALIGIM_API_BASE, KIRALIGIM_ENCRYPTION_KEY) tanımlanmadan
            eklenti çalışmaz. Değerler yalnız sunucuda tutulur.
          </p>
        )}
      </Card>

      {/* 2. Çift besleme uyarısı */}
      {data.duplicates.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">
          <p className="font-medium flex items-center gap-1.5">
            <AlertTriangle size={14} /> Çift takvim beslemesi
          </p>
          <p className="mt-1">
            Aşağıdaki villalar hem Kiraligim API hem de Kiraligim iCal adresiyle besleniyor. Doluluk iki kez görünür
            (takvim kapanması doğru kalır). API senkronunu doğruladıktan sonra iCal kaynağını villa sayfasından
            pasifleştirmeniz önerilir — eklenti iCal kaynaklarını otomatik kapatmaz.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {data.duplicates.map((d) => (
              <li key={d.source_id}>
                <Link className="underline" href={`/maki-admin/villas/${d.villa_id}`}>
                  {d.villa_title ?? d.villa_id}
                </Link>{" "}
                · iCal kaynağı: {d.source_name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Villa eşleştirme */}
      <Card
        title="Villa eşleştirme"
        right={
          <button type="button" className="admin-btn-ghost" disabled={!configured || !!busy} onClick={loadMapping}>
            {busy === "mapping" ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
            Kiraligim villalarını getir
          </button>
        }
      >
        {current.length === 0 ? (
          <p className="text-[13px] text-[var(--color-stone-500)]">Henüz bağlı villa yok.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-stone-100)] rounded-xl border border-[var(--color-stone-100)]">
            {current.map((c) => (
              <li key={c.id} className="p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-[13px]">
                  <p className="font-medium text-[var(--color-stone-900)]">
                    {c.property_name ?? c.property_id} → {c.villa_title ?? c.villa_id}
                  </p>
                  <p className="text-[var(--color-stone-500)]">
                    {STATUS_LABEL[c.status]} · {c.busy_count} dolu aralık · snapshot {fmt(c.snapshot_at)}
                    {c.last_error_code ? ` · ${errText(c.last_error_code)}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    disabled={!!busy}
                    onClick={() =>
                      run(`snap:${c.id}`, () => resnapshotKiraligimAction(c.id), "Takvim yeniden alındı.")
                    }
                  >
                    {busy === `snap:${c.id}` ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
                    Yeniden senkronize et
                  </button>
                  <button
                    type="button"
                    className="admin-btn-ghost !text-amber-700 !border-amber-200"
                    disabled={!!busy}
                    onClick={async () => {
                      const proceed = await confirm({
                        title: "Kiraligim bağlantısı kesilsin mi?",
                        description:
                          "Bu villanın Kiraligim dolulukları takvimden kalkar. Kiraligim'deki kayıtlar değişmez.",
                        confirmLabel: "Bağlantıyı kes",
                        variant: "danger",
                      });
                      if (!proceed) return;
                      void run(`disc:${c.id}`, () => disconnectKiraligimVillaAction(c.id), "Bağlantı kesildi.");
                    }}
                  >
                    <Unlink size={13} /> Bağlantıyı kes
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {mapping && (
          <div className="space-y-2">
            <p className="text-[13px] text-[var(--color-stone-600)]">
              Erişim izni verilmiş Kiraligim villaları. Her birini bir yerel villayla eşleştirin; yerel villa
              kimliği Kiraligim&apos;e acente kimliği olarak gönderilir.
            </p>
            {mapping.properties.length === 0 && (
              <p className="text-[13px] text-[var(--color-stone-500)]">
                Kiraligim&apos;de bu hesaba izin verilmiş villa yok. Villa sahibinin erişim kodunu onaylaması gerekir.
              </p>
            )}
            <ul className="divide-y divide-[var(--color-stone-100)] rounded-xl border border-[var(--color-stone-100)]">
              {mapping.properties
                .filter((p) => !connectedProperty.has(p.id))
                .map((p) => (
                  <li key={p.id} className="p-3 flex flex-wrap items-center gap-3">
                    <span className="text-[13px] font-medium min-w-[180px]">{p.name}</span>
                    <select
                      className="input max-w-xs"
                      value={selection[p.id] ?? ""}
                      onChange={(e) => setSelection((s) => ({ ...s, [p.id]: e.target.value }))}
                    >
                      <option value="">Yerel villa seçin…</option>
                      {mapping.villas
                        .filter((v) => !connectedVilla.has(v.id))
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.title ?? v.id}
                            {v.is_active === false ? " (pasif)" : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      disabled={!selection[p.id] || !!busy}
                      onClick={async () => {
                        const r = await run(
                          `conn:${p.id}`,
                          () =>
                            connectKiraligimVillaAction({
                              propertyId: p.id,
                              propertyName: p.name,
                              villaId: selection[p.id]!,
                            }),
                          "Villa bağlandı ve takvim alındı.",
                        );
                        if (r?.ok) setSelection((s) => ({ ...s, [p.id]: "" }));
                      }}
                    >
                      {busy === `conn:${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                      Bağla
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {ended.length > 0 && (
          <details className="text-[12.5px] text-[var(--color-stone-500)]">
            <summary className="cursor-pointer">Biten bağlantılar ({ended.length})</summary>
            <ul className="mt-2 space-y-1">
              {ended.map((c) => (
                <li key={c.id}>
                  {c.property_name ?? c.property_id} → {c.villa_title ?? c.villa_id} · {STATUS_LABEL[c.status]}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* 4. Senkron ve webhook */}
      <Card
        title="Senkron"
        right={
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={!configured || !!busy || current.length === 0}
            onClick={() => run("sync", syncKiraligimNowAction, "Değişiklikler alındı.")}
          >
            {busy === "sync" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
            Şimdi senkronize et
          </button>
        }
      >
        <p className="text-[13px] text-[var(--color-stone-600)]">
          Son senkron: {fmt(data.sync.lastAt)}{" "}
          {data.sync.ok === false && <span className="text-red-700">· {errText(data.sync.errorCode)}</span>}
        </p>
        <div className="rounded-xl border border-[var(--color-stone-100)] p-3 space-y-2">
          <p className="text-[13px] font-medium flex items-center gap-1.5">
            <Webhook size={14} /> Webhook
          </p>
          <p className="text-[12.5px] text-[var(--color-stone-500)]">
            Değişiklikleri anında almak için. Kapalıyken zamanlanmış görev birkaç dakikada bir alır.
            Adres: <span className="font-mono">{data.webhookTargetUrl ?? "—"}</span>
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Flag ok={!!data.webhook.url && data.webhook.secretStored} label={data.webhook.url ? "Kayıtlı" : "Kayıtlı değil"} />
            {data.webhook.registeredAt && (
              <span className="text-[12px] text-[var(--color-stone-500)]">{fmt(data.webhook.registeredAt)}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="admin-btn-ghost"
              disabled={!configured || data.config.encryptionKey !== "ok" || !!busy}
              onClick={() => run("wh", registerKiraligimWebhookAction, "Webhook kaydedildi.")}
            >
              Webhook&apos;u {data.webhook.url ? "güncelle" : "etkinleştir"}
            </button>
            {data.webhook.url && (
              <>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  disabled={!!busy}
                  onClick={() => run("whr", rotateKiraligimWebhookAction, "Webhook imza sırrı yenilendi.")}
                >
                  Sırrı yenile
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost !text-amber-700 !border-amber-200"
                  disabled={!!busy}
                  onClick={() => run("whd", deleteKiraligimWebhookAction, "Webhook kapatıldı.")}
                >
                  Kapat
                </button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* 5. Çakışmalar */}
      <Card title={`Çakışmalar (${data.conflicts.length})`}>
        {data.conflicts.length === 0 ? (
          <p className="text-[13px] text-[var(--color-stone-500)]">
            Kiraligim dolulukları ile çakışan rezervasyon veya manuel blok yok.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-[var(--color-stone-600)]">
              Bu kayıtlar Kiraligim&apos;de dolu görünen tarihlerle çakışıyor. Hiçbiri otomatik değiştirilmedi; kontrol
              edip elle karar verin. Not: bekleyen bir rezervasyon bu tarihlerde onaylanamaz.
            </p>
            <ul className="divide-y divide-[var(--color-stone-100)] rounded-xl border border-[var(--color-stone-100)] text-[13px]">
              {data.conflicts.map((c, i) => (
                <li key={i} className="p-3">
                  <strong>{c.villa_title ?? c.villa_id}</strong> ·{" "}
                  {c.kind === "reservation" ? `Rezervasyon (${c.status})` : "Manuel blok"} {c.start_date} →{" "}
                  {c.end_date} · Kiraligim dolu {c.busy_start} → {c.busy_end}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
