import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const technicianLoadMock = vi.hoisted(() => vi.fn());
const technicianAssignmentsMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/shared/lib/stats/getTechnicianLoadMetricsCore", () => ({
  getTechnicianLoadMetricsWithClient: technicianLoadMock,
}));

vi.mock("@/features/copilot/technician/server/assignedWork", () => ({
  listTechnicianWorkCandidates: technicianAssignmentsMock,
}));

import {
  isResumableAssistantFinalizationCheckpoint,
  type AssistantFinalizationActionCheckpoint,
} from "@/features/invoices/server/finalizeWorkOrderInvoice";
import {
  listLowStockPartsTool,
  listPartsBlockersTool,
} from "@/features/shop-assistant/server/tools/domains/inventory";
import { listBookingsTool } from "@/features/shop-assistant/server/tools/domains/scheduling";
import {
  listTechnicianAssignmentsTool,
  recommendWorkAssignmentsTool,
} from "@/features/shop-assistant/server/tools/domains/workforce";
import { listStalledWorkOrdersTool } from "@/features/shop-assistant/server/tools/domains/workOrders";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

const universalMigration = readFileSync(
  "supabase/migrations/20260816220000_shop_assistant_universal_actions.sql",
  "utf8",
);
const stateBuilder = readFileSync(
  "features/shop-assistant/server/state/buildShopState.ts",
  "utf8",
);

function sqlFunction(name: string): string {
  const marker = `create or replace function public.${name}(`;
  const start = universalMigration.indexOf(marker);
  if (start < 0) throw new Error(`Missing SQL function ${name}.`);
  const next = universalMigration.indexOf(
    "\ncreate or replace function public.",
    start + marker.length,
  );
  return universalMigration.slice(
    start,
    next < 0 ? universalMigration.length : next,
  );
}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function queryClient(
  rowsByTable: Record<string, Array<Record<string, unknown>>>,
  onRange?: (table: string, from: number, to: number) => void,
) {
  return {
    from(table: string) {
      let workOrderIds: string[] | null = null;
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        is() {
          return query;
        },
        in(column: string, values: string[]) {
          if (table === "work_order_lines" && column === "work_order_id") {
            workOrderIds = values;
          }
          return query;
        },
        order() {
          return query;
        },
        range(from: number, to: number) {
          onRange?.(table, from, to);
          const source = (rowsByTable[table] ?? []).filter(
            (row) =>
              !workOrderIds ||
              workOrderIds.includes(String(row.work_order_id ?? "")),
          );
          return Promise.resolve({
            data: source.slice(from, to + 1),
            error: null,
          });
        },
      };
      return query;
    },
  };
}

