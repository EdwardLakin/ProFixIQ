import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work order Use Part regression", () => {
  const consumePartSource = readFileSync(
    "features/work-orders/lib/parts/consumePart.ts",
    "utf8",
  );
  const partsDrawerSource = readFileSync(
    "features/parts/components/PartsDrawer.tsx",
    "utf8",
  );
  const handoffRuntimeShapeMigration = readFileSync(
    "supabase/migrations/20260723044000_fix_parts_handoff_runtime_shape.sql",
    "utf8",
  );

  it("uses the generic inspection allocation shape when attaching inventory parts", () => {
    expect(consumePartSource).not.toContain('rpc("apply_stock_move"');
    expect(consumePartSource).not.toContain("stock_move_id: moveId");
    expect(consumePartSource).toContain(
      'DB["public"]["Tables"]["work_order_part_allocations"]["Insert"]',
    );
    expect(consumePartSource).toContain("work_order_line_id: input.work_order_line_id");
    expect(consumePartSource).toContain("location_id: locationId");
  });

  it("surfaces inventory attachment failures from the drawer", () => {
    expect(partsDrawerSource).toContain("throw e;");
  });

  it("keeps handoff aligned with the current lifecycle schema and enum type", () => {
    expect(handoffRuntimeShapeMigration).toContain(
      "v_status public.part_request_item_status;",
    );
    expect(handoffRuntimeShapeMigration).toContain("quantity_allocated");
    expect(handoffRuntimeShapeMigration).not.toContain("quantity_reserved");
    expect(handoffRuntimeShapeMigration).toContain("qty_change");
    expect(handoffRuntimeShapeMigration).toContain("reason");
    expect(handoffRuntimeShapeMigration).not.toContain("move_type");
    expect(handoffRuntimeShapeMigration).toContain(
      "'partially_consumed'::public.part_request_item_status",
    );
    expect(handoffRuntimeShapeMigration).toContain(
      "'consumed'::public.part_request_item_status",
    );
    expect(handoffRuntimeShapeMigration).toContain("status = v_status");
  });
});
