import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadEquipmentLineStatus } from "@/features/equipment/dispatch/server/loadLineStatus";

const SHOP = "shop-1";
const LINE = "line-1";

type Tables = Record<string, unknown[]>;

/** Minimal query-builder fake that records the filters each table read applied. */
function fakeAdmin(tables: Tables, filters: Record<string, Record<string, unknown>>) {
  return {
    from(table: string) {
      const applied: Record<string, unknown> = (filters[table] = {});
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          applied[column] = value;
          return builder;
        },
        in: (column: string, value: unknown) => {
          applied[column] = value;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: tables[table] ?? [], error: null }),
      };
      return builder;
    },
  } as never;
}

const line = {
  id: LINE,
  work_order_id: "wo-1",
  description: "Replace hydraulic seal",
  complaint: null,
  status: "in_progress",
  approval_state: "approved",
  hold_reason: null,
  cause: null,
  correction: null,
  assigned_tech_id: "primary",
};

describe("loadEquipmentLineStatus", () => {
  it("scopes every read to the viewer's shop", async () => {
    const filters: Record<string, Record<string, unknown>> = {};
    const admin = fakeAdmin(
      {
        work_order_lines: [line],
        work_order_line_technicians: [],
        work_order_line_labor_segments: [
          { technician_id: "primary", started_at: "2026-10-17T10:00:00Z", ended_at: null, pause_reason: null },
        ],
        profiles: [{ id: "primary", full_name: "Pat" }],
      },
      filters,
    );
    const result = await loadEquipmentLineStatus({
      admin,
      shopId: SHOP,
      lineId: LINE,
      viewerProfileId: "primary",
      viewerCanManage: false,
    });

    expect(result?.names).toEqual({ primary: "Pat" });
    expect(filters.work_order_lines.shop_id).toBe(SHOP);
    expect(filters.work_order_line_labor_segments.shop_id).toBe(SHOP);
    expect(filters.profiles.shop_id).toBe(SHOP);
  });

  it("hides the line from a technician who is not assigned to it", async () => {
    const result = await loadEquipmentLineStatus({
      admin: fakeAdmin({ work_order_lines: [line], work_order_line_technicians: [] }, {}),
      shopId: SHOP,
      lineId: LINE,
      viewerProfileId: "stranger",
      viewerCanManage: false,
    });
    expect(result).toBeNull();
  });

  it("shows a line to dispatch staff, and to a supporting technician", async () => {
    const staff = await loadEquipmentLineStatus({
      admin: fakeAdmin({ work_order_lines: [line], work_order_line_technicians: [] }, {}),
      shopId: SHOP,
      lineId: LINE,
      viewerProfileId: "office",
      viewerCanManage: true,
    });
    expect(staff?.viewerAssigned).toBe(false);

    const support = await loadEquipmentLineStatus({
      admin: fakeAdmin(
        { work_order_lines: [line], work_order_line_technicians: [{ technician_id: "helper" }] },
        {},
      ),
      shopId: SHOP,
      lineId: LINE,
      viewerProfileId: "helper",
      viewerCanManage: false,
    });
    expect(support?.viewerAssigned).toBe(true);
  });

  it("returns null for a line outside the shop", async () => {
    const result = await loadEquipmentLineStatus({
      admin: fakeAdmin({ work_order_lines: [] }, {}),
      shopId: SHOP,
      lineId: LINE,
      viewerProfileId: "office",
      viewerCanManage: true,
    });
    expect(result).toBeNull();
  });
});
