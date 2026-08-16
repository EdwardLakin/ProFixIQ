import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260815232321_technician_completion_integrity.sql",
  "utf8",
);
const chat = readFileSync(
  "features/copilot/technician/server/chat.ts",
  "utf8",
);
const actions = readFileSync(
  "features/copilot/technician/server/actions.ts",
  "utf8",
);
const completionService = readFileSync(
  "features/work-orders/server/completeWorkOrderLine.ts",
  "utf8",
);
const completionLearningMigration = readFileSync(
  "supabase/migrations/20260816173500_completion_learning_queue_review_hardening.sql",
  "utf8",
);
const copilotClient = readFileSync(
  "features/copilot/technician/components/TechnicianTextCopilot.tsx",
  "utf8",
);

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Missing migration section: ${start}`);
  }
  return migration.slice(startIndex, endIndex);
}

describe("technician completion integrity", () => {
  it("keeps auth-owned receipts separate from profile-owned labor", () => {
    const finish = section(
      "create or replace function public.apply_job_punch_transition_atomic(",
      "create or replace function copilot.technician_job_action_internal(",
    );
    expect(finish).toContain("v_technician_profile_id");
    expect(finish).toContain("v_actor_profile_id");
    expect(finish).toContain("v_actor_auth_user_id");
    expect(finish).toContain(
      "p_shop_id, 'job_punch:' || v_action, p_operation_key, v_actor_auth_user_id",
    );
    expect(finish).toContain("v_actor_profile_id, v_now");
    expect(migration).toContain("p_actor_user_id => p_auth_user_id");
  });

  it("requires explicit current-cycle inspection evidence without signing it", () => {
    const finish = section(
      "create or replace function public.apply_job_punch_transition_atomic(",
      "create or replace function copilot.technician_job_action_internal(",
    );
    expect(finish).toContain("INSPECTION_COMPLETION_REQUIRED");
    expect(finish).toContain("from public.inspection_signatures s");
    expect(finish).not.toContain("update public.inspections");
  });

  it("recovers only receipt-bound completion turns and settles the session", () => {
    expect(migration).toContain(
      "copilot.technician_has_bound_completion_receipt(",
    );
    expect(migration).toContain("wok.operation_name = 'job_punch:finish'");
    expect(migration).toContain("when 'session.close' then");
    expect(migration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(chat.indexOf("storedActionTurn(envelope.events")).toBeLessThan(
      chat.indexOf("technician_copilot_work_not_actionable"),
    );
    expect(chat).toContain("completion-session-reanchor");
    expect(chat).toContain("completion-session-close");
    expect(copilotClient).toContain(
      'Object.prototype.hasOwnProperty.call(body, "session")',
    );
  });

  it("queues repair learning from the canonical finish receipt for screen and voice", () => {
    expect(completionService).toContain("await applyJobPunchTransition");
    expect(actions).toContain("await sendCopilotServerCommand");
    expect(actions).not.toContain("upsertMenuRepairItemFromCompletedLine");
    expect(completionLearningMigration).toContain(
      "after insert on public.workforce_operation_keys",
    );
  });
});
