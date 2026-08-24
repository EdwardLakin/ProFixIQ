import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260824183500_grant_field_quarantine_service_reader.sql",
  "utf8",
);
const runtime = readFileSync(
  "tests/mobile/field-quarantine-service-reader.runtime.sql",
  "utf8",
);

describe("Field assignment quarantine reader", () => {
  it("grants the service role the schema and table privileges required to audit", () => {
    expect(migration).toContain("grant usage on schema private to service_role");
    expect(migration).toContain(
      "grant select on table private.field_service_vehicle_assignment_quarantine",
    );
    expect(migration).toContain("to service_role");
    expect(runtime).toContain("set local role service_role");
    expect(runtime).toContain(
      "service role could not read the audit snapshot",
    );
  });

  it("keeps browser roles out of the private audit table", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(runtime).toContain("set local role authenticated");
    expect(runtime).toContain(
      "authenticated role read private audit snapshots",
    );
  });

  it("does not restore private RPC execution privileges", () => {
    expect(migration).not.toContain("grant execute");
    expect(migration).toContain(
      "does not restore EXECUTE on private RPCs",
    );
  });
});
