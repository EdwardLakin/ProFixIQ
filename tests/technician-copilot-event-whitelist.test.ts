import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260814023000_technician_copilot_silent_documentation_events.sql",
  "utf8",
);

describe("Technician CoPilot Phase-3 database event boundary", () => {
  it("allows explicit diagnostic findings through the private append function", () => {
    expect(migration).toContain(
      "create or replace function copilot.technician_event_append_internal",
    );
    expect(migration).toContain("'diagnostic.finding'");
  });

  it("retains role, assignment, lifecycle, origin, and payload safety checks", () => {
    expect(migration).toContain(
      "v_profile_id := copilot.technician_profile_id(p_auth_user_id)",
    );
    expect(migration).toContain("rs.status <> 'closed'");
    expect(migration).toContain("copilot.technician_is_assigned(");
    expect(migration).toContain("copilot_event_origin_not_allowed");
    expect(migration).toContain("octet_length(p_details::text) > 262144");
  });

  it("does not expose the private runtime through a new browser grant", () => {
    expect(migration.toLowerCase()).not.toContain("grant execute");
    expect(migration.toLowerCase()).not.toContain("grant usage on schema copilot");
  });
});
