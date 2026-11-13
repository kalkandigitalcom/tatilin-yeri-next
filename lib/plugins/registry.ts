/* ===============================================================
   🧩 EKLENTİ KAYDI (client-safe, saf veri)
   ===============================================================
   Admin "Eklentiler" sayfasında listelenen eklentiler. Yeni bir eklenti
   eklemek için buraya bir kayıt + `app/(admin)/maki-admin/eklentiler/<key>`
   sayfası yeterlidir. İzin modeli değişmez: bütün eklentiler tek
   `plugins` anahtarıyla korunur (lib/auth/admin-permission-map.ts).
   Bu dosya sunucu kodu / gizli bilgi İÇERMEZ.
=============================================================== */

export type PluginManifest = {
  /** URL parçası ve teknik anahtar (değişmez). */
  key: string;
  name: string;
  description: string;
  /** Admin sayfası. */
  href: string;
};

export const PLUGINS: readonly PluginManifest[] = [
  {
    key: "kiraligim",
    name: "Kiraligim",
    description:
      "Merkezi Kiraligim takviminden villa dolulukları: villa eşleştirme, ilk senkron, değişiklik akışı ve imzalı webhook.",
    href: "/maki-admin/eklentiler/kiraligim",
  },
];

export function findPlugin(key: string): PluginManifest | null {
  return PLUGINS.find((p) => p.key === key) ?? null;
}
