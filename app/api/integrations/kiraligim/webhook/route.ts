import { after, NextResponse } from "next/server";

import { defaultDb } from "@/lib/plugins/kiraligim/store.server";
import { defaultDeps, pull } from "@/lib/plugins/kiraligim/sync.server";
import { receiveWebhook } from "@/lib/plugins/kiraligim/webhook.server";

/* ===============================================================
   POST /api/integrations/kiraligim/webhook — Kiraligim olay alıcısı
   ===============================================================
   Public uç nokta; tek yetki imzadır (HMAC-SHA256, ±5 dk, sabit süreli
   karşılaştırma — sunucu tarafında). Gövde ham okunur (en fazla 64 KB)
   ve yalnız tetikleyici olarak kullanılır: geçerli ve yeni bir olayda
   yanıt hemen döner, değişiklikler after() içinde imzalı API'den aynı
   cursor yoluyla (pull) alınır. Aynı anda tek senkron (advisory lock).
   Loga gövde, imza, secret yazılmaz.
=============================================================== */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > 64 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  let receipt;
  try {
    receipt = await receiveWebhook(defaultDb(), { rawBody: raw, headers: req.headers });
  } catch {
    console.error("[kiraligim.webhook] RECEIVE_FAILED");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (receipt.status !== 204) {
    return NextResponse.json({ ok: false, error: receipt.error }, { status: receipt.status });
  }
  if (receipt.trigger) {
    after(async () => {
      try {
        const s = await pull(defaultDeps());
        console.info("[kiraligim.webhook] pull", {
          locked: s.locked,
          pages: s.pages,
          applied: s.applied,
          skipped: s.skipped,
          error: s.errorCode,
        });
      } catch {
        console.error("[kiraligim.webhook] PULL_FAILED");
      }
    });
  }
  return new NextResponse(null, { status: 204 });
}
