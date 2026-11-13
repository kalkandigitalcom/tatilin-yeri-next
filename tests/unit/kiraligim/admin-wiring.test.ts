import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { adminSectionForPath, ADMIN_SECTIONS } from "@/lib/auth/admin-permission-map";
import { PLUGINS } from "@/lib/plugins/registry";
import { SIDEBAR_PERMISSIONS } from "@/app/services/admin-user.service";

describe("Eklentiler menüsü ve izin", () => {
  it("/maki-admin/eklentiler/** → 'plugins' izni", () => {
    expect(adminSectionForPath("/maki-admin/eklentiler")?.need).toBe("plugins");
    expect(adminSectionForPath("/maki-admin/eklentiler/kiraligim")?.need).toBe("plugins");
    expect(ADMIN_SECTIONS.filter((s) => s.need === "plugins")).toHaveLength(1);
  });
  it("'plugins' kullanıcı izin listesinde (Users sayfası) tanımlı", () => {
    expect(SIDEBAR_PERMISSIONS.find((p) => p.key === "plugins")).toMatchObject({ group: "Eklentiler" });
  });
  it("kayıtlı her eklenti /maki-admin/eklentiler altında", () => {
    expect(PLUGINS.map((p) => p.key)).toContain("kiraligim");
    for (const p of PLUGINS) expect(p.href.startsWith("/maki-admin/eklentiler/")).toBe(true);
  });
  it("eklenti istemci sayfası gizli bilgi/ortam değişkeni okumaz", () => {
    const src = readFileSync("app/(admin)/maki-admin/eklentiler/kiraligim/page.tsx", "utf8");
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/webhook_secret_enc|secret_enc|KIRALIGIM_API_KEY\s*[=:]/);
    expect(src).not.toMatch(/from "@\/lib\/plugins\/kiraligim\/(store|sync|webhook|config|crypto)\.server"(?!;?\s*$)/m);
  });
  it("server action'lar 'plugins' izniyle korunur", () => {
    const src = readFileSync("app/(admin)/maki-admin/eklentiler/kiraligim/kiraligim.action.ts", "utf8");
    const exported = src.match(/export async function \w+/g) ?? [];
    const guarded = src.match(/await requirePermission\("plugins"\);/g) ?? [];
    expect(exported.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(exported.length);
  });
});
