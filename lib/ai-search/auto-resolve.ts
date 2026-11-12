/* ===============================================================
   🎯 AI ARAMA — OTOMATİK ÇÖZÜMLEME (ARA EKRAN YOK)
   ===============================================================
   `parseNaturalQuery` belirsizlikleri `choices` olarak raporlar. "Villa
   Bul" doğrudan sonuç sayfasına gittiği için bu dosya her belirsizliği
   SORU SORMADAN, yalnız mevcut taksonomi kayıtları arasından ve sorgunun
   kendi bağlamıyla çözer. Hiçbir zaman olmayan filtre üretmez; çözülemeyen
   / desteklenmeyen / geçersiz ifadeler filtreye dönüşmez, arama tanınan
   diğer kriterlerle sürer.

   Kurallar (sırayla):
   • ambiguous_region (aynı adlı alt bölge, ör. "Üzümlü"):
       1) Sorguda aynı ana bölgeden başka bir bölge geçiyorsa o seçilir
          ("Kalkan Üzümlü" → Kalkan / Üzümlü).
       2) Yoksa slug'ı adın kendisi olan (ana bölge öneki taşımayan)
          canonical kayıt seçilir ("uzumlu" ↔ "fethiye-uzumlu").
       3) Hâlâ tek değilse adaylar birlikte gönderilir (/arama bölgelerde
          OR uygular → hiçbir aday kaybolmaz).
   • ambiguous_match (tip ↔ özellik, ör. "ısıtmalı kapalı havuz"):
       1) Sorguda başka bir villa tipi zaten varsa özellik seçilir
          (tipler /arama'da AND'dir; ikinci tip sonucu sıfırlar).
       2) İfade bir villa kelimesine bağlıysa ("…lı villa", "villa with …")
          tip seçilir.
       3) Aksi hâlde özellik seçilir; tip/özellik dışı çakışmada ilk aday.
   • multiple_types (v3): /arama tiplerde AND uygular; kullanıcı her
     tipi istediği için NİTELİK tipleri ("muhafazakâr", "balayı",
     "çocuk havuzlu", "korunaklı havuzlu"…) HEPSİ birlikte gönderilir
     (`typeIds`) — rastgele düşürme yok.
       – SINIF tipleri (konaklama biçimi: Bungalov, Apart) birbirini
         dışlar: tek sınıf tipi nitelik tipleriyle birlikte kalır; iki
         ve daha fazla sınıf tipi varsa ("bungalov veya apart") hiçbiri
         gönderilmez (her biri tek başına AND'de sonucu sıfırlardı).
       – Birbirini dışlayan nitelik çifti (Lüks ↔ Ekonomik) birlikte
         gelirse ikisi de gönderilmez.
     Sınıf/dışlayıcı tipler sözlükteki kavram eşleşmesinden (ad
     eşitliği) bulunur; slug/id sabit kodlanmaz.
   • conflicting_guests: en büyük kişi sayısı (kapasite kaybı olmaz).
   • Tarih sorunu (yalnız ay, tek tarih, geçersiz, geçmiş…): tarih
     gönderilmez; diğer kriterlerle aranır.

   DB/ağ erişimi YOK, yan etki YOK.
   =============================================================== */

import { normalizePhrase } from "./tokenize";
import type { ConfirmedCriteria, ParseChoice, ParseResult } from "./schema";
import { tokenMatches, type Vocabulary } from "./vocabulary";

export type AutoDecision = {
  reason: ParseChoice["reason"];
  phrase: string;
  picked: string[];
  rule:
    | "context"
    | "canonical"
    | "all"
    | "type_present"
    | "villa_head"
    | "default"
    | "max"
    | "all_types"
    | "dropped_conflicting_kinds"
    | "dropped_exclusive_pair";
};

export type AutoResolved = {
  criteria: ConfirmedCriteria;
  decisions: AutoDecision[];
  /** Tanınan en az bir kriter var mı (yoksa arama yapılmaz). */
  hasCriteria: boolean;
};

