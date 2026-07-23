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
});
