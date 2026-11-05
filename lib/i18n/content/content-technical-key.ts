import { slugifyTr } from "@/lib/slug";
import { CONTENT_ENTITY_BY_KEY, type ContentEntityKey } from "@/lib/i18n/content/content-registry";

/* ===============================================================
   🌐 Faz 5 dalga 2 — EKSİK TEKNİK ANAHTARIN BİR KEZ ATANMASI
   ===============================================================
   Sorun: migration 008 öncesinden kalan bazı kayıtların (ör. villa
   tipleri) `slug`'ı NULL/boş. Eski kod adı kaydedince slug'ı addan
   üretiyordu; Faz 5'te teknik anahtar ad değişiminden bağımsız olduğu
   için bu kayıtlar HİÇ anahtar almıyordu → kapak yükleme (yol
   `category-covers/<slug>`), landing URL'i ve menü bağlantısı kapalı
   kalıyordu.

   Kural (veri kaybı / yanlış eşleşme olmasın):
     • YALNIZ boş anahtar doldurulur; dolu anahtar ASLA değişmez
       (`WHERE slug IS NULL OR btrim(slug) = ''` + satır kilidi);
     • aday, aynı türün başka bir kaydının teknik anahtarıyla VEYA
       herhangi bir dildeki URL slug'ıyla çakışmaz (-2, -3 …);
     • tek transaction; eşzamanlı ikinci çağrı mevcut anahtarı döner.
   Çeviri satırlarına (dil URL slug'larına) dokunulmaz.
   =============================================================== */

export type AssignTechnicalKeyResult =
  | { ok: true; slug: string; assigned: boolean }
  | { ok: false; error: string };

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export type TechnicalKeyClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release: () => void;
};

/** Saf çekirdek (bağlantı dışarıdan) — izole PG testinde doğrudan çalışır. */
export async function assignMissingTechnicalKeyWith(
  connect: () => Promise<TechnicalKeyClient>,
  entity: ContentEntityKey,
  id: string,
  source: string
): Promise<AssignTechnicalKeyResult> {
  const def = CONTENT_ENTITY_BY_KEY[entity];
  if (!def.slugKind) return { ok: false, error: "Bu türün teknik anahtarı yok" };
  const base = slugifyTr(source);
  if (!base) return { ok: false, error: "Anahtar üretilecek ad boş" };
  let client: TechnicalKeyClient;
  try {
    client = await connect();
  } catch {
    return { ok: false, error: "Teknik anahtar atanamadı" };
  }
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT slug FROM public.${q(def.parentTable)} WHERE id::text = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Kayıt bulunamadı" };
    }
    const existing = String(cur.rows[0].slug ?? "").trim();
    if (existing) {
      await client.query("COMMIT");
      return { ok: true, slug: existing, assigned: false };
    }
    let candidate = base;
    for (let n = 2; n < 1000; n++) {
      const clash = await client.query(
        `SELECT 1 FROM public.${q(def.parentTable)} WHERE slug = $1 AND id::text <> $2
         UNION ALL
         SELECT 1 FROM public.${q(def.table)} WHERE slug = $1 AND ${q(def.parentIdColumn)}::text <> $2
         LIMIT 1`,
        [candidate, id]
      );
      if (clash.rows.length === 0) break;
      candidate = `${base}-${n}`;
    }
    const upd = await client.query(
      `UPDATE public.${q(def.parentTable)} SET slug = $2 WHERE id::text = $1 AND (slug IS NULL OR btrim(slug) = '')`,
      [id, candidate]
    );
    await client.query("COMMIT");
    return { ok: true, slug: candidate, assigned: (upd.rowCount ?? 0) > 0 };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* noop */
    }
    const code = (err as { code?: string }).code;
    return { ok: false, error: code === "23505" ? "Teknik anahtar çakıştı, tekrar deneyin" : "Teknik anahtar atanamadı" };
  } finally {
    client.release();
  }
}
