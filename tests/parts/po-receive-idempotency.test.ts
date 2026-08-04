import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260804054000_fix_po_partial_receive_idempotency.sql";
const receivePagePath = "app/parts/po/[id]/receive/page.tsx";
const receiveRoutePath = "app/api/receive-scan/route.ts";

describe("purchase-order receipt idempotency", () => {
  it("binds each receipt to an operation id and makes replays no-ops", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("p_operation_id uuid");
    expect(sql).toMatch(
      /create function public\.receive_po_part_and_allocate\(\s*p_po_id uuid,\s*p_part_id uuid,\s*p_location_id uuid,\s*p_qty numeric\s*\)/,
    );
    expect(sql).toContain(
      "grant execute on function public.receive_po_part_and_allocate(uuid, uuid, uuid, numeric) to authenticated, service_role",
    );
    expect(sql).toContain(
      "drop trigger if exists trg_stock_moves_apply_snapshot on public.stock_moves",
    );
    expect(sql).toContain("purchase_order_receipt:");
    expect(sql).toContain("PO_RECEIVE_IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("v_move.metadata -> 'receipt_result'");
    expect(sql).toContain("'replayed', true");
  });

  it("locks and bounds PO quantities before writing inventory", () => {
    const sql = readFileSync(migrationPath, "utf8");

    const lockIndex = sql.indexOf("for update;");
    const remainingIndex = sql.indexOf("into v_po_remaining");
    const stockMoveIndex = sql.indexOf("from public.apply_stock_move(");

    expect(lockIndex).toBeGreaterThan(-1);
    expect(remainingIndex).toBeGreaterThan(lockIndex);
    expect(stockMoveIndex).toBeGreaterThan(remainingIndex);
    expect(sql).toContain("PO_RECEIVE_QUANTITY_EXCEEDS_REMAINING");
    expect(sql).toContain("PO_RECEIVE_LINE_RECONCILIATION_FAILED");
  });

  it("keeps the stock ledger, PO lines, and allocation result on one quantity", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("p_qty => p_qty");
    expect(sql).toContain("v_remaining := p_qty");
    expect(sql).toContain("'request_item_id', v_item.id");
    expect(sql).toContain("'qty_allocated', v_take");
    expect(sql).toContain("'receipt_result', v_result");
  });

  it("sends stable operation ids from both PO receiving entry points", () => {
    const page = readFileSync(receivePagePath, "utf8");
    const route = readFileSync(receiveRoutePath, "utf8");

    expect(page).toContain("receiveOperationRef");
    expect(page).toContain("crypto.randomUUID()");
    expect(page).toContain("p_operation_id: receiveOperationRef.current.id");
    expect(page).toContain("receiveOperationRef.current = null");
    expect(page).toContain("disabled={!manualPartId || !selectedLoc || qty <= 0 || remaining <= 0}");

    expect(route).toContain("p_operation_id: operationId ?? crypto.randomUUID()");
  });
});
