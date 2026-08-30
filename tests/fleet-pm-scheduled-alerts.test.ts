import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const MIGRATION =
  "supabase/migrations/20260830180000_fleet_pm_scheduled_evaluation_alerts.sql";

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
      "create or replace function public.evaluate_fleet_pm_due_events_system",
    );
    const systemEnd = sql.indexOf(
      "create or replace function public.evaluate_fleet_pm_due_calendar",
    );

    expect(systemStart).toBeGreaterThan(-1);
    const systemBody = sql.slice(systemStart, systemEnd);
    expect(systemBody).not.toContain("auth.uid()");
    expect(systemBody).toContain("null, false");
  });

  it("never provisions policies without an actor, because created_by is NOT NULL", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("if p_provision_policies then");
    // The actor path provisions; the unattended path does not.
    expect(sql).toContain("p_fleet_id, p_vehicle_id, v_user_id, true");
    expect(sql).toContain("p_fleet_id, p_vehicle_id, null, false");
  });

  it("keeps the privileged paths away from client roles", () => {
    const sql = read(MIGRATION);

    for (const fn of [
      "public.evaluate_fleet_pm_due_events_core(uuid, uuid, uuid, boolean)",
      "public.evaluate_fleet_pm_due_events_system(uuid, uuid)",
      "public.evaluate_fleet_pm_due_calendar()",
    ]) {
      expect(sql).toContain(
        `revoke all on function ${fn} from public, anon, authenticated`,
      );
      expect(sql).toContain(`grant execute on function ${fn} to service_role`);
    }

    expect(sql).toContain(
      "grant execute on function public.evaluate_fleet_pm_due_events(uuid, uuid) to authenticated, service_role",
    );
  });

  it("raises a fleet-sourced PM alert the Fleet feed can read", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("insert into public.assistant_notifications");
    expect(sql).toContain("'fleet-pm-due:' || v_event_id::text");
    expect(sql).toContain("'fleet_pm_due'");
    // source must be 'fleet' so the Fleet-scoped feed picks it up, and metadata
    // must carry fleet_id because that feed pins reads to entitled fleets.
    expect(sql).toContain("'manager', 'fleet',");
    expect(sql).toContain("'fleet_id', v_policy.fleet_id");
    expect(sql).toContain("on conflict (shop_id, fingerprint) do update");
  });

  it("schedules the sweep and retires alerts whose due event closed", () => {
    const sql = read(MIGRATION);

    expect(sql).toContain("'fleet-pm-due-hourly'");
    expect(sql).toContain("select public.evaluate_fleet_pm_due_calendar();");
    expect(sql).toContain("set status = 'resolved'");
    expect(sql).toContain("e.status not in ('pending', 'deferred')");
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
});
