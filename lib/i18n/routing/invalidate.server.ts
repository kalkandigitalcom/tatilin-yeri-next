import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { invalidateProxyRoutingContext } from "@/lib/i18n/routing/proxy-config";
import { LOCALE_SLUGS_TAG } from "@/lib/i18n/routing/slug-map.server";

/* ===============================================================
   🌐 PUBLIC ROUTING CACHE GEÇERSİZ KILMA — Çok Dilli Mimari Faz 4
   ===============================================================
   Ana dil veya aktif dil listesi DB'de değiştikten HEMEN sonra çağrılır.
   Proxy ve sunucu AYNI anda yeni ayara geçer:
     1) "settings" + "locale-slugs" data cache tag'leri (expire: 0)
        → primeRoutingContext / getCachedSettings yeni ana dili okur
     2) revalidatePath("/", "layout") → ISR/statik tüm public sayfalar,
        sitemap.xml ve robots.txt yeniden üretilir (eski ana dilin
        canonical / hreflang / dil seçicisi önbellekten sunulmaz)
     3) proxy bellek cache'i (30 sn TTL) + nesil sayacı → bir sonraki
        istek DB'den okur; değişiklikten önce başlamış bir yükleme
        eski değeri cache'e YAZAMAZ.
   Hiçbiri throw etmez (kayıt zaten DB'de; cache temizliği best-effort,
   en kötü durumda TTL'ler — 30 sn / 1 sa — devreye girer).
   =============================================================== */
export function invalidatePublicRoutingCaches(): void {
  for (const tag of ["settings", LOCALE_SLUGS_TAG]) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      /* noop */
    }
  }
  try {
    revalidatePath("/", "layout");
  } catch {
    /* noop */
  }
  for (const p of ["/sitemap.xml", "/robots.txt"]) {
    try {
      revalidatePath(p);
    } catch {
      /* noop */
    }
  }
  invalidateProxyRoutingContext();
}
