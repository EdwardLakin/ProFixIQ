import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260805042000_fix_parts_lifecycle_ensure_lookup.sql",
  "utf8",
);
const receiveStatusMigration = readFileSync(
  "supabase/migrations/20260805043000_fix_parts_receive_status_enum.sql",
  "utf8",
);

describe("parts lifecycle ensure lookup migration", () => {
  it("resolves the ensured work-order part before selecting it", () => {
    expect(migration).toContain(
      "v_wop_id := public.parts_ensure_work_order_part(p_request_item_id);",
    );
    expect(migration).toContain("where id = v_wop_id");
    expect(migration).not.toContain(
      "where id = public.parts_ensure_work_order_part(p_request_item_id)",
    );
  });

  it("rejects an empty or mismatched lifecycle row before stock movement", () => {
    expect(migration).toContain("if not found");
    expect(migration).toContain("v_wop.part_id is null");
    expect(migration).toContain(
      "v_wop.part_id is distinct from v_item.part_id",
    );
    expect(migration).toContain(
      "v_line.part_id is distinct from v_wop.part_id",
    );
  });

  it("repairs only unambiguous PO-line links and their ordered totals", () => {
    expect(migration).toContain("count(*) over (partition by pol.id)");
    expect(migration).toContain("candidate.match_count = 1");
    expect(migration).toContain("pol.work_order_part_id is null");
    expect(migration).toContain("ordered_totals.quantity_ordered");
  });

  it("keeps the security-definer functions unavailable to public and anon", () => {
    expect(migration).toContain(
      "revoke all on function public.parts_create_po_line_for_request(",
    );
    expect(migration).toContain(
      "revoke all on function public.parts_receive_request_item(",
    );
    expect(migration).toContain("to authenticated, service_role;");
  });

  it("stores the derived receive status in the request item enum", () => {
    expect(receiveStatusMigration).toContain(
      "v_status public.part_request_item_status;",
    );
    expect(receiveStatusMigration).not.toContain("v_status text;");
    expect(receiveStatusMigration).toContain(
      "'received'::public.part_request_item_status",
    );
  });
});
