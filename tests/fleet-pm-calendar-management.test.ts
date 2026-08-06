import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20260806022431_fleet_pm_calendar_management.sql",
);

describe("Fleet PM scheduling and maintenance calendar", () => {
  it("stores Fleet-owned program assignments behind a manager RPC", () => {
    expect(migration).toContain(
      "create table if not exists public.fleet_program_assignments",
    );
    expect(migration).toContain(
      "assignment_mode in ('all_units', 'selected_units')",
    );
    expect(migration).toContain(
      "create or replace function public.manage_fleet_pm_program",
    );
    expect(migration).toContain("Fleet manager access required");
    expect(migration).toContain("fleet_programs_operation_key_uidx");
    expect(migration).toContain("idempotent");
    expect(migration).toContain(
      "grant select on table public.fleet_program_assignments to authenticated",
    );
    expect(migration).not.toContain(
      "grant select, insert, update, delete on table public.fleet_program_assignments to authenticated",
    );
  });

  it("keeps selected-unit templates from expanding to the whole Fleet", () => {
    expect(migration).toContain("enforce_fleet_pm_program_assignment");
    expect(migration).toContain("fleet_pm_policy_assignment_guard");
    expect(migration).toContain("v_assignment_mode = 'selected_units'");
    expect(migration).toContain("fleet_program_assignments_vehicle_idx");
    expect(migration).toContain("set active = false, updated_at = now()");
    expect(migration).toContain("set status = 'dismissed', updated_at = now()");
  });

  it("provides manager-only PM template administration and planned requests", () => {
    const route = source("app/api/fleet/maintenance/route.ts");
    const workspace = source(
      "features/fleet/components/FleetMaintenanceWorkspace.tsx",
    );
    const editor = source("features/fleet/components/FleetPmProgramEditor.tsx");

    expect(route).toContain("canAdministerFleetForActor");
    expect(route).toContain('action === "archive_program"');
    expect(route).toContain('"manage_fleet_pm_program"');
    expect(route).toContain("p_requested_for_date: requestedForDate");
    expect(route).toContain('.from("fleet_program_tasks")');
    expect(route).toContain("programTaskId");
    expect(workspace).toContain("New PM program");
    expect(workspace).toContain("Requested service date");
    expect(workspace).toContain("Fleet chooses the requested date");
    expect(editor).toContain("Selected assets only");
    expect(editor).toContain("Fleet approval required");
  });

  it("replaces the calendar placeholder with live Fleet maintenance events", () => {
    const route = source("app/api/fleet/calendar/route.ts");
    const calendar = source(
      "features/fleet/components/FleetMaintenanceCalendar.tsx",
    );
    const page = source("app/portal/fleet/calendar/page.tsx");

    for (const table of [
      "fleet_pm_policies",
      "fleet_pm_due_events",
      "fleet_service_requests",
      "fleet_inspection_schedules",
      "work_orders",
    ]) {
      expect(route).toContain(`.from("${table}")`);
    }
    for (const eventType of [
      "pm_due",
      "pm_forecast",
      "service_request",
      "inspection",
      "shop_service",
    ]) {
      expect(calendar).toContain(eventType);
    }
    expect(calendar).toContain("Maintenance Calendar");
    expect(calendar).toContain("Needs a planning date");
    expect(page).toContain("!actor.capabilities.canManageUnits");
    expect(route).toContain('actor.actorType === "fleet_driver"');
  });
});
