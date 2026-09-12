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

  it("keeps vehicle imagery private", () => {
    // Customer vehicle photos can show plates and premises, so the buckets are
    // private and readers mint signed URLs.
    expect(migration).toContain("set public = false");
    expect(migration).not.toContain("public, true");
  });

  it("scopes object access to the shop that owns the vehicle", () => {
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
    expect(migration).toContain("v.shop_id = public.current_shop_id()");
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
