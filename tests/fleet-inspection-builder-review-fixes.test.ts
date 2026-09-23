import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  fleetInspectionTemplateTag,
  isInspectionTemplateAvailableToFleet,
} from "../features/fleet/lib/fleetInspectionTemplateScope";

const ROOT = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("Fleet inspection builder review repairs", () => {
  it("keeps Shop-wide templates visible but isolates Fleet-authored templates", () => {
    const fleetA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const fleetB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    expect(isInspectionTemplateAvailableToFleet(["cvip"], fleetB)).toBe(true);
    expect(
      isInspectionTemplateAvailableToFleet(
        ["fleet-maintenance", fleetInspectionTemplateTag(fleetA)],
        fleetA,
      ),
    ).toBe(true);
    expect(
      isInspectionTemplateAvailableToFleet(
        ["fleet-maintenance", fleetInspectionTemplateTag(fleetA)],
        fleetB,
      ),
    ).toBe(false);
  });

  it("enforces Fleet template scope in catalog and submit routes", () => {
    const context = source("app/api/fleet/request-builder/context/route.ts");
    const submit = source("app/api/fleet/request-builder/submit/route.ts");

    expect(context).toContain("isInspectionTemplateAvailableToFleet");
    expect(context).toContain("while (inspections.length < 250)");
    expect(context).toContain(".range(");
    expect(submit).toContain("isInspectionTemplateAvailableToFleet");
  });

  it("uses canonical Shop vehicle types for Fleet PM templates", () => {
    const builder = source(
      "features/fleet/components/FleetMaintenanceInspectionBuilder.tsx",
    );

    expect(builder).toContain('{ value: "truck"');
    expect(builder).toContain('{ value: "trailer"');
    expect(builder).toContain('{ value: "bus"');
    expect(builder).toContain('{ value: "car"');
    expect(builder).not.toContain('"All fleet assets"');
    expect(builder).not.toContain('useState("Highway tractor")');
    const route = source("app/api/fleet/inspection-templates/route.ts");
    expect(route).toContain("canonicalVehicleType");
    expect(route).toContain('"highway tractor": "truck"');
    expect(route).toContain("LEGACY_VEHICLE_TYPE_ALIASES[normalized] ?? trimmed");
  });

  it("retains one PM template id until a definitive publish success", () => {
    const builder = source(
      "features/fleet/components/FleetMaintenanceInspectionBuilder.tsx",
    );
    const route = source("app/api/fleet/inspection-templates/route.ts");

    expect(builder).toContain(
      "const [templateId, setTemplateId] = useState(() => crypto.randomUUID())",
    );
    expect(builder).toContain("templateId,");
    expect(builder).toContain("setTemplateId(crypto.randomUUID())");
    expect(route).toContain("samePayload");
    expect(route).toContain("stableJson(existing.sections)");
    expect(route).toContain('error.code === "23505"');
    expect(route).toContain("readPublishedTemplate");
    expect(route).toContain("already published with different content");
  });

  it("keeps both purpose builders mounted so tab switches preserve drafts", () => {
    const builder = source(
      "features/fleet/components/FleetInspectionTemplateBuilder.tsx",
    );

    expect(builder).toContain('hidden={purpose !== "pretrip"}');
    expect(builder).toContain('hidden={purpose !== "maintenance"}');
    expect(builder).not.toContain('purpose === "pretrip" ?');
  });

  it("explains and enforces the 200-item limit before publish", () => {
    const pmBuilder = source(
      "features/fleet/components/FleetMaintenanceInspectionBuilder.tsx",
    );
    const pretripBuilder = source(
      "features/fleet/components/FleetPretripTemplateBuilder.tsx",
    );
    const pmRoute = source("app/api/fleet/inspection-templates/route.ts");
    const pretripRoute = source("app/api/fleet/pretrip/templates/route.ts");

    expect(pmBuilder).toContain("MAX_TEMPLATE_ITEMS = 200");
    expect(pmBuilder).toContain("/ {MAX_TEMPLATE_ITEMS} items selected");
    expect(pretripBuilder).toContain("MAX_TEMPLATE_ITEMS = 200");
    expect(pretripBuilder).toContain("Limit reached");
    expect(pmRoute).toContain("Inspection templates support up to");
    expect(pretripRoute).toContain("Pre-trip templates support up to 200 items");
  });
});
