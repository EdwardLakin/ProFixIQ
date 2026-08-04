import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260804070000_complete_job_with_punchout_atomic.sql",
  "utf8",
);

describe("atomic job completion punch-out ordering", () => {
  it("writes a non-null punch-out in the same update that completes the line", () => {
    expect(migration).toMatch(
      /update public\.work_order_lines\s+set status = 'completed'[\s\S]*?punched_out_at = coalesce\([\s\S]*?where id = p_work_order_line_id;/,
    );
    expect(migration).toContain("v_line.punched_out_at");
    expect(migration).toContain("v_now");
  });

  it("preserves a valid finish punch-out during the common timeline rollup", () => {
    expect(migration).toContain(
      "when v_action = 'finish' then coalesce(v_latest, punched_out_at, v_now)",
    );
    expect(migration).not.toContain(
      "punched_out_at = case when coalesce(v_has_open, false) then null else v_latest end",
    );
  });
});
