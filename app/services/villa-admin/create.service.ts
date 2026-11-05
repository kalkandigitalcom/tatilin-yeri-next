/* 🛡️ FAZ 2 STABILIZATION — server-role repo (dbAdmin) RLS bypass.
   ⚠️ DATA-INTEGRITY FIX (server-side persistence):
     Eski `setVillaDistances` ve `setVillaPrices` anon `db` + silent
     `console.error` döndürüyordu. Server context'te (route handler)
     anon JWT taşımaz → mig 037 RLS DENY → RPC fail → caller'a
     silent return → villa kaydedildi ama prices/distances DB'de
     YOK. Production'da fiyat eksik kaydetme bug'ı bu kanaldan
     gelmişti. Server-only variant (`*.service.server.ts`) service-role
     repo kullanır + error → throw → orchestrator catch → route 400.
     CLIENT path (`PricingCalendarCanvas`) eski `villa-price.service.ts`
     üzerinden çalışmaya devam eder (browser admin JWT → RLS allow).
*/
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { setVillaDistancesServer } from "../villa-distance.service.server";
import { setVillaPricesServer } from "../villa-price.service.server";

import { buildVillaCorePayload } from "./_helpers/payload";
import { generateUniqueSlug } from "./_helpers/slug";
import { sanitizeDistances } from "./_helpers/distances";
import {
  insertVillaTypeRelations,
  insertVillaFeatureRelations,
  insertVillaRuleRelations,
  insertVillaPriceIncludeRelations,
} from "./_helpers/relations";

import type { VillaFormPayload } from "./types";
import type { AuthorizedAdminCaller } from "@/lib/admin-route-auth";
import { isContentWriteMigrated, LEGACY_WRITE_DISABLED_MESSAGE } from "@/lib/i18n/content/content-write-modules";
import { createVillaCoreCentral } from "./_helpers/content.server";

/* ===============================================================
   🛡️ FAZ 3 — createVillaFull (ORCHESTRATOR)
   ===============================================================
   Eski villa-admin.service.ts > createVillaFull'un BYTE-IDENTICAL
   karşılığı; tüm pure body helper'lara delege edildi. Orchestrator
   yalnız:
     - validate (title zorunlu)
     - slug üretimi
     - villa INSERT (returning id)
     - 4 relation conditional INSERT
     - distances / prices conditional sync
   sırasını yönetir.

   ⚠️ ORCHESTRATION SIRASI BYTE-IDENTICAL (AST contract FAZ 5):
     1. validate form.title
     2. await generateUniqueSlug(title)            (slug üretimi)
     3. await villaAdminRepository.insertVilla(...) (villa row)
     4. if selectedTypes?.length          → await insertTypes
     5. if selectedFeatures?.length       → await insertFeatures
     6. if distances?.length              → await setVillaDistances
     7. if prices?.length                 → await setVillaPrices
     8. if selectedRules?.length          → await insertRules
     9. if selectedPriceIncludes?.length  → await insertPriceIncludes
    10. return newId

   ⚠️ KESIN KURAL: `.length > 0` conditional INSERT pattern'i (create
   davranışı) AYNEN korundu. Update'ten farklı: orada ALWAYS replace_*
   RPC çağrılır.
=============================================================== */

export async function createVillaFull({
  form,
  selectedLocation,
  selectedTypes,
  selectedFeatures,
  mapData,
  distances,
  prices,
  selectedRules,
  selectedPriceIncludes,
}: VillaFormPayload,
  /** Faz 5 dalga 2 — merkezi yazma için çağıran admin (audit). */
  opts?: { actor?: AuthorizedAdminCaller }
): Promise<string> {

  if (!form.title) {
    throw new Error("Villa adı zorunlu");
  }

  // ✅ SLUG OTOMATİK
  const slug = await generateUniqueSlug(form.title);

  // 🔥 INSERT
  /* FAZ 37: DB I/O villaAdminRepository.insertVilla delege.
     `.select().single()` chain repo içinde aynen; newId return
     için kritik. */
  /* 🌐 Faz 5 dalga 2 — merkezi yazma: ana tablo (teknik anahtar + teknik
     alanlar) ve ana dil içeriği (açıklama, rozet, SEO) TEK transaction.
     Eski doğrudan insert bu modül için KAPALI. İlişkiler / mesafeler /
     fiyatlar aşağıda AYNEN (değişmedi). */
  let newId: string;
  if (isContentWriteMigrated("villa")) {
    if (!opts?.actor) throw new Error(LEGACY_WRITE_DISABLED_MESSAGE);
    const createdId = await createVillaCoreCentral(
      opts.actor,
      buildVillaCorePayload({ form, mapData, selectedLocation, slug }) as unknown as Record<string, unknown>,
      slug
    );
    newId = createdId;
  } else {
    const { data, error } = await villaAdminRepository.insertVilla(
      buildVillaCorePayload({
        form,
        mapData,
        selectedLocation,
        slug,
      })
    );

    if (error) {
      console.error(
        "❌ Villa create error:",
        error.message
      );

      throw error;
    }

    newId = data.id;
  }

  // 🔥 TYPES
  if (selectedTypes?.length) {
    await insertVillaTypeRelations(newId, selectedTypes);
  }

  // 🔥 FEATURES
  if (selectedFeatures?.length) {
    await insertVillaFeatureRelations(newId, selectedFeatures);
  }

  // 🔥 DISTANCES
  if (distances?.length) {
    /* 🛡️ Server-only variant (RLS bypass + throws on error). Eski
       anon path silent fail veriyordu; bu sürüm hata olursa
       orchestrator catch'i tetikler → route 400. */
    await setVillaDistancesServer(
      newId,
      sanitizeDistances(distances)
    );
  }

  // 🔥 PRICES
  if (prices?.length) {
    /* 🛡️ Server-only variant — yukarıdaki açıklama aynen. */
    await setVillaPricesServer(
      newId,
      prices
    );
  }

  /* ===============================================================
     🔥 RULES — relation sync (master/relation architecture)
     ===============================================================
     selectedRules: string[] — rule_items.id dizisi
     villa_rule_relations tablosuna insert edilir.
     =============================================================== */
  if (selectedRules?.length) {
    await insertVillaRuleRelations(newId, selectedRules);
  }

  /* ===============================================================
     🔥 PRICE INCLUDES — relation sync
     ===============================================================
     selectedPriceIncludes: string[] — price_include_items.id dizisi
     ⚠️ Relation kolonu "include_id" — "price_include_id" DEĞİL.
     =============================================================== */
  if (selectedPriceIncludes?.length) {
    await insertVillaPriceIncludeRelations(newId, selectedPriceIncludes);
  }

  return newId;
}
