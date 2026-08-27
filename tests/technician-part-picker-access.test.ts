import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const picker = readFileSync("features/parts/components/PartPicker.tsx", "utf8");
const usePartButton = readFileSync(
  "features/work-orders/components/UsePartButton.tsx",
  "utf8",
);
const pickerRoute = readFileSync("app/api/parts/picker/route.ts", "utf8");
const workOrderDetail = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");
const menuBuilder = readFileSync("app/menu/page.tsx", "utf8");
const menuItemEditor = readFileSync("app/menu/item/[id]/page.tsx", "utf8");

describe("parts-role part picker access", () => {
  it("loads inventory through a server-scoped route", () => {
    expect(picker).toContain("fetch(`/api/parts/picker?");
    expect(picker).toContain('params.set("workOrderLineId", workOrderLineId)');
    expect(picker).not.toContain('.from("parts")');
    expect(usePartButton).toContain("workOrderLineId={workOrderLineId}");
  });

  it("requires the canonical parts capability for inventory actions", () => {
    expect(pickerRoute).toContain('requiredCapability: "canManageParts"');
    expect(pickerRoute).not.toContain('access.canonicalRole === "mechanic"');
    expect(workOrderDetail).toContain(
      "const canUseInventoryPicker = currentActor.canManageParts",
    );
    expect(workOrderDetail).toContain("canUseInventoryPicker");
    expect(workOrderDetail).toContain("? () => setPartsLineId(ln.id)");
  });

  it("preserves read-only catalog lookup for authorized menu editors", () => {
    expect(picker).toContain('accessContext?: "inventory" | "menu-editor"');
    expect(picker).toContain('params.set("context", accessContext)');
    expect(pickerRoute).toContain('pickerContext === "menu-editor"');
    expect(pickerRoute).toContain("allowRoles: MENU_EDITOR_ROLES");
    expect(pickerRoute).toContain(
      "requiredProductCapabilities: SHOP_OR_FIELD_PRODUCT_CAPABILITIES",
    );
    expect(menuBuilder).toContain('accessContext="menu-editor"');
    expect(menuItemEditor).toContain('accessContext="menu-editor"');
  });

  it("keeps every inventory query scoped to the authenticated shop", () => {
    expect(pickerRoute).toContain("createAdminSupabase()");
    expect(pickerRoute).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(pickerRoute).toContain('"Cache-Control": "private, no-store"');
  });
});