export function autoResolve(result: ParseResult, vocab: Vocabulary): AutoResolved {
  const c: ConfirmedCriteria = {
    regionIds: result.regions.map((o) => o.id),
    typeId: result.types[0]?.id ?? null,
    typeIds: result.types.map((o) => o.id),
    featureIds: result.features.map((o) => o.id),
    guests: result.guests,
    start: result.start,
    end: result.end,
    flexible: result.flexible ?? null,
    sort: result.sort ?? null,
  };
  const typeIdsOf = (concepts: string[]) =>
    new Set(
      concepts.flatMap((k) => vocab.conceptOptions[k] ?? []).flatMap((key) => {
        const o = vocab.options[key];
        return o && o.kind === "type" ? [o.id] : [];
      })
    );
  const KIND_TYPES = typeIdsOf(["bungalow", "apartment"]);
  const LUX = typeIdsOf(["luxury"]);
  const ECO = typeIdsOf(["economy"]);
  const decisions: AutoDecision[] = [];
  const addRegion = (id: string) => {
    if (!c.regionIds.includes(id)) c.regionIds.push(id);
  };
  const addFeature = (id: string) => {
    if (!c.featureIds.includes(id)) c.featureIds.push(id);
  };

  // Tip seçimleri önce: tip/özellik kararları buna bakar.
  const ordered = [...result.choices].sort(
    (a, b) => Number(b.reason === "multiple_types") - Number(a.reason === "multiple_types")
  );

  for (const ch of ordered) {
    if (ch.reason === "conflicting_guests") {
      const vals = ch.options.flatMap((o) => (o.kind === "guests" ? [o.value] : []));
      if (vals.length) {
        c.guests = Math.max(...vals);
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [String(c.guests)], rule: "max" });
      }
      continue;
    }

    if (ch.reason === "multiple_types") {
      let ids = ch.options.flatMap((o) => (o.kind === "type" ? [o.id] : []));
      if (!ids.length) continue;
      const kinds = ids.filter((id) => KIND_TYPES.has(id));
      if (kinds.length > 1) {
        ids = ids.filter((id) => !KIND_TYPES.has(id));
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [], rule: "dropped_conflicting_kinds" });
      }
      if (ids.some((id) => LUX.has(id)) && ids.some((id) => ECO.has(id))) {
        ids = ids.filter((id) => !LUX.has(id) && !ECO.has(id));
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [], rule: "dropped_exclusive_pair" });
      }
      c.typeIds = ids;
      c.typeId = ids[0] ?? null;
      if (ids.length) decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: ids, rule: "all_types" });
      continue;
    }

    if (ch.reason === "ambiguous_region") {
      const regs = ch.options.flatMap((o) => (o.kind === "region" ? [vocab.options[`region:${o.id}`]] : []))
        .filter((o): o is NonNullable<typeof o> => !!o);
      if (!regs.length) continue;
      // 1) Bağlam: sorgudaki diğer bölgelerin ana bölgesi
      const groups = new Set(
        c.regionIds
          .map((id) => vocab.options[`region:${id}`])
          .filter(Boolean)
          .map((o) => (o!.groupName ?? "").trim())
          .filter((g) => g.length > 0)
      );
      const byContext = regs.filter((o) => groups.has((o.groupName ?? "").trim()));
      if (byContext.length === 1) {
        addRegion(byContext[0].id);
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [byContext[0].id], rule: "context" });
        continue;
      }
      // 2) Canonical: slug = adın kendisi (ana bölge öneki yok)
      const core = normalizePhrase(ch.phrase).join("");
      /* Sorgudaki ek ("Üzümlü'de", "Uzumlude") canonical eşleşmeyi bozmaz. */
      const canonical = regs.filter((o) => {
        const slug = (o.slug ?? "").replace(/-/g, "");
        return slug.length > 0 && tokenMatches(core, slug);
      });
      if (canonical.length === 1) {
        addRegion(canonical[0].id);
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [canonical[0].id], rule: "canonical" });
        continue;
      }
      // 3) Hepsi (OR)
      for (const o of regs) addRegion(o.id);
      decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: regs.map((o) => o.id), rule: "all" });
      continue;
    }

    // ambiguous_match
    const typeOpt = ch.options.find((o) => o.kind === "type");
    const featOpt = ch.options.find((o) => o.kind === "feature");
    if (typeOpt && featOpt) {
      if (c.typeId !== null) {
        addFeature(featOpt.id);
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [featOpt.id], rule: "type_present" });
      } else if (ch.attachedToVilla) {
        c.typeId = typeOpt.id;
        c.typeIds = [typeOpt.id];
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [typeOpt.id], rule: "villa_head" });
      } else {
        addFeature(featOpt.id);
        decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [featOpt.id], rule: "default" });
      }
      continue;
    }
    const first = ch.options[0];
    if (!first || first.kind === "guests") continue;
    if (first.kind === "region") addRegion(first.id);
    else if (first.kind === "type") {
      if (c.typeId === null) {
        c.typeId = first.id;
        c.typeIds = [first.id];
      }
    } else addFeature(first.id);
    decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [first.id], rule: "default" });
  }

  /* Ana bölge + aynı ana bölgeden alt bölge birlikte → yalnız alt bölge
     (sıra fark etmez: "Kalkan Üzümlü" = "Yeşilköy Kalkan"). /arama ana
     bölgeyi tüm alt bölgelere genişlettiği için kök kalırsa alt bölge
     anlamsızlaşırdı. */
  {
    const regionOf = (id: string) => vocab.options[`region:${id}`];
    const subGroups = new Set(
      c.regionIds
        .map(regionOf)
        .filter((o): o is NonNullable<typeof o> => !!o && !o.isGroupRoot)
        .map((o) => (o.groupName ?? "").trim())
        .filter((g) => g.length > 0)
    );
    c.regionIds = c.regionIds.filter((id) => {
      const o = regionOf(id);
      return !(o?.isGroupRoot && subGroups.has((o.groupName ?? "").trim()));
    });
  }

  // Tarih: ikisi birden ve geçerli sırada değilse hiç gönderilmez.
  if (!(c.start && c.end && c.start < c.end)) {
    c.start = null;
    c.end = null;
  }
  // Esnek tarih (±gün) yalnız geçerli tarih aralığıyla anlamlıdır.
  if (!c.start) c.flexible = null;

  const hasCriteria =
    c.regionIds.length > 0 || c.typeId !== null || c.featureIds.length > 0 ||
    c.guests !== null ||
    c.start !== null ||
    !!c.sort;
  return { criteria: c, decisions, hasCriteria };
}
