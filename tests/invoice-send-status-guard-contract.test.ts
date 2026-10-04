import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/invoices/send/route.ts", "utf8");

describe("invoice send status update", () => {
  it("only moves draft or issued invoices to issued, never a paid/refunded one", () => {
    const step = route.slice(route.indexOf('step: "invoice_status_after_send"'), route.indexOf('step: "work_order_invoice_state_update"'));
    expect(step).toContain('.update({ status: "issued", issued_at: now })');
    expect(step).toContain('.eq("shop_id", workOrder.shop_id)');
    expect(step).toContain('.in("status", ["draft", "issued"])');
  });
});
