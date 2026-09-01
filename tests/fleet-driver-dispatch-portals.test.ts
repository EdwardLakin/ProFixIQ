import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260806164259_fleet_driver_dispatch_portals.sql",
);

describe("Fleet driver and dispatcher portals", () => {
  it("routes the three Fleet roles to distinct dashboards", () => {
    const actor = read("features/fleet/lib/resolveFleetActorContext.ts");
    const portal = read("app/portal/fleet/page.tsx");
    const shell = read("features/fleet/components/FleetProductShell.tsx");

    expect(actor).toContain('"fleet_manager"');
    expect(actor).toContain('"fleet_dispatcher"');
    expect(actor).toContain('"fleet_driver"');
    expect(actor).toContain('["dispatcher", "approver"]');
    expect(portal).toContain('actor.actorType === "fleet_driver"');
    expect(portal).toContain(
      "<FleetDriverDashboard fleetId={selectedFleetId} />",
    );
    expect(portal).toContain('actor.actorType === "fleet_dispatcher"');
    expect(portal).toContain("<FleetDispatcherDashboard");
    expect(portal).toContain("<FleetControlTower");
    expect(shell).toContain("DRIVER_NAV_GROUPS");
    expect(shell).toContain("DISPATCHER_NAV_GROUPS");
  });

  it("keeps the driver surface mobile-first and free of Shop workflow", () => {
    const dashboard = read(
      "features/fleet/components/FleetDriverDashboard.tsx",
    );
    const form = read("features/fleet/components/PretripForm.tsx");
    const unitsApi = read("app/api/fleet/units/route.ts");
    const workspaceApi = read(
      "app/api/fleet/units/[unitId]/workspace/route.ts",
    );

    expect(dashboard).toContain("Start pre-trip");
    expect(dashboard).toContain("Report an issue");
    expect(dashboard).toContain("Dispatch needs one more thing");
    expect(dashboard.toLowerCase()).not.toContain("work order");
    expect(dashboard.toLowerCase()).not.toContain("parts");
    expect(dashboard.toLowerCase()).not.toContain("labor");
    expect(dashboard.toLowerCase()).not.toContain("estimate");
    expect(form).toContain('accept="image/*"');
    expect(form).toContain('accept="audio/*"');
    expect(form).toContain("engineHours");
    expect(form).toContain("trailerVehicleId");
    expect(unitsApi).toContain('.eq("driver_profile_id", actor.userId)');
    expect(unitsApi).toContain('.eq("active", true)');
    expect(workspaceApi).toContain('actor.actorType === "fleet_driver"');
  });

  it("makes dispatch the only raw-driver-intake gate", () => {
    const queue = read("features/fleet/components/FleetDefectQueue.tsx");
    const defectsApi = read("app/api/fleet/defects/route.ts");

    expect(queue).toContain("Nothing reaches the Shop until");
    expect(queue).toContain("payload?.missed.map");
    expect(queue).not.toContain("missed.slice(0, 6)");
    expect(queue).toContain('act("request_info")');
    expect(queue).toContain('act("monitor")');
    expect(queue).toContain('act("schedule")');
    expect(queue).toContain('act("escalate")');
    expect(queue).toContain('act("close")');
    expect(defectsApi).toContain(
      "actor.capabilities.canRunFleetDispatchActions",
    );
    expect(migration).toContain(
      "create or replace function public.get_fleet_defect_queue",
    );
    expect(migration).toContain("Fleet dispatch access required");
    expect(migration).toContain(
      "create or replace function public.manage_fleet_driver_intake",
    );
    expect(migration).toContain(
      "One or more defects have already been escalated",
    );
    expect(migration).toContain("public.manage_fleet_unit_defects(");
  });

  it("uses canonical templates with versioned Fleet assignments", () => {
    const builder = read(
      "features/fleet/components/FleetPretripTemplateBuilder.tsx",
    );
    const templateApi = read("app/api/fleet/pretrip/templates/route.ts");

    expect(migration).toContain(
      "inspection_template_id uuid not null references public.inspection_templates(id)",
    );
    expect(migration).toContain("fleet_pretrip_template_one_active_type_uidx");
    expect(migration).toContain(
      "create or replace function public.save_fleet_pretrip_template",
    );
    expect(migration).toContain("notify_dispatcher boolean not null");
    expect(migration).toContain("intake_required boolean not null");
    expect(migration).toContain("marks_vehicle_attention boolean not null");
    expect(migration).toContain("and d.intake_required");
    expect(migration).toContain("and d.notify_dispatcher");
    expect(builder).toContain("Pass / fail");
    expect(builder).toContain("Measurement");
    expect(builder).toContain("Photo");
    expect(builder).toContain("Voice note");
    expect(builder).toContain("Require photo on fail");
    expect(templateApi).toContain("canAdministerFleetForActor");
    expect(read("app/api/fleet/units/route.ts")).toContain(
      '.eq("marks_vehicle_attention", true)',
    );
  });

  it("keeps evidence private and driver records scoped", () => {
    expect(migration).toContain("'fleet-driver-evidence'");
    expect(migration).toContain("false,");
    expect(migration).toContain(
      "revoke all on table public.fleet_driver_evidence from anon, authenticated",
    );
    expect(migration).toContain("driver_profile_id = (select auth.uid())");
    expect(migration).toContain(
      "(driver_profile_id = (select auth.uid()) and active)",
    );
    expect(migration).toContain("d.reported_by = (select auth.uid())");
    expect(migration).toContain(
      "v_defect.reported_by is distinct from v_user_id",
    );
    expect(migration).toContain(
      "create or replace function public.respond_fleet_defect_clarification",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on table public.fleet_pretrip_reports",
    );
    expect(migration).toContain(
      'drop policy if exists "fleet_pretrip_reports.insert.member"',
    );
  });

  it("server-guards manager-only and dispatcher-only routes", () => {
    const billing = read("app/portal/fleet/billing/page.tsx");
    const maintenance = read("app/portal/fleet/maintenance/page.tsx");
    const templates = read("app/portal/fleet/inspection-templates/page.tsx");
    const intake = read("app/portal/fleet/intake/page.tsx");
    const requests = read("app/portal/fleet/service-requests/page.tsx");
    const requestLayout = read("app/portal/fleet/request/layout.tsx");

    expect(billing).toContain("canManageUnits");
    expect(maintenance).toContain("canManageUnits");
    expect(templates).toContain("canManagePretripTemplates");
    expect(intake).toContain("canViewDispatch");
    expect(requests).toContain("canViewServiceRequests");
    expect(requestLayout).toContain("canManageUnits");
  });
});
