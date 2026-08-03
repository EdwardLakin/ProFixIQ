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
  const canonicalUsePartMigration = readFileSync(
    "supabase/migrations/20260723114500_canonical_use_part_runtime_security.sql",
    "utf8",
  );

  it("uses one canonical attach-and-issue RPC without direct lifecycle writes", () => {
    expect(consumePartSource).toContain(
      '"parts_attach_and_issue_line_part_atomic"',
    );
    expect(consumePartSource).toContain("p_idempotency_key:");
    expect(consumePartSource).not.toContain(
      '.from("work_order_part_allocations")',
    );
    expect(consumePartSource).not.toContain('.from("stock_moves")');
  });

  it("awaits picker failures without closing the drawer action itself", () => {
    expect(partsDrawerSource).toContain("const result = await consumePart");
    expect(partsDrawerSource).toContain("throw new Error(result.error)");
    expect(partsDrawerSource).not.toContain("throw e;");
    expect(partsDrawerSource).not.toContain("toast.error(msg)");
  });

  it("hardens the final handoff function using the current lifecycle schema", () => {
    expect(canonicalUsePartMigration).toContain(
      "v_status public.part_request_item_status;",
    );
    expect(canonicalUsePartMigration).toContain(
      "parts_lifecycle_assert_line_access",
    );
    expect(canonicalUsePartMigration).toContain("quantity_allocated");
    expect(canonicalUsePartMigration).toContain("qty_change");
    expect(canonicalUsePartMigration).not.toContain("move_type");
    expect(canonicalUsePartMigration).toContain(
      "'partially_consumed'::public.part_request_item_status",
    );
    expect(canonicalUsePartMigration).toContain(
      "'consumed'::public.part_request_item_status",
    );
    expect(canonicalUsePartMigration).toContain("status = v_status");
  });

  it("authorizes the direct request-item attach RPC before delegating", () => {
    expect(canonicalUsePartMigration).toContain(
      "parts_attach_request_item_unchecked",
    );
    expect(canonicalUsePartMigration).toContain(
      "perform public.parts_lifecycle_assert_line_access(\n    v_shop_id,\n    v_work_order_line_id",
    );
    expect(canonicalUsePartMigration).toContain(
      "revoke all on function public.parts_attach_request_item_unchecked(uuid)",
    );
    expect(canonicalUsePartMigration).toContain(
      "from public, anon, authenticated",
    );
  });

  it("recovers only evidenced allocation lineage and prevents new orphans", () => {
    expect(canonicalUsePartMigration).toContain(
      "allocation.stock_move_id = move.id",
    );
    expect(canonicalUsePartMigration).toContain(
      "PARTS_ORPHAN_ALLOCATIONS_BLOCK_MIGRATION",
    );
    expect(canonicalUsePartMigration).toContain(
      "PARTS_ALLOCATION_SCOPE_MISMATCH_BLOCKS_MIGRATION",
    );
    expect(canonicalUsePartMigration).toContain(
      "alter column work_order_part_id set not null",
    );
    expect(canonicalUsePartMigration).toContain(
      "pg_get_triggerdef(trigger_row.oid, true)",
    );
    expect(canonicalUsePartMigration).toContain(
      "'drop trigger %I on public.work_order_parts'",
    );
    expect(canonicalUsePartMigration).toContain(
      "execute v_trigger_definitions[v_trigger_index]",
    );
    expect(canonicalUsePartMigration).toContain(
      "create or replace function public.trg_parts_auto_release_approved_line_part()",
    );
    expect(canonicalUsePartMigration).toContain(
      "current_setting('app.parts_direct_use', true)",
    );
    expect(canonicalUsePartMigration).toContain(
      "set_config('app.parts_direct_use', '1', true)",
    );
    expect(canonicalUsePartMigration).toContain("v_wop_exists := found;");
    expect(canonicalUsePartMigration).toContain("if v_wop_exists then");
    expect(canonicalUsePartMigration).toContain(
      "Canonical work-order part was not materialized.",
    );
    expect(canonicalUsePartMigration).toContain(
      "'location_id', p_location_id,\n    'qty_issued', p_qty,\n    'requested_unit_cost'",
    );
    expect(canonicalUsePartMigration).toContain(
      "new.source_parts_request_item_id is not null",
    );
    expect(canonicalUsePartMigration).toContain(
      "to_regclass('public.assistant_notifications') is null",
    );
    expect(canonicalUsePartMigration).toContain(
      "parts_publish_request_notification_with_table",
    );
    expect(canonicalUsePartMigration).toContain(
      "parts_sync_technician_ready_notification_with_table",
    );
    expect(canonicalUsePartMigration).toContain(
      "foreign key (\n    work_order_part_id,\n    shop_id,\n    work_order_id,\n    work_order_line_id,\n    part_id",
    );
  });
});
