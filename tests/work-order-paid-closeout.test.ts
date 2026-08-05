import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { toSafeDatabaseError } from "@/features/shared/lib/server/safeDatabaseError";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260805050000_reconcile_work_order_paid_closeout.sql",
);
const markReadyRoute = read("app/api/work-orders/[id]/mark-ready/route.ts");
const portalLoader = read("features/portal/server/portalWorkOrders.ts");
const quoteClient = read(
  "features/portal/app/quotes/[id]/QuotePageClient.tsx",
);
const boardHook = read("features/shared/hooks/useWorkOrderBoard.ts");
const shiftTracker = read("features/shared/components/ShiftTracker.tsx");
const receiveItem = read("app/api/parts/_lib/receivePartRequestItem.ts");
const lifecycleCommand = read("app/api/parts/_lib/lifecycleCommand.ts");

describe("work-order paid closeout boundary", () => {
  it("derives the shell from durable line and quote state", () => {
    expect(migration).toContain(
      "create or replace function private.reconcile_work_order_state",
    );
    expect(migration).toContain("v_nonterminal_count = 0 then 'ready_to_invoice'");
    expect(migration).toContain("v_pending_quote_count + v_pending_line_count");
    expect(migration).toContain("after insert or update of");
    expect(migration).toContain("approval_state,");
    expect(migration).toContain("line_status,");
    expect(migration).not.toContain("pg_catalog.current_date()");
  });

  it("moves history creation from operational completion to paid settlement", () => {
    expect(markReadyRoute).not.toContain("syncWorkOrderToHistory");
    expect(migration).toContain(
      "create or replace function public.sync_paid_work_order_history",
    );
    expect(migration).toContain("when (new.payment_status = 'paid')");
    expect(migration).toContain("insert into public.history(");
    expect(migration).toContain("'closed_from', 'paid_invoice'");
  });

  it("removes paid work from the active board and routes the portal to history", () => {
    expect(boardHook).toContain('workOrder.payment_status === "paid"');
    expect(boardHook).toContain("!paidWorkOrderIds.has(row.work_order_id)");
    expect(portalLoader).toContain('href: "/portal/history"');
    expect(portalLoader).toContain("paymentStatus: workOrder.payment_status");
    expect(portalLoader).toContain("paidAt: workOrder.paid_at");
  });

  it("keeps authorized direct lines visible without making them actionable quotes", () => {
    expect(quoteClient).toContain('.from("work_order_lines")');
    expect(quoteClient).toContain('source: "work_order" as const');
    expect(quoteClient).toContain(
      '.filter((line) => line.source === "quote")',
    );
    expect(quoteClient).toContain("item.workOrderLineId === line.id");
  });

  it("reconciles direct technicians, shift display, approval audits, and PO closeout", () => {
    expect(boardHook).toContain("assigned_tech_id,assigned_to");
    expect(shiftTracker).toContain(
      "applyShiftState(await fetchMobileShiftState(), true)",
    );
    expect(migration).toContain("trg_work_order_line_approval_audit");
    expect(migration).toContain("insert into public.work_order_approvals(");
    expect(migration).toContain("set status = 'received'");
    expect(migration).toContain("received_at = coalesce(received_at, current_date)");
  });

  it("maps unexpected database failures to a correlation id", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = toSafeDatabaseError(
      {
        message: 'new row violates check constraint "secret_constraint"',
        details: "Failing row contains private values",
        code: "23514",
      },
      {
        context: "test",
        fallback: "The operation could not be completed.",
      },
    );

    expect(result.message).toBe("The operation could not be completed.");
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.message).not.toContain("constraint");
    expect(receiveItem).toContain("toSafeDatabaseError");
    expect(lifecycleCommand).toContain("toSafeDatabaseError");
    consoleError.mockRestore();
  });
});
