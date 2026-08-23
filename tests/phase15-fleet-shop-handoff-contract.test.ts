import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260823180000_enforce_fleet_service_request_ownership.sql";
const runtimePath =
  "tests/fleet/fleet-service-request-ownership.runtime.sql";

describe("Phase 15 Fleet to Shop handoff contract", () => {
  it("guards the Shop handoff without replacing shared writers", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("if to_regprocedure");
    expect(migration).toContain("resolve_fleet_id_from_vehicle");
    expect(migration).toContain(
      "count(distinct fv.fleet_id)::integer",
    );
    expect(migration).not.toContain("limit 1");
    expect(migration).toContain(
      "convert_owned_fleet_service_request_to_work_order_atomic",
    );
    expect(migration).toContain("profile.shop_id = request.shop_id");
    expect(migration).toContain("vehicle.customer_id = fleet.customer_id");
    expect(migration).toContain("set job_type = 'diagnosis'");
    expect(migration).toContain("PFX_FLEET_HANDOFF_UNAVAILABLE");
    expect(migration).not.toContain(
      "create or replace function public.convert_fleet_service_request_to_work_order_atomic",
    );
    expect(migration).not.toContain(
      "trg_enforce_fleet_service_request_vehicle_ownership",
    );
    expect(migration).not.toContain(
      "trg_enforce_work_order_customer_vehicle_consistency",
    );
  });

  it("runs valid, mismatched, atomic, and idempotent cases in clean replay", () => {
    const workflow = readFileSync(
      ".github/workflows/supabase-clean-replay-audit.yml",
      "utf8",
    );
    const runtime = readFileSync(runtimePath, "utf8");

    expect(workflow).toContain(runtimePath);
    expect(runtime).toContain("PFX_FLEET_HANDOFF_UNAVAILABLE");
    expect(runtime).toContain("historical_work_order_count <> 1");
    expect(runtime).toContain("Ambiguous enrollment unexpectedly resolved");
    expect(runtime).toContain("converted_work_order_count <> 1");
    expect(runtime).toContain("legacy_request_work_order_count <> 0");
  });
});
