/* ===============================================================
   🌐 SEÇENEK D — FAZ 2: migration 106 (ayna) + 107 (TR aktarımı)
   ===============================================================
   Canlı DB YOK. Davranış izole PostgreSQL 16'da test edildi (bkz.
   Claude outputs/faz-2-veri-aktarimi-raporu.md). Burada migration
   metinlerinin içerik kaydıyla (content-registry) ve güvenlik
   sözleşmesiyle uyumu statik olarak doğrulanır.
   =============================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { CONTENT_ENTITIES } from "@/lib/i18n/content/content-registry";

const MIG = join(process.cwd(), "db/migrations");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const m106 = strip(readFileSync(join(MIG, "106_content_mirror.sql"), "utf8"));
const m107 = strip(readFileSync(join(MIG, "107_backfill_tr_translations.sql"), "utf8"));

type Row = { tr: string; base: string; fk: string; fields: string[]; slug: boolean };
function entityRows(sql: string): Row[] {
  return [
    ...sql.matchAll(/\('([a-z_]+_translations)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_,]+)',\s*(true|false)\)/g),
  ].map((m) => ({ tr: m[1], base: m[2], fk: m[3], fields: m[4].split(","), slug: m[5] === "true" }));
}

describe.each([
  ["106", m106],
  ["107", m107],
])("migration %s ↔ content-registry", (_name, sql) => {
  const rows = entityRows(sql);
  it("14 varlık; tablo, ana tablo, FK, alanlar ve slug birebir", () => {
    expect(rows).toHaveLength(CONTENT_ENTITIES.length);
    for (const e of CONTENT_ENTITIES) {
      expect(rows, e.table).toContainEqual({
        tr: e.table,
        base: e.parentTable,
        fk: e.parentIdColumn,
        fields: e.fields.map((f) => f.name),
        slug: !!e.slugKind,
      });
    }
  });
  it("tek transaction", () => {
    expect(sql.trim().startsWith("BEGIN;")).toBe(true);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
  });
  it("yalnız base modunda uygulanır", () => {
    expect(sql).toMatch(/content_mirror_mode\(\) <> 'base'/);
  });
});

describe("migration 106 — ayna sözleşmesi", () => {
  it("mod fonksiyonunu DEĞİŞTİRMEZ", () => {
    expect(m106).not.toMatch(/FUNCTION public\.content_mirror_mode/);
  });
  it("her yön yalnız kendi modunda çalışır (aynı anda tek yön)", () => {
    const toTr = /FUNCTION public\.trg_content_mirror_base_to_tr\(\)[\s\S]*?\$\$;/.exec(m106)![0];
    const toBase = /FUNCTION public\.trg_content_mirror_tr_to_base\(\)[\s\S]*?\$\$;/.exec(m106)![0];
    expect(toTr).toMatch(/IF public\.content_mirror_mode\(\) <> 'base' THEN\s+RETURN NEW;/);
    expect(toBase).toMatch(/public\.content_mirror_mode\(\) <> 'translations' THEN\s+RETURN NEW;/);
  });
  it("ayna bayrağını açar ve önceki değerine geri döndürür", () => {
    expect((m106.match(/set_config\('app\.content_mirror', 'on', true\)/g) ?? []).length).toBe(2);
    expect((m106.match(/set_config\('app\.content_mirror', COALESCE\(v_prev, ''\), true\)/g) ?? []).length).toBe(2);
  });
  it("tr → ana yönünde slug AYNALANMAZ, NOT NULL ana kolon korunur", () => {
    const toBase = /FUNCTION public\.trg_content_mirror_tr_to_base\(\)[\s\S]*?\$\$;/.exec(m106)![0];
    expect(toBase).not.toMatch(/slug/);
    expect(toBase).toMatch(/COALESCE\(r\.%1\$I, b\.%1\$I\)/);
  });
  it("ana → tr yönünde slug 102 formatına uymuyorsa veya çakışıyorsa NULL", () => {
    expect(m106).toMatch(/v_s !~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/);
    expect(m106).toMatch(/IF v_taken THEN\s+v_s := NULL;/);
  });
  it("trigger'lar: ana tablo AFTER (ayna), çeviri AFTER WHEN tr (ayna), ana tablo BEFORE UPDATE OF (guard)", () => {
    expect(m106).toMatch(/_content_mirror_to_tr', v_events/);
    expect(m106).toMatch(/WHEN \(NEW\.locale = ''tr''\)/);
    expect(m106).toMatch(/BEFORE UPDATE OF %s ON public\.%I FOR EACH ROW '\s+'EXECUTE FUNCTION public\.trg_content_base_guard\(\)/);
  });
  it("şema doğrulaması: ana kolon yoksa veya tip uyumsuzsa DUR", () => {
    expect(m106).toMatch(/ana tablo kolonu yok/);
    expect(m106).toMatch(/tip uyumsuz/);
  });
  it("tr guard: yaşayan ana kaydın tr satırı her iki modda tek başına silinemez", () => {
    const g = /FUNCTION public\.trg_content_tr_guard\(\)[\s\S]*?\$\$;/.exec(m106)![0];
    const delIdx = g.indexOf("IF TG_OP = 'DELETE' THEN");
    const modeIdx = g.indexOf("IF public.content_mirror_mode() = 'translations' THEN");
    expect(delIdx).toBeGreaterThan(0);
    expect(modeIdx).toBeGreaterThan(delIdx);
  });
  it("slug geçmişi: cascade silmede ve ayna bayrağında çeviri trigger'ı geçmiş yazmaz", () => {
    const h = /FUNCTION public\.trg_record_slug_history\(\)[\s\S]*?\$\$;/.exec(m106)![0];
    expect(h).toMatch(/v_mode = 'translation' AND current_setting\('app\.content_mirror', true\) = 'on'/);
    expect(h).toMatch(/IF NOT v_alive THEN\s+RETURN OLD;/);
    expect(h).toMatch(/ON CONFLICT \(entity_kind, locale, old_slug\)/);
  });
  it("url_redirects verisine dokunmaz (yalnız fonksiyon içi DELETE'ler)", () => {
    const outside = m106.replace(/AS \$\$[\s\S]*?\$\$;/g, "");
    expect(outside).not.toMatch(/DELETE FROM public\.url_redirects/);
    expect(outside).not.toMatch(/\bINSERT INTO\b|\bUPDATE public\./);
  });
});

describe("migration 107 — aktarım sözleşmesi", () => {
  it("mevcut tr satırının üzerine yazmaz; ayna bayrağıyla ekler", () => {
    expect(m107).toMatch(/ON CONFLICT \(%2\$I, locale\) DO NOTHING/);
    expect(m107).not.toMatch(/DO UPDATE/);
    expect(m107).toMatch(/set_config\('app\.content_mirror', 'on', true\)/);
  });
  it("güvenli değilse durur: farklı mevcut tr, slug tekrarı, slug çakışması, doğrulama", () => {
    expect(m107).toMatch(/mevcut locale=tr satırı ana kayıttan farklı/);
    expect(m107).toMatch(/tekrarlanan taban slug/);
    expect(m107).toMatch(/tr slug''ıyla çakışıyor/);
    expect(m107).toMatch(/doğrulaması başarısız/);
  });
  it("ana tabloları, EN/DE satırlarını ve url_redirects'i değiştirmez", () => {
    expect(m107).not.toMatch(/\bUPDATE\b/);
    expect(m107).not.toMatch(/\bDELETE\b/);
    expect(m107).not.toMatch(/url_redirects/);
    expect(m107).not.toMatch(/\bDROP\b/);
  });
});
