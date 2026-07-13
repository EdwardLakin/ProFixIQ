import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("parts package handoff source contracts", () => {
  const requestPage = readFileSync("app/parts/requests/[id]/page.tsx", "utf8");
  const editRoute = readFileSync("app/api/parts/requests/items/[itemId]/edit/route.ts", "utf8");
  const mapper = readFileSync("features/parts/components/request-workbench/mapToWorkbenchModel.ts", "utf8");
  const row = readFileSync("features/parts/components/request-workbench/PartsRequestWorkbenchRow.tsx", "utf8");
  const workOrderClient = readFileSync("app/work-orders/[id]/Client.tsx", "utf8");
  const focusedJob = readFileSync("features/work-orders/components/workorders/FocusedJobModal.tsx", "utf8");
  const appShell = readFileSync("features/shared/components/AppShell.tsx", "utf8");

  it("persists row sell price through quoted_price and verifies the updated row before success", () => {
    expect(editRoute).toContain("update.quoted_price = quotedPrice");
    expect(editRoute).toContain('.select("*")');
    expect(editRoute).toContain("if (!updatedItem)");
    expect(mapper).toContain("item.ui_price ?? item.quoted_price ?? item.unit_price");
    expect(requestPage).toContain("await persistItemFields(input.itemId");
    expect(requestPage.indexOf("await persistItemFields(input.itemId")).toBeLessThan(requestPage.indexOf('toast.success("Part request row saved.")'));
  });

  it("shows selected inventory sell price as an explicit suggested apply action without silently persisting selection", () => {
    expect(mapper).toContain("suggestedSellPrice");
    expect(row).toContain("Use suggested");
    expect(row).toContain("onChange?.({ ...item, sellPrice: item.suggestedSellPrice");
  });

  it("hydrates package committed state from active source-linked work_order_parts and preserves content during refresh", () => {
    expect(requestPage).toContain("source_parts_request_item_id");
    expect(requestPage).toContain('.eq("is_active", true)');
    expect(requestPage).toContain("preserveContent");
    expect(requestPage).toContain("next[result.itemId] = true");
  });

  it("uses active canonical work_order_parts for work-order display before allocation", () => {
    expect(workOrderClient).toContain('.from("work_order_parts")');
    expect(workOrderClient).toContain('.eq("work_order_id", woRow.id)');
    expect(workOrderClient).toContain('.eq("is_active", true)');
    expect(focusedJob).toContain("requiredParts");
    expect(focusedJob).toContain('.from("work_order_parts")');
    expect(focusedJob).toContain('.eq("is_active", true)');
  });

  it("does not render a second Sonner toaster inside the app shell", () => {
    expect(appShell).not.toContain("<Toaster");
  });
});
