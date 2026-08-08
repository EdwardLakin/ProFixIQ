import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InventoryPickerModal } from "./InventoryPickerModal";
import { sumStockMovesByPartId } from "@/features/parts/lib/stock-on-hand";

describe("InventoryPickerModal", () => {
  it("renders physical on-hand totals calculated from stock moves", () => {
    const stockByPartId = sumStockMovesByPartId([
      { part_id: "part-1", qty_change: 60, reason: "receive" },
      { part_id: "part-1", qty_change: 40, reason: "receive" },
    ]);

    render(
      <InventoryPickerModal
        open
        results={[
          {
            value: "part-1",
            label: "Imported oil filter",
            onHandQty: stockByPartId["part-1"],
          },
        ]}
      />,
    );

    expect(screen.getByText("100 on hand")).toBeInTheDocument();
  });

  it("portals the scrollable picker above application stacking contexts", () => {
    render(
      <div data-testid="app-stacking-context">
        <InventoryPickerModal
          open
          results={Array.from({ length: 60 }, (_, index) => ({
            value: `part-${index}`,
            label: `Part ${index}`,
            onHandQty: index,
          }))}
        />
      </div>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("z-[610]", "min-h-0", "overflow-hidden");
    expect(screen.getByTestId("inventory-picker-results-body")).toHaveClass(
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(screen.getByText("Showing 50 of 60 results. Refine search to narrow matches.")).toBeInTheDocument();
  });
});
