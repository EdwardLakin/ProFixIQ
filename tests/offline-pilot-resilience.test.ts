import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOfflinePilotDiagnostics } from "@/features/shared/lib/offline/diagnostics";
import type { PendingMutation } from "@/features/shared/lib/offline/mutations";

const read = (path: string) => readFileSync(path, "utf8");

const mutation: PendingMutation = {
  clientMutationId: "secret-mutation-id",
  actionType: "upload_job_photo",
  payload: {
    customerName: "Private Customer",
    notes: "Private technician notes",
  },
  createdAt: "2026-07-16T18:00:00.000Z",
  retryCount: 2,
  userId: "secret-user-id",
  shopId: "secret-shop-id",
  status: "failed",
};

describe("offline pilot resilience", () => {
  it("exports aggregate diagnostics without tenant IDs or mutation payloads", () => {
    const diagnostics = buildOfflinePilotDiagnostics({
      now: new Date("2026-07-16T19:00:00.000Z"),
      appVersion: "abc123",
      online: true,
      installed: true,
      sessionHealth: {
        status: "verified",
        message: "Verified",
        verifiedAt: "2026-07-16T19:00:00.000Z",
      },
      browserStorage: { usage: 100, quota: 1000, persistent: true },
      storageHealth: {
        level: "ready",
        label: "Storage ready",
        message: "Ready",
        usagePercent: 10,
        availableBytes: 900,
      },
      databaseStats: { mutations: 1, snapshots: 2, blobs: 1, blobBytes: 50 },
      attachmentAudit: { checked: 1, missing: 1, invalid: 0 },
      persistenceHealth: {
        expectedPendingMutations: 1,
        storedPendingMutations: 1,
        expectedPendingAttachments: 1,
        suspectedEviction: false,
      },
      updateWaiting: false,
      mutations: [mutation],
    });
    const json = JSON.stringify(diagnostics);
    expect(diagnostics.queue.byAction.upload_job_photo).toBe(1);
    expect(diagnostics.queue.oldestPendingMinutes).toBe(60);
    for (const secret of [
      "secret-mutation-id",
      "secret-user-id",
      "secret-shop-id",
      "Private Customer",
      "Private technician notes",
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it("marks unavailable staged files as actionable conflicts before replay", () => {
    const mutations = read("features/shared/lib/offline/mutations.ts");
    const syncCenter = read("app/offline/sync/page.tsx");
    expect(mutations).toContain("auditOfflineMutationAttachments");
    expect(mutations).toContain("await auditOfflineMutationAttachments(scope)");
    expect(mutations).toContain("Browser storage removed the staged photo");
    expect(mutations).toContain('status: "conflicted"');
    expect(syncCenter).toContain("auditOfflineMutationAttachments(scope)");
    expect(syncCenter.toLowerCase()).toContain("capture the photo again");
  });

  it("detects a missing offline database using only aggregate persistence markers", () => {
    const mutations = read("features/shared/lib/offline/mutations.ts");
    expect(mutations).toContain('const PERSISTENCE_MARKER_KEY = "profixiq.offline.persistence.v1"');
    expect(mutations).toContain("pendingMutations: pending.length");
    expect(mutations).toContain("expectedPendingMutations > 0");
    expect(mutations).toContain("storedPendingMutations === 0");
    expect(mutations).not.toContain("payload: marker");
  });

  it("repairs the advisor materializer legacy lead alias for existing databases", () => {
    const original = read(
      "supabase/migrations/20260717090000_offline_advisor_work_order_drafts.sql",
    );
    const repair = read(
      "supabase/migrations/20260717120000_offline_advisor_lead_alias.sql",
    );
    for (const source of [original, repair]) {
      expect(source).toContain("'leadhand','lead','foreman'");
      expect(source).toContain("materialize_offline_work_order_draft_atomic");
    }
  });
});
