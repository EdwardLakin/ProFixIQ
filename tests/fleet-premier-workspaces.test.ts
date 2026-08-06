import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("premier fleet workspaces", () => {
  it("gives ProFixIQ Fleet a complete fleet-owned navigation model", () => {
    const fleetShell = source(
      "features/fleet/components/FleetProductShell.tsx",
    );

    for (const label of [
      "Control Tower",
      "Assets",
      "Drivers",
      "Pre-trips & Defects",
      "PM & Maintenance",
      "Maintenance Calendar",
      "Requests & Approvals",
      "History & Costs",
      "Reports",
      "Fleet Settings",
    ]) {
      expect(fleetShell).toContain(label);
    }
    expect(fleetShell).toContain("ThemeToggleButton");
    expect(fleetShell).toContain('experience !== "external_driver"');
    expect(fleetShell).toContain("ProFixIQ");
    expect(fleetShell).toContain("Fleet");
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
    expect(workspace).toContain("Plan request");
    expect(workspace).toContain("PM programs");
    expect(workspace).toContain("Confirm deferral");
  });

  it("keeps the service request lifecycle tied to sent estimate facts", () => {
    const route = source("app/api/fleet/service-requests/route.ts");
    const builder = source("app/portal/fleet/request/build/page.tsx");
    const workspace = source(
      "features/fleet/components/FleetServiceRequestsPage.tsx",
    );

    expect(route).toContain("source_fleet_service_request_id");
    expect(route).toContain("pendingApprovalsByWorkOrder");
    expect(route).toContain("sent_to_customer_at");
    expect(workspace).toContain("TERMINAL_REQUEST_STATUSES");
    expect(workspace).toContain("One timeline from fleet request");
    expect(workspace).toContain("Review approval");
    expect(workspace).toContain("Submitted {dateLabel(item.createdAt)}");
    expect(workspace).toContain("dateLabel(item.requestedForDate)");
    expect(workspace).toContain(
      "const dateOnly = /^(\\d{4})-(\\d{2})-(\\d{2})$/",
    );
    expect(builder).toContain(
      "onInput={(event) => setRequestedForDate(event.currentTarget.value)}",
    );
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
    expect(billing).toContain("applyWorkOrderQuoteLineDecision");
    expect(billing).toContain(
      'decisionSource: actor.isInternal ? "shop" : "customer"',
    );
    expect(billing).not.toContain("apply_customer_quote_decision_atomic");
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
    expect(route).toContain('actor.actorType === "fleet_driver"');
    expect(route).toContain('["requests", "units"].includes(point.id)');
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

  it("ships real driver operations and fleet intelligence instead of placeholders", () => {
    const driversPage = source("app/portal/fleet/drivers/page.tsx");
    const drivers = source(
      "features/fleet/components/FleetDriversWorkspace.tsx",
    );
    const reportsPage = source("app/portal/fleet/reports/page.tsx");
    const reports = source(
      "features/fleet/components/FleetReportsWorkspace.tsx",
    );

    expect(driversPage).toContain("FleetDriversWorkspace");
    expect(driversPage).toContain("FleetPortalAccessManager");
    expect(driversPage).not.toContain("FleetModuleFoundation");
    expect(drivers).toContain('fetch("/api/fleet/enrollment"');
    expect(drivers).toContain("Drivers & assignments");
    expect(drivers).toContain("Invite driver");
    expect(drivers).toContain("/assets/new");

    expect(reportsPage).toContain("FleetReportsWorkspace");
    expect(reportsPage).not.toContain("FleetModuleFoundation");
    for (const endpoint of [
      "/api/fleet/maintenance",
      "/api/fleet/unit-economics",
      "/api/fleet/billing",
      "/api/fleet/tower",
      "/api/fleet/pretrip",
    ]) {
      expect(reports).toContain(endpoint);
    }
    expect(reports).toContain("Export CSV");
    expect(reports).toContain("Asset cost and maintenance performance");
  });

  it("keeps product-domain actions on clean public Fleet routes", () => {
    const issues = source("features/fleet/components/FleetIssueTables.tsx");
    const detail = source(
      "features/fleet/components/FleetUnitDetailWorkspace.tsx",
    );
    const economics = source(
      "features/fleet/components/FleetUnitEconomicsPanel.tsx",
    );
    const requests = source(
      "features/fleet/components/FleetServiceRequestsPage.tsx",
    );
    const pretrips = source("features/fleet/components/PretripReportsPage.tsx");

    expect(issues).toContain("requestHref = productHostRoute");
    expect(issues).toContain('"/requests/new"');
    expect(issues).toContain("`/pre-trips/start/${encodedUnitId}`");
    expect(issues).toContain("href={pretripHref(a.unitId)}");
    expect(detail).toContain('"/pre-trips/start"');
    expect(detail).toContain('"/requests/new"');
    expect(economics).toContain("`/assets/${encodeURIComponent(unit.unitId)}`");
    expect(requests).toContain("const buildHref = productRoutes");
    expect(requests).toContain('? "/requests/new"');
    expect(requests).toContain('productRoutes ? "/history"');
    expect(pretrips).toContain('productRoutes ? "/assets"');
  });

  it("keeps driver pre-trip history visible without widening its Fleet scope", () => {
    const pretripApi = source("app/api/fleet/pretrip/route.ts");

    expect(pretripApi).toContain("import { supabaseAdmin }");
    expect(pretripApi).toContain('actor.actorType === "fleet_driver"');
    expect(pretripApi).toContain('.eq("driver_profile_id", actor.userId)');
    expect(pretripApi).toContain('query.in("fleet_id", scope.fleetIds)');
  });

  it("sends Fleet invitations with a subject and Fleet-specific content", () => {
    const events = source("features/email/server/emailEvents.ts");
    const sender = source("features/email/server/sendDynamicTemplateEmail.ts");

    expect(events).toContain("Your ${fleetName} Fleet invitation");
    expect(events).toContain("Activate your Fleet access");
    expect(events).toContain('input.portalType === "fleet"');
    expect(events).toContain("content: fleetContent");
    expect(sender).toContain("content?: {");
    expect(sender).toContain("const message: MailDataRequired = input.content");
  });
});
