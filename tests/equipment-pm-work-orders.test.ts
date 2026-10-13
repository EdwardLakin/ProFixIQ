import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", () => ({
  authorizeEquipmentAsset: mocks.authorize,
  EquipmentAssetProfileError: class extends Error {},
}));

import type { PmCompletion, PmPlan } from "@/features/equipment/lib/pm";
import {
  pmCompletionPrefill,
  pmCreateWorkOrderHref,
  pmWorkOrderRecorded,
  pmWorkOrderState,
  type PmWorkOrderLink,
} from "@/features/equipment/lib/pmWorkOrders";
import {
  linkPmWorkOrder,
  loadAssetPmWorkOrders,
  unlinkPmWorkOrder,
} from "@/features/equipment/server/equipmentPmWorkOrderService";

const SHOP = "00000000-0000-4000-8000-000000000111";
const USER = "00000000-0000-4000-8000-000000000222";
const ASSET = "00000000-0000-4000-8000-000000000001";
const CUSTOMER = "00000000-0000-4000-8000-000000000009";
const PLAN = "00000000-0000-4000-8000-0000000000b1";
const LINK = "00000000-0000-4000-8000-0000000000d1";
const WO = "00000000-0000-4000-8000-0000000000c1";
const WO_OPEN = "00000000-0000-4000-8000-0000000000c2";
const WO_HIDDEN = "00000000-0000-4000-8000-0000000000c3";
const KEY = "00000000-0000-4000-8000-0000000000aa";
const NOW = Date.parse("2026-10-13T12:00:00Z");

type Tables = Record<string, Array<Record<string, unknown>>>;
type Rpc = { name: string; args: Record<string, unknown> };

function fakeClient(tables: Tables, rpcs: Rpc[] = [], rpcError: unknown = null) {
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        is: (column: string, value: unknown) => {
          filters.push((row) => (row[column] ?? null) === value);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: rows(), error: null }),
      };
      return builder;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return rpcError ? { data: null, error: rpcError } : { data: { id: LINK }, error: null };
    },
  };
}

const identity = { id: ASSET, engineHours: 2400, odometer: null, odometerUnit: null, customerId: CUSTOMER };

const linkRow = (patch: Record<string, unknown>) => ({
  id: LINK,
  shop_id: SHOP,
  plan_id: PLAN,
  vehicle_id: ASSET,
  work_order_id: WO,
  linked_at: "2026-10-02T00:00:00Z",
  unlinked_at: null,
  ...patch,
});

const workOrderRow = (patch: Record<string, unknown>) => ({
  id: WO,
  shop_id: SHOP,
  vehicle_id: ASSET,
  custom_id: "1042",
  status: "completed",
  record_type: "work_order",
  estimate_number: null,
  estimate_status: null,
  updated_at: "2026-10-10T15:00:00Z",
  odometer_km: 16093.4,
  vehicle_engine_hours: 2510.4,
  ...patch,
});

const link = (patch: Partial<PmWorkOrderLink["workOrder"]> = {}): PmWorkOrderLink => ({
  id: LINK,
  planId: PLAN,
  linkedAt: "2026-10-02T00:00:00Z",
  workOrder: {
    id: WO,
    label: "WO-1042",
    href: `/work-orders/${WO}`,
    status: "completed",
    state: "completed",
    odometerKm: 16093.4,
    engineHours: 2510.4,
    updatedOn: "2026-10-10",
    ...patch,
  },
});

