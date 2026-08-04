import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const originalMigrationPath =
  "supabase/migrations/20260804070000_complete_job_with_punchout_atomic.sql";
const hardeningMigrationPath =
  "supabase/migrations/20260804120000_codex_review_followup_hardening.sql";

describe("job completion punch-out ordering", () => {
  it("writes a non-null punch-out in the same update that completes the line", () => {
    const migration = readFileSync(originalMigrationPath, "utf8");
    const completionUpdate = migration.indexOf(
      "update public.work_order_lines\n    set status = 'completed'",
    );
    const punchOut = migration.indexOf(
      "punched_out_at = coalesce(",
      completionUpdate,
    );
    const inspectionFinalize = migration.indexOf(
      "update public.inspections",
      completionUpdate,
    );

    expect(completionUpdate).toBeGreaterThanOrEqual(0);
    expect(punchOut).toBeGreaterThan(completionUpdate);
    expect(inspectionFinalize).toBeGreaterThan(punchOut);
    expect(migration).toContain(
      "when v_action = 'finish' then coalesce(v_latest, punched_out_at, v_now)",
    );
  });

  it("rejects shared-line completion while another technician remains active", () => {
    const hardening = readFileSync(hardeningMigrationPath, "utf8");
    expect(hardening).toContain("OTHER_TECHNICIANS_STILL_PUNCHED_IN");
    expect(hardening).toContain("segment.ended_at is null");
    expect(hardening).toContain(
      "new.punched_in_at := null;\n    new.punched_out_at := null;",
    );
  });
});
