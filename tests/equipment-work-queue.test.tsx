import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseEquipmentQueueFilters,
  equipmentQueueQuery,
} from "@/features/equipment/lib/equipmentWorkQueue";
import type { EquipmentIdentityRow } from "@/features/equipment/lib/equipmentDirectoryQuery";

const mocks = vi.hoisted(() => ({ index: vi.fn() }));
vi.mock("@/features/equipment/server/loadEquipmentAssetList", () => ({
  loadEquipmentAssetList: mocks.index,
}));
import { loadEquipmentWorkQueue } from "@/features/equipment/server/loadEquipmentWorkQueue";
import EquipmentWorkQueueView from "@/features/equipment/components/EquipmentWorkQueueView";

type Row = Record<string, unknown>;
const identity = (id: string): EquipmentIdentityRow => ({
  assetId: id,
  updatedAt: "2026-10-01",
  unitNumber: id,
  year: 2024,
  make: "CAT",
  model: "320",
  serialNumber: "serial",
  equipmentClass: "crawler_excavator",
  equipmentClassLabel: "Excavator",
  customerId: "customer-1",
  customerName: "North Yard",
  siteName: null,
  operatingStatus: "operational",
});
const record = (n: number, patch: Row = {}): Row => ({
  id: `wo-${String(n).padStart(5, "0")}`,
  shop_id: "shop-1",
  vehicle_id: "asset-1",
  custom_id: String(n),
  status: "completed",
  record_type: "work_order",
  estimate_number: null,
  estimate_status: null,
  customer_name: "North Yard",
  created_at: new Date(Date.UTC(2026, 9, 17) - n * 1000).toISOString(),
  scheduled_at: null,
  ...patch,
});
function client(records: Row[], fail = false) {
  const calls: Array<{
    table: string;
    columns: string;
    scope: unknown;
    ids: unknown[];
  }> = [];
  return {
    calls,
    from(table: string) {
      const call = {
        table,
        columns: "",
        scope: undefined as unknown,
        ids: [] as unknown[],
      };
      calls.push(call);
      let offset = 0,
        end = 0;
      const query = {
        select(columns: string) {
          call.columns = columns;
          return query;
        },
        eq(_column: string, value: unknown) {
          call.scope = value;
          return query;
        },
        in(_column: string, ids: unknown[]) {
          call.ids = ids;
          return query;
        },
        order() {
          return query;
        },
        range(from: number, to: number) {
          offset = from;
          end = to;
          return query;
        },
        then(resolve: (v: unknown) => void) {
          resolve({
            data: records
              .filter(
                (r) =>
                  r.shop_id === call.scope && call.ids.includes(r.vehicle_id),
              )
              .slice(offset, end + 1),
            error: fail ? { message: "database error" } : null,
          });
        },
      };
      return query;
    },
  };
}
const input = (
  admin: ReturnType<typeof client>,
  params: Record<string, string> = {},
) => ({
  admin: admin as never,
  supabase: {} as never,
  shopId: "shop-1",
  role: "owner" as const,
  filters: parseEquipmentQueueFilters(params),
});
beforeEach(() =>
  mocks.index.mockReset().mockResolvedValue({
    rows: [identity("asset-1"), identity("asset-2")],
    capped: false,
  }),
);