describe("PM work order facts", () => {
  it("classifies work orders with the canonical status contracts", () => {
    expect(pmWorkOrderState("in_progress")).toBe("open");
    expect(pmWorkOrderState("waiting_parts")).toBe("open");
    expect(pmWorkOrderState("new")).toBe("open");
    expect(pmWorkOrderState("ready_to_invoice")).toBe("completed");
    expect(pmWorkOrderState("completed")).toBe("completed");
    expect(pmWorkOrderState("invoiced")).toBe("completed");
    expect(pmWorkOrderState("done")).toBe("completed");
    expect(pmWorkOrderState("cancelled")).toBe("closed");
    expect(pmWorkOrderState(null)).toBe("unknown");
  });

  it("builds the existing create page link with the asset and a way back", () => {
    expect(
      pmCreateWorkOrderHref({
        baseHref: `/work-orders/create?autostart=1&customerId=${CUSTOMER}&vehicleId=${ASSET}`,
        assetId: ASSET,
      }),
    ).toBe(
      `/work-orders/create?autostart=1&customerId=${CUSTOMER}&vehicleId=${ASSET}&returnTo=%2Fequipment%2F${ASSET}`,
    );
    expect(pmCreateWorkOrderHref({ baseHref: null, assetId: ASSET })).toBeNull();
  });

  it("prefills a completion from the work order's recorded facts, never in the future", () => {
    const plan = { distanceUnit: "mi" } as Pick<PmPlan, "distanceUnit">;
    expect(pmCompletionPrefill(link(), plan, NOW)).toEqual({
      workOrderId: WO,
      workOrderLabel: "WO-1042",
      completedOn: "2026-10-10",
      assetHours: 2510,
      distance: 10000,
    });
    expect(pmCompletionPrefill(link({ updatedOn: "2026-12-01", odometerKm: null, engineHours: null }), { distanceUnit: null }, NOW)).toMatchObject({
      completedOn: "2026-10-13",
      assetHours: null,
      distance: null,
    });
  });

  it("knows when a completion already records the work order (voided ones do not count)", () => {
    const completion = { workOrder: { id: WO, label: "WO-1042", href: null }, voided: null } as PmCompletion;
    expect(pmWorkOrderRecorded([completion], WO)).toBe(true);
    expect(pmWorkOrderRecorded([{ ...completion, voided: { at: "x", reason: "Wrong" } }], WO)).toBe(false);
    expect(pmWorkOrderRecorded([], WO)).toBe(false);
  });
});

