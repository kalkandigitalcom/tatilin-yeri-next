"use client";

/* ===============================================================
   🛡️ MENÜ ADI ÇEVİRİ PANELİ (migration 086)
   ===============================================================
   `app/(admin)/maki-admin/types/TypeTranslationsPanel.tsx` ile AYNI
   desen ve AYNI tasarım dili (card-premium + `input` class + uppercase
   label). TR bu panelden DÜZENLENEMEZ — yalnız referans olarak
   gösterilir (TR canonical `menu.name`, mevcut CRUD'dan yönetilir).

   TEK FARK — İKİ ALAN AYNI ANDA: villa tipi panelinde EN/DE pill-tab
   ile TEK input gösterilir; menüde talep edilen yerleşim iki alanı da
   aynı anda gösterir (Menü Adı / English / Deutsch). Her ikisi de tek
   "Kaydet" ile yazılır.

   ⚠️ Boş bırakılabilir: boş/whitespace değer çeviriyi TEMİZLER ve
   public tarafta TR adına düşer (bkz. menu-translation.service.ts).
   ⚠️ href / kaynak / sıralama / parent-child bu panelden ETKİLENMEZ.
   =============================================================== */

import { useEffect, useState } from "react";
import { Loader2, Languages } from "lucide-react";

import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  loadMenuTranslationsAction,
  saveMenuTranslationAction,
} from "./menu-translations.action";
/* 🛡️ Menü adı çevirisi public Header'da okunuyor → TR adı
   değiştirildiğinde çağrılan AYNI invalidation (`revalidateMenu`).
   Yeni bir cache/invalidation mekanizması İCAT EDİLMEDİ. */
import { revalidateMenu } from "@/app/services/revalidate.actions";
import type { Locale } from "@/lib/i18n/config";
import { ADMIN_LOCALE_LABELS, type AdminLocaleLayout } from "@/lib/i18n/content/content-admin";

/* 🌐 Faz 5 — diller ANA DİLE göre kurulur (ana dil TR → EN, DE;
   ana dil EN → TR, DE; ana dil DE → TR, EN). Ana dil adı ana formda
   (menü satırı) düzenlenir, burada referanstır. */
type WritableLocale = Locale;

export const MENU_LOCALE_LABELS: Record<Locale, string> = ADMIN_LOCALE_LABELS;

const DEFAULT_LAYOUT: AdminLocaleLayout = {
  root: "tr",
  translations: ["en", "de"],
  enabled: ["tr", "en", "de"],
  multilingual: true,
};

/** Panel + "Menü ekle" formu AYNI sınırı kullanır (DB kolonu `text`;
 *  bu yalnız UI/UX koruması — mevcut `name` alanıyla tutarlı). */
export const MENU_TRANSLATION_MAX_LEN = 200;

type Props = {
  menuId: string;
  /** TR referans metni — bu panelden DÜZENLENEMEZ, yalnız gösterilir. */
  menuName: string;
};

export default function MenuTranslationsPanel({ menuId, menuName }: Props) {
  const toast = useNotify();

  const [layout, setLayout] = useState<AdminLocaleLayout>(DEFAULT_LAYOUT);
  const [forms, setForms] = useState<Partial<Record<WritableLocale, string>>>({
    en: "",
    de: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const result = await loadMenuTranslationsAction(menuId);
      if (cancelled) return;

      if (!result.ok) {
        toast.error("Çeviriler yüklenemedi", {
          id: `menu-translations-load-${menuId}`,
          description: result.error,
        });
        setLoading(false);
        return;
      }

      const lay = result.layout ?? DEFAULT_LAYOUT;
      const next: Partial<Record<WritableLocale, string>> = {};
      for (const l of lay.translations) next[l] = "";
      for (const row of result.rows) {
        const l = row.locale as Locale;
        if (!lay.translations.includes(l)) continue;
        next[l] = typeof row.name === "string" ? row.name : "";
      }
      setLayout(lay);
      setForms(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId]);

  async function handleSave() {
    setSaving(true);
    try {
      /* İki locale AYRI upsert (UNIQUE(menu_id, locale)); sıralı —
         tek bir hata bile kullanıcıya bildirilir. */
      for (const locale of layout.translations) {
        const result = await saveMenuTranslationAction({
          menuId,
          locale,
          name: forms[locale] ?? "",
        });
        if (!result.ok) {
          toast.error("Kaydedilemedi", {
            id: `menu-translations-save-${menuId}`,
            description: result.error,
          });
          return;
        }
      }

      toast.success("Menü çevirileri kaydedildi", {
        id: `menu-translations-save-${menuId}`,
      });
      revalidateMenu().catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)]/50 p-4 space-y-4">
      <div className="flex items-center gap-1.5">
        <Languages size={13} className="text-[var(--color-champagne-700)]" />
        <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)]">
          Menü adı çevirileri
        </p>
      </div>

      <div>
        <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-400)]">
          Menü Adı ({ADMIN_LOCALE_LABELS[layout.root]} — referans)
        </p>
        <p className="text-sm text-[var(--color-stone-600)] mt-1">{menuName}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-stone-500)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Yükleniyor…
        </div>
      ) : (
        <div className="space-y-4">
          {layout.translations.map(
            (locale) => (
              <div key={locale} className="space-y-1.5">
                <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
                  {MENU_LOCALE_LABELS[locale]}
                  {!(forms[locale] ?? "").trim() && (
                    <span className="ml-2 normal-case tracking-normal font-normal text-amber-700">
                      (çeviri eksik)
                    </span>
                  )}
                </label>
                <input
                  aria-label={MENU_LOCALE_LABELS[locale]}
                  className="input"
                  maxLength={MENU_TRANSLATION_MAX_LEN}
                  value={forms[locale] ?? ""}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [locale]: e.target.value,
                    }))
                  }
                />
              </div>
            )
          )}

          <p className="text-xs text-[var(--color-stone-400)]">
            Boş bırakılan dilde ana dildeki ({ADMIN_LOCALE_LABELS[layout.root]}) menü adı
            gösterilir. Bağlantı adresi çevrilmez.
          </p>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-white transition disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Kaydediliyor…
              </span>
            ) : (
              "Çevirileri kaydet"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
