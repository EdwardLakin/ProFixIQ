import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canResumeWorkOrderCreation,
  getCreateResumeBlocker,
} from "../../features/work-orders/lib/resumableCreateWorkOrder";

const maintenanceWriter = readFileSync(
  "features/maintenance/server/addMaintenanceSuggestionToWorkOrder.ts",
  "utf8",
);
const bundleRoute = readFileSync(
  "app/api/work-orders/maintenance-suggestions/add-bundle/route.ts",
  "utf8",
);
const createPage = readFileSync(
  "features/work-orders/app/work-orders/create/page.tsx",
  "utf8",
);
const workOrderList = readFileSync(
  "features/work-orders/app/work-orders/view/page.tsx",
  "utf8",
);

describe("maintenance suggestion quote contract", () => {
  it("uses the current suggestion schema and canonical quote-line writer", () => {
    expect(maintenanceWriter).toContain('.select("suggestions")');
    expect(maintenanceWriter).not.toContain('.select("id, suggestions")');
    expect(maintenanceWriter).toContain("createCanonicalQuoteLines({");
    expect(maintenanceWriter).toContain('source: "maintenance_suggestion"');
    expect(maintenanceWriter).toContain(
      "findingIdentity: `maintenance_suggestion:${serviceCode}`",
    );
    expect(maintenanceWriter).not.toContain('.from("work_order_lines")');
    expect(maintenanceWriter).not.toContain(
      "add_repair_line_from_vehicle_service",
    );
  });

  it("adds a bundle in one canonical batch and surfaces Supabase object errors", () => {
    expect(bundleRoute).toContain("addMaintenanceSuggestionsToWorkOrder({");
    expect(bundleRoute).not.toContain("for (const serviceCode of serviceCodes)");
    expect(bundleRoute).toContain("getMaintenanceSuggestionErrorMessage(");
    expect(maintenanceWriter).toContain("candidate.details");
    expect(maintenanceWriter).toContain("candidate.hint");
  });
});

describe("abandoned work-order creation recovery", () => {
  it("allows only untouched or setup-only awaiting work orders", () => {
    expect(
      canResumeWorkOrderCreation({
        workOrder: { status: "awaiting" },
        lines: [
          { status: "awaiting", line_status: "pending" },
          { status: "deferred", line_status: "deferred" },
        ],
      }),
    ).toBe(true);
  });

  it.each([
    {
      label: "archived",
      input: { workOrder: { status: "awaiting", archived_at: "2026-09-14" } },
    },
    {
      label: "inspection started",
      input: { workOrder: { status: "awaiting", inspection_id: "inspection-1" } },
    },
    {
      label: "assigned",
      input: {
        workOrder: { status: "awaiting" },
        lines: [{ assigned_tech_id: "tech-1" }],
      },
    },
    {
      label: "bridge assigned",
      input: {
        workOrder: { status: "awaiting" },
        hasBridgeAssignment: true,
      },
    },
    {
      label: "punched",
      input: {
        workOrder: { status: "awaiting" },
        lines: [{ punched_in_at: "2026-09-14T10:00:00Z" }],
      },
    },
    {
      label: "work progressed",
      input: {
        workOrder: { status: "awaiting" },
        lines: [{ status: "in_progress", line_status: "in_progress" }],
      },
    },
    {
      label: "closed lifecycle",
      input: { workOrder: { status: "completed" } },
    },
  ])("blocks $label work orders", ({ input }) => {
    expect(getCreateResumeBlocker(input)).not.toBeNull();
  });

  it("loads a shop-scoped shell and checks canonical technician assignments", () => {
    expect(createPage).toContain('searchParams.get("resumeWorkOrderId")');
    expect(createPage).toContain('.eq("shop_id", shopId)');
    expect(createPage).toContain('.from("work_order_line_technicians")');
    expect(createPage).toContain("getCreateResumeBlocker({");
    expect(createPage).toContain("setLines(candidateLines)");
    expect(createPage).toContain("setPrefillCustomerId(persisted.customer_id");
    expect(createPage).toContain("setPrefillVehicleId(persisted.vehicle_id");
  });

  it("offers continuation from the work-order list with the server-side guard authoritative", () => {
    expect(workOrderList).toContain("const canContinueSetup =");
    expect(workOrderList).toContain("!row.inspection_id");
    expect(workOrderList).toContain("!hasAssignedTech");
    expect(workOrderList).toContain("Continue setup");
    expect(workOrderList).toContain(
      "/work-orders/create?resumeWorkOrderId=",
    );
  });
});
