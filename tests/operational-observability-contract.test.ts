import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260802101500_operational_observability_p0_p4.sql",
  "utf8",
);
const hardeningMigration = readFileSync(
  "supabase/migrations/20260802153000_operational_observability_hardening.sql",
  "utf8",
);
const punchIdentityMigration = readFileSync(
  "supabase/migrations/20260802154500_operational_observability_punch_identity.sql",
  "utf8",
);
const healthProjectionV2Migration = readFileSync(
  "supabase/migrations/20260802160000_operational_observability_health_projection_v2.sql",
  "utf8",
);

describe("canonical operational observability migrations", () => {
  it("creates an append-only tenant-scoped event contract", () => {
    expect(migration).toContain("create table if not exists public.operational_events");
    expect(migration).toContain("shop_id uuid not null references public.shops");
    expect(migration).toContain("correlation_id uuid");
    expect(migration).toContain("causation_id uuid references public.operational_events");
    expect(migration).toContain("idempotency_key text");
    expect(migration).toContain("operational_events_shop_idempotency_uidx");
    expect(migration).toContain("alter table public.operational_events enable row level security");
    expect(migration).toContain("public.is_shop_member_v2(shop_id)");
    expect(migration).toContain("('owner', 'admin', 'manager')");
    expect(migration).toContain(
      "revoke insert, update, delete, truncate, references, trigger\n  on public.operational_events from authenticated",
    );
  });

  it("keeps telemetry failures non-blocking but durable and actionable", () => {
    expect(migration).toContain(
      "create table if not exists public.operational_event_failures",
    );
    expect(migration).toContain("private.record_operational_event_failure");
    expect(migration).toContain("operational_event_write_failure");
    expect(migration).toContain(
      "/dashboard/operations/observability?panel=failures",
    );
    expect(migration).toContain("exception\n  when others then");
    expect(migration).toContain("return new;");
  });

  it("installs complete core workflow coverage", () => {
    for (const trigger of [
      "trg_operational_event_work_orders",
      "trg_operational_event_work_order_lines",
      "trg_operational_event_inspections",
      "trg_operational_event_quote_lines",
      "trg_operational_event_part_requests",
      "trg_operational_event_part_request_items",
      "trg_operational_event_purchase_orders",
      "trg_operational_event_work_order_parts",
      "trg_operational_event_parts_dispositions",
      "trg_operational_event_labor_segments",
      "trg_operational_event_punches",
      "trg_operational_event_payroll_entries",
      "trg_operational_event_invoices",
      "trg_operational_event_invoice_versions",
      "trg_operational_event_payments",
      "trg_operational_event_bookings",
      "trg_operational_event_fleet_requests",
      "trg_operational_event_estimates",
      "trg_operational_event_ai_actions",
      "trg_operational_event_portal_notifications",
      "trg_operational_event_conversations",
      "trg_operational_event_messages",
    ]) {
      expect(migration).toContain(trigger);
    }
  });

  it("retires the silently failing line trigger and secures compatibility views", () => {
    expect(migration).toContain(
      "drop trigger if exists trg_work_order_lines_log_ai on public.work_order_lines",
    );
    expect(migration).toContain(
      "create or replace view public.unified_events\nwith (security_invoker = true)",
    );
    expect(migration).toContain(
      "create or replace view public.operational_event_health\nwith (security_invoker = true)",
    );
    expect(migration).toContain("revoke all on public.unified_events from anon");
  });

  it("isolates notification failures from the durable failure sink", () => {
    expect(hardeningMigration).toContain(
      "create or replace function private.record_operational_event_failure",
    );
    expect(hardeningMigration).toContain(
      "create or replace function private.resolve_operational_event_failure",
    );
    expect(hardeningMigration).toContain("begin\n    insert into public.assistant_notifications");
    expect(hardeningMigration).toContain("exception\n    when others then\n      null;");
    expect(hardeningMigration).toContain(
      "when public.assistant_notifications.status = 'acknowledged'",
    );
  });

  it("provides one service-role-only operational health projection", () => {
    expect(hardeningMigration).toContain(
      "create or replace function public.get_operational_observability_health",
    );
    expect(hardeningMigration).toContain("security invoker");
    expect(hardeningMigration).toContain("events_previous_24h");
    expect(hardeningMigration).toContain("unresolved_failure_count");
    expect(hardeningMigration).toContain("grant execute on function public.get_operational_observability_health");
    expect(hardeningMigration).toContain("to service_role");
  });

  it("replaces the monitor projection with combined operational and AI health", () => {
    expect(healthProjectionV2Migration).toContain(
      "drop function if exists public.get_operational_observability_health",
    );
    expect(healthProjectionV2Migration).toContain(
      "ai_active_recommendation_count bigint",
    );
    expect(healthProjectionV2Migration).toContain(
      "ai_stale_recommendation_count bigint",
    );
    expect(healthProjectionV2Migration).toContain(
      "ai_pending_approval_count bigint",
    );
    expect(healthProjectionV2Migration).toContain(
      "ai_cron_probably_running boolean",
    );
    expect(healthProjectionV2Migration).toContain("security invoker");
    expect(healthProjectionV2Migration).toContain("to service_role");
    expect(healthProjectionV2Migration).toContain(
      "from public.ai_action_events e",
    );
  });

  it("captures punches from either profile identity or auth identity without mutating them", () => {
    expect(punchIdentityMigration).toContain(
      "create or replace function private.capture_operational_punch_event",
    );
    expect(punchIdentityMigration).toContain("p.id = new.profile_id");
    expect(punchIdentityMigration).toContain("p.user_id = new.user_id");
    expect(punchIdentityMigration).toContain("after insert on public.punch_events");
    expect(punchIdentityMigration).not.toContain("update public.punch_events");
  });

  it("does not alter unrelated private-schema permissions", () => {
    expect(migration).not.toContain("revoke all on schema private");
  });
});
