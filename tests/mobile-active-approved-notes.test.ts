import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobilePath = "features/work-orders/mobile/MobileFocusedJob.tsx";
const originalMigrationPath =
  "supabase/migrations/20260804055000_allow_active_approved_job_notes.sql";
const hardeningMigrationPath =
  "supabase/migrations/20260804120000_codex_review_followup_hardening.sql";
const activeStatusRepairPath =
  "supabase/migrations/20260805134500_restore_active_technician_notes.sql";

describe("mobile technician notes on active approved jobs", () => {
  it("keeps the mobile editor available for active approved work", () => {
    const source = readFileSync(mobilePath, "utf8");
    expect(source).toContain("technician_notes");
    expect(source).toContain("const saveNotes = async () =>");
    expect(source).toContain('actionType: "update_work_order_line_notes"');
    expect(source).toContain(
      'mode === "notes" && data.approval_state === "approved" && data.status === "completed"',
    );
    expect(source).toContain("Notes update blocked.");
  });

  it("preserves the original permission repair and supersedes it with active-state and void guards", () => {
    const original = readFileSync(originalMigrationPath, "utf8");
    const hardening = readFileSync(hardeningMigrationPath, "utf8");
    const activeStatusRepair = readFileSync(activeStatusRepairPath, "utf8");

    expect(original).toContain(
      "create or replace function public.apply_offline_line_mutation_atomic",
    );
    expect(hardening).toContain("v_line.voided_at is not null");
    expect(hardening).toContain("Work-order line is not active.");
    expect(hardening).toContain("technician_notes");
    expect(hardening).toContain("OFFLINE_VERSION_CONFLICT");
    expect(hardening).toContain("Actor is not assigned to this work-order line.");
    expect(hardening).toContain("offline_mutation_receipts");
    expect(activeStatusRepair).toContain(
      "create or replace function public.apply_offline_line_mutation_atomic",
    );
    expect(activeStatusRepair).toContain("'active'");
    expect(activeStatusRepair).toContain("v_line.voided_at is not null");
    expect(activeStatusRepair).toContain("OFFLINE_VERSION_CONFLICT");
  });
});
