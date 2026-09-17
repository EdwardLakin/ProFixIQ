import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inventoryRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/inventory/route.ts",
  "utf8",
);
const editRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/edit/route.ts",
  "utf8",
);
const quoteSaveRoute = readFileSync(
  "app/api/parts/requests/items/[itemId]/quote-save/route.ts",
  "utf8",
);
const workbenchRow = readFileSync(
  "features/parts/components/request-workbench/PartsRequestWorkbenchRow.tsx",
  "utf8",
);

describe("pre-approval Parts Request inventory selection", () => {
  it("persists quote-origin inventory choices without materializing a work-order part", () => {
    expect(inventoryRoute).toContain("isUuid(item.quote_line_id) && !isUuid(item.work_order_line_id)");
    expect(inventoryRoute).toContain("part_id: part.id");
    expect(inventoryRoute).toContain("syncQuoteLinePartsStatus(access.supabase");
    expect(inventoryRoute.indexOf("isUuid(item.quote_line_id) && !isUuid(item.work_order_line_id)")).toBeLessThan(
      inventoryRoute.indexOf('"parts_attach_inventory_to_request_item_atomic"'),
    );
  });

  it("keeps the operational attach RPC for materialized work-order lines", () => {
    expect(inventoryRoute).toContain('"parts_attach_inventory_to_request_item_atomic"');
    expect(inventoryRoute).toContain("PARTS_REQUEST_ALREADY_MAPPED");
  });
});

describe("editable request quantities", () => {
  it("allows the controlled quantity input to become blank while the user edits it", () => {
    expect(workbenchRow).toContain("const [qtyDraft, setQtyDraft]");
    expect(workbenchRow).toContain('if (next === "") return;');
    expect(workbenchRow).toContain('step="any"');
  });

  it("preserves positive fractional quantities on both edit and quote-save paths", () => {
    expect(editRoute).toContain("update.qty = qty;");
    expect(editRoute).not.toContain("Math.floor(qty)");
    expect(quoteSaveRoute).toContain("const nextQty = qty == null ? null : qty;");
    expect(quoteSaveRoute).not.toContain("Math.floor(qty)");
  });
});
