import "server-only";

import { getContent, getContentMany } from "@/lib/i18n/content/content-read.server";
import type { PublicContentReader } from "@/lib/i18n/content/public-villa-content";

/* 🌐 Faz 6 Dalga 2 — public villa/kategori içeriği için merkezi okuyucu
   (lib/i18n/content/content-read.server.ts; cache anahtarı dili içerir). */
export const publicContentReader: PublicContentReader = {
  getContent: (entity, parentId, locale) => getContent(entity, parentId, locale),
  getContentMany: (entity, parentIds, locale) => getContentMany(entity, parentIds, locale),
};
