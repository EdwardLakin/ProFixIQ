import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260824183500_grant_field_quarantine_service_reader.sql",
  "utf8",
);
const cleanupMigration = readFileSync(
  "supabase/migrations/20260824183730_secure_field_quarantine_reader.sql",
  "utf8",
);
const runtime = readFileSync(
  "tests/mobile/field-quarantine-service-reader.runtime.sql",
  "utf8",
);

describe("Field assignment quarantine reader", () => {
  it("uses a bounded service-role reader without exposing the private schema", () => {
    expect(migration).toContain(
      "revoke usage on schema private from service_role",
    );
    expect(cleanupMigration).toContain(
      "revoke usage on schema private from service_role",
    );
    expect(migration).toContain(
      "public.field_service_vehicle_assignment_quarantine_report",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("p_limit integer default 100");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(migration).not.toContain("grant usage on schema private");
    expect(migration).not.toContain("grant select on table private");
    expect(runtime).toContain("set local role service_role");
    expect(runtime).toContain(
      "service-role report could not read the audit snapshot",
    );
    expect(runtime).toContain(
      "service role read the private quarantine table directly",
    );
  });

  it("keeps browser roles out of the private audit table", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(runtime).toContain("set local role authenticated");
    expect(runtime).toContain(
      "authenticated role read private audit snapshots",
    );
    expect(runtime).toContain(
      "authenticated role executed the quarantine report",
    );
  });

  it("grants only the controlled report function to service_role", () => {
    expect(migration).toContain(
      "grant execute on function public.field_service_vehicle_assignment_quarantine_report",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(cleanupMigration).toContain(
      "grant execute on function public.field_service_vehicle_assignment_quarantine_report",
    );
  });
});
