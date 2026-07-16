import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeOfflineMutationQueue,
  restoreOfflineMutation,
  sortOfflineMutationsForReplay,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import {
  offlineMutationDeviceValue,
  offlineMutationTarget,
} from "@/features/shared/lib/offline/conflicts";

const read = (path: string) => readFileSync(path, "utf8");

function mutation(
  id: string,
  actionType: string,
  createdAt: string,
  orderKey?: string,
): PendingMutation {
  return {
    clientMutationId: id,
    actionType,
    payload: { lineId: "line-1" },
    createdAt,
    retryCount: 0,
    userId: "user-1",
    shopId: "shop-1",
    orderKey,
    status: "queued",
  };
}

describe("technician offline hardening", () => {
  it("recovers an interrupted sync as retryable after an app restart", () => {
    const restored = restoreOfflineMutation({
      ...mutation("restart-1", "job:punch-transition", "2026-07-16T10:00:00Z"),
      status: "syncing",
    });
    expect(restored?.status).toBe("failed");
    expect(restored?.clientMutationId).toBe("restart-1");
  });

  it("collapses repeated actions with the same stable mutation id", () => {
    const first = mutation(
      "same-id",
      "save_story_draft",
      "2026-07-16T10:00:00Z",
    );
    const repeated = { ...first, retryCount: 2, status: "failed" as const };
    expect(normalizeOfflineMutationQueue([first, repeated])).toEqual([
      repeated,
    ]);
  });

  it("replays reconnect work chronologically and deterministically", () => {
    const sorted = sortOfflineMutationsForReplay([
      mutation("third", "save_story_draft", "2026-07-16T10:01:00Z", "line:002"),
      mutation(
        "second",
        "update_work_order_line_notes",
        "2026-07-16T10:00:00Z",
        "line:002",
      ),
      mutation(
        "first",
        "job:punch-transition",
        "2026-07-16T10:00:00Z",
        "line:001",
      ),
    ]);
    expect(sorted.map((item) => item.clientMutationId)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("keeps the device value visible and links conflicts to their job", () => {
    const conflicted = {
      ...mutation(
        "notes-1",
        "update_work_order_line_notes",
        "2026-07-16T10:00:00Z",
      ),
      payload: { workOrderLineId: "line/1", notes: "Device diagnosis" },
      status: "conflicted" as const,
    };
    expect(offlineMutationTarget(conflicted)).toBe("/mobile/jobs/line%2F1");
    expect(offlineMutationDeviceValue(conflicted)).toBe("Device diagnosis");
  });

  it("atomically rejects stale notes and story writes from a second device", () => {
    const migration = read(
      "supabase/migrations/20260716230000_offline_line_version_conflicts.sql",
    );
    const editor = read("features/work-orders/mobile/MobileFocusedJob.tsx");
    const route = read("app/api/offline/mutations/route.ts");
    expect(editor).toContain("baseUpdatedAt: line?.updated_at ?? null");
    expect(editor).toContain("baseUpdatedAt: line.updated_at");
    expect(migration).toContain("for update");
    expect(migration).toContain(
      "v_line.updated_at is distinct from v_base_updated_at",
    );
    expect(migration).toContain("OFFLINE_VERSION_CONFLICT");
    expect(route).toContain('normalized.includes("idempotency_key_reuse")');
    expect(route).toContain("return 409");
  });

  it("refreshes authoritative work-order and shift snapshots after replay", () => {
    const replay = read("features/shared/lib/offline/replay.ts");
    const reconciliation = read(
      "features/shared/lib/offline/reconciliation.ts",
    );
    const syncCenter = read("app/offline/sync/page.tsx");
    expect(replay).toContain("replayAndReconcileOfflineMutations");
    expect(reconciliation).toContain("downloadAssignedTechnicianWork");
    expect(reconciliation).toContain("fetchMobileShiftState");
    expect(syncCenter).toContain("Retry device update");
    expect(syncCenter).toContain("prepareOfflineMutationRetry");
    expect(reconciliation).toContain("downloadAssignedTechnicianWork");
    expect(syncCenter).toContain("Use server state");
    expect(syncCenter).toContain("Open record");
  });
});
