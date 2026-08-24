import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260824182500_repair_standalone_field_truck_boundary.sql",
  "utf8",
);
const runtime = readFileSync(
  "tests/mobile/field-owner-truck-boundary-hotfix.runtime.sql",
  "utf8",
);

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("standalone Field owner truck boundary hotfix", () => {
  it("quarantines assignments created from ambiguous or conflicting history", () => {
    expect(migration).toContain(
      "private.field_service_vehicle_assignment_quarantine",
    );
    expect(migration).toContain(
      "private.repair_standalone_field_vehicle_assignments",
    );
    expect(migration).toContain("'ambiguous_owner_vehicle_set'");
    expect(migration).toContain("'assigned_vehicle_not_unique_owner_vehicle'");
    expect(migration).toContain("'non_canonical_profile'");
    expect(migration).toContain(
      "select private.repair_standalone_field_vehicle_assignments();",
    );
    expect(runtime).toContain(
      "ambiguous assignment was not physically quarantined",
    );
    expect(runtime).toContain(
      "quarantined assignment reappeared after cardinality changed",
    );
  });

  it("keeps standalone Field entitlement independent from truck cardinality", () => {
    const entitlement = section(
      "create or replace function public.mobile_profile_has_field_service_access",
      "-- Truck access is narrower than Field entitlement.",
    );

    expect(entitlement).toContain(
      "workspace.owner_id in (profile.id, profile.user_id)",
    );
    expect(entitlement).not.toContain("profile.role");
    expect(entitlement).not.toContain("select count(*)");
    expect(entitlement).not.toContain("service_vehicles candidate");
    expect(runtime).toContain(
      "truck ambiguity or historical role label revoked standalone Field entitlement",
    );
    expect(runtime).toContain(
      "canonical owner lost dispatch eligibility during truck repair",
    );
    expect(runtime).toContain("role = 'manager'");
    expect(runtime).toContain(
      "manager-labelled canonical owner assignment was removed",
    );
    expect(runtime).toContain(
      "manager-labelled canonical owner was quarantined as non-canonical",
    );
  });

  it("requires the assigned truck itself to be the unique owner-primary truck", () => {
    const access = section(
      "create or replace function public.field_actor_can_access_service_vehicle",
      "select private.repair_standalone_field_vehicle_assignments();",
    );

    expect(access).toContain("vehicle.primary_user_id = profile.id");
    expect(access).toContain("candidate.primary_user_id = profile.id");
    expect(access).toContain(") = 1");
    expect(access).not.toContain("profile.role");
    expect(runtime).toContain(
      "non-owner-primary truck was exposed as My Truck",
    );
    expect(runtime).toContain("unique canonical owner truck was not restored");
  });

  it("lands as a separate forward compatibility repair", () => {
    expect(migration).not.toContain(
      "alter function public.mobile_configure_service_v1_atomic",
    );
    expect(migration).not.toContain("set schema private");
    expect(migration).toContain(
      "explicitly approved this shared compatibility integration for PR #1531",
    );
    expect(migration).toContain(
      "workspace.subscription_package is distinct from 'field_service'",
    );
    expect(runtime).toContain(
      "Shop-linked enabled operator lost Field entitlement",
    );
    expect(runtime).toContain(
      "Shop-linked explicit truck assignment was denied",
    );
  });
});
