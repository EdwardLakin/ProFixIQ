import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260912150000_provision_vehicle_media_buckets.sql",
);

describe("vehicle media bucket provisioning", () => {
  it("creates the buckets the create page has always written to", () => {
    // create/page.tsx uploads vehicle photos and documents to these buckets,
    // but no migration ever created them, so they exist only where someone made
    // them by hand and those uploads fail in a freshly provisioned environment.
    const createPage = read(
      "features/work-orders/app/work-orders/create/page.tsx",
    );
    expect(createPage).toContain('"vehicle-photos" | "vehicle-docs"');
    expect(createPage).toContain('.from("vehicle_media")');

    expect(migration).toContain("insert into storage.buckets");
    expect(migration).toContain("'vehicle-photos'");
    expect(migration).toContain("'vehicle-docs'");
  });

  it("never rewrites an existing bucket's contract", () => {
    // An existing bucket may accept formats or sizes this migration does not
    // list; rewriting its visibility, size limit or MIME rules would start
    // rejecting files the create page's accept="image/*" input still offers.
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).not.toContain("do update");
    expect(migration).not.toContain("allowed_mime_types");
  });

  it("creates new buckets private", () => {
    // Customer vehicle photos can show plates and premises, so a bucket this
    // migration creates is private and readers mint signed URLs.
    expect(migration).toContain(
      "values ('vehicle-photos', 'vehicle-photos', false, 15728640)",
    );
    expect(migration).toContain(
      "values ('vehicle-docs', 'vehicle-docs', false, 15728640)",
    );
  });

  it("requires a shop staff role, not just shop scope", () => {
    // The session shop setting carries no role gate, so a shop-scoped driver
    // or fleet_manager would otherwise be able to read and delete raw vehicle
    // media directly.
    expect(migration).toContain("join public.profiles p on p.id = auth.uid()");
    expect(migration).toContain("p.shop_id = v.shop_id");
    expect(migration).toContain("p.role in (");
    expect(migration).not.toContain("current_shop_id()");

    for (const role of [
      "'owner'",
      "'admin'",
      "'manager'",
      "'advisor'",
      "'service'",
      "'lead_hand'",
      "'foreman'",
    ]) {
      expect(migration).toContain(role);
    }
    // Fleet-side and customer roles must not reach these objects.
    for (const role of ["'driver'", "'fleet_manager'", "'dispatcher'", "'customer'"]) {
      expect(migration).not.toContain(role);
    }

    // is_staff_for_shop omits service, lead_hand and foreman, which
    // ROLE_GROUPS.workOrderCreators includes and which upload these photos.
    const rbac = read("features/shared/lib/rbac.ts");
    const creators = rbac.slice(
      rbac.indexOf("workOrderCreators: ["),
      rbac.indexOf("schedulerBookingWriters"),
    );
    for (const role of ["service", "lead_hand", "foreman"]) {
      expect(creators).toContain(`"${role}"`);
    }
    expect(migration).not.toContain("is_staff_for_shop(");
  });

  it("scopes object access to the vehicle's shop", () => {
    for (const policy of [
      "vehicle_media_objects_select",
      "vehicle_media_objects_insert",
      "vehicle_media_objects_delete",
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
      // Idempotent: a re-run must not fail on an existing policy.
      expect(migration).toContain(`drop policy if exists ${policy}`);
    }

    expect(migration).toContain("public.vehicle_media_object_in_shop(");
    expect(migration).toContain("v.shop_id is not null");
    // Paths are <vehicle uuid>/<file>, which is what the create page writes.
    expect(migration).toContain("(storage.foldername(name))[1]");
  });

  it("never raises on a malformed object name", () => {
    // A non-uuid folder yields null rather than erroring, so a bad path simply
    // matches no policy instead of breaking every storage query.
    expect(migration).toContain(
      "create or replace function public.vehicle_storage_path_uuid",
    );
    expect(migration).toContain("else null");
    expect(migration).toContain("revoke all on function");
  });

  it("clears the tracked debt entry it resolves", () => {
    // The regression inventory carried this exact gap as accepted debt. Leaving
    // it behind after the fix makes the baseline stale, which fails the gate.
    const baseline = read("scripts/regression-inventory/baseline.json") as string;
    expect(baseline).not.toContain("e89e74621eb0c97c7ada");
    expect(baseline).not.toContain(
      "Storage bucket vehicle-photos is not provisioned by the migration chain",
    );
  });
});
