import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260823180000_enforce_fleet_service_request_ownership.sql";
const runtimePath =
  "tests/fleet/fleet-service-request-ownership.runtime.sql";

describe("Phase 15 Fleet to Shop handoff contract", () => {
  it("enforces Fleet billing ownership before request and work-order writes", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain(
      "trg_enforce_fleet_service_request_vehicle_ownership",
    );
    expect(migration).toContain("resolve_fleet_id_from_vehicle");
    expect(migration).toContain("PFX_FLEET_UNIT_ENROLLMENT_NOT_FOUND");
    expect(migration).toContain(
      "revoke all on function public.resolve_fleet_id_from_vehicle(uuid)",
    );
    expect(migration).toContain(
      "trg_enforce_work_order_customer_vehicle_consistency",
    );
    expect(migration).toContain("PFX_FLEET_UNIT_OWNERSHIP_MISMATCH");
    expect(migration).toContain("PFX_WORK_ORDER_CUSTOMER_VEHICLE_MISMATCH");
    expect(migration).toContain(
      "when l.line_kind = 'diagnostic' then 'diagnosis'",
    );
    expect(migration).not.toContain(
      "when l.line_kind = 'diagnostic' then 'diagnostic'",
    );
    expect(migration).toContain("new.shop_id is distinct from v_fleet_shop_id");
    expect(migration).not.toMatch(/customer_id % does not match vehicle/);
  });

  it("runs valid, mismatched, atomic, and idempotent cases in clean replay", () => {
    const workflow = readFileSync(
      ".github/workflows/supabase-clean-replay-audit.yml",
      "utf8",
    );
    const runtime = readFileSync(runtimePath, "utf8");

    expect(workflow).toContain(runtimePath);
    expect(runtime).toContain("PFX_FLEET_UNIT_OWNERSHIP_MISMATCH");
    expect(runtime).toContain("PFX_WORK_ORDER_CUSTOMER_VEHICLE_MISMATCH");
    expect(runtime).toContain("converted_work_order_count <> 1");
    expect(runtime).toContain("legacy_request_work_order_count <> 0");
  });
});
