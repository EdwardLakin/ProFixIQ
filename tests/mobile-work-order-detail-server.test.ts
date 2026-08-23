import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const mocks = vi.hoisted(() => ({
  loadWorkOrderWorkspaceSnapshot: vi.fn(),
  loadCanonicalWorkOrderLineContext: vi.fn(),
  collectTechnicianIdsForLineContexts: vi.fn(),
  loadRowsForIdChunks: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot",
  () => ({
    loadWorkOrderWorkspaceSnapshot: mocks.loadWorkOrderWorkspaceSnapshot,
    WORK_ORDER_WORKSPACE_READER_ROLES: [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
      "parts",
      "mechanic",
      "lead_hand",
      "foreman",
    ],
  }),
);
vi.mock(
  "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext",
  () => ({
    loadCanonicalWorkOrderLineContext:
      mocks.loadCanonicalWorkOrderLineContext,
    collectTechnicianIdsForLineContexts:
      mocks.collectTechnicianIdsForLineContexts,
    loadRowsForIdChunks: mocks.loadRowsForIdChunks,
  }),
);

import { loadMobileWorkOrderDetail } from "@/features/work-orders/mobile/server/loadMobileWorkOrderDetail";

const WORK_ORDER_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

function emptyContext() {
  return {
    allocationsByLine: {},
    canonicalPartsByLine: {},
    technicianIdsByLine: {},
    activeTechnicianIdsByLine: {},
    partRequestsByLine: {},
    partRequestsByQuoteLine: {},
  };
}

function createClient(overrides: {
  workOrder?: Record<string, unknown>;
  vehicle?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
} = {}) {
  const calls: Array<{ table: string; operation: string; args: unknown[] }> = [];
  const results: Record<string, { data: unknown; error: null }> = {
    work_orders: {
      data: overrides.workOrder ?? {
        id: WORK_ORDER_ID,
        shop_id: SHOP_ID,
        custom_id: "WO-000014",
        status: "in_progress",
        vehicle_id: null,
        customer_id: null,
      },
      error: null,
    },
    vehicles: { data: overrides.vehicle ?? null, error: null },
    customers: { data: overrides.customer ?? null, error: null },
    shops: { data: { labor_rate: null }, error: null },
  };
  const client = {
    from(table: string) {
      const query: Record<string, unknown> = {};
      for (const operation of ["select", "eq"]) {
        query[operation] = (...args: unknown[]) => {
          calls.push({ table, operation, args });
          return query;
        };
      }
      query.maybeSingle = async () => results[table];
      return query;
    },
  };
  return {
    calls,
    client: client as unknown as SupabaseClient<Database>,
  };
}

describe("mobile work-order detail server snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkOrderWorkspaceSnapshot.mockResolvedValue({
      workOrder: {
        id: WORK_ORDER_ID,
        shopId: SHOP_ID,
        vehicleId: null,
        customerId: null,
      },
    });
    mocks.loadCanonicalWorkOrderLineContext.mockResolvedValue(emptyContext());
    mocks.collectTechnicianIdsForLineContexts.mockReturnValue([]);
    mocks.loadRowsForIdChunks
      .mockResolvedValueOnce([
        {
          id: "line-1",
          shop_id: SHOP_ID,
          work_order_id: WORK_ORDER_ID,
          assigned_tech_id: null,
          status: "awaiting",
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
  });

  it("reuses the Shop workspace identity and canonical line context", async () => {
    const fixture = createClient();

    const snapshot = await loadMobileWorkOrderDetail({
      supabase: fixture.client,
      shopId: SHOP_ID,
      routeId: "WO14",
    });

    expect(mocks.loadWorkOrderWorkspaceSnapshot).toHaveBeenCalledWith({
      supabase: fixture.client,
      shopId: SHOP_ID,
      routeId: "WO14",
    });
    expect(mocks.loadCanonicalWorkOrderLineContext).toHaveBeenCalledWith({
      supabase: fixture.client,
      workOrderId: WORK_ORDER_ID,
      shopId: SHOP_ID,
      lineIds: ["line-1"],
    });
    expect(snapshot).toMatchObject({
      workOrder: { id: WORK_ORDER_ID, shop_id: SHOP_ID },
      lines: [{ id: "line-1", assigned_tech_id: null }],
      quoteLines: [],
      vehicle: null,
      customer: null,
      techNamesById: {},
      shopLaborRate: null,
    });
    expect(fixture.calls).toContainEqual({
      table: "work_orders",
      operation: "eq",
      args: ["shop_id", SHOP_ID],
    });
  });

  it("does not issue detail reads when the canonical identity is not visible", async () => {
    const fixture = createClient();
    mocks.loadWorkOrderWorkspaceSnapshot.mockResolvedValue(null);

    await expect(
      loadMobileWorkOrderDetail({
        supabase: fixture.client,
        shopId: SHOP_ID,
        routeId: "cross-tenant-id",
      }),
    ).resolves.toBeNull();

    expect(fixture.calls).toEqual([]);
    expect(mocks.loadCanonicalWorkOrderLineContext).not.toHaveBeenCalled();
  });

  it("derives related records from the same full work-order row", async () => {
    mocks.loadWorkOrderWorkspaceSnapshot.mockResolvedValue({
      workOrder: {
        id: WORK_ORDER_ID,
        shopId: SHOP_ID,
        vehicleId: "vehicle-old",
        customerId: "customer-old",
      },
    });
    const fixture = createClient({
      workOrder: {
        id: WORK_ORDER_ID,
        shop_id: SHOP_ID,
        custom_id: "WO-000014",
        status: "in_progress",
        vehicle_id: "vehicle-new",
        customer_id: "customer-new",
      },
      vehicle: {
        id: "vehicle-new",
        shop_id: SHOP_ID,
      },
      customer: {
        id: "customer-new",
        shop_id: SHOP_ID,
      },
    });

    const snapshot = await loadMobileWorkOrderDetail({
      supabase: fixture.client,
      shopId: SHOP_ID,
      routeId: "WO14",
    });

    expect(snapshot).toMatchObject({
      workOrder: {
        vehicle_id: "vehicle-new",
        customer_id: "customer-new",
      },
      vehicle: { id: "vehicle-new" },
      customer: { id: "customer-new" },
    });
    expect(fixture.calls).toContainEqual({
      table: "vehicles",
      operation: "eq",
      args: ["id", "vehicle-new"],
    });
    expect(fixture.calls).toContainEqual({
      table: "customers",
      operation: "eq",
      args: ["id", "customer-new"],
    });
    expect(fixture.calls).not.toContainEqual({
      table: "vehicles",
      operation: "eq",
      args: ["id", "vehicle-old"],
    });
  });
});
