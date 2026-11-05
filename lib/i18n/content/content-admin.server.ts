import "server-only";

import { getPgPool } from "@/lib/db/pg.client";
import { getCachedSettings } from "@/lib/cache.helpers";
import { adminActivityLogRepository } from "@/lib/db/admin-activity-log.repository.server";
import { boundJsonSize, computeDiffSummary, sanitizeForAudit } from "@/lib/activity-log.helper";
import { CONTENT_LOCALES, CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";
import type { Locale } from "@/lib/i18n/config";
import type { ContentValues, ContentWriteItem, ContentWriteResult } from "@/lib/i18n/content/content-contract";
import { contentLocaleContextFromSettings } from "@/lib/i18n/content/content-locale-context";
import { createContentRepository } from "@/lib/i18n/content/content-repository";
import { normalizeParentIds } from "@/lib/i18n/content/content-resolve";
import { createContent, saveContent, saveContentMany } from "@/lib/i18n/content/content-write.server";
/* 🌐 Faz 6 Dalga 6 — yazma servisi yalnız bu katmandan dışarı açılır (Faz 4 sınırı). */
export { invalidateContentEntity } from "@/lib/i18n/content/content-write.server";
import type { ContentTechnicalPatch } from "@/lib/i18n/content/content-write-core";
import {
  adminLocaleLayout,
  missingFieldsOf,
  type AdminContentLocales,
  type AdminLocaleLayout,
} from "@/lib/i18n/content/content-admin";

/* ===============================================================
   🌐 ADMIN İÇERİK KATMANI — Faz 5 (server-only)
   ===============================================================
   Admin eylemlerinin (yetki kontrolünden SONRA) kullandığı tek katman:
     • okuma: çeviri tablolarından HAM değerler (cache YOK, yedek YOK —
       admin her dilin kendi değerini görür/düzenler)
     • yazma: merkezi saveContent / createContent
     • denetim kaydı: admin_activity_logs (mevcut /api/admin/activity-logs
       ile AYNI sanitize + boyut sınırı + diff kuralı), commit SONRASI,
       hata yazmayı ETKİLEMEZ.
   Ana dil = settings.public_default_locale (getRootLocale kuralı).
   =============================================================== */

const repository = createContentRepository((q) => getPgPool().query(q.text, q.values));

export async function getAdminLocaleLayout(): Promise<AdminLocaleLayout> {
  const settings = await getCachedSettings().catch(() => null);
  const ctx = contentLocaleContextFromSettings(settings);
  return adminLocaleLayout(ctx.root, ctx.enabled, !!(settings as { multilingual_enabled?: boolean } | null)?.multilingual_enabled);
}

/** Kayıt başına bütün dillerin HAM değerleri (tek sorgu). */
export async function getAdminContentRows(
  entity: ContentEntityKey,
  ids: readonly string[]
): Promise<Map<string, AdminContentLocales>> {
  const def = CONTENT_ENTITY_BY_KEY[entity];
  const out = new Map<string, AdminContentLocales>();
  const { canonical, originals } = normalizeParentIds(ids, def.parentIdType);
  if (canonical.length === 0) return out;
  const rows = await repository.fetchRows(def, canonical, CONTENT_LOCALES);
  for (const id of canonical) {
    const byLocale: AdminContentLocales = {};
    for (const r of rows) {
      if (r.parentId !== id) continue;
      byLocale[r.locale] = def.slugKind ? { ...r.values, slug: r.slug ?? null } : { ...r.values };
    }
    for (const o of originals.get(id) ?? [id]) out.set(o, byLocale);
  }
  return out;
}

export async function getAdminContent(entity: ContentEntityKey, id: string): Promise<AdminContentLocales> {
  return (await getAdminContentRows(entity, [id])).get(id) ?? {};
}

/** Teknik anahtar (ana tablo slug'ı) — salt okunur gösterim. */
export async function getTechnicalKey(entity: ContentEntityKey, id: string): Promise<string | null> {
  const def = CONTENT_ENTITY_BY_KEY[entity];
  if (!def.slugKind) return null;
  try {
    const r = await getPgPool().query(
      `SELECT slug FROM public."${def.parentTable}" WHERE id::text = $1`,
      [id]
    );
    return (r.rows[0]?.slug as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function getSlugSeparationCapability(): Promise<boolean> {
  try {
    const r = await getPgPool().query(
      "SELECT to_regprocedure('public.content_language_slugs_separated()') IS NOT NULL AS ok"
    );
    return r.rows[0]?.ok === true;
  } catch {
    return false;
  }
}

type Actor = { id: string; email: string };

async function audit(
  actor: Actor,
  row: {
    action: string;
    entity: ContentEntityKey;
    entityId: string;
    title?: string | null;
    before?: unknown;
    after?: unknown;
    route?: string | null;
  }
): Promise<void> {
  try {
    const before = row.before === undefined ? null : boundJsonSize(sanitizeForAudit(row.before));
    const after = row.after === undefined ? null : boundJsonSize(sanitizeForAudit(row.after));
    const { error } = await adminActivityLogRepository.insert({
      admin_user_id: actor.id,
      admin_email: actor.email,
      action: row.action.slice(0, 80),
      entity_type: row.entity.slice(0, 40),
      entity_id: row.entityId.slice(0, 80),
      entity_title: row.title ? row.title.slice(0, 200) : null,
      before_data: before,
      after_data: after,
      diff_summary: computeDiffSummary(before, after),
      route: row.route ?? null,
      ip_address: null,
      user_agent: null,
    });
    if (error) console.warn("[content-admin] denetim kaydı yazılamadı", error.message);
  } catch (err) {
    console.warn("[content-admin] denetim kaydı yazılamadı", err);
  }
}

/** Yetki kontrolü ÇAĞIRAN eylemde yapılmış olmalı. */
export async function adminSaveContent(
  actor: Actor,
  input: { entity: ContentEntityKey; parentId: string; locale: Locale; patch: ContentWriteItem["patch"]; title?: string | null; route?: string | null }
): Promise<ContentWriteResult> {
  const before = (await getAdminContent(input.entity, input.parentId))[input.locale] ?? null;
  const r = await saveContent(input.entity, input.parentId, input.locale, input.patch, { actorId: actor.id });
  if (r.ok) {
    const after: ContentValues = { ...(before ?? {}), ...input.patch };
    await audit(actor, {
      action: r.created ? "content.translation_create" : "content.update",
      entity: input.entity,
      entityId: input.parentId,
      title: input.title,
      before: before ? { locale: input.locale, ...before } : { locale: input.locale },
      after: { locale: input.locale, ...after },
      route: input.route,
    });
  }
  return r;
}

export async function adminCreateContent(
  actor: Actor,
  input: {
    entity: ContentEntityKey;
    technical: Record<string, unknown>;
    locales: readonly { locale: Locale; patch: ContentWriteItem["patch"] }[];
    title?: string | null;
    route?: string | null;
  }
) {
  const r = await createContent({ entity: input.entity, technical: input.technical, locales: input.locales }, { actorId: actor.id });
  if (r.ok) {
    await audit(actor, {
      action: "content.create",
      entity: input.entity,
      entityId: r.id,
      title: input.title,
      after: { technical: input.technical, locales: input.locales },
      route: input.route,
    });
  }
  return r;
}

/** Toplu kayıt (tek transaction) + TEK denetim kaydı. */
export async function adminSaveContentMany(
  actor: Actor,
  input: {
    items: readonly ContentWriteItem[];
    action: string;
    entity: ContentEntityKey;
    route?: string | null;
    title?: string | null;
    /** Faz 5 dalga 2 — içerik DIŞI ana tablo kolonları, aynı transaction. */
    technical?: readonly ContentTechnicalPatch[];
    entityId?: string;
    before?: unknown;
  }
) {
  const r = await saveContentMany(input.items, { actorId: actor.id }, { technical: input.technical });
  if (r.ok) {
    await audit(actor, {
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? `batch:${input.items.length}`,
      title: input.title,
      before: input.before,
      after: {
        content: input.items.map((i) => ({ id: i.parentId, locale: i.locale, ...i.patch })),
        ...(input.technical?.length ? { technical: input.technical.map((t) => t.values) } : {}),
      },
      route: input.route,
    });
  }
  return r;
}

export { missingFieldsOf };
/** Faz 5 dalga 2 — admin modülleri teknik yama tipini bu katmandan alır
 *  (yazma çekirdeğine doğrudan bağımlılık yok — Faz 4 sınırı). */
export type { ContentTechnicalPatch };
