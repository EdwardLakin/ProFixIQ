import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260804031005_harden_invoice_ai_contracts.sql";

function migrationSource() {
  return readFileSync(migrationPath, "utf8");
}

describe("invoice AI and advisor hardening", () => {
  it("admits the application training event without losing existing event types", () => {
    const migration = migrationSource();
    expect(migration).toContain("'training.event'");
    expect(migration).toContain("'work_order_updated'");
    expect(migration).toContain("'fleet_work_completed'");
    expect(migration).toContain(
      "validate constraint ai_events_event_type_check",
    );
  });

  it("admits immutable invoice versions in the QuickBooks audit contract", () => {
    const migration = migrationSource();
    expect(migration).toContain("'invoice_version'");
    expect(migration).toContain("'connection'");
    expect(migration).toContain("'token'");
    expect(migration).toContain(
      "validate constraint quickbooks_sync_events_entity_type_check",
    );
  });

  it("makes tenant-scoped invoice views honor caller RLS", () => {
    const migration = migrationSource();
    expect(migration).toContain(
      "alter view public.invoice_net_issued_parts\n  set (security_invoker = true)",
    );
    expect(migration).toContain(
      "to_regclass('public.v_work_order_line_labor_rollups') is not null",
    );
    expect(migration).toContain(
      "alter view public.v_work_order_line_labor_rollups set (security_invoker = true)",
    );
    expect(migration).toContain(
      "revoke all on public.invoice_net_issued_parts from public, anon",
    );
  });

  it("keeps financial mutations service-only and trigger functions internal", () => {
    const migration = migrationSource();
    expect(migration).toContain(
      "revoke all on function public.post_payment_event(",
    );
    expect(migration).toContain(
      "grant execute on function public.post_payment_event(",
    );
    expect(migration).toContain(
      "revoke all on function public.void_invoice_version(uuid,uuid,uuid,text,text)",
    );
    expect(migration).toContain(
      "revoke all on function public.link_superseded_invoice_version()",
    );
    expect(migration).not.toContain(
      "revoke all on function public.sync_invoice_from_work_order(uuid)",
    );
  });

  it("pins search paths for the invoice functions found by Security Advisor", () => {
    const migration = migrationSource();
    expect(migration).toContain(
      "alter function public.sync_invoice_from_work_order(uuid)",
    );
    expect(migration).toContain(
      "alter function public.recompute_live_invoice_costs(uuid)",
    );
    expect(migration).toContain("set search_path = ''");
  });
});
