import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DispatchBoardSnapshot,
  DispatchVisit,
} from "@/features/dispatch/lib/contracts";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";
import { equipmentDispatchPage } from "@/features/equipment/dispatch/lib/equipmentDispatchBoard";
const mocks = vi.hoisted(() => ({ projection: vi.fn(), board: vi.fn() }));
vi.mock("@/features/equipment/server/loadEquipmentWorkQueue", () => ({
  loadEquipmentWorkQueueProjection: mocks.projection,
}));
vi.mock("@/features/dispatch/server/commands", () => ({
  getDispatchBoard: mocks.board,
}));
import { loadEquipmentDispatch } from "@/features/equipment/dispatch/server/loadEquipmentDispatch";
const visit = (
  i: number,
  patch: Partial<DispatchVisit> = {},
): DispatchVisit => ({
  id: `visit-${i}`,
  shopId: "shop",
  workOrderId: `wo-${i}`,
  workOrderNumber: `WO-${i}`,
  vehicle: { id: "equipment" },
  mode: "mobile",
  status: "dispatched",
  version: 1,
  createdAt: "2026-10-17T12:00:00Z",
  updatedAt: "2026-10-17T12:00:00Z",
  assignmentState: "assigned",
  allowedTransitions: [],
  ...patch,
});
const board = (visits: DispatchVisit[]): DispatchBoardSnapshot => ({
  visits,
  technicians: [],
  serviceVehicles: [],
  generatedAt: "2026-10-17T12:00:00Z",
});
const filters = parseEquipmentQueueFilters({});
function client(
  tables: Record<string, Array<Record<string, unknown>>> = {},
  fail = false,
) {
  const calls: Array<{ table: string; conditions: Array<[string, unknown]> }> =
    [];
  return {
    calls,
    from(table: string) {
      const conditions: Array<[string, unknown]> = [];
      calls.push({ table, conditions });
      let start = 0,
        end = Infinity,
        single = false;
      const query = {
        select: () => query,
        eq: (k: string, v: unknown) => {
          conditions.push([k, v]);
          return query;
        },
        in: (k: string, v: unknown[]) => {
          conditions.push([k, v]);
          return query;
        },
        is: (k: string, v: unknown) => {
          conditions.push([k, v]);
          return query;
        },
        order: () => query,
        limit: (n: number) => {
          end = n;
          return query;
        },
        range: (a: number, b: number) => {
          start = a;
          end = b + 1;
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
        then: (resolve: (value: unknown) => void) => {
          const rows = (tables[table] ?? [])
            .filter((r) =>
              conditions.every(([k, v]) =>
                Array.isArray(v) ? v.includes(r[k]) : r[k] === v,
              ),
            )
            .slice(start, end);
          resolve({
            data: single ? (rows[0] ?? null) : rows,
            error: fail ? { message: "failure" } : null,
          });
        },
      };
      return query;
    },
  };
}
const input = (db = client()) => ({
  admin: db as never,
  supabase: db as never,
  shopId: "shop",
  actorUserId: "actor",
  role: "owner" as const,
  filters,
  workOrderId: "",
  now: new Date("2026-10-17T12:00:00Z"),
});
beforeEach(() => {
  mocks.projection.mockReset().mockResolvedValue({
    assets: [["equipment", "Excavator"]],
    rows: [],
    partial: false,
  });
  mocks.board.mockReset().mockResolvedValue(board([]));
});
describe("Equipment Dispatch read boundaries", () => {
  it("filters mixed-product and foreign-tenant visits before pagination", () => {
    const data = board([
      ...Array.from({ length: 70 }, (_, i) =>
        visit(i, { vehicle: { id: "ordinary" } }),
      ),
      visit(90, { shopId: "other" }),
      visit(91, { vehicle: null }),
      ...Array.from({ length: 55 }, (_, i) => visit(i + 100)),
    ]);
    const result = equipmentDispatchPage(
      data,
      "shop",
      [["equipment", "Excavator"]],
      parseEquipmentQueueFilters({ page: "2" }),
    );
    expect(result.info.total).toBe(55);
    expect(result.items.map((v) => v.id)).toEqual(
      [150, 151, 152, 153, 154].map((n) => `visit-${n}`),
    );
  });
  it("applies asset, search and status before counts", () => {
    const data = board([visit(1), visit(2, { status: "scheduled" })]);
    expect(
      equipmentDispatchPage(
        data,
        "shop",
        [["equipment", "Excavator"]],
        parseEquipmentQueueFilters({ q: "excavator", status: "scheduled" }),
      ).items.map((v) => v.id),
    ).toEqual(["visit-2"]);
    expect(
      equipmentDispatchPage(
        data,
        "shop",
        [["equipment", "Excavator"]],
        parseEquipmentQueueFilters({ asset: "ordinary" }),
      ).info.total,
    ).toBe(0);
  });
  it("uses canonical actor/window and propagates partial scans; eligibility is explicit", async () => {
    mocks.projection.mockResolvedValue({ assets: [], rows: [], partial: true });
    mocks.board.mockResolvedValue({
      ...board([]),
      technicians: [
        { id: "a", fieldOperator: true },
        { id: "b", fieldOperator: false },
        { id: "c" },
      ],
    });
    const data = await loadEquipmentDispatch(input());
    expect(mocks.board).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "shop",
        actorUserId: "actor",
        startsAt: "2026-10-17T00:00:00.000Z",
        endsAt: "2026-10-24T12:00:00.000Z",
      }),
    );
    expect(data.partial).toBe(true);
    expect(data.technicians.map((t) => t.id)).toEqual(["a"]);
  });
  it("scopes participants to this tenant and page, and jobsites to the selected Equipment work customer", async () => {
    mocks.projection.mockResolvedValue({
      assets: [["equipment", "Excavator"]],
      partial: false,
      rows: [
        { id: "wo", assetId: "equipment", active: true, kind: "work_order" },
        { id: "estimate", active: true, kind: "estimate" },
      ],
    });
    mocks.board.mockResolvedValue(board([visit(1)]));
    const db = client({
      work_orders: [
        {
          id: "wo",
          shop_id: "shop",
          vehicle_id: "equipment",
          customer_id: "customer",
        },
      ],
      profiles: [
        { id: "actor", shop_id: "shop", full_name: "Ineligible support" },
        { id: "foreign", shop_id: "other", full_name: "Foreign" },
      ],
      service_addresses: [
        {
          id: "jobsite",
          shop_id: "shop",
          customer_id: "customer",
          address_line1: "Yard",
        },
        { id: "foreign", shop_id: "other", customer_id: "customer" },
        { id: "other-customer", shop_id: "shop", customer_id: "different" },
      ],
      service_visit_participants: [
        {
          service_visit_id: "visit-1",
          shop_id: "shop",
          user_id: "actor",
          role: "support",
          removed_at: null,
          acknowledged_at: null,
        },
        { service_visit_id: "visit-1", shop_id: "other", removed_at: null },
        {
          service_visit_id: "ordinary-visit",
          shop_id: "shop",
          removed_at: null,
        },
      ],
    });
    const data = await loadEquipmentDispatch({
      ...input(db),
      workOrderId: "wo",
    });
    expect(data.work.map((w) => w.id)).toEqual(["wo"]);
    expect(data.addresses.map((a) => a.id)).toEqual(["jobsite"]);
    expect(data.participants).toHaveLength(1);
    expect(data.technicians).toEqual([]);
    expect(data.participantNames).toEqual({ actor: "Ineligible support" });
    expect(
      db.calls.every((call) =>
        call.conditions.some(([k, v]) => k === "shop_id" && v === "shop"),
      ),
    ).toBe(true);
  });
  it("does not resolve an arbitrary work ID", async () => {
    const db = client();
    const data = await loadEquipmentDispatch({
      ...input(db),
      workOrderId: "foreign",
    });
    expect(data.selected).toBeNull();
    expect(db.calls).toHaveLength(0);
  });
  it("denies non-scheduling roles before reads", async () => {
    await expect(
      loadEquipmentDispatch({ ...input(), role: "parts" }),
    ).rejects.toThrow("denied");
    expect(mocks.board).not.toHaveBeenCalled();
    expect(mocks.projection).not.toHaveBeenCalled();
  });
  it("propagates canonical read failure", async () => {
    mocks.board.mockRejectedValue(new Error("denied"));
    await expect(loadEquipmentDispatch(input())).rejects.toThrow("denied");
  });
});

