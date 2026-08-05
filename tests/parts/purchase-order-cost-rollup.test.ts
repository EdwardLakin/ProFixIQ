import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260805143000_reconcile_purchase_order_costs_and_totals.sql",
    import.meta.url,
  ),
  "utf8",
);

const requestPage = readFileSync(
  new URL("../../app/parts/requests/[id]/page.tsx", import.meta.url),
  "utf8",
);

describe("purchase-order cost and total reconciliation", () => {
  it("prefers catalog acquisition cost when the request still mirrors sell price", () => {
    expect(requestPage).toContain("selectedInventoryPart?.default_cost");
    expect(requestPage).toContain("selectedInventoryPart?.cost");
    expect(migration).toContain("create or replace function public.normalize_purchase_order_line_cost()");
    expect(migration).toContain("round(v_request_cost, 4) = round(v_request_sell, 4)");
    expect(migration).toContain("new.unit_cost := v_catalog_cost");
  });

  it("synchronizes the durable request and work-order cost snapshots", () => {
    expect(migration).toContain("create or replace function public.sync_purchase_order_line_cost_to_parts()");
    expect(migration).toContain("set unit_cost = new.unit_cost");
    expect(migration).toContain("set unit_cost_snapshot = new.unit_cost");
  });

  it("rolls active line cost into the PO header including tax and shipping", () => {
    expect(migration).toContain("coalesce(line.qty, 0) - coalesce(line.cancelled_qty, 0)");
    expect(migration).toContain("+ greatest(coalesce(po.tax_total, 0), 0)");
    expect(migration).toContain("+ greatest(coalesce(po.shipping_total, 0), 0)");
    expect(migration).toContain("trg_sync_purchase_order_totals_from_line");
  });

  it("backfills only PO headers that have deterministic line detail", () => {
    expect(migration).toContain("select distinct line.po_id");
    expect(migration).toContain("where line.po_id is not null");
  });
});
