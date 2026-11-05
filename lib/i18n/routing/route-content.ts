import type { Locale } from "@/lib/i18n/config";
import type { LocalizedContent } from "@/lib/i18n/content/content-contract";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import type { SlugKind } from "@/lib/i18n/routing/route-registry";

/* ===============================================================
   🌐 Faz 6 Dalga 1 — ROUTE ↔ MERKEZİ İÇERİK ORTAK ALTYAPISI (saf)
   ===============================================================
   Dispatcher (localeRouteFor) dil slug'ını TEKNİK ANAHTARA çevirir.
   Route modülü içeriği şu sözleşmeyle okur:
     teknik anahtar → kayıt kimliği (dilden bağımsız)
                    → getContent(varlık, kimlik, SAYFANIN DİLİ)
   Okuma zinciri / boş gövde / NULL / noindex kararları merkezi
   servistedir (Faz 3.1 + Faz 5) — bu katman yalnız bağlar.
   DB/Next bağımlılığı YOK; sunucu bağlantısı route-content.server.ts.
   =============================================================== */

export const SLUG_KIND_ENTITY: Readonly<Record<SlugKind, ContentEntityKey>> = {
  villa: "villa",
  villaType: "villa_type",
  blog: "blog_post",
  page: "page",
};

export type RouteContentDeps = {
  findIdByTechnicalKey(entity: ContentEntityKey, technicalKey: string): Promise<string | null>;
  getContent(entity: ContentEntityKey, id: string, locale: Locale): Promise<LocalizedContent | null>;
};

export type RouteContent =
  | { found: false }
  | { found: true; id: string; content: LocalizedContent | null };

export async function loadRouteContent(
  deps: RouteContentDeps,
  kind: SlugKind,
  technicalKey: string,
  locale: Locale
): Promise<RouteContent> {
  const entity = SLUG_KIND_ENTITY[kind];
  const id = await deps.findIdByTechnicalKey(entity, technicalKey);
  if (!id) return { found: false };
  return { found: true, id, content: await deps.getContent(entity, id, locale) };
}
