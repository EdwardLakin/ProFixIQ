import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const loader = read(
  "features/vehicles/server/loadVehicleWorkspaceSnapshot.ts",
);
const search = read("features/vehicles/server/searchShopVehicleRecords.ts");
const searchRoute = read("app/api/vehicles/search/route.ts");
const workspacePage = read("app/vehicles/[id]/page.tsx");
const workspaceComponent = read(
  "features/vehicles/components/VehicleWorkspace.tsx",
);
const vehicleSearchPage = read("features/vehicles/app/vehicles/page.tsx");

describe("Shop Vehicle Workspace security contract", () => {
  it("anchors the canonical vehicle and work-order reads to the requested shop", () => {
    const vehicleQuery = loader.slice(
      loader.indexOf("const vehicleResult"),
      loader.indexOf(
        'throwQueryError(vehicleResult.error, "Unable to load vehicle")',
      ),
    );
    const workOrderQuery = loader.slice(
      loader.indexOf("const workOrdersResult"),
      loader.indexOf(
        'throwQueryError(workOrdersResult.error, "Unable to load work orders")',
      ),
    );

    expect(vehicleQuery).toContain('.from("vehicles")');
    expect(vehicleQuery).toContain('.eq("shop_id", input.shopId)');
    expect(vehicleQuery).toContain('.eq("id", input.vehicleId)');
    expect(vehicleQuery).toContain(".maybeSingle()");
    expect(workOrderQuery).toContain('.from("work_orders")');
    expect(workOrderQuery).toContain('.eq("shop_id", input.shopId)');
    expect(workOrderQuery).toContain('.eq("vehicle_id", input.vehicleId)');
  });

  it("scopes installed-part evidence without projecting commercial fields", () => {
    const partQuery = loader.slice(
      loader.indexOf('.from("work_order_parts")'),
      loader.indexOf('.from("work_order_quote_lines")'),
    );

    expect(partQuery).toContain('.eq("shop_id", input.shopId)');
    expect(partQuery).toContain('.eq("is_active", true)');
    expect(partQuery).toContain('.in("work_order_id", workOrderIds)');
    expect(partQuery).toContain("quantity_consumed,quantity_returned");
    expect(partQuery).not.toContain("price");
    expect(partQuery).not.toContain("cost");
  });

  it("uses the caller's RLS client and guards protected financial reads", () => {
    expect(loader).not.toContain("createAdminSupabase");
    expect(loader).not.toContain("service_role");
    expect(loader.match(/permissions\.canViewFinancials && workOrderIds\.length/g))
      .toHaveLength(2);
    expect(loader).toContain(
      "permissions.canViewPartRequests && workOrderIds.length",
    );
    expect(loader).toContain(
      "if (permissions.isAssignedWorkOnly && workOrders.length === 0) return null",
    );
    expect(loader.indexOf("if (permissions.isAssignedWorkOnly")).toBeLessThan(
      loader.indexOf("const accountQuery"),
    );
  });

  it("keeps search candidates canonical, shop-scoped, and assignment-scoped", () => {
    const canonicalVehicleLoad = search.slice(
      search.indexOf("if (boundedVehicleIds.length)"),
      search.indexOf("const currentCustomerIds"),
    );

    expect(search).not.toContain("createAdminSupabase");
    expect(search).not.toContain("service_role");
    expect(search).toContain("const candidateVehicleIds = new Map<string, true>()");
    expect(search).toContain("candidateVehicleIds.set(row.id, true)");
    expect(search).toContain("candidateVehicleIds.set(row.vehicle_id, true)");
    expect(canonicalVehicleLoad).toContain('.from("vehicles")');
    expect(canonicalVehicleLoad).toContain('.eq("shop_id", input.shopId)');
    expect(canonicalVehicleLoad).toContain('.in("id", boundedVehicleIds)');
    expect(search).toContain("const activeWorkOrdersByVehicle = new Map");
    expect(search).toContain("rows.push(row)");
    expect(search).toContain(
      "activeWork: (activeWorkOrdersByVehicle.get(vehicle.id) ?? []).map",
    );

    const mechanicScope = search.slice(
      search.indexOf("if (isMechanic)"),
      search.indexOf("let directVehicleMatches"),
    );
    expect(mechanicScope).toContain('.from("work_orders")');
    expect(mechanicScope).toContain('.eq("shop_id", input.shopId)');
    expect(mechanicScope).toContain("visibleMechanicWorkOrders");
    expect(mechanicScope).toContain("const allowedVehicleIds = Array.from");
    expect(mechanicScope).toContain('.in("id", allowedVehicleIds)');
    expect(search).toContain(
      "if (permissions.canViewFinancials && workOrderIds.length)",
    );
    expect(search).toContain(
      "const canSearchAccountContact = permissions.canViewAccountContact",
    );
    expect(search).toContain(".select(CUSTOMER_COLUMNS)");
    expect(search.match(/\.select\(CUSTOMER_SAFE_COLUMNS\)/g)).toHaveLength(2);
    expect(search).toContain(
      '"id,account_type,active,business_name,name,first_name,last_name,identity_name,archived_at,merged_into_customer_id"',
    );
    expect(search).toContain("customerFilterForTerm(term, true)");
    expect(search).toContain("customerFilterForTerm(term, false)");
  });

  it("retains restricted evidence while gating canonical detail links by role", () => {
    expect(loader).toContain('href: `/estimates/${row.work_order_id}`');
    expect(search).toContain(
      'kind: workOrderIsEstimate(row) ? "estimate" : "work_order"',
    );

    expect(workspaceComponent).toContain(
      'if (item.kind === "estimate") return permissions.canViewEstimates',
    );
    expect(workspaceComponent).toContain(
      'if (event.kind === "estimate") return permissions.canViewEstimates',
    );
    expect(workspaceComponent).toContain(
      'reference.sourceType === "work_order_quote_line"',
    );
    expect(workspaceComponent).toContain(
      'reference.sourceType === "inspection"',
    );
    expect(workspaceComponent).toContain(
      'reference.sourceType === "history"',
    );
    expect(workspaceComponent).toContain(
      "WORK_ORDER_SOURCE_TYPES.has(reference.sourceType)",
    );
    expect(workspaceComponent).toContain(
      "canOpenReference(\n              snapshot.documentSummary.latestReference",
    );
    expect(workspaceComponent).toContain("Source retained");

    expect(vehicleSearchPage).toContain('work.kind === "estimate"');
    expect(vehicleSearchPage).toContain("permissions.canViewEstimates");
    expect(vehicleSearchPage).toContain("permissions.canOpenWorkOrders");
    expect(vehicleSearchPage).toContain(
      "data-source-id={work.reference.sourceId}",
    );
  });

  it("guards the search API with the exact workspace role allowlist", () => {
    const guard = searchRoute.indexOf("await requireShopScopedApiAccess");
    const searchCall = searchRoute.indexOf("await searchShopVehicleRecords");

    expect(searchRoute).toContain(
      "allowRoles: VEHICLE_WORKSPACE_READER_ROLES",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(searchCall).toBeGreaterThan(guard);
    expect(searchRoute).toContain("supabase: access.supabase");
    expect(searchRoute).toContain("shopId: access.profile.shop_id");
    expect(searchRoute).toContain("role: access.canonicalRole");
    expect(searchRoute).not.toContain("createAdminSupabase");
    expect(searchRoute).toContain('"Cache-Control": "private, no-store"');
  });

  it("authorizes the page before loading and gives invalid or invisible IDs the same posture", () => {
    const guard = workspacePage.indexOf("await requireShopPageAccess");
    const paramsRead = workspacePage.indexOf("await params");
    const loaderCall = workspacePage.indexOf(
      "await loadVehicleWorkspaceSnapshot",
    );

    expect(workspacePage).toContain(
      "allowRoles: VEHICLE_WORKSPACE_READER_ROLES",
    );
    expect(workspacePage).toContain("supabase: createServerSupabaseRSC()");
    expect(workspacePage).not.toContain("createAdminSupabase");
    expect(guard).toBeGreaterThan(-1);
    expect(paramsRead).toBeGreaterThan(guard);
    expect(loaderCall).toBeGreaterThan(guard);
    expect(workspacePage).toContain("shopId: profile.shop_id");
    expect(workspacePage).toContain("role: canonicalRole");
    expect(workspacePage).toContain("vehicleId: id");
    expect(workspacePage).toContain("if (!UUID_PATTERN.test(id)) notFound()");
    expect(workspacePage).toContain("if (!snapshot) notFound()");
    expect(workspacePage.match(/notFound\(\)/g)).toHaveLength(2);
  });

  it("does not format ambiguous or absent financial totals as a currency amount", () => {
    expect(
      workspaceComponent.match(
        /snapshot\.financialSummary\.invoiceCount === 0/g,
      ),
    ).toHaveLength(2);
    expect(workspaceComponent.match(/"No invoices"/g)).toHaveLength(2);
    expect(workspaceComponent.match(/"Multiple currencies"/g)).toHaveLength(
      2,
    );
    expect(workspaceComponent).toContain(
      "snapshot.financialSummary.outstandingAmount === null",
    );
    expect(workspaceComponent).toContain(
      "snapshot.financialSummary.paidAmount === null",
    );
  });
});
