import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004120000_portal_parts_quote_requests_foundation.sql",
  "utf8",
);

const reconcile = migration.slice(
  migration.indexOf(
    "create or replace function public.parts_reconcile_request_lifecycle",
  ),
);

describe("portal parts quote requests foundation migration", () => {
  it("creates a tenant-scoped table that clients can only read", () => {
    expect(migration).toContain(
      "create table if not exists public.portal_parts_quote_requests",
    );
    expect(migration).toContain(
      "alter table public.portal_parts_quote_requests enable row level security",
    );
    expect(migration).toContain(
      "using (public.profixiq_is_portal_customer_for(customer_id, shop_id))",
    );
    expect(migration).toContain("using (public.is_staff_for_shop(shop_id))");
    expect(migration).not.toContain("from public.profiles p");
    expect(migration).toContain(
      "revoke all on table public.portal_parts_quote_requests from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select on table public.portal_parts_quote_requests to authenticated",
    );
    expect(migration).not.toMatch(/create policy[^;]*for (insert|update|delete)/i);
    expect(migration).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/i);
  });

  it("stays idempotent and unique per operation, part request and checkout session", () => {
    expect(migration).toContain("portal_parts_quote_requests_operation_key_unique");
    expect(migration).toContain("portal_parts_quote_requests_part_request_unique");
    expect(migration).toContain("portal_parts_quote_requests_checkout_session_unique");
  });

  it("only adds a portal anchor to the shared Parts lifecycle reconciler", () => {
    expect(reconcile).toContain("v_portal_status text := ''");
    expect(reconcile).toContain(
      "v_quote_approved := v_quote_approved or v_portal_status = 'approved'",
    );
    expect(reconcile).toContain(
      "v_quote_declined := v_quote_declined or v_portal_status in ('declined', 'cancelled')",
    );
    expect(reconcile).toContain("pq.part_request_id = p_request_id");
    expect(reconcile).toContain("pq.shop_id = v_request.shop_id");
  });

  it("preserves every pre-existing reconciler decision and guard", () => {
    for (const preserved of [
      "if lower(v_request.status::text) in ('fulfilled', 'returned', 'cancelled') then",
      "elsif v_request.handoff_completed_at is not null",
      "elsif v_quote_approved then\n    v_new_status := 'approved';",
      "elsif v_quote_declined then\n    v_new_status := 'rejected';",
      "elsif v_quote_deferred then\n    v_new_status := 'deferred';",
      "elsif lower(v_request.status::text) in ('rejected', 'deferred') then",
      "elsif v_line_approved then\n    v_new_status := 'approved';",
      "elsif v_item_count > 0 and v_all_priced then\n    v_new_status := 'quoted';",
      "perform set_config('app.parts_lifecycle_reconciling', '1', true)",
      "and q.work_order_id = v_request.work_order_id",
      "and coalesce(pri.qty_ordered, 0) = 0",
      "and pri.po_id is null",
      "perform public.sync_quote_line_pricing_from_parts(",
      "perform public.parts_publish_request_notification(p_request_id, v_new_stage)",
      "security definer",
      "set search_path to 'public'",
    ]) {
      expect(reconcile).toContain(preserved);
    }
  });

  it("does not touch triggers, policies or grants on pre-existing objects", () => {
    expect(migration).not.toMatch(/create trigger[^;]*on public\.(part_requests|part_request_items|work_order)/i);
    expect(migration).not.toMatch(/alter table public\.(part_requests|part_request_items)/i);
    expect(migration).not.toMatch(/drop (trigger|policy|function)[^;]*part_request/i);
    expect(migration).not.toMatch(/alter type/i);
  });
});
