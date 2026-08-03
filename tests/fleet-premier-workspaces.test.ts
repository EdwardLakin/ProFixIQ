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
    expect(workspace).toContain("Live unit summary");
    expect(workspace).toContain("Service & invoices");
    expect(workspace).toContain("Readings & pre-trips");
    expect(workspace).toContain("FleetUnitWorkOrderEvidence");
  });

  it("turns PM due data into an actionable maintenance queue", () => {
    const route = source("app/api/fleet/maintenance/route.ts");
    const workspace = source(
      "features/fleet/components/FleetMaintenanceWorkspace.tsx",
    );

    expect(route).toContain('action === "evaluate"');
    expect(route).toContain('action === "defer"');
    expect(route).toContain("create_fleet_service_request_atomic");
    expect(route).toContain("actorUserId");
    expect(workspace).toContain("Create service request");
    expect(workspace).toContain("Program overview");
    expect(workspace).toContain("Deferral reason");
  });

  it("keeps the service request lifecycle in one shared staff and portal view", () => {
    const route = source("app/api/fleet/service-requests/route.ts");
    const workspace = source(
      "features/fleet/components/FleetServiceRequestsPage.tsx",
    );

    expect(route).toContain("source_fleet_service_request_id");
    expect(route).toContain("needsApproval");
    expect(workspace).toContain("One timeline from fleet request");
    expect(workspace).toContain("Review approval");
    expect(workspace).toContain('routePrefix: "/fleet" | "/portal/fleet"');
  });

  it("supports scoped line approvals and shop-owned invoice checkout", () => {
    const billing = source("app/api/fleet/billing/route.ts");
    const checkout = source("app/api/fleet/billing/checkout/route.ts");
    const workspace = source(
      "features/fleet/components/FleetBillingWorkspace.tsx",
    );

    expect(billing).toContain("apply_customer_quote_decision_atomic");
    expect(billing).toContain("accessibleVehicleContext");
    expect(billing).toContain("p_quote_line_ids");
    expect(checkout).toContain("createConnectedAccountInvoiceCheckout");
    expect(checkout).not.toContain("transfer_data");
    expect(workspace).toContain("Approvals & invoices");
    expect(workspace).toContain("Pay invoice");
  });

  it("builds an actionable AI brief from live fleet facts with a safe fallback", () => {
    const route = source("app/api/fleet/ai-summary/route.ts");
    const summary = source("features/fleet/components/FleetAISummary.tsx");

    expect(route).toContain("openai.responses.create");
    expect(route).toContain("AI fallback used");
    expect(route).toContain("work_order_quote_lines");
    expect(route).toContain("fleet_pm_due_events");
    expect(summary).toContain("live records one click away");
    expect(summary).toContain("point.href");
  });
});
