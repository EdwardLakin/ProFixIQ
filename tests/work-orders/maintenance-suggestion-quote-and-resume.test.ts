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
const resumeValidator = readFileSync(
  "features/work-orders/lib/client/validateMutableWorkOrder.ts",
  "utf8",
);
const canonicalQuoteWriter = readFileSync(
  "features/work-orders/lib/work-orders/canonicalQuoteLines.ts",
  "utf8",
);
const maintenanceIdentityMigration = readFileSync(
  "supabase/migrations/20260914184500_harden_maintenance_quote_identity.sql",
  "utf8",
);
const singleRoute = readFileSync(
  "app/api/work-orders/maintenance-suggestions/add/route.ts",
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
    expect(maintenanceWriter).not.toContain(
      "add_repair_line_from_vehicle_service",
    );
    expect(maintenanceWriter).toContain('.from("menu_items")');
    expect(maintenanceWriter).toContain(
      '.select("id, total_price, base_price, inspection_template_id, service_key")',
    );
    expect(maintenanceWriter).toContain(
      "finiteNonNegative(menuItem?.total_price ?? null)",
    );
  });

  it("seeds mapped menu parts but keeps a blank part row when no recipe is known", () => {
    expect(maintenanceWriter).toContain('.from("menu_item_parts")');
    expect(maintenanceWriter).toContain(
      '.select("menu_item_id, name, quantity, unit_cost")',
    );
    expect(maintenanceWriter).toContain(
      "parts: menuItem?.parts.length ? menuItem.parts : undefined",
    );
    expect(maintenanceWriter).toContain("unitPrice,");
    expect(maintenanceWriter).toContain("ensureMaintenancePartsQuoteRequest({");
    expect(maintenanceWriter).toContain('.from("part_requests")');
    expect(maintenanceWriter).toContain('.eq("quote_line_id", quoteLineId)');
    expect(maintenanceWriter).toContain('status: "requested"');
    expect(maintenanceWriter).toContain("Service to quote: ${input.description}");
    expect(maintenanceWriter).toContain('.from("part_request_items")');
    expect(maintenanceWriter).toContain('description: ""');
    expect(maintenanceWriter).not.toContain("description: `Parts to quote");
    expect(maintenanceWriter).toContain("qty_requested: 1");
    expect(maintenanceWriter).toContain("syncQuoteLinePartsStatus(supabase");
  });

  it("adds a bundle in one canonical batch and surfaces Supabase object errors", () => {
    expect(bundleRoute).toContain("addMaintenanceSuggestionsToWorkOrder({");
    expect(bundleRoute).not.toContain("for (const serviceCode of serviceCodes)");
    expect(bundleRoute).toContain("getMaintenanceSuggestionErrorMessage(");
    expect(maintenanceWriter).toContain("candidate.details");
    expect(maintenanceWriter).toContain("candidate.hint");
    expect(bundleRoute).toContain("userId: access.authUserId");
    expect(singleRoute).toContain("userId: access.authUserId");
  });

  it("enforces atomic maintenance identity and restores menu identity on approval", () => {
    expect(canonicalQuoteWriter).toContain("errorCode: error.code");
    expect(maintenanceWriter).toContain('quoteResult.errorCode !== "23505"');
    expect(maintenanceIdentityMigration).toContain(
      "uq_work_order_quote_lines_maintenance_service",
    );
    expect(maintenanceIdentityMigration).toContain(
      "trg_materialize_maintenance_quote_line_identity",
    );
    expect(maintenanceIdentityMigration).toContain(
      "new.menu_item_id := coalesce",
    );
    expect(maintenanceIdentityMigration).toContain(
      "new.inspection_template_id := coalesce",
    );
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
      label: "draft inspection row",
      input: {
        workOrder: { status: "awaiting" },
        hasInspection: true,
      },
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

  it("loads and hydrates a shop-scoped shell before enabling mutations", () => {
    expect(createPage).toContain('searchParams.get("resumeWorkOrderId")');
    expect(createPage).toContain("requireResumableCreateWorkOrder({");
    expect(resumeValidator).toContain('.eq("shop_id", input.shopId)');
    expect(resumeValidator).toContain('.from("work_order_line_technicians")');
    expect(resumeValidator).toContain('.from("inspections")');
    expect(resumeValidator).toContain('.is("voided_at", null)');
    expect(createPage).toContain("setCustomer(hydratedCustomer)");
    expect(createPage).toContain("setVehicle(hydratedVehicle)");
    expect(createPage.indexOf("setCustomer(hydratedCustomer)")).toBeLessThan(
      createPage.indexOf("setValidatedWorkOrderId(persisted.id)"),
    );
    expect(createPage).toContain("notes: strOrNull(notes)");
    expect(createPage).toContain("priority,");
    expect(createPage).toContain("Start a clean work order");
  });

  it("ignores voided lines when deciding whether setup can resume", () => {
    expect(
      canResumeWorkOrderCreation({
        workOrder: { status: "awaiting" },
        lines: [
          {
            status: "in_progress",
            line_status: "in_progress",
            assigned_tech_id: "old-tech",
            voided_at: "2026-09-14T10:00:00Z",
          },
        ],
      }),
    ).toBe(true);
  });

  it("offers continuation from the work-order list with the server-side guard authoritative", () => {
    expect(workOrderList).toContain("const canContinueSetup =");
    expect(workOrderList).toContain("!row.inspection_id");
    expect(workOrderList).toContain("!hasInspectionByWo[row.id]");
    expect(workOrderList).toContain("resumeInspectionLookupReady");
    expect(workOrderList).toContain("!hasAssignedTech");
    expect(workOrderList).toContain("Continue setup");
    expect(workOrderList).toContain(
      "/work-orders/create?resumeWorkOrderId=",
    );
  });
});