import { loadPersonalEquipmentAcknowledgements } from "@/features/equipment/dispatch/server/loadPersonalEquipmentAcknowledgements";
describe("personal Equipment acknowledgement reads", () => {
  it("returns only the actor's current Equipment assignments, without job details", async () => {
    const participant = (id: string, patch: Record<string, unknown> = {}) => ({
      service_visit_id: id,
      user_id: "mechanic",
      shop_id: "shop",
      removed_at: null,
      acknowledged_at: null,
      role: "support",
      added_at: "2026-10-17T12:00:00Z",
      ...patch,
    });
    const db = client({
      service_visit_participants: [
        participant("mine"),
        participant("ordinary"),
        participant("closed"),
        participant("other-user", { user_id: "other" }),
        participant("other-shop", { shop_id: "other" }),
        participant("removed", { removed_at: "2026-10-17" }),
        participant("acknowledged", { acknowledged_at: "2026-10-17" }),
      ],
      service_visits: [
        {
          id: "mine",
          shop_id: "shop",
          mode: "mobile",
          status: "working",
          work_order_id: "equipment-work",
        },
        {
          id: "ordinary",
          shop_id: "shop",
          mode: "mobile",
          status: "working",
          work_order_id: "ordinary-work",
        },
        {
          id: "closed",
          shop_id: "shop",
          mode: "mobile",
          status: "completed",
          work_order_id: "equipment-work",
        },
        {
          id: "other-user",
          shop_id: "shop",
          mode: "mobile",
          status: "working",
          work_order_id: "equipment-work",
        },
      ],
      work_orders: [
        {
          id: "equipment-work",
          shop_id: "shop",
          vehicle_id: "equipment",
          customer_name: "Private customer",
        },
        { id: "ordinary-work", shop_id: "shop", vehicle_id: "ordinary" },
      ],
      equipment_asset_profiles: [{ vehicle_id: "equipment", shop_id: "shop" }],
    });
    const result = await loadPersonalEquipmentAcknowledgements({
      admin: db as never,
      shopId: "shop",
      actorId: "mechanic",
    });
    expect(result).toEqual({
      rows: [
        { visitId: "mine", role: "support", addedAt: "2026-10-17T12:00:00Z" },
      ],
      partial: false,
    });
    expect(
      db.calls.every((c) =>
        c.conditions.some(([k, v]) => k === "shop_id" && v === "shop"),
      ),
    ).toBe(true);
    expect(db.calls[0].conditions).toContainEqual(["user_id", "mechanic"]);
    expect(JSON.stringify(result)).not.toMatch(
      /Private customer|work_order|vehicle|customer/,
    );
  });
  it("fails closed on a personal-assignment read error", async () => {
    await expect(
      loadPersonalEquipmentAcknowledgements({
        admin: client({}, true) as never,
        shopId: "shop",
        actorId: "mechanic",
      }),
    ).rejects.toThrow("Unable to load");
  });
});
