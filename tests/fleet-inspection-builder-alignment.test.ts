import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("Fleet inspection builder alignment", () => {
  it("builds Fleet PM sections through the canonical Shop selection helper", () => {
    const builder = source(
      "features/fleet/components/FleetMaintenanceInspectionBuilder.tsx",
    );
    const canonicalBuilder = source(
      "features/inspections/lib/inspection/buildFromSelections.ts",
    );

    expect(builder).toContain("buildInspectionFromSelections");
    expect(builder).toContain("sections = buildInspectionFromSelections");
    expect(canonicalBuilder).toContain('status: (args.status ?? "na")');
    expect(canonicalBuilder).toContain('notes: args.notes ?? ""');
    expect(canonicalBuilder).toContain("value: args.value ?? null");
    expect(canonicalBuilder).toContain("masterInspectionList");
  });

  it("keeps both Fleet builders on the Shop master inspection list", () => {
    const pretrip = source(
      "features/fleet/components/FleetPretripTemplateBuilder.tsx",
    );
    const maintenance = source(
      "features/fleet/components/FleetMaintenanceInspectionBuilder.tsx",
    );

    expect(pretrip).toContain("masterInspectionList");
    expect(pretrip).toContain("Add canonical inspection points");
    expect(maintenance).toContain("masterInspectionList");
    expect(maintenance).toContain("buildInspectionFromSelections");
  });

  it("keeps Fleet maintenance templates administrative and work-order free", () => {
    const route = source("app/api/fleet/inspection-templates/route.ts");
    const builder = source(
      "features/fleet/components/FleetInspectionTemplateBuilder.tsx",
    );
    const shopConverter = source(
      "app/api/fleet/service-requests/convert-to-work-order/route.ts",
    );

    expect(route).toContain("canAdministerFleetForActor");
    expect(route).toContain('"fleet-maintenance"');
    expect(route).not.toContain('.from("work_orders")');
    expect(route).not.toContain("convert_owned_fleet_service_request_to_work_order_atomic");

    expect(builder).toContain("work-order capabilities");
    expect(builder).toContain("A subscribed Shop accepts the");
    expect(builder).toContain("request before technicians run it");

    expect(shopConverter).toContain(
      '"Work orders are created in ProFixIQ Shop."',
    );
    expect(shopConverter).toContain("isFleetProductHostname");
  });

  it("routes the Fleet inspection page through the purpose-aware builder", () => {
    const page = source("app/portal/fleet/inspection-templates/page.tsx");
    expect(page).toContain("FleetInspectionTemplateBuilder");
    expect(page).toContain("canManagePretripTemplates");
    expect(page).toContain("canAdministerFleetForActor");
  });
});
