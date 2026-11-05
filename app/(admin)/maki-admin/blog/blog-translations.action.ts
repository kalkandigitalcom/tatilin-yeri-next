"use server";

import { revalidateLocaleSlugs } from "@/lib/i18n/routing/slug-map.server";

import {
  callerHasPermission,
  requirePermission,
} from "@/lib/auth/action-authz";
import {
  getBlogTranslations,
  upsertBlogTranslation,
  type BlogTranslationInput,
} from "@/app/services/blog-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import { isContentWriteMigrated } from "@/lib/i18n/content/content-write-modules";
import type { AdminLocaleLayout } from "@/lib/i18n/content/content-admin";
import {
  loadBlogTranslationsCentral,
  saveBlogTranslationCentral,
} from "./blog-content.server";

/* ===============================================================
   🛡️ MIGRATION 089 — Admin Blog Çeviri UI Server Actions
   ===============================================================
   Okuma: requirePermission("blog"). Yazma: authorizeAdminSession() İLK
   kontrol + callerHasPermission("blog").

   🌐 Faz 5 dalga 2 — "blog_post" merkezi yazmadayken kart ANA DİL
   DIŞINDAKİ iki dili (TR dahil olabilir) düzenler: loadTranslationRows /
   saveTranslationRow. Eski blog-translation.service yazma yolu KAPALI.
   =============================================================== */

export type BlogTranslationsLoad =
  | {
      ok: true;
      rows: Array<Record<string, unknown> & { locale: string }>;
      layout?: AdminLocaleLayout;
      technicalKey?: string | null;
      slugSeparated?: boolean;
    }
  | { ok: false; error: string };

export type BlogTranslationSave =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

export async function loadBlogTranslationsAction(postId: string): Promise<BlogTranslationsLoad> {
  await requirePermission("blog");
  if (isContentWriteMigrated("blog_post")) return loadBlogTranslationsCentral(postId);
  return getBlogTranslations(postId) as Promise<BlogTranslationsLoad>;
}

export async function saveBlogTranslationAction(
  input: Omit<BlogTranslationInput, "locale"> & { locale: string }
): Promise<BlogTranslationSave> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };
  if (!(await callerHasPermission(auth.caller.id, "blog"))) {
    return { ok: false, error: "Yetkisiz" };
  }

  const result = isContentWriteMigrated("blog_post")
    ? await saveBlogTranslationCentral(auth.caller, input)
    : ((await upsertBlogTranslation(input as BlogTranslationInput)) as BlogTranslationSave);
  /* 🌐 Faz 2 — dil slug'ı değiştiyse URL haritası + sayfalar yenilenir. */
  if (result.ok && input.slug !== undefined) revalidateLocaleSlugs();
  return result;
}
