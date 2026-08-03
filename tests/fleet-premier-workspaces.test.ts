import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("premier fleet workspaces", () => {
  it("keeps staff and portal navigation to the same five destinations", () => {
    const staffNav = source("features/fleet/components/FleetWorkspaceNav.tsx");
    const portalNav = source("app/portal/fleet/FleetShell.tsx");

    for (const label of ["Overview", "Units", "Maintenance", "Requests", "Billing"]) {
      expect(staffNav).toContain(label);
      expect(portalNav).toContain(label);
    }
    expect(staffNav.match(/label:/g)).toHaveLength(5);
    expect(portalNav.match(/label:/g)).toHaveLength(5);
  });

  it("provides one complete record for each fleet unit", () => {
    const route = source("app/api/fleet/units/[unitId]/workspace/route.ts");
    const workspace = source(
      "features/fleet/components/FleetUnitDetailWorkspace.tsx",
    );

    for (const table of [
      "fleet_unit_readings",
      "fleet_pm_policies",
      "fleet_pm_due_events",
      "fleet_service_requests",
      "fleet_pretrip_reports",
      "work_orders",
      "work_order_quote_lines",
      "invoice_versions",
    ]) {
      expect(route).toContain(`.from("${table}")`);
    }
    expect(route).toContain("loadLifetimeWorkOrderMetrics");
    expect(route).toContain(".range(offset, offset + pageSize - 1)");
    expect(workspace).toContain("Live unit summary");
    expect(workspace).toContain("Service & invoices");
    expect(workspace).toContain("Readings & pre-trips");
    expect(workspace).toContain("FleetUnitWorkOrderEvidence");
  });

  it("turns PM due data into a target-authorized maintenance queue", () => {
    const route = source("app/api/fleet/maintenance/route.ts");
    const workspace = source(
      "features/fleet/components/FleetMaintenanceWorkspace.tsx",
    );

    expect(route).toContain('action === "evaluate"');
    expect(route).toContain('action === "defer"');
    expect(route).toContain("canManageFleetForActor");
    expect(route).toContain("targetFleetIds.map");
    expect(route).toContain('.in("status", ["pending", "deferred"])');
    expect(route).toContain("source_pm_due_event_id: dueEventId");
    expect(route).toContain("create_fleet_service_request_atomic");
    expect(workspace).toContain('fleetId: fleetId === "all" ? null : fleetId');
    expect(workspace).toContain("Create request");
    expect(workspace).toContain("PM programs");
    expect(workspace).toContain("Confirm deferral");
  });

  it("keeps the service request lifecycle tied to sent estimate facts", () => {
    const route = source("app/api/fleet/service-requests/route.ts");
    const workspace = source(
      "features/fleet/components/FleetServiceRequestsPage.tsx",
    );

    expect(route).toContain("source_fleet_service_request_id");
    expect(route).toContain("pendingApprovalsByWorkOrder");
    expect(route).toContain("sent_to_customer_at");
    expect(workspace).toContain("TERMINAL_REQUEST_STATUSES");
    expect(workspace).toContain("One timeline from fleet request");
    expect(workspace).toContain("Review approval");
  });

  it("protects financial data and records decisions through canonical flows", () => {
    const actor = source("features/fleet/lib/resolveFleetActorContext.ts");
    const billing = source("app/api/fleet/billing/route.ts");
    const checkout = source("app/api/fleet/billing/checkout/route.ts");
    const workspace = source(
      "features/fleet/components/FleetBillingWorkspace.tsx",
    );

    expect(actor).toContain("fleetMemberships");
    expect(actor).toContain("canManageFleetForActor");
    expect(billing).toContain("Fleet billing access required");
    expect(billing).toContain("apply_shop_quote_decision_atomic");
    expect(billing).toContain("apply_customer_quote_decision_atomic");
    expect(billing).toContain('"issued", "partially_paid", "paid"');
    expect(billing).toContain("byCurrency");
    expect(checkout).toContain("manageableFleetIdsForActor");
    expect(checkout).toContain("createConnectedAccountInvoiceCheckout");
    expect(checkout).not.toContain("transfer_data");
    expect(workspace).toContain("Decision note");
    expect(workspace).toContain("initialWorkOrderId");
    expect(workspace).toContain("Pay invoice");
  });

  it("derives unit tenant scope from the authenticated actor", () => {
    const route = source("app/api/fleet/units/route.ts");
    const units = source("features/fleet/components/FleetUnitsPage.tsx");

    expect(route).toContain("resolveFleetActorScope(actor)");
    expect(route).not.toContain("explicitShopId");
    expect(units).not.toContain("shopId");
  });

  it("uses the governed AI provider boundary with a deterministic fallback", () => {
    const route = source("app/api/fleet/ai-summary/route.ts");
    const policy = source("features/shared/lib/server/ai-policy.ts");
    const summary = source("features/fleet/components/FleetAISummary.tsx");

    expect(route).toContain("getOpenAIClient");
    expect(route).toContain("getOpenAIModelForPurpose");
    expect(route).toContain("recordAITelemetry");
    expect(route).toContain("enforceAIOperationalPolicy");
    expect(route).not.toContain('from "openai"');
    expect(route).not.toContain("OPENAI_FLEET_SUMMARY_MODEL");
    expect(policy).toContain("fleet_operations_summary");
    expect(summary).toContain("live records one click away");
    expect(summary).toContain("point.href");
  });

  it("keeps legacy unit links and pre-trip history one click from canonical units", () => {
    const legacy = source("app/fleet/assets/[id]/page.tsx");
    const units = source("features/fleet/components/FleetUnitsPage.tsx");
    const dispatch = source("features/fleet/components/FleetDispatchBoard.tsx");

    expect(legacy).toContain("redirect");
    expect(legacy).toContain("/fleet/units/");
    expect(units).toContain("Fleet-wide pre-trip history");
    expect(dispatch).not.toContain("/fleet/assets/");
  });
});
