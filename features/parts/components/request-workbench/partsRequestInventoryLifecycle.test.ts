import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inventoryRoute = readFileSync("app/api/parts/requests/items/[itemId]/inventory/route.ts", "utf8");
const addRoute = readFileSync("app/api/parts/requests/items/[itemId]/add/route.ts", "utf8");
const page = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");

describe("parts request inventory lifecycle route separation", () => {
  it("keeps inventory selection scoped to persisting part_request_items.part_id", () => {
    expect(inventoryRoute).toContain('body.mode === "attach"');
    expect(inventoryRoute).toContain(".from(\"part_request_items\")");
    expect(inventoryRoute).toContain("part_id: partId");
    expect(inventoryRoute).not.toContain("upsert_part_allocation_from_request_item");
    expect(inventoryRoute).not.toContain("upsert-from-line");
    expect(inventoryRoute).not.toContain("work_order_parts");
    expect(inventoryRoute).not.toContain("work_order_line_id:");
  });

  it("keeps Add to Work Order on the canonical add route and downstream side effects", () => {
    expect(addRoute).toContain("upsert_part_allocation_from_request_item");
    expect(page).toContain("/api/parts/requests/items/${itemId}/add");
    expect(page).toContain("/api/menu-items/upsert-from-line");
    expect(page).toContain("Part added to work order.");
  });

  it("uses work_order_parts source linkage rather than part_id as the durable added state", () => {
    expect(page).toContain("source_parts_request_item_id");
    expect(page).toContain("setAddedToWorkOrderByItemId");
    expect(page).toContain("addedToWorkOrderByItemId");
  });
});
