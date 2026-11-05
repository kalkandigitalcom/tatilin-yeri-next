import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { findContentIdByTechnicalKey, getContent } from "@/lib/i18n/content/content-read.server";
import type { SlugKind } from "@/lib/i18n/routing/route-registry";
import { loadRouteContent, type RouteContent } from "@/lib/i18n/routing/route-content";

/* 🌐 Faz 6 Dalga 1 — route modülleri için merkezi içerik okuma bağlantısı
   (sunucu). Dalga 2+ route'ları bunu kullanır; bu dalgada hiçbir içerik
   route'u henüz bağlı değil. */
export function getRouteContent(kind: SlugKind, technicalKey: string, locale: Locale): Promise<RouteContent> {
  return loadRouteContent({ findIdByTechnicalKey: findContentIdByTechnicalKey, getContent }, kind, technicalKey, locale);
}
