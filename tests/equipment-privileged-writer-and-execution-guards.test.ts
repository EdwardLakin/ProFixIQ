import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Equipment guard on every privileged template writer", () => {
  it.each([
    ["app/api/fleet/inspection-templates/route.ts", ".insert(insert)"],
    ["app/api/optimization/apply/route.ts", ".update({"],
  ])("%s checks entitlement before persisting", (path, write) => {
    const source = read(path);
    const guard = source.indexOf("shopCanMutateInspectionSections(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(source.indexOf(write, guard));
    expect(source).toContain("status: 403");
    expect(source).toContain("status: 503");
  });
});

describe("Equipment gate on inspection execution entry points", () => {
  it.each([
    "features/inspections/app/inspection/fill/page.tsx",
    "app/mobile/inspections/[id]/page.tsx",
    "app/inspections/genericInspection/page.tsx",
  ])("%s mounts the runner behind EquipmentExecutionGate", (path) => {
    const source = read(path);
    expect(source).toMatch(
      /<EquipmentExecutionGate>\s*<GenericInspectionScreen \/>\s*<\/EquipmentExecutionGate>/,
    );
  });

  it("fails closed with a retry when verification errors", () => {
    const source = read("features/equipment/components/EquipmentExecutionGate.tsx");
    expect(source).toContain("/api/equipment/entitlement");
    expect(source).toContain("Retry verification");
    expect(source).toContain('payload.enabled === true ? "allowed" : "denied"');
  });
});

describe("Editable draft entitlement verification", () => {
  it("separates verification failure from valid denial and offers retry", () => {
    const source = read("features/inspections/app/inspection/custom-draft/page.tsx");
    expect(source).toContain("setEquipmentEntitlementError(true)");
    expect(source).toContain("Retry verification");
    expect(source).not.toContain("if (!response.ok) return { enabled: false }");
  });
});
