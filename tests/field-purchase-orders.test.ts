import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  purchaseOrderCanReceive,
  purchaseOrderLineRemaining,
  requestRemainingToOrder,
  requestTargetQuantity,
} from "@/features/parts/mobile/mobilePurchaseOrderQuantities";
import { isOpenPartsObligation } from "@/features/parts/lib/open-parts-obligations";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("app/mobile/service/purchase-orders/page.tsx");
const workflow = read("features/parts/mobile/MobilePurchaseOrders.tsx");
const snapshot = read("app/api/parts/purchase-orders/mobile-snapshot/route.ts");

describe("Field purchase orders", () => {
  it("derives the approved ordering ceiling without conflating requested and ordered quantities", () => {
    const item = {
      qty: 2,
      qty_requested: 3,
      qty_approved: 5,
      qty_ordered: 1.5,
    };

    expect(requestTargetQuantity(item)).toBe(5);
    expect(requestRemainingToOrder(item)).toBe(3.5);
    expect(requestRemainingToOrder({ ...item, qty_ordered: 7 })).toBe(0);
  });

  it("subtracts cancelled and received quantities from the active PO line", () => {
    expect(
      purchaseOrderLineRemaining({
        qty: 10,
        cancelled_qty: 2,
        received_qty: 3.5,
      }),
    ).toBe(4.5);
    expect(
      purchaseOrderLineRemaining({
        qty: 4,
        cancelled_qty: 1,
        received_qty: 8,
      }),
    ).toBe(0);
  });

  it("requires placement before a purchase order can be received", () => {
    expect(purchaseOrderCanReceive("draft")).toBe(false);
    expect(purchaseOrderCanReceive("open")).toBe(true);
    expect(purchaseOrderCanReceive("sent")).toBe(true);
    expect(purchaseOrderCanReceive("received")).toBe(false);
    expect(workflow).toContain("purchaseOrderCanReceive(purchaseOrder.status)");
  });

  it("requires parts capability at the Field page boundary", () => {
    expect(page).toContain('requiredCapability: "canManageParts"');
    expect(page).toContain('redirectTo: "/mobile/service"');
    expect(page).toContain("<MobilePurchaseOrders />");
    expect(workflow).toContain('"/api/parts/purchase-orders/mobile-snapshot"');
    expect(workflow).not.toContain("createBrowserSupabase");
  });

  it("authors approved demand through the canonical idempotent PO command", () => {
    expect(workflow).toContain(
      "/api/parts/requests/items/${encodeURIComponent(",
    );
    expect(workflow).toContain("/po-line`");
    expect(workflow).toContain('"Idempotency-Key": key');
    expect(workflow).toContain("requestRemainingToOrder(orderDraft.item)");
    expect(workflow).toContain('fetch("/api/parts/vendors"');
    expect(workflow).toContain("/place`");
    expect(workflow).toContain("Mark placed");
  });

  it("uses each canonical receipt path without inventing a second inventory ledger", () => {
    expect(workflow).toContain("/receive`");
    expect(workflow).toContain('fetch("/api/receive-scan"');
    expect(workflow).toContain("/receive-free-text`");
    expect(workflow).not.toContain('.from("stock_moves")');
    expect(workflow).not.toContain('.from("purchase_order_lines").update');
  });

  it("keeps terminal requests out of ordering and routes request-backed free text by inventory identity", () => {
    expect(
      isOpenPartsObligation("fulfilled", {
        request_id: "request-1",
        status: "approved",
        qty_approved: 1,
        qty_ordered: 0,
      }),
    ).toBe(false);
    expect(workflow).toMatch(
      /receiveDraft\.line\.part_request_item_id\s*&&\s*receiveDraft\.line\.part_id/,
    );
    expect(workflow).toContain(
      "const needsLocation = Boolean(receiveDraft.line.part_id)",
    );
  });

  it("loads every operational PO before rendering the receive queue", () => {
    expect(snapshot).toContain("ACTIVE_PURCHASE_ORDER_STATUSES");
    expect(snapshot).toContain("offset += QUERY_PAGE_SIZE");
    expect(snapshot).toContain(
      "readPage(offset, offset + QUERY_PAGE_SIZE - 1)",
    );
    expect(snapshot).toContain(".range(from, to)");
    expect(workflow).not.toContain(".limit(150)");
  });

  it("filters the Field snapshot through canonical linked-work authority", () => {
    expect(snapshot).toContain("requireCanonicalPartsApiAccess");
    expect(snapshot).toContain("listFieldOperatorAssignedWorkOrderIds");
    expect(snapshot).toContain("allowedItemIds");
    expect(snapshot).toContain("purchaseOrderLines.every");
  });
});
