import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { supplementSnapshotWithWorkOrders } from "@/features/equipment/server/supplementWorkspaceWork";
import type { VehicleWorkspaceSnapshot } from "@/features/vehicles/lib/vehicleWorkspace";

type Row = Record<string, unknown>;

function snapshot(patch: Partial<VehicleWorkspaceSnapshot> = {}): VehicleWorkspaceSnapshot {
  return { identity: { id: "asset" }, activeWork: [], recentTimeline: [], ...patch } as unknown as VehicleWorkspaceSnapshot;
}

function workOrder(id: string, patch: Row = {}) {
  return {
    id,
    custom_id: id.toUpperCase(),
    status: "in_progress",
    record_type: "work_order",
    approval_state: null,
    estimate_number: null,
    estimate_status: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-05T00:00:00Z",
    ...patch,
  } as never;
}

const invoiceItem = {
  kind: "invoice",
  title: "Invoice 7",
  status: "open",
  detail: null,
  occurredAt: "2026-10-02T00:00:00Z",
  reference: { sourceType: "invoice", sourceId: "inv-7", sourceLabel: "Invoice 7", href: "/invoices/inv-7" },
};

describe("supplementSnapshotWithWorkOrders", () => {
  it("fills Active work and Service history from evidence when the snapshot saw no work orders", () => {
    const base = snapshot();
    const result = supplementSnapshotWithWorkOrders(base, [
      workOrder("wo-open", { updated_at: "2026-10-09T00:00:00Z" }),
      workOrder("wo-done", { status: "completed", updated_at: "2026-09-01T00:00:00Z" }),
    ]);

    expect(result.activeWork).toHaveLength(1);
    expect(result.activeWork[0]).toMatchObject({
      kind: "work_order",
      status: "in_progress",
      reference: { sourceType: "work_order", sourceId: "wo-open", href: "/work-orders/wo-open" },
    });
    // Newest first, both orders appear in history.
    expect(result.recentTimeline.map((event) => event.reference.sourceId)).toEqual(["wo-open", "wo-done"]);
    // The canonical snapshot is not mutated.
    expect(base.activeWork).toEqual([]);
    expect(base.recentTimeline).toEqual([]);
  });

  it("keeps what the snapshot already had and adds work orders alongside it", () => {
    const result = supplementSnapshotWithWorkOrders(
      snapshot({ activeWork: [invoiceItem as never] }),
      [workOrder("wo-open")],
    );
    expect(result.activeWork.map((item) => item.reference.sourceId).sort()).toEqual(["inv-7", "wo-open"]);
  });

  it("links estimates to the estimate page and labels them as estimates", () => {
    const result = supplementSnapshotWithWorkOrders(snapshot(), [
      workOrder("est-1", { record_type: "estimate", estimate_number: "E-100", estimate_status: "sent", status: "sent" }),
    ]);
    expect(result.activeWork[0]).toMatchObject({ kind: "estimate", status: "sent", title: "Estimate E-100" });
    expect(result.activeWork[0].reference.href).toBe("/estimates/est-1");
  });

  it("returns the snapshot untouched for roles that already see work orders", () => {
    const sawInActive = snapshot({
      activeWork: [{ ...invoiceItem, kind: "work_order", reference: { sourceType: "work_order", sourceId: "wo-1", sourceLabel: "WO-1", href: "/work-orders/wo-1" } } as never],
    });
    expect(supplementSnapshotWithWorkOrders(sawInActive, [workOrder("wo-1"), workOrder("wo-2")])).toBe(sawInActive);

    const sawInTimeline = snapshot({
      recentTimeline: [{ kind: "work_order", title: "WO-1", detail: null, occurredAt: "2026-10-01T00:00:00Z", reference: { sourceType: "work_order", sourceId: "wo-1", sourceLabel: "WO-1", href: "/work-orders/wo-1" } } as never],
    });
    expect(supplementSnapshotWithWorkOrders(sawInTimeline, [workOrder("wo-1")])).toBe(sawInTimeline);
  });

  it("returns the snapshot untouched when there is no work-order evidence", () => {
    const base = snapshot();
    expect(supplementSnapshotWithWorkOrders(base, [])).toBe(base);
  });

  it("adds only the non-financial work-order fields", () => {
    const result = supplementSnapshotWithWorkOrders(snapshot(), [
      workOrder("wo-open", { invoice_total: 999, labor_total: 500 }),
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("999");
    expect(serialized).not.toContain("500");
    expect(result.activeWork[0].amount).toBeUndefined();
  });
});
