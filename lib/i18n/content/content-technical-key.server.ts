import "server-only";

import { getPgPool } from "@/lib/db/pg.client";
import type { ContentEntityKey } from "@/lib/i18n/content/content-registry";
import {
  assignMissingTechnicalKeyWith,
  type AssignTechnicalKeyResult,
  type TechnicalKeyClient,
} from "@/lib/i18n/content/content-technical-key";

/* 🌐 Faz 5 dalga 2 — eksik teknik anahtarın bir kez atanması (sunucu
   bağlantısıyla). Kurallar: content-technical-key.ts. */
export type { AssignTechnicalKeyResult };

export async function assignMissingTechnicalKey(
  entity: ContentEntityKey,
  id: string,
  source: string
): Promise<AssignTechnicalKeyResult> {
  return assignMissingTechnicalKeyWith(
    async () => (await getPgPool().connect()) as unknown as TechnicalKeyClient,
    entity,
    id,
    source
  );
}
