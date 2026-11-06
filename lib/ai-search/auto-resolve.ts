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
   • multiple_types: villa kelimesine en yakın (baş isim) tip seçilir
     ("muhafazakâr balayı villası" → Balayı; ipucu parser'dan `head`);
     bulunamazsa son yazılan.
   • conflicting_guests: en büyük kişi sayısı (kapasite kaybı olmaz).
   • Tarih sorunu (yalnız ay, tek tarih, geçersiz, geçmiş…): tarih
     gönderilmez; diğer kriterlerle aranır.

   DB/ağ erişimi YOK, yan etki YOK.
   =============================================================== */

import { normalizePhrase } from "./tokenize";
import type { ConfirmedCriteria, ParseChoice, ParseResult } from "./schema";
import type { Vocabulary } from "./vocabulary";

export type AutoDecision = {
  reason: ParseChoice["reason"];
  phrase: string;
  picked: string[];
  rule: "context" | "canonical" | "all" | "type_present" | "villa_head" | "default" | "max";
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
    featureIds: result.features.map((o) => o.id),
    guests: result.guests,
    start: result.start,
    end: result.end,
  };
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
      const ids = ch.options.flatMap((o) => (o.kind === "type" ? [o.id] : []));
      if (!ids.length) continue;
      const head = ch.head && ids.includes(ch.head) ? ch.head : null;
      const pick = head ?? ids[ids.length - 1];
      const rule: AutoDecision["rule"] = head ? "villa_head" : "default";
      c.typeId = pick;
      decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [pick], rule });
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
      const canonical = regs.filter((o) => (o.slug ?? "").replace(/-/g, "") === core);
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
      if (c.typeId === null) c.typeId = first.id;
    } else addFeature(first.id);
    decisions.push({ reason: ch.reason, phrase: ch.phrase, picked: [first.id], rule: "default" });
  }

  // Tarih: ikisi birden ve geçerli sırada değilse hiç gönderilmez.
  if (!(c.start && c.end && c.start < c.end)) {
    c.start = null;
    c.end = null;
  }

  const hasCriteria =
    c.regionIds.length > 0 || c.typeId !== null || c.featureIds.length > 0 || c.guests !== null || c.start !== null;
  return { criteria: c, decisions, hasCriteria };
}
