import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveFleetActorScope,
  type FleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function dualRoleActor(): FleetActorContext {
  return {
    userId: "10000000-0000-4000-8000-000000000001",
    actorType: "internal_staff",
    canonicalRole: "owner",
    profileRole: "owner",
    profileShopId: "20000000-0000-4000-8000-000000000001",
    shopId: "20000000-0000-4000-8000-000000000001",
    fleetIds: ["30000000-0000-4000-8000-000000000001"],
    fleetMemberships: [
      {
        fleetId: "30000000-0000-4000-8000-000000000001",
        shopId: "20000000-0000-4000-8000-000000000001",
        role: "manager",
      },
    ],
    primaryFleetId: "30000000-0000-4000-8000-000000000001",
    membershipRole: "manager",
    isInternal: true,
    isFleetActor: false,
    capabilities: {
      canSeeFleetWideUnits: true,
      canCreatePretripReports: true,
      canConvertPretripToServiceRequest: true,
      canConvertServiceRequestToWorkOrder: true,
      canAccessFleetIntake: true,
      canAccessPortalFleetWrappers: true,
      canRunFleetDispatchActions: true,
      canOverrideShopScope: false,
    },
  };
}

describe("fleet pre-trip, defects, and compliance", () => {
  it("preserves the selected membership fleet for a dual-role portal actor", () => {
    const actor = dualRoleActor();
    expect(
      resolveFleetActorScope(actor, { preferMembershipFleet: true }),
    ).toEqual({
      shopId: actor.shopId,
      fleetId: actor.primaryFleetId,
      fleetIds: [actor.primaryFleetId],
    });
    expect(resolveFleetActorScope(actor)?.fleetId).toBeNull();
    expect(
      resolveFleetActorScope(actor, {
        explicitShopId: "20000000-0000-4000-8000-000000000099",
      }),
    ).toBeNull();
  });

  it("keeps drivers out of manager conversion and puts pre-trip one click from portal home", () => {
    const form = read("features/fleet/components/PretripForm.tsx");
    const tower = read("features/fleet/components/FleetControlTower.tsx");
    const page = read("app/portal/fleet/pretrip/[unitId]/page.tsx");
    const route = read("app/api/fleet/pretrip/route.ts");
    expect(form).not.toContain("convert-to-service-request");
    expect(form).toContain("Fleet managers—not drivers");
    expect(tower).toContain("Start today’s pre-trip");
    expect(tower).toContain("/portal/fleet/pretrip/");
    expect(page).toContain("const admin = createAdminSupabase()");
    expect(page).toContain('.eq("fleet_id", fleetId)');
    expect(page).toContain('.eq("driver_profile_id", actor.userId)');
    expect(page).toContain('.eq("active", true)');
    expect(route).toContain("serviceDateInTimeZone(shop.timezone)");
    expect(route).toContain("inspection_date: inspectionDate");
    expect(route).toContain('.select("timezone")');
  });

  it("uses one durable defect ledger and manager lifecycle RPC", () => {
    const migration = read(
      "supabase/migrations/20260803023000_fleet_pretrip_defect_compliance.sql",
    );
    expect(migration).toContain(
      "create table if not exists public.fleet_unit_defects",
    );
    expect(migration).toContain(
      "create table if not exists public.fleet_pretrip_compliance",
    );
    expect(migration).toContain(
      "create or replace function public.manage_fleet_unit_defects",
    );
    expect(migration).toContain(
      "create or replace function public.evaluate_fleet_pretrip_compliance",
    );
    expect(migration).toContain("perform public.evaluate_fleet_pm_due_events");
    expect(migration).toContain(
      "grant select on table public.fleet_unit_defects to authenticated",
    );
    expect(migration).toContain(
      "revoke execute on function public.evaluate_fleet_pretrip_compliance",
    );
    const assignmentBoundary = read(
      "supabase/migrations/20260806063000_fleet_pretrip_assignment_start_boundary.sql",
    );
    expect(assignmentBoundary).toContain(
      "> v_assignment.pretrip_due_local_time then 1",
    );
    expect(assignmentBoundary).toContain("when v_status is null then state");
    expect(assignmentBoundary).toContain(
      "delete from public.fleet_pretrip_compliance",
    );
  });

  it("schedules missed-pretrip evaluation in Supabase and keeps the retired sign-in URL safe", () => {
    const config = JSON.parse(read("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(config.crons).not.toContainEqual(
      expect.objectContaining({
        path: "/api/internal/fleet/pretrip-compliance",
      }),
    );
    const scheduler = read(
      "supabase/migrations/20260803041000_schedule_fleet_pretrip_compliance.sql",
    );
    expect(scheduler).toContain("create extension if not exists pg_cron");
    expect(scheduler).toContain("'fleet-pretrip-compliance-hourly'");
    expect(scheduler).toContain(
      "public.evaluate_fleet_pretrip_compliance(clock_timestamp())",
    );
    const cronRoute = read(
      "app/api/internal/fleet/pretrip-compliance/route.ts",
    );
    expect(cronRoute).toContain("process.env.CRON_SECRET");
    expect(cronRoute).toContain("`Bearer ${cronSecret}`");
    expect(cronRoute).toContain('envSecretName: "INTERNAL_CRON_SECRET"');
    const middleware = read("middleware.ts");
    expect(middleware).toContain('pathname === "/portal/fleet/auth/sign-in"');
    expect(middleware).toContain("NextResponse.redirect(target, 308)");
  });

  it("keeps unit enrollment and assignment behind the atomic server RPC", () => {
    const page = read("features/fleet/components/FleetUnitEnrollmentPage.tsx");
    const route = read("app/api/fleet/enrollment/route.ts");
    expect(page).not.toContain(".from(");
    expect(page).toContain("Enroll units & assign drivers");
    expect(route).toContain('supabase.rpc("manage_fleet_unit_enrollment"');
  });
});
