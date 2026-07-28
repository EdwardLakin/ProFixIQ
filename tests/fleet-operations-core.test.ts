import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const migration = source(
  "supabase/migrations/20260727120000_fleet_operations_core.sql",
);

describe("fleet operations core", () => {
  it("preserves structured fleet request lines through work-order conversion", () => {
    expect(migration).toContain(
      "create table if not exists public.fleet_service_request_lines",
    );
    expect(migration).toContain("create_fleet_service_request_atomic");
    expect(migration).toContain(
      "convert_fleet_service_request_to_work_order_atomic",
    );
    expect(migration).toContain("source_fleet_service_request_line_id");
    expect(migration).toContain(
      "Structured request lines are required before conversion",
    );
  });

  it("captures pre-trip readings and evaluates replay-safe PM due events", () => {
    expect(migration).toContain(
      "create table if not exists public.fleet_unit_readings",
    );
    expect(migration).toContain("capture_pretrip_unit_reading");
    expect(migration).toContain("evaluate_fleet_pm_due_events");
    expect(migration).toContain("fleet_pm_due_events_active_uidx");
    expect(migration).toContain("on conflict (policy_id, vehicle_id)");
  });

  it("turns fleet-authored PM programs into per-unit policies", () => {
    expect(migration).toContain(
      "fleet_pm_policies_active_program_vehicle_uidx",
    );
    expect(migration).toContain("coalesce(fv.custom_interval_km, fp.interval_km)");
    expect(migration).toContain(
      "coalesce(fv.custom_interval_hours, fp.interval_hours)",
    );
    expect(migration).toContain(
      "coalesce(fv.custom_interval_days, fp.interval_days)",
    );
    expect(migration).toContain("left join lateral");
    expect(migration).toContain(
      "v_policy.anchor_odometer_km := v_reading.odometer_km",
    );
  });

  it("closes the PM loop when linked work is completed", () => {
    expect(migration).toContain("last_completed_work_order_id = new.id");
    expect(migration).toContain("anchor_date = current_date");
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain("completed_at = now()");
  });

  it("feeds fleet facts into evidence-backed, reviewable AI recommendations", () => {
    expect(migration).toContain("fleet_pretrip_submitted");
    expect(migration).toContain("fleet_pm_due");
    expect(migration).toContain("fleet_work_deferred");
    expect(migration).toContain("fleet_work_declined");
    expect(migration).toContain("fleet_work_completed");
    expect(migration).toContain("insert into public.ai_evidence_snapshots");
    expect(migration).toContain("insert into public.ai_recommendations");
    expect(migration).toContain("requires_approval");
  });

  it("keeps live telematics outside the first fleet release", () => {
    expect(migration).toContain(
      "source_type in ('pretrip', 'work_order', 'manual', 'import')",
    );
    expect(migration).not.toContain("'telematics'");
    expect(source("app/api/fleet/unit-economics/route.ts")).toContain(
      'telematics: "not_used"',
    );
  });

  it("uses the shared customer and fleet service request builder", () => {
    const customerBuilder = source("app/portal/request/build/page.tsx");
    const fleetBuilder = source("app/portal/fleet/request/build/page.tsx");
    const sharedBuilder = source(
      "features/portal/components/request/SharedServiceRequestBuilder.tsx",
    );

    expect(customerBuilder).toContain("SharedServiceRequestBuilder");
    expect(fleetBuilder).toContain("SharedServiceRequestBuilder");
    expect(sharedBuilder).toContain("diagnosticMinimumHours");
    expect(fleetBuilder).toContain("pmPackages");
    expect(fleetBuilder).toContain("inspections");
  });
});
