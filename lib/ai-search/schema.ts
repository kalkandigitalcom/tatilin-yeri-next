/* ===============================================================
   ✅ AI ARAMA — ZOD ŞEMALARI
   ===============================================================
   1) `TaxonomyResponseSchema` — mevcut `GET /api/public/taxonomies`
      cevabının (değiştirilmedi) tarayıcıda doğrulanması. Ağdan gelen
      veri güvenilmez kabul edilir; şekil bozuksa AI modu çalışmaz,
      "Tarihle Ara" önerilir.
   2) `ParseResultSchema` — ayrıştırıcı çıktısı.
   3) `ConfirmedCriteriaSchema` — kullanıcının onayladığı kriterler;
      `buildHeroSearchParams`'a gitmeden önce son kontrol.
   =============================================================== */

import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TaxonomyResponseSchema = z.object({
  ok: z.literal(true),
  locations: z.array(
    z.object({
      id: z.coerce.string().pipe(nonEmpty),
      name: nonEmpty,
      slug: z.string().nullable().optional(),
      filter_group_name: z.string().nullable().optional(),
    })
  ),
  types: z.array(
    z.object({
      id: z.coerce.string().pipe(nonEmpty),
      name: nonEmpty,
      slug: z.string().nullable().optional(),
      name_by_locale: z
        .object({ en: z.string().optional(), de: z.string().optional() })
        .partial()
        .optional(),
    })
  ),
  features: z.array(
    z.object({
      id: z.coerce.string().pipe(nonEmpty),
      name: nonEmpty,
      name_by_locale: z
        .object({ en: z.string().optional(), de: z.string().optional() })
        .partial()
        .optional(),
    })
  ),
});
export type TaxonomyResponse = z.infer<typeof TaxonomyResponseSchema>;

/** `/arama` sıralama izin listesi (lib/pagination ALLOWED_PUBLIC_SORTS; "smart" varsayılandır). */
export const SortSchema = z.enum(["price-asc", "price-desc", "capacity-asc", "capacity-desc"]);

export const OptionKindSchema = z.enum(["region", "type", "feature"]);

export const OptionRefSchema = z.object({
  kind: OptionKindSchema,
  id: nonEmpty,
  label: nonEmpty,
});

export const UnsupportedCodeSchema = z.enum([
  "bedrooms",
  "budget",
  "sea_distance",
  "pool",
  "min_stay",
  "not_in_system",
]);

export const DateIssueSchema = z.enum([
  "month_only",
  "partial",
  "relative",
  "nights_only",
  "invalid_calendar",
  "end_before_start",
  "past",
  "too_long",
  "ambiguous_format",
  "multiple",
]);

export const ChoiceReasonSchema = z.enum([
  "multiple_types",
  "ambiguous_match",
  "ambiguous_region",
  "conflicting_guests",
]);

export const ParseResultSchema = z.object({
  regions: z.array(OptionRefSchema),
  types: z.array(OptionRefSchema),
  features: z.array(OptionRefSchema),
  guests: z.number().int().min(1).max(50).nullable(),
  guestBreakdown: z
    .object({
      adults: z.number().int().min(0).optional(),
      children: z.number().int().min(0).optional(),
      infants: z.number().int().min(0).optional(),
    })
    .nullable(),
  start: ymd.nullable(),
  end: ymd.nullable(),
  dateIssue: z.object({ code: DateIssueSchema, phrase: z.string() }).nullable(),
  choices: z.array(
    z.object({
      key: nonEmpty,
      reason: ChoiceReasonSchema,
      phrase: z.string(),
      options: z.array(
        z.union([
          OptionRefSchema,
          z.object({ kind: z.literal("guests"), id: nonEmpty, label: nonEmpty, value: z.number().int().min(1).max(50) }),
        ])
      ).min(2),
      /** Bağlam ipucu (otomatik çözümleme için): çoklu tipte villa
       *  kelimesine en yakın (baş isim) tipin id'si. */
      head: z.string().optional(),
      /** Bağlam ipucu: ifade bir villa kelimesine bağlı ("…lı villa",
       *  "villa with …"). */
      attachedToVilla: z.boolean().optional(),
    })
  ),
  unsupported: z.array(
    z.object({ code: UnsupportedCodeSchema, phrase: z.string(), concept: z.string().optional() })
  ),
  unknown: z.array(z.string()),
  suggestions: z.array(z.object({ phrase: z.string(), option: OptionRefSchema })),
  nothingParsed: z.boolean(),
  /** v3 — olumsuzlanan kriterler ("jakuzi olmasın", "no pets", "ohne Pool").
   *  Filtreye DÖNÜŞMEZ (sistemde "hariç tut" filtresi yok); yalnız bilgi. */
  negated: z.array(z.object({ phrase: z.string(), labels: z.array(z.string()) })).default([]),
  /** v3 — güvenli yazım düzeltmeleri ("Kalkn" → Kalkan). */
  corrections: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
  /** v3 — esnek tarih (±gün); `/arama` yalnız 0..3 uygular. */
  flexible: z.number().int().min(0).max(3).nullable().default(null),
  /** v3 — `/arama` sıralama izin listesi (smart hariç). */
  sort: SortSchema.nullable().default(null),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;
export type OptionRef = z.infer<typeof OptionRefSchema>;
export type ParseChoice = ParseResult["choices"][number];

/** Arama URL'sine gidecek son kriterler. Villa tipleri `/arama`'da AND
 *  uygulanır (`typeIds`); `typeId` geriye uyumluluk için tek tiptir. */
export const ConfirmedCriteriaSchema = z
  .object({
    regionIds: z.array(nonEmpty).max(30),
    typeId: nonEmpty.nullable(),
    /** v3 — birden fazla villa tipi (`/arama` tiplerde AND uygular).
     *  Verilirse `typeId` yerine bu liste kullanılır. */
    typeIds: z.array(nonEmpty).max(10).optional(),
    featureIds: z.array(nonEmpty).max(30),
    guests: z.number().int().min(1).max(50).nullable(),
    start: ymd.nullable(),
    end: ymd.nullable(),
    flexible: z.number().int().min(0).max(3).nullable().optional(),
    sort: SortSchema.nullable().optional(),
  })
  .refine((c) => (c.start === null) === (c.end === null), {
    message: "start/end birlikte verilmeli",
  })
  .refine((c) => c.start === null || c.end === null || c.start < c.end, {
    message: "end > start olmalı",
  });
export type ConfirmedCriteria = z.infer<typeof ConfirmedCriteriaSchema>;
