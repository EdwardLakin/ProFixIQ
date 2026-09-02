import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const MIGRATION =
  "supabase/migrations/20260902010000_fleet_pm_scheduled_evaluation_alerts.sql";

describe("scheduled Fleet PM evaluation", () => {
  it("keeps the actor entrypoint authenticated and fleet-authorized", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain(
      "create or replace function public.evaluate_fleet_pm_due_events(\n  p_fleet_id uuid,\n  p_vehicle_id uuid default null\n)",
    );
    expect(sql).toContain("raise exception 'Authentication required'");
    expect(sql).toContain("raise exception 'Fleet access required'");
    expect(sql).toContain(
      "returns table (due_event_id uuid, vehicle_id uuid, policy_id uuid, created boolean)",
    );
  });

  it("gives the system path no auth.uid() dependency", () => {
    const sql = read(MIGRATION);
    const systemStart = sql.indexOf(
      "create or replace function private.evaluate_fleet_pm_due_events_system",
    );
    const systemEnd = sql.indexOf(
      "create or replace function private.evaluate_fleet_pm_due_calendar",
    );

    expect(systemStart).toBeGreaterThan(-1);
    const systemBody = sql.slice(systemStart, systemEnd);
    expect(systemBody).not.toContain("auth.uid()");
    expect(systemBody).toContain("null, false");
  });

  it("backfills historical program policies with deterministic user attribution", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("if p_provision_policies then");
    expect(sql).toContain("with fleet_policy_actor as (");
    expect(sql).toContain("select member.user_id");
    expect(sql).toContain("f.created_by,");
    expect(sql).toContain("select profile.id");
    expect(sql).toContain("and actor.created_by is not null");
    expect(sql).toContain("fp.assignment_mode = 'all_units'");
    expect(sql).toContain("from public.fleet_program_assignments assignment");
    expect(sql).toContain("on conflict (program_id, vehicle_id)");
    // The actor path provisions; the unattended path does not.
    expect(sql).toContain("p_fleet_id, p_vehicle_id, v_user_id, true");
    expect(sql).toContain("p_fleet_id, p_vehicle_id, null, false");
  });

  it("keeps the privileged paths away from client roles", () => {
    const sql = read(MIGRATION);

    for (const fn of [
      "private.evaluate_fleet_pm_due_events_core(uuid, uuid, uuid, boolean)",
      "private.evaluate_fleet_pm_due_events_system(uuid, uuid)",
      "private.evaluate_fleet_pm_due_calendar()",
    ]) {
      expect(sql).toContain(
        `revoke all on function ${fn} from public, anon, authenticated, service_role`,
      );
      expect(sql).not.toContain(`grant execute on function ${fn}`);
    }

    expect(sql).not.toContain(
      "function public.evaluate_fleet_pm_due_events_core",
    );
    expect(sql).not.toContain(
      "function public.evaluate_fleet_pm_due_events_system",
    );
    expect(sql).not.toContain("function public.evaluate_fleet_pm_due_calendar");

    expect(sql).toContain(
      "grant execute on function public.evaluate_fleet_pm_due_events(uuid, uuid) to authenticated, service_role",
    );
  });

  it("raises and backfills a fleet-sourced PM alert the Fleet feed can read", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("insert into public.assistant_notifications");
    expect(sql).toContain("'fleet-pm-due:' || v_event_id::text");
    expect(sql).toContain("'fleet_pm_due'");
    // source must be 'fleet' so the Fleet-scoped feed picks it up, and metadata
    // must carry fleet_id because that feed pins reads to entitled fleets.
    expect(sql).toContain("'manager', 'fleet',");
    expect(sql).toContain("'fleet_id', v_policy.fleet_id");
    expect(sql).toContain("on conflict (shop_id, fingerprint) do update");
    expect(sql).toContain("e.status = 'pending'");
    expect(sql).toContain("e.status = 'deferred'");
    expect(sql).toContain(
      "coalesce(e.deferred_until, current_date) <= current_date",
    );
    expect(sql).toContain(
      "when public.assistant_notifications.status = 'acknowledged'",
    );

    const createdOnlyEnd = sql.indexOf(
      "-- A due event may predate this alert integration.",
    );
    const alertInsert = sql.indexOf(
      "insert into public.assistant_notifications",
    );
    expect(createdOnlyEnd).toBeGreaterThan(-1);
    expect(alertInsert).toBeGreaterThan(createdOnlyEnd);
  });

  it("schedules the sweep and retires alerts whose due event closed or was deleted", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("'fleet-pm-due-hourly'");
    expect(sql).toContain("select private.evaluate_fleet_pm_due_calendar();");
    expect(sql).toContain("set status = 'resolved'");
    expect(sql).toContain("and n.entity_type = 'fleet_pm_due_event'");
    expect(sql).toContain("and not exists (");
    expect(sql).toContain("where e.id::text = n.entity_id");
    expect(sql).toContain("and e.shop_id = n.shop_id");
    expect(sql).toContain("e.status = 'pending'");
    expect(sql).toContain("e.status = 'deferred'");
    expect(sql).toContain(
      "coalesce(e.deferred_until, current_date) <= current_date",
    );
    expect(sql).not.toContain("where e.id = n.entity_id");
    // One unhealthy fleet must not abort the sweep.
    expect(sql).toContain("exception when others then");
  });

  it("does not edit the applied migration that defined the original function", () => {
    const original = read(
      "supabase/migrations/20260727120000_fleet_operations_core.sql",
    );
    expect(original).toContain("v_user_id uuid := auth.uid();");
    expect(original).not.toContain("p_provision_policies");
  });

  it("preserves human deferral evidence during scheduled reevaluation", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain(
      "due_snapshot = existing_event.due_snapshot || excluded.due_snapshot",
    );
    expect(sql).not.toContain("due_snapshot = excluded.due_snapshot,");
  });
});