describe("Equipment work queue read model", () => {
  it("filters Equipment before reading and returns older matches beyond the recent-100 feed", async () => {
    const data = Array.from({ length: 620 }, (_, i) => record(i));
    data[619] = record(619, { status: "in_progress" });
    const db = client([
      ...data,
      record(900, { vehicle_id: "ordinary-vehicle" }),
      record(901, { shop_id: "other-shop" }),
    ]);
    const queue = await loadEquipmentWorkQueue(
      input(db, { activity: "active" }),
    );
    expect(queue.rows.map((r) => r.id)).toEqual(["wo-00619"]);
    expect(queue.summary).toEqual({
      records: 1,
      workOrders: 1,
      estimates: 0,
      active: 1,
    });
    expect(db.calls).toHaveLength(2);
    for (const call of db.calls) {
      expect(call.scope).toBe("shop-1");
      expect(call.ids).toEqual(["asset-1", "asset-2"]);
      expect(call.columns).not.toContain("*");
      expect(call.columns).not.toMatch(/total|price|cost|payment/);
    }
    expect(queue.partial).toBe(false);
  });
  it("counts all matches before paginating and clamps invalid pages", async () => {
    const db = client(Array.from({ length: 125 }, (_, i) => record(i)));
    const queue = await loadEquipmentWorkQueue(input(db, { page: "3" }));
    expect(queue.rows).toHaveLength(25);
    expect(queue.rows[0].title).toBe("WO-100");
    expect(queue.info).toMatchObject({
      page: 3,
      pageCount: 3,
      total: 125,
      from: 101,
      to: 125,
    });
    expect(queue.summary.records).toBe(125);
  });
  it("uses canonical estimate classification, including converted estimates with retained numbers", async () => {
    const db = client([
      record(1, {
        record_type: "estimate",
        estimate_number: "E-1",
        estimate_status: "draft",
        status: "new",
      }),
      record(2, { estimate_number: "E-2", status: "in_progress" }),
      record(3, {
        record_type: null,
        estimate_number: "E-3",
        estimate_status: "declined",
        status: "new",
      }),
    ]);
    const queue = await loadEquipmentWorkQueue(input(db));
    expect(queue.rows.map((r) => [r.kind, r.active, r.href])).toEqual([
      ["estimate", true, "/estimates/wo-00001"],
      ["work_order", true, "/work-orders/wo-00002"],
      ["estimate", false, "/estimates/wo-00003"],
    ]);
    const estimates = await loadEquipmentWorkQueue(
      input(db, { kind: "estimate", status: "draft" }),
    );
    expect(estimates.rows.map((r) => r.title)).toEqual(["Estimate E-1"]);
  });
  it("never widens the existing parts role's record links", async () => {
    const queue = await loadEquipmentWorkQueue({
      ...input(client([record(1)])),
      role: "parts",
    });
    expect(queue.rows[0].href).toBeNull();
    render(
      <EquipmentWorkQueueView
        queue={queue}
        filters={parseEquipmentQueueFilters({})}
      />,
    );
    expect(screen.getByText("WO-1")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "WO-1" })).toBeNull();
  });
  it("rejects assigned-work-only users before shop-wide reads", async () => {
    const db = client([]);
    await expect(
      loadEquipmentWorkQueue({ ...input(db), role: "mechanic" }),
    ).rejects.toThrow("access denied");
    expect(mocks.index).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });
  it("narrows asset history before reads and rejects arbitrary non-Equipment asset IDs", async () => {
    const db = client([record(1), record(2, { vehicle_id: "asset-2" })]);
    const queue = await loadEquipmentWorkQueue(input(db, { asset: "asset-2" }));
    expect(db.calls[0].ids).toEqual(["asset-2"]);
    expect(queue.rows.map((r) => r.id)).toEqual(["wo-00002"]);
    db.calls.length = 0;
    const empty = await loadEquipmentWorkQueue(
      input(db, { asset: "foreign-asset" }),
    );
    expect(empty.rows).toEqual([]);
    expect(db.calls).toEqual([]);
  });
  it("labels bounded scans and inherited directory caps as partial", async () => {
    const db = client(Array.from({ length: 20_001 }, (_, i) => record(i)));
    const queue = await loadEquipmentWorkQueue(input(db));
    expect(queue.summary.records).toBe(20_000);
    expect(queue.partial).toBe(true);
    mocks.index.mockResolvedValue({
      rows: [identity("asset-1")],
      capped: true,
    });
    const capped = await loadEquipmentWorkQueue(input(client([record(1)])));
    render(
      <EquipmentWorkQueueView
        queue={capped}
        filters={parseEquipmentQueueFilters({})}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Limited scan");
    expect(screen.getByText(/matching records/)).toHaveTextContent(
      "in this scan",
    );
  });
  it("fails closed on read errors instead of reporting zero work", async () => {
    await expect(
      loadEquipmentWorkQueue(input(client([], true))),
    ).rejects.toThrow("Unable to load");
  });
  it("keeps unmatched selected filters visible instead of displaying All", async () => {
    const filters = parseEquipmentQueueFilters({
      asset: "missing",
      status: "waiting_parts",
    });
    const queue = await loadEquipmentWorkQueue(
      input(client([]), { asset: "missing", status: "waiting_parts" }),
    );
    render(<EquipmentWorkQueueView queue={queue} filters={filters} />);
    expect(screen.getByRole("combobox", { name: "Asset" })).toHaveValue(
      "missing",
    );
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "waiting_parts",
    );
    expect(
      screen.getByText("No Equipment work matches these filters."),
    ).toBeTruthy();
  });

  it("preserves all filters in pagination URLs and bounds malformed inputs", () => {
    const filters = parseEquipmentQueueFilters({
      q: " North ",
      kind: "estimate",
      status: "waiting_for_parts",
      activity: "active",
      asset: "asset-2",
      page: "-1",
    });
    expect(filters.page).toBe(1);
    expect(equipmentQueueQuery(filters, 2)).toBe(
      "?q=North&asset=asset-2&kind=estimate&activity=active&status=waiting_for_parts&page=2",
    );
    expect(
      parseEquipmentQueueFilters({
        kind: "invalid",
        activity: "invalid",
        q: "a".repeat(200),
      }),
    ).toMatchObject({ kind: "", activity: "", q: "a".repeat(100) });
  });
});

it.each([
  ["ready_to_work", "queued"],
  ["waiting_parts", "waiting_parts"],
  ["ready_to_invoice", "completed"],
] as const)("uses canonical %s semantics before pagination", async (stage, status) => {
  const db = client([...Array.from({length: 120}, (_, n) => record(n, {status: "in_progress"})), record(121, {status}), record(122, {status, record_type: "estimate", estimate_status: "approved"})]);
  const result = await loadEquipmentWorkQueue({admin: db as never, supabase: {} as never, shopId: "shop-1", role: "owner", filters: parseEquipmentQueueFilters({stage})});
  expect(result.rows.map(row => row.id)).toEqual(["wo-00121"]);
  expect(result.info.total).toBe(1);
});
