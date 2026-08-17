import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const picker = readFileSync(
  "features/parts/components/PartPicker.tsx",
  "utf8",
);
const usePartButton = readFileSync(
  "features/work-orders/components/UsePartButton.tsx",
  "utf8",
);
const pickerRoute = readFileSync("app/api/parts/picker/route.ts", "utf8");
const workOrderDetail = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");

describe("parts-role part picker access", () => {
  it("loads inventory through a server-scoped route", () => {
    expect(picker).toContain("fetch(`/api/parts/picker?");
    expect(picker).toContain('params.set("workOrderLineId", workOrderLineId)');
    expect(picker).not.toContain('.from("parts")');
    expect(usePartButton).toContain(
      "workOrderLineId={workOrderLineId}",
    );
  });

  it("requires the canonical parts capability in both UI and API", () => {
    expect(pickerRoute).toContain('requiredCapability: "canManageParts"');
    expect(pickerRoute).not.toContain('access.canonicalRole === "mechanic"');
    expect(workOrderDetail).toContain(
      "const canUseInventoryPicker = currentActor.canManageParts",
    );
    expect(workOrderDetail).toContain("canUseInventoryPicker");
    expect(workOrderDetail).toContain("? () => setPartsLineId(ln.id)");
  });

  it("keeps every inventory query scoped to the authenticated shop", () => {
    expect(pickerRoute).toContain("createAdminSupabase()");
    expect(pickerRoute).toContain(
      '.eq("shop_id", access.profile.shop_id)',
    );
    expect(pickerRoute).toContain('"Cache-Control": "private, no-store"');
  });
});