describe("shop assistant review hardening", () => {
  it("finds low stock beyond the first database page", async () => {
    const stockRows = Array.from({ length: 501 }, (_, index) => ({
      part_id: uuid(index + 1),
      location_id: uuid(index + 10_000),
      qty_on_hand: index === 500 ? 0 : 20,
      reorder_point: 5,
      reorder_qty: 5,
      parts: {
        name: `Part ${index + 1}`,
        sku: `SKU-${index + 1}`,
        low_stock_threshold: 5,
      },
    }));
    const ranges: number[] = [];
    const supabase = queryClient({ part_stock: stockRows }, (table, from) => {
      if (table === "part_stock") ranges.push(from);
    });

    const result = await listLowStockPartsTool.execute({ limit: 1 }, {
      actor: { shopId: uuid(90_000), supabase },
      threadId: uuid(90_001),
      idempotencyKey: "low-stock-page-test",
    } as never);

    expect(ranges).toEqual([0, 500]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.partId).toBe(uuid(501));
  });

  it("finds an outstanding parts blocker beyond completed recent rows", async () => {
    const requestItems = Array.from({ length: 501 }, (_, index) => ({
      id: uuid(index + 1),
      description: `Requested part ${index + 1}`,
      qty_approved: index === 500 ? 3 : 1,
      qty_received: index === 500 ? 1 : 1,
      work_order_id: uuid(70_000),
    }));
    const ranges: number[] = [];
    const supabase = queryClient(
      {
        part_request_items: requestItems,
        work_orders: [{ id: uuid(70_000), custom_id: "WO-70000" }],
      },
      (table, from) => {
        if (table === "part_request_items") ranges.push(from);
      },
    );

    const result = await listPartsBlockersTool.execute({ limit: 1 }, {
      actor: { shopId: uuid(90_000), supabase },
      threadId: uuid(90_001),
      idempotencyKey: "parts-blocker-page-test",
    } as never);

    expect(ranges).toEqual([0, 500]);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toMatchObject({
      requestItemId: uuid(501),
      remainingQuantity: 2,
      workOrderId: uuid(70_000),
      workOrderLabel: "WO #WO-70000",
    });
  });

  it("lists a named technician's canonical assignments without requiring an active shift", async () => {
    technicianLoadMock.mockClear();
    technicianAssignmentsMock.mockResolvedValueOnce([
      {
        id: uuid(80_000),
        customId: "EL000004",
        status: "active",
        concern: null,
        description: null,
        vehicleYear: 2021,
        vehicleMake: "Ford",
        vehicleModel: "F-150",
        vehicleVin: null,
        vehicleUnitNumber: null,
        lineIds: [uuid(80_001)],
        lines: [
          {
            id: uuid(80_001),
            complaint: null,
            description: "Replace front brake pads",
            status: "in_progress",
            cause: null,
            correction: null,
            holdReason: null,
            priority: null,
            createdAt: null,
            updatedAt: null,
          },
        ],
        lineComplaints: [],
      },
    ]);
    const supabase = queryClient({
      profiles: [
        {
          id: uuid(79_000),
          user_id: uuid(79_001),
          shop_id: uuid(90_000),
          full_name: "Test Mechanic",
          role: "mechanic",
        },
      ],
    });

    const result = await listTechnicianAssignmentsTool.execute(
      { query: "test mechanic", limit: 20 },
      {
        actor: { shopId: uuid(90_000), supabase },
        threadId: uuid(90_001),
        idempotencyKey: "named-technician-assignments-test",
      } as never,
    );

    expect(technicianLoadMock).not.toHaveBeenCalled();
    expect(technicianAssignmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: uuid(90_000),
        technicianIds: [uuid(79_000), uuid(79_001)],
      }),
    );
    expect(result.technician.name).toBe("Test Mechanic");
    expect(result.workOrders[0]).toMatchObject({
      customId: "EL000004",
      lines: [{ label: "Replace front brake pads" }],
    });
  });

  it("finds stalled approval work beyond older non-stalled queued rows", async () => {
    const now = Date.now();
    const workOrders = Array.from({ length: 501 }, (_, index) => ({
      id: uuid(index + 1),
      custom_id: `WO-${index + 1}`,
      status: index === 500 ? "awaiting_approval" : "queued",
      updated_at: new Date(
        now - (index === 500 ? 13 : 20) * 60 * 60 * 1000,
      ).toISOString(),
    }));
    const ranges: number[] = [];
    const supabase = queryClient({ work_orders: workOrders }, (table, from) => {
      if (table === "work_orders") ranges.push(from);
    });

    const result = await listStalledWorkOrdersTool.execute({ limit: 1 }, {
      actor: { shopId: uuid(90_000), supabase },
      threadId: uuid(90_001),
      idempotencyKey: "stalled-work-page-test",
    } as never);

    expect(ranges).toEqual([0, 500]);
    expect(result.workOrders).toHaveLength(1);
    expect(result.workOrders[0]).toMatchObject({
      workOrderId: uuid(501),
      status: "awaiting_approval",
    });
  });

  it("ranks eligible work from every work-order page", async () => {
    const workOrders = Array.from({ length: 501 }, (_, index) => ({
      id: uuid(index + 1),
      custom_id: `WO-${index + 1}`,
      status: "queued",
      priority: index === 500 ? 99 : 0,
      is_waiter: false,
      created_at: "2026-08-17T12:00:00.000Z",
      updated_at: "2026-08-17T12:00:00.000Z",
    }));
    const lines = workOrders.map((workOrder, index) => ({
      id: uuid(index + 20_000),
      work_order_id: workOrder.id,
      description: `Job ${index + 1}`,
      labor_time: 1,
      assigned_tech_id: null,
      line_status: "awaiting",
      status: "awaiting",
      priority: 0,
      job_priority: null,
    }));
    technicianLoadMock.mockResolvedValueOnce({
      rows: [
        {
          techId: uuid(80_000),
          name: "Available Tech",
          role: "mechanic",
          currentActiveJobs: 0,
          completedJobsToday: 0,
          utilizationPct: 0,
          shiftSecondsToday: 3_600,
        },
      ],
      summary: { shopUtilizationPct: 0 },
    });
    const workOrderRanges: number[] = [];
    const supabase = queryClient(
      { work_orders: workOrders, work_order_lines: lines },
      (table, from) => {
        if (table === "work_orders") workOrderRanges.push(from);
      },
    );

    const result = await recommendWorkAssignmentsTool.execute({ limit: 1 }, {
      actor: { shopId: uuid(90_000), supabase },
      threadId: uuid(90_001),
      idempotencyKey: "workforce-page-test",
    } as never);

    expect(workOrderRanges).toEqual([0, 500]);
    expect(result.recommendations[0]?.workOrderId).toBe(uuid(501));
  });

  it("detects booking conflicts beyond the displayed result cap", async () => {
    const cancelled = Array.from({ length: 500 }, (_, index) => ({
      id: uuid(index + 1),
      starts_at: new Date(Date.UTC(2026, 7, 17, 0, index)).toISOString(),
      ends_at: null,
      status: "cancelled",
      customer_id: null,
      vehicle_id: null,
      work_order_id: null,
      notes: null,
      updated_at: null,
    }));
    const rows = [
      ...cancelled,
      {
        id: uuid(501),
        starts_at: "2026-08-18T16:00:00.000Z",
        ends_at: "2026-08-18T17:00:00.000Z",
        status: "scheduled",
        customer_id: null,
        vehicle_id: null,
        work_order_id: null,
        notes: null,
        updated_at: null,
      },
      {
        id: uuid(502),
        starts_at: "2026-08-18T16:30:00.000Z",
        ends_at: "2026-08-18T17:30:00.000Z",
        status: "scheduled",
        customer_id: null,
        vehicle_id: null,
        work_order_id: null,
        notes: null,
        updated_at: null,
      },
    ];
    const ranges: number[] = [];
    const query = {
      select() {
        return query;
      },
      eq() {
        return query;
      },
      gte() {
        return query;
      },
      lt() {
        return query;
      },
      order() {
        return query;
      },
      range(from: number, to: number) {
        ranges.push(from);
        return Promise.resolve({
          data: rows.slice(from, to + 1),
          error: null,
        });
      },
    };
    const supabase = { from: () => query };

    const result = await listBookingsTool.execute({ limit: 1 }, {
      actor: { shopId: uuid(90_000), supabase },
      threadId: uuid(90_001),
      idempotencyKey: "booking-conflict-page-test",
    } as never);

    expect(ranges).toEqual([0, 500]);
    expect(result.bookings).toHaveLength(1);
    expect(result.conflicts).toEqual([
      {
        firstBookingId: uuid(501),
        secondBookingId: uuid(502),
        startsAt: "2026-08-18T16:30:00.000Z",
        endsAt: "2026-08-18T17:00:00.000Z",
      },
    ]);
    expect(result.summary).toContain("502 appointment(s) matched");
  });

  it("resumes only the exact executing invoice checkpoint", () => {
    const actionId = uuid(1);
    const shopId = uuid(2);
    const workOrderId = uuid(3);
    const actorAuthUserId = uuid(4);
    const invoiceId = uuid(5);
    const invoiceVersionId = uuid(6);
    const checkpoint: AssistantFinalizationActionCheckpoint = {
      id: actionId,
      shop_id: shopId,
      requested_by: actorAuthUserId,
      confirmed_by: actorAuthUserId,
      tool_name: "finalize_invoice",
      status: "executing",
      input: { workOrderId },
      result: {
        ok: true,
        sideEffectsPending: true,
        workOrderId,
        invoiceId,
        invoiceVersionId,
      },
    };
    const candidate = {
      checkpoint,
      actionId,
      shopId,
      workOrderId,
      actorAuthUserId,
      version: {
        id: invoiceVersionId,
        invoice_id: invoiceId,
        work_order_id: workOrderId,
      },
    };

    expect(isResumableAssistantFinalizationCheckpoint(candidate)).toBe(true);
    expect(
      isResumableAssistantFinalizationCheckpoint({
        ...candidate,
        checkpoint: { ...checkpoint, status: "succeeded" },
      }),
    ).toBe(false);
    expect(
      isResumableAssistantFinalizationCheckpoint({
        ...candidate,
        checkpoint: {
          ...checkpoint,
          result: {
            ok: true,
            sideEffectsPending: true,
            workOrderId,
            invoiceId,
            invoiceVersionId: uuid(7),
          },
        },
      }),
    ).toBe(false);
  });

  it("surfaces audit failures to strict callers without changing the default", async () => {
    const insert = vi
      .fn()
      .mockResolvedValue({ error: { message: "activity log unavailable" } });
    const supabase = { from: () => ({ insert }) };
    const event = {
      supabase: supabase as never,
      event: "invoice_finalized",
      entityType: "invoice_version",
      entityId: uuid(1),
    };

    await expect(logOperationalEvent(event)).resolves.toBeUndefined();
    await expect(
      logOperationalEvent({ ...event, throwOnFailure: true }),
    ).rejects.toThrow("activity log unavailable");
  });

  it("keeps lifecycle writes and fleet metrics on canonical durable state", () => {
    const addLine = sqlFunction("shop_assistant_add_work_order_line_atomic");
    const partRequest = sqlFunction(
      "shop_assistant_create_part_request_atomic",
    );
    const approval = sqlFunction(
      "shop_assistant_record_approval_decision_atomic",
    );
    const purchaseOrder = sqlFunction(
      "shop_assistant_create_purchase_order_atomic",
    );
    const markReady = sqlFunction("mark_work_order_ready_atomic");
    const finalizeInvoice = sqlFunction(
      "shop_assistant_finalize_invoice_atomic",
    );
    const fleetState = stateBuilder.slice(
      stateBuilder.indexOf("async function buildFleetState"),
      stateBuilder.indexOf("function mapNotificationCode"),
    );

    expect(addLine).toContain("'awaiting_approval',\n    'pending'");
    expect(approval).toContain(
      "set approval_state = 'declined',\n        status = 'on_hold',\n        line_status = 'deferred'",
    );
    expect(markReady).toContain(
      "and lower(coalesce(line_status::text, '')) not in (\n          'declined', 'deferred'",
    );
    expect(partRequest).toContain(
      "set_config('request.jwt.claim.sub', p_actor_user_id::text, true)",
    );
    expect(partRequest).not.toContain("set requested_by = p_actor_user_id");
    expect(
      partRequest.indexOf("set_config('request.jwt.claim.sub'"),
    ).toBeLessThan(partRequest.indexOf("create_part_request_with_items("));
    expect(purchaseOrder).toContain(
      "FINANCIALLY_LOCKED: purchase orders cannot be linked after invoice finalization.",
    );
    expect(finalizeInvoice).toContain("'sideEffectsPending', true");
    expect(finalizeInvoice).toContain("and status = 'executing';");
    expect(finalizeInvoice).not.toContain("shop_assistant_succeed_action");
    expect(fleetState).toContain('.in("severity", ["safety", "compliance"])');
    expect(fleetState.match(/count: "exact"/g)).toHaveLength(3);
    expect(fleetState).not.toContain("/critical|urgent|high/i");
  });
});
