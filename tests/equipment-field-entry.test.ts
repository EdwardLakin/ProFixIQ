import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  EQUIPMENT_FIELD_ENTRY_LINKS,
  EQUIPMENT_FIELD_ENTRY_ROLES,
} from "@/features/equipment/lib/equipmentFieldEntry";

describe("Equipment field entry", () => {
  it("lets technicians in alongside the directory roles, and nobody else", () => {
    expect(EQUIPMENT_FIELD_ENTRY_ROLES).toContain("mechanic");
    expect(EQUIPMENT_FIELD_ENTRY_ROLES).toContain("owner");
    for (const role of ["customer", "driver", "fleet_manager", "dispatcher", "unknown"]) {
      expect(EQUIPMENT_FIELD_ENTRY_ROLES as readonly string[]).not.toContain(role);
    }
  });

  it("hands off only to existing canonical mobile surfaces", () => {
    for (const link of EQUIPMENT_FIELD_ENTRY_LINKS) {
      expect(link.href.startsWith("/mobile/service/")).toBe(true);
      expect(existsSync(`app${link.href}/page.tsx`)).toBe(true);
    }
  });

  it("authenticates, checks entitlement, and reads no business data", () => {
    const page = readFileSync("app/equipment/field/page.tsx", "utf8");
    expect(page).toContain("requireShopPageAccess");
    expect(page).toContain("EQUIPMENT_FIELD_ENTRY_ROLES");
    expect(page).toContain("resolveEquipmentPageEntitlement");
    // Links only appear once the canonical Field access check passes.
    expect(page).toContain("getMobileFieldServiceAccess");
    expect(page).toContain("equipmentFieldEntryState");
    expect(page).not.toContain("createAdminSupabase");
    expect(page).not.toMatch(/\.(from|rpc)\(/);
  });
});