describe("PM work order service", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
  });

  it("loads current links with work order facts and the create handoff", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const result = await loadAssetPmWorkOrders({
      supabase: fakeClient({
        work_orders: [workOrderRow({}), workOrderRow({ id: WO_OPEN, custom_id: "1043", status: "in_progress" })],
      }) as never,
      admin: fakeClient({
        equipment_pm_work_orders: [
          linkRow({}),
          linkRow({ id: "l2", work_order_id: WO_OPEN }),
          linkRow({ id: "l3", work_order_id: WO_HIDDEN }),
          linkRow({ id: "gone", unlinked_at: "2026-10-03T00:00:00Z" }),
          linkRow({ id: "other-shop", shop_id: "x" }),
        ],
      }) as never,
      shopId: SHOP,
      role: "manager",
      assetId: ASSET,
    });
    expect(result?.links.map((entry) => [entry.id, entry.workOrder.label, entry.workOrder.state])).toEqual([
      [LINK, "WO-1042", "completed"],
      ["l2", "WO-1043", "open"],
      ["l3", "Work order", "unknown"],
    ]);
    expect(result?.links[0].workOrder).toMatchObject({ odometerKm: 16093.4, engineHours: 2510.4, updatedOn: "2026-10-10", href: `/work-orders/${WO}` });
    expect(result?.links[2].workOrder).toMatchObject({ href: null, odometerKm: null });
    expect(result?.createWorkOrderHref).toContain(`customerId=${CUSTOMER}`);
    expect(result?.createWorkOrderHref).toContain(`returnTo=%2Fequipment%2F${ASSET}`);
    expect(result).toMatchObject({ canLink: true, canUnlink: true });
  });

  it("gives mechanics link-only access and no create handoff", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const result = await loadAssetPmWorkOrders({
      supabase: fakeClient({}) as never,
      admin: fakeClient({}) as never,
      shopId: SHOP,
      role: "mechanic",
      assetId: ASSET,
    });
    expect(result).toEqual({ links: [], createWorkOrderHref: null, canLink: true, canUnlink: false });
  });

  it("offers no create handoff for an asset without a customer, and null for a hidden asset", async () => {
    mocks.authorize.mockResolvedValue({ ...identity, customerId: null });
    const result = await loadAssetPmWorkOrders({
      supabase: fakeClient({}) as never,
      admin: fakeClient({}) as never,
      shopId: SHOP,
      role: "advisor",
      assetId: ASSET,
    });
    expect(result?.createWorkOrderHref).toBeNull();
    mocks.authorize.mockResolvedValue(null);
    expect(
      await loadAssetPmWorkOrders({ supabase: fakeClient({}) as never, admin: fakeClient({}) as never, shopId: SHOP, role: "manager", assetId: ASSET }),
    ).toBeNull();
  });

  it("links a visible work order of the plan's asset through the RPC", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: Rpc[] = [];
    const context = {
      admin: fakeClient({ equipment_pm_plans: [{ id: PLAN, shop_id: SHOP, vehicle_id: ASSET }] }, rpcs) as never,
      shopId: SHOP,
      role: "mechanic" as const,
      actorUserId: USER,
      planId: PLAN,
    };
    const result = await linkPmWorkOrder({
      ...context,
      supabase: fakeClient({ work_orders: [workOrderRow({})] }) as never,
      body: { workOrderId: WO, operationKey: KEY },
    });
    expect(result).toEqual({ id: LINK });
    expect(rpcs).toEqual([
      {
        name: "equipment_pm_work_order_link",
        args: { p_shop_id: SHOP, p_actor_user_id: USER, p_plan_id: PLAN, p_work_order_id: WO, p_operation_key: KEY },
      },
    ]);

    // Not visible / another asset, an estimate, a bad id, or no key: refused before the RPC.
    await expect(
      linkPmWorkOrder({ ...context, supabase: fakeClient({ work_orders: [workOrderRow({ vehicle_id: "other" })] }) as never, body: { workOrderId: WO, operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      linkPmWorkOrder({ ...context, supabase: fakeClient({ work_orders: [workOrderRow({ record_type: "estimate" })] }) as never, body: { workOrderId: WO, operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      linkPmWorkOrder({ ...context, supabase: fakeClient({}) as never, body: { workOrderId: "nope", operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      linkPmWorkOrder({ ...context, supabase: fakeClient({}) as never, body: { workOrderId: WO } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(rpcs).toHaveLength(1);
  });

  it("refuses links on another shop's plan, hidden assets and read-only roles", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const body = { workOrderId: WO, operationKey: KEY };
    await expect(
      linkPmWorkOrder({
        supabase: fakeClient({ work_orders: [workOrderRow({})] }) as never,
        admin: fakeClient({ equipment_pm_plans: [{ id: PLAN, shop_id: "other-shop", vehicle_id: ASSET }] }) as never,
        shopId: SHOP,
        role: "manager",
        actorUserId: USER,
        planId: PLAN,
        body,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      linkPmWorkOrder({ supabase: {} as never, admin: {} as never, shopId: SHOP, role: "parts", actorUserId: USER, planId: PLAN, body }),
    ).rejects.toMatchObject({ status: 403 });
    mocks.authorize.mockResolvedValue(null);
    await expect(
      linkPmWorkOrder({
        supabase: fakeClient({ work_orders: [workOrderRow({})] }) as never,
        admin: fakeClient({ equipment_pm_plans: [{ id: PLAN, shop_id: SHOP, vehicle_id: ASSET }] }) as never,
        shopId: SHOP,
        role: "mechanic",
        actorUserId: USER,
        planId: PLAN,
        body,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("maps RPC refusals to clear errors", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const attempt = (rpcError: unknown) =>
      linkPmWorkOrder({
        supabase: fakeClient({ work_orders: [workOrderRow({})] }) as never,
        admin: fakeClient({ equipment_pm_plans: [{ id: PLAN, shop_id: SHOP, vehicle_id: ASSET }] }, [], rpcError) as never,
        shopId: SHOP,
        role: "manager",
        actorUserId: USER,
        planId: PLAN,
        body: { workOrderId: WO, operationKey: KEY },
      });
    await expect(attempt({ code: "22023", message: "This PM plan is archived" })).rejects.toMatchObject({
      status: 400,
      message: "This PM plan is archived.",
    });
    await expect(attempt({ code: "23514", message: "PM work order must be one of the asset's work orders" })).rejects.toMatchObject({
      status: 400,
      message: "Select one of this asset's work orders.",
    });
    await expect(attempt({ code: "P0002", message: "PM plan not found" })).rejects.toMatchObject({ status: 404 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(attempt({ code: "XX000", message: "boom" })).rejects.toMatchObject({ status: 500 });
  });

  it("lets managers unlink (once, through the RPC) and refuses mechanics", async () => {
    mocks.authorize.mockResolvedValue(identity);
    const rpcs: Rpc[] = [];
    await unlinkPmWorkOrder({
      supabase: fakeClient({}) as never,
      admin: fakeClient({ equipment_pm_work_orders: [linkRow({})] }, rpcs) as never,
      shopId: SHOP,
      role: "manager",
      actorUserId: USER,
      linkId: LINK,
      body: { operationKey: KEY },
    });
    expect(rpcs[0]).toEqual({
      name: "equipment_pm_work_order_unlink",
      args: { p_shop_id: SHOP, p_actor_user_id: USER, p_link_id: LINK, p_operation_key: KEY },
    });
    await expect(
      unlinkPmWorkOrder({ supabase: {} as never, admin: {} as never, shopId: SHOP, role: "mechanic", actorUserId: USER, linkId: LINK, body: { operationKey: KEY } }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      unlinkPmWorkOrder({
        supabase: fakeClient({}) as never,
        admin: fakeClient({ equipment_pm_work_orders: [linkRow({ shop_id: "other-shop" })] }) as never,
        shopId: SHOP,
        role: "manager",
        actorUserId: USER,
        linkId: LINK,
        body: { operationKey: KEY },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
