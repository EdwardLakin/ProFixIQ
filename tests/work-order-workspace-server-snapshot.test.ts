import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { WorkspaceResourceContext } from "@/features/workspace/lib/workspace";

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: vi.fn(),
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRSC: vi.fn(),
}));

import { loadWorkOrderWorkspaceSnapshot } from "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot";
import {
  resolveWorkOrderWorkspaceResource,
  type WorkOrderWorkspaceServerSnapshot,
} from "@/features/work-orders/workspace/workOrderWorkspace";

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryCall = {
  operation: string;
  args: unknown[];
};

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  ilike: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  maybeSingle: (...args: unknown[]) => QueryBuilder;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2>;
};

function createSupabaseFixture(results: QueryResult[]): {
  client: SupabaseClient<Database>;
  calls: QueryCall[];
} {
  const calls: QueryCall[] = [];
  let queryIndex = 0;

  const client = {
    from(table: string) {
      expect(table).toBe("work_orders");
      const result = results[queryIndex++];
      if (!result) throw new Error(`Missing result for query ${queryIndex}`);

      const query: QueryBuilder = {
        select(...args) {
          calls.push({ operation: "select", args });
          return query;
        },
        eq(...args) {
          calls.push({ operation: "eq", args });
          return query;
        },
        ilike(...args) {
          calls.push({ operation: "ilike", args });
          return query;
        },
        limit(...args) {
          calls.push({ operation: "limit", args });
          return query;
        },
        maybeSingle(...args) {
          calls.push({ operation: "maybeSingle", args });
          return query;
        },
        then(onfulfilled, onrejected) {
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    calls,
  };
}

function workOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    shop_id: "shop-1",
    customer_id: "customer-1",
    vehicle_id: "vehicle-1",
    custom_id: "WO0001",
    status: "in_progress",
    payment_status: null,
    approval_state: "approved",
    record_type: "work_order",
    ...overrides,
  };
}

describe("Work Order Workspace server snapshot", () => {
  it("keeps the server-authorized identity until the client loads that Work Order", () => {
    const serverSnapshot: WorkOrderWorkspaceServerSnapshot = {
      routeId: "WO1",
      resource: {
        kind: "work_order",
        shopId: "shop-1",
        resourceId: "wo-1",
        workOrderId: "wo-1",
        customerId: "customer-1",
        vehicleId: "vehicle-1",
        locationId: null,
      },
      workOrder: {
        id: "wo-1",
        shopId: "shop-1",
        customerId: "customer-1",
        vehicleId: "vehicle-1",
        customId: "WO0001",
        status: "in_progress",
        paymentStatus: null,
        approvalState: "approved",
        recordType: "work_order",
      },
    };
    const matchingClientResource: WorkspaceResourceContext = {
      ...serverSnapshot.resource,
    };
    const staleClientResource: WorkspaceResourceContext = {
      kind: "work_order",
      shopId: "shop-1",
      resourceId: "wo-stale",
      workOrderId: "wo-stale",
    };

    expect(
      resolveWorkOrderWorkspaceResource({
        initialResource: serverSnapshot.resource,
        loadedResource: null,
      }),
    ).toEqual(serverSnapshot.resource);
    expect(
      resolveWorkOrderWorkspaceResource({
        initialResource: serverSnapshot.resource,
        loadedResource: staleClientResource,
      }),
    ).toEqual(serverSnapshot.resource);
    expect(
      resolveWorkOrderWorkspaceResource({
        initialResource: serverSnapshot.resource,
        loadedResource: matchingClientResource,
      }),
    ).toEqual(matchingClientResource);
  });

  it("bootstraps the canonical RLS-visible Work Order UUID and scopes by shop", async () => {
    const fixture = createSupabaseFixture([
      { data: workOrderRow(), error: null },
    ]);

    const snapshot = await loadWorkOrderWorkspaceSnapshot({
      supabase: fixture.client,
      shopId: "shop-1",
      routeId: "11111111-1111-4111-8111-111111111111",
    });

    expect(snapshot).toMatchObject({
      routeId: "11111111-1111-4111-8111-111111111111",
      resource: {
        kind: "work_order",
        shopId: "shop-1",
        resourceId: "11111111-1111-4111-8111-111111111111",
        workOrderId: "11111111-1111-4111-8111-111111111111",
        customerId: "customer-1",
        vehicleId: "vehicle-1",
      },
      workOrder: {
        customId: "WO0001",
        status: "in_progress",
        approvalState: "approved",
      },
    });
    expect(fixture.calls).toContainEqual({
      operation: "eq",
      args: ["shop_id", "shop-1"],
    });
    expect(fixture.calls).toContainEqual({
      operation: "eq",
      args: ["id", "11111111-1111-4111-8111-111111111111"],
    });
  });

  it("resolves an exact custom Work Order number", async () => {
    const fixture = createSupabaseFixture([
      { data: workOrderRow(), error: null },
    ]);

    const snapshot = await loadWorkOrderWorkspaceSnapshot({
      supabase: fixture.client,
      shopId: "shop-1",
      routeId: "WO0001",
    });

    expect(snapshot?.workOrder.id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(fixture.calls).toContainEqual({
      operation: "eq",
      args: ["custom_id", "WO0001"],
    });
  });

  it("resolves a unique normalized alias without choosing an ambiguous Work Order", async () => {
    const uniqueFixture = createSupabaseFixture([
      { data: null, error: null },
      { data: [], error: null },
      { data: [workOrderRow()], error: null },
    ]);
    const uniqueSnapshot = await loadWorkOrderWorkspaceSnapshot({
      supabase: uniqueFixture.client,
      shopId: "shop-1",
      routeId: "WO1",
    });
    expect(uniqueSnapshot?.workOrder.customId).toBe("WO0001");

    const ambiguousFixture = createSupabaseFixture([
      { data: null, error: null },
      { data: [], error: null },
      {
        data: [
          workOrderRow(),
          workOrderRow({
            id: "22222222-2222-4222-8222-222222222222",
            custom_id: "WO01",
          }),
        ],
        error: null,
      },
    ]);
    const ambiguousSnapshot = await loadWorkOrderWorkspaceSnapshot({
      supabase: ambiguousFixture.client,
      shopId: "shop-1",
      routeId: "WO1",
    });
    expect(ambiguousSnapshot).toBeNull();
  });

  it("does not publish a cross-shop row even if a malformed fixture returns it", async () => {
    const fixture = createSupabaseFixture([
      { data: workOrderRow({ shop_id: "shop-2" }), error: null },
    ]);

    await expect(
      loadWorkOrderWorkspaceSnapshot({
        supabase: fixture.client,
        shopId: "shop-1",
        routeId: "WO0001",
      }),
    ).resolves.toBeNull();
  });

  it("surfaces query failures to the best-effort current-actor boundary", async () => {
    const fixture = createSupabaseFixture([
      { data: null, error: { message: "database unavailable" } },
    ]);

    await expect(
      loadWorkOrderWorkspaceSnapshot({
        supabase: fixture.client,
        shopId: "shop-1",
        routeId: "WO0001",
      }),
    ).rejects.toThrow(
      "Unable to load Work Order workspace identity: database unavailable",
    );
  });
});
