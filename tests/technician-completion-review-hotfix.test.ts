import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260816013256_technician_completion_review_hotfix.sql",
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
    expect(migration).toContain(
      "completed_repair_learning_receipts_line_idx",
    );
    expect(migration).toContain(
      "completed_repair_learning_receipts_actor_idx",
    );
    expect(migration).toContain(
      "completed_repair_learning_receipts_deny_direct_access",
    );
    expect(completionService).toContain(
      '"claim_completed_repair_learning_atomic"',
    );
    expect(completionService).toContain(
      '"finish_completed_repair_learning_atomic"',
    );
    expect(completionService).toContain("operationKey: input.operationKey");
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
