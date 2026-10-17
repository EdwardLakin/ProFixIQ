import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ index: vi.fn() }));
vi.mock("@/features/equipment/server/loadEquipmentAssetList", () => ({
  loadEquipmentAssetList: mocks.index,
}));
import { loadEquipmentWorkQueue } from "@/features/equipment/server/loadEquipmentWorkQueue";
import { parseEquipmentQueueFilters } from "@/features/equipment/lib/equipmentWorkQueue";

type Row = Record<string, unknown>;
function db(customers: Row[], fail = false) {
  const work = [
    { id: "wo-linked", customer_id: "old-owner", customer_name: null },
    {
      id: "wo-snapshot",
      customer_id: "old-owner",
      customer_name: "Historical snapshot",
    },
    { id: "wo-foreign", customer_id: "foreign", customer_name: "  " },
    { id: "wo-missing", customer_id: null, customer_name: null },
  ].map((row) => ({
    ...row,
    vehicle_id: "asset",
    shop_id: "shop",
    status: "awaiting",
    record_type: "work_order",
    created_at: "2026-10-17",
  }));
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  return {
    calls,
    from(table: string) {
      const call = { table, filters: [] as [string, unknown][] };
      calls.push(call);
      const q = {
        select: () => q,
        order: () => q,
        range: () => q,
        eq: (key: string, value: unknown) => {
          call.filters.push([key, value]);
          return q;
        },
        in: (key: string, value: unknown[]) => {
          call.filters.push([key, value]);
          return q;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: (table === "customers" ? customers : work).filter((r: Row) =>
              call.filters.every(([k, v]) =>
                Array.isArray(v) ? v.includes(r[k]) : r[k] === v,
              ),
            ),
            error: table === "customers" && fail ? { message: "failed" } : null,
          }),
      };
      return q;
    },
  };
}
beforeEach(() =>
  mocks.index.mockResolvedValue({
    capped: false,
    rows: [
      {
        assetId: "asset",
        customerId: "new-owner",
        customerName: "New asset owner",
        unitNumber: "EX-1",
      },
    ],
  }),
);
const load = (admin: ReturnType<typeof db>, q = "") =>
  loadEquipmentWorkQueue({
    admin: admin as never,
    supabase: {} as never,
    role: "owner",
    shopId: "shop",
    filters: parseEquipmentQueueFilters({ q }),
  });
describe("Equipment work customer context", () => {
  it("resolves the WO account, preserves a historical snapshot and never substitutes the asset owner or another tenant", async () => {
    const admin = db([
      { id: "old-owner", shop_id: "shop", business_name: "QA Customer" },
      {
        id: "foreign",
        shop_id: "other-shop",
        business_name: "Private customer",
      },
    ]);
    const result = await load(admin);
    expect(
      Object.fromEntries(result.rows.map((r) => [r.id, r.customerName])),
    ).toEqual({
      "wo-linked": "QA Customer",
      "wo-snapshot": "Historical snapshot",
      "wo-foreign": null,
      "wo-missing": null,
    });
    expect(admin.calls.find((c) => c.table === "customers")?.filters).toEqual([
      ["shop_id", "shop"],
      ["id", ["old-owner", "foreign"]],
    ]);
    expect((await load(admin, "QA Customer")).rows.map((r) => r.id)).toEqual([
      "wo-linked",
    ]);
  });
  it("surfaces read failures instead of misreporting an absent customer", async () => {
    await expect(load(db([], true))).rejects.toThrow(
      "Unable to load Equipment work customers",
    );
  });
});
