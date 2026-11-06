/* ===============================================================
   🔎 AI ARAMA (KURAL TABANLI) — NORMALİZASYON + TOKENIZER (SAF)
   ===============================================================
   "Yapay Zekâ ile Ara" ilk sürümü harici model/API KULLANMAZ; bu
   dosya kullanıcının serbest metnini deterministik token'lara böler.

   • Normalizasyon, villa adı aramasının ZATEN kullandığı
     `normalizeSearchText` (lib/search.ts) üzerine kurulur: Türkçe
     harf katlama (ç→c, ğ→g, ı/İ→i, ö→o, ş→s, ü→u) + aksan silme +
     küçük harf. Almanca için ek olarak ß → ss.
   • Kesme işaretli ekler ayrı tutulur: "Kalkan'da" → taban "kalkan",
     ek "da". Böylece kısa bölge adları ("Kaş'ta") güvenle eşleşir.
   • Rakam + harf bitişik yazımlar ayrılır: "6kişilik" → 6 · kisilik.
   • Kelime arasındaki tire atılır ("pet-friendly" → pet friendly);
     sayılar arasındaki tire tarih aralığı için token olarak kalır.

   DB/ağ erişimi YOK, yan etki YOK.
   =============================================================== */

import { normalizeSearchText } from "@/lib/search";

export type TokenKind = "word" | "num" | "date" | "dash" | "currency";

export type NumericDate = {
  d: number;
  m: number;
  /** Yıl yazılmadıysa `null`. */
  y: number | null;
  /** Ayırıcı: "." (TR/DE), "/" (belirsiz olabilir), "-" (ISO). */
  sep: "." | "/" | "-";
};

export type Token = {
  index: number;
  kind: TokenKind;
  /** Kullanıcının yazdığı biçim (gösterim için). */
  raw: string;
  /** Normalize edilmiş taban (eşleştirme için). */
  norm: string;
  /** Kesme işaretinden sonraki ek (normalize). */
  suffix?: string;
  /** `num` için sayısal değer. */
  value?: number;
  /** `num` sonrasında nokta vardı ("2." — Almanca sıra sayısı). */
  ordinal?: boolean;
  /** Basamak sayısı (yıl/gün ayrımı için). */
  digits?: number;
  /** `date` için ayrıştırılmış tarih parçaları. */
  date?: NumericDate;
};

/** Tek kelimelik metni eşleştirme kanonuna indirger. */
export function normalizeToken(raw: string): string {
  return normalizeSearchText(raw)
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Serbest bir ifadeyi (sözlük girdisi, DB adı) token dizisine çevirir. */
export function normalizePhrase(text: string): string[] {
  return tokenize(text)
    .filter((t) => t.kind === "word" || t.kind === "num")
    /* Kesme işaretli ek atılır ("Children's" → "children"): sorgu
       tarafındaki eşleştirme de yalnız tabanı kullanır. */
    .map((t) => t.norm)
    .filter((s) => s.length > 0);
}

const L = "A-Za-z\\u00C0-\\u024F\\u0300-\\u036F";

/* Sıra önemlidir: önce tam tarih biçimleri, sonra binlik sayılar,
   sonra düz sayı, kelime, tire ve para birimi. */
const TOKEN_RE = new RegExp(
  [
    "(\\d{4}-\\d{1,2}-\\d{1,2})", // 1 ISO 2027-08-02
    "(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})", // 2 02.08.2027 · 2/8/2027
    "(\\d{1,2}\\.\\d{1,2}\\.)(?!\\d)", // 3 02.08. (yılsız)
    "(\\d{1,3}(?:[.,]\\d{3})+)", // 4 10.000 · 1,500
    "(\\d+)(\\.)?", // 5-6 sayı (+ sıra noktası)
    `([${L}]+)(?:['’\`´]([${L}]+))?`, // 7-8 kelime ('ek)
    "([-–—])", // 9 tire
    "([€$£₺])", // 10 para birimi
  ].join("|"),
  "g"
);

function parseNumericDate(raw: string, sep: "." | "/" | "-"): NumericDate | null {
  const parts = raw.split(/[./-]/).filter((p) => p.length > 0);
  if (sep === "-") {
    const [y, m, d] = parts.map(Number);
    return { d, m, y, sep };
  }
  if (parts.length < 2) return null;
  const d = Number(parts[0]);
  const m = Number(parts[1]);
  let y: number | null = parts[2] ? Number(parts[2]) : null;
  if (y !== null && parts[2].length === 2) y = 2000 + y;
  return { d, m, y, sep };
}

export function tokenize(input: string): Token[] {
  const text = String(input ?? "");
  const out: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const raw = m[0];
    let tok: Omit<Token, "index"> | null = null;
    if (m[1]) {
      const date = parseNumericDate(m[1], "-");
      if (date) tok = { kind: "date", raw, norm: m[1], date };
    } else if (m[2]) {
      const sep = m[2].includes("/") ? "/" : ".";
      const date = parseNumericDate(m[2], sep);
      if (date) tok = { kind: "date", raw, norm: m[2], date };
    } else if (m[3]) {
      const date = parseNumericDate(m[3], ".");
      if (date) tok = { kind: "date", raw, norm: m[3], date };
    } else if (m[4]) {
      const value = Number(m[4].replace(/[.,]/g, ""));
      tok = { kind: "num", raw, norm: String(value), value, digits: String(value).length };
    } else if (m[5]) {
      const value = Number(m[5]);
      tok = {
        kind: "num",
        raw,
        norm: m[5],
        value,
        digits: m[5].length,
        ordinal: !!m[6],
      };
    } else if (m[7]) {
      const norm = normalizeToken(m[7]);
      const suffix = m[8] ? normalizeToken(m[8]) : undefined;
      if (norm.length > 0) tok = { kind: "word", raw, norm, suffix };
    } else if (m[9]) {
      tok = { kind: "dash", raw, norm: "-" };
    } else if (m[10]) {
      tok = { kind: "currency", raw, norm: m[10] };
    }
    if (tok) out.push({ ...tok, index: 0 });
  }

  /* Kelime-kelime arasındaki tire anlamsızdır ("wi-fi", "pet-friendly");
     yalnız sayı/tarih komşuluğundaki tire (aralık) korunur. */
  const filtered = out.filter((t, i) => {
    if (t.kind !== "dash") return true;
    const prev = out[i - 1];
    const next = out[i + 1];
    return !(prev?.kind === "word" && next?.kind === "word");
  });
  return filtered.map((t, i) => ({ ...t, index: i }));
}
