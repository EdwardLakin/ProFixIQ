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
const quoteApprovalActions = read(
  "features/portal/components/QuoteApprovalActions.tsx",
);
const boardHook = read("features/shared/hooks/useWorkOrderBoard.ts");
const shiftTracker = read("features/shared/components/ShiftTracker.tsx");
const receiveItem = read("app/api/parts/_lib/receivePartRequestItem.ts");
const lifecycleCommand = read("app/api/parts/_lib/lifecycleCommand.ts");
const lifecycleEnsureMigration = read(
  "supabase/migrations/20260805042000_fix_parts_lifecycle_ensure_lookup.sql",
);
const generatedTypes = read("features/shared/types/types/supabase.ts");
const shopHistory = read("app/work-orders/history/WorkOrdersHistoryClient.tsx");
const historyCard = read(
  "features/work-orders/components/ImportedHistoryRecordCard.tsx",
);
const readOnlyWorkOrder = read("app/work-orders/view/[id]/page.tsx");

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

  it("identifies live paid closeouts as service history instead of imports", () => {
    expect(shopHistory).toContain('r.source_system === "profixiq_live"');
    expect(shopHistory).toContain('? "Paid service"');
    expect(shopHistory).toContain("badgeLabel={");
    expect(historyCard).toContain('badgeLabel = "Read-only imported"');
    expect(historyCard).toContain("{badgeLabel}");
  });

  it("shows the paid state on the read-only work-order story", () => {
    expect(readOnlyWorkOrder).toContain(
      "formatWorkOrderHeaderStatus(\n    wo?.status,\n    wo?.payment_status",
    );
    expect(readOnlyWorkOrder).toContain("{statusView.label}");
  });

  it("keeps direct lines visible and routes pending decisions to the line API", () => {
    expect(quoteClient).toContain('.from("work_order_lines")');
    expect(quoteClient).toContain('.from("work_order_parts")');
    expect(quoteClient).toContain('source: "work_order" as const');
    expect(quoteClient).toContain(
      'approvalState === "pending" && status === "awaiting_approval"',
    );
    expect(quoteClient).toContain("partsAmount = directParts.reduce");
    expect(quoteApprovalActions).toContain(
      "/api/work-orders/lines/${encodeURIComponent(lineId)}/approval-decision",
    );
    expect(quoteClient).toContain("source: line.source");
    expect(quoteApprovalActions).toContain('line.source === "work_order"');
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

  it("keeps the clean bootstrap schema aligned with production PO lifecycle links", () => {
    expect(lifecycleEnsureMigration).toContain(
      "add column if not exists work_order_part_id uuid",
    );
    expect(lifecycleEnsureMigration).toContain(
      "add column if not exists idempotency_key text",
    );
    expect(lifecycleEnsureMigration).toContain(
      "create unique index if not exists uq_purchase_order_lines_idempotency",
    );
    expect(generatedTypes).toContain("work_order_part_id: string | null");
    expect(generatedTypes).toContain("idempotency_key: string | null");
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
