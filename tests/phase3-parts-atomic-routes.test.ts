import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("phase 3 atomic parts routes", () => {
  it("uses one package command", () => {
    const route = source("app/api/parts/requests/[requestId]/commit-package/route.ts");
    expect(route).toContain("parts_commit_request_package_atomic");
    expect(route).not.toContain("for (const item");
    expect(route).not.toContain('from("work_order_parts")');
  });

  it("uses one item attach command", () => {
    const route = source("app/api/parts/requests/items/[itemId]/add/route.ts");
    expect(route).toContain("parts_update_attach_allocate_item_atomic");
    expect(route).not.toContain('from("part_request_items").update');
    expect(route).not.toContain("upsert_part_allocation_from_request_item");
  });

  it("requires explicit operation keys", () => {
    const helper = source("app/api/parts/_lib/lifecycleCommand.ts");
    const receiving = source("app/api/parts/_lib/receivePartRequestItem.ts");
    expect(helper).toContain("A stable idempotency key is required");
    expect(receiving).toContain("A stable idempotency key is required");
    expect(helper).not.toContain("|| fallback");
  });

  it("uses one line disposition command", () => {
    const route = source("app/api/work-orders/lines/[id]/delete-or-void/route.ts");
    expect(route).toContain("parts_void_work_order_line_atomic");
    expect(route).not.toContain("apply_stock_move");
    expect(route).not.toContain('from("work_order_part_allocations")');
  });

  it("uses canonical issued quantity for invoice creation", () => {
    expect(source("app/api/invoices/send/route.ts")).toContain(
      "getIssuableInvoiceSnapshot",
    );
    expect(source("features/invoices/server/getIssuableInvoiceSnapshot.ts")).toContain(
      "get_invoice_net_issued_parts",
    );
  });

  it("keeps deployed invoice pricing compatible with stable parts columns", () => {
    const snapshot = source("features/invoices/server/getInvoiceSnapshot.ts");
    expect(snapshot).toContain("stagedPartsFallbackResult");
    expect(snapshot).toContain("filterInvoicePartAllocations");
    expect(snapshot).not.toContain('.not("work_order_line_id", "is", null)');
  });
});
