import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260816013256_technician_completion_review_hotfix.sql",
  "utf8",
);
const advisorMigration = readFileSync(
  "supabase/migrations/20260816020500_completion_learning_receipt_advisor_hardening.sql",
  "utf8",
);
const trustedQueueMigration = readFileSync(
  "supabase/migrations/20260816173500_completion_learning_queue_review_hardening.sql",
  "utf8",
);
const actions = readFileSync(
  "features/copilot/technician/server/actions.ts",
  "utf8",
);
const chat = readFileSync(
  "features/copilot/technician/server/chat.ts",
  "utf8",
);
const completionService = readFileSync(
  "features/work-orders/server/completeWorkOrderLine.ts",
  "utf8",
);
const completionWorker = readFileSync(
  "features/work-orders/server/processCompletedRepairLearningQueue.ts",
  "utf8",
);

describe("technician completion post-merge review hotfix", () => {
  it("expires completion-receipt authorization when a session re-anchors", () => {
    expect(migration).toContain(
      "rs.active_work_order_line_id = wok.work_order_line_id",
    );
    expect(migration).toContain(
      "copilot.technician_has_bound_completion_receipt(",
    );
  });

  it("serializes repair learning behind a private durable lease", () => {
    expect(migration).toContain(
      "copilot.completed_repair_learning_receipts",
    );
    expect(migration).toContain("on conflict (shop_id, work_order_line_id)");
    expect(migration).toContain("for update");
    expect(migration).toContain("interval '5 minutes'");
    expect(advisorMigration).toContain(
      "completed_repair_learning_receipts_line_idx",
    );
    expect(advisorMigration).toContain(
      "completed_repair_learning_receipts_actor_idx",
    );
    expect(advisorMigration).toContain(
      "completed_repair_learning_receipts_deny_direct_access",
    );
  });

  it("moves repair-learning finalization behind a trusted durable queue", () => {
    expect(trustedQueueMigration).toContain(
      "create trigger enqueue_completed_repair_learning",
    );
    expect(trustedQueueMigration).toContain(
      "backfill_completed_repair_learning_queue",
    );
    expect(trustedQueueMigration).toContain(
      "on conflict (shop_id, work_order_line_id) do nothing",
    );
    expect(trustedQueueMigration).toContain(
      "claim_completed_repair_learning_batch",
    );
    expect(trustedQueueMigration).toContain(
      "workforce.operation_name = 'job_punch:finish'",
    );
    expect(trustedQueueMigration).toContain(
      ") from public, anon, authenticated, service_role;",
    );
    expect(trustedQueueMigration).toContain(") to service_role;");
    expect(trustedQueueMigration).toContain("clock_timestamp()");
    expect(trustedQueueMigration).toContain("on delete set null");
    expect(trustedQueueMigration).toContain(
      "check (nullif(btrim(operation_key), '') is not null)",
    );
    expect(trustedQueueMigration).toContain(
      "check (state in ('running', 'retryable', 'completed', 'failed'))",
    );
    expect(trustedQueueMigration).toContain(
      "v_terminal_failure := v_receipt.attempt_count >= 6",
    );
    expect(trustedQueueMigration).toContain("power(");
    expect(trustedQueueMigration).toContain(
      "where state in ('retryable', 'running')",
    );
    expect(trustedQueueMigration).toContain(
      "finish_completed_repair_learning_worker",
    );
    expect(completionService).toContain(
      'menuRepairLearning: { ok: false, state: "pending" as const }',
    );
    expect(completionWorker).toContain(
      '"claim_completed_repair_learning_batch"',
    );
    expect(actions).not.toContain("learnFromCompletedWorkOrderLine");
  });

  it("normalizes legacy split-identity completion receipts", () => {
    expect(migration).toContain(
      "normalize_technician_copilot_completion_receipt_actor",
    );
    expect(migration).toContain("set actor_user_id = profile.user_id");
    expect(migration).toContain("receipt.actor_user_id = profile.id");
  });

  it("locks and validates only the canonical inspection", () => {
    const canonicalPredicates = migration.match(/and i\.is_canonical/g) ?? [];
    expect(canonicalPredicates).toHaveLength(2);
    expect(migration).toContain("INSPECTION_COMPLETION_REQUIRED");
  });

  it("uses the shared next-work ordering when completion re-anchors", () => {
    expect(actions).toContain("selectNextTechnicianWorkLine");
    expect(actions).toContain("compareTechnicianWorkLines");
    expect(chat).toContain(
      "selectNextTechnicianWorkLine(\n      activeWorkOrder?.lines ?? [],",
    );
  });
});
