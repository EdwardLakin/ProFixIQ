import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order Use Part regression", () => {
  const consumePartSource = readFileSync(
    "features/work-orders/lib/parts/consumePart.ts",
    "utf8",
  );
  const partPickerSource = readFileSync(
    "features/parts/components/PartPicker.tsx",
    "utf8",
  );
  const partsDrawerSource = readFileSync(
    "features/parts/components/PartsDrawer.tsx",
    "utf8",
  );

  it("accepts the UUID returned by apply_stock_move", () => {
    expect(consumePartSource).toContain(
      'if (typeof data === "string" && data.length > 0) return data;',
    );
    expect(consumePartSource).toContain(
      "apply_stock_move returns a stock move UUID",
    );
  });

  it("keeps the picker open while inventory attachment is pending or failed", () => {
    expect(partPickerSource).toContain(
      "onPick?: (sel: PickedPart) => void | Promise<void>;",
    );
    expect(partPickerSource).toContain("await onPick?.(payload);");
    expect(partPickerSource).toContain("disabled={!selectedPartId || qtyNum <= 0 || submitting}");
    expect(partsDrawerSource).toContain("throw e;");
  });
});
