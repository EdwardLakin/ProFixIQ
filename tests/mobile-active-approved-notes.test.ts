import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("active approved technician notes", () => {
  it("keeps completed and assignment guards while permitting active approved notes", () => {
    const sql = readFileSync(
      "supabase/migrations/20260804055000_allow_active_approved_job_notes.sql",
      "utf8",
    );

    expect(sql).toContain(
      "if lower(coalesce(v_line.status::text, '')) = 'completed' then",
    );
    expect(sql).toContain(
      "and v_line.assigned_tech_id is distinct from p_actor_user_id",
    );
    expect(sql).toContain("OFFLINE_VERSION_CONFLICT");
    expect(sql).toContain(
      "if p_action_type = 'update_work_order_line_notes' then",
    );
    expect(sql).toContain(
      "set notes = coalesce(v_payload->>'notes', ''), updated_at = now()",
    );
    expect(sql).not.toContain(
      "Approved job notes require review before editing.",
    );
  });

  it("matches the active mobile editor contract", () => {
    const mobile = readFileSync(
      "features/work-orders/mobile/MobileFocusedJob.tsx",
      "utf8",
    );

    expect(mobile).toContain('onBlur={saveNotes}');
    expect(mobile).toContain(
      'mode === "notes" && data.approval_state === "approved" && data.status === "completed"',
    );
  });
});
