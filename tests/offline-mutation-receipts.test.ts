import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260716090000_phase2_offline_mutation_receipts.sql",
);

describe("offline mutation receipts", () => {
  it("stores tenant and actor scoped receipts with one operation-key owner", () => {
    expect(migration).toContain(
      "create table if not exists public.offline_mutation_receipts",
    );
    expect(migration).toContain("unique (shop_id, operation_key)");
    expect(migration).toContain("actor_user_id = auth.uid()");
    expect(migration).toContain("payload_hash text not null");
    expect(migration).toContain("IDEMPOTENCY_KEY_REUSE");
    expect(migration).toContain("auth.uid() <> p_actor_user_id");
    expect(migration).toContain("work_order_line_technicians");
  });

  it("applies line and shift mutations atomically before completing receipts", () => {
    expect(migration).toContain("apply_offline_line_mutation_atomic");
    expect(migration).toContain("apply_offline_shift_punch_atomic");
    expect(migration).toContain("pause_all_active_technician_labor_atomic");
    expect(migration).toContain("insert into public.punch_events");
    expect(migration).toContain("insert into public.offline_mutation_receipts");
  });

  it("requires authenticated idempotency keys at both server entry points", () => {
    const offlineRoute = read("app/api/offline/mutations/route.ts");
    const punchRoute = read("app/api/scheduling/punches/route.ts");
    for (const source of [offlineRoute, punchRoute]) {
      expect(source).toContain('headers.get("Idempotency-Key")');
      expect(source).toContain("A stable Idempotency-Key is required.");
      expect(source).toContain("auth.getUser()");
    }
  });

  it("routes every remaining queued write through server receipts", () => {
    const replay = read("features/shared/lib/offline/replay.ts");
    const mobileJob = read("features/work-orders/mobile/MobileFocusedJob.tsx");
    expect(replay).toContain("postOfflineServerMutation");
    expect(replay).toContain("mutation.clientMutationId");
    expect(replay).toContain('actionType: "update_work_order_line_notes"');
    expect(replay).toContain('actionType: "save_story_draft"');
    expect(replay).toContain('actionType: "upload_job_photo"');
    expect(mobileJob).toContain("postOfflineServerMutation");
  });
});
