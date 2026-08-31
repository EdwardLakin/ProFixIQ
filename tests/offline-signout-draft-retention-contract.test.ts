import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  collectRequiredOfflineMutationIds,
  isRetainableWriteBearingSnapshot,
  isWriteBearingSnapshotKind,
} from "@/features/shared/lib/offline/database";

describe("offline sign-out draft retention contract", () => {
  it("treats every canonical authored draft kind as write-bearing", () => {
    for (const kind of [
      "inspection-draft",
      "parts-request-draft",
      "message-draft",
      "advisor-work-order-draft",
      "technician-job-draft",
      "future-authored-surface-draft",
    ]) {
      expect(isWriteBearingSnapshotKind(kind), kind).toBe(true);
    }

    for (const kind of [
      "advisor-offline-day",
      "advisor-draft-materialization",
      "mobile-work-order-detail",
      "technician-offline-download",
    ]) {
      expect(isWriteBearingSnapshotKind(kind), kind).toBe(false);
    }
  });

  it("retains only unexpired authored drafts", () => {
    const now = Date.parse("2026-08-31T18:00:00.000Z");

    expect(
      isRetainableWriteBearingSnapshot(
        {
          kind: "advisor-work-order-draft",
          expiresAt: "2026-09-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
    expect(
      isRetainableWriteBearingSnapshot(
        {
          kind: "technician-job-draft",
          expiresAt: "2026-08-31T17:59:59.999Z",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isRetainableWriteBearingSnapshot(
        {
          kind: "mobile-work-order-detail",
          expiresAt: "2026-09-01T18:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isRetainableWriteBearingSnapshot(
        { kind: "message-draft", expiresAt: "not-a-date" },
        now,
      ),
    ).toBe(false);
  });

  it("retains the complete synced dependency closure of pending work", () => {
    const retained = collectRequiredOfflineMutationIds([
      {
        clientMutationId: "grandparent",
        status: "synced",
      },
      {
        clientMutationId: "parent",
        status: "synced",
        dependsOn: ["grandparent"],
      },
      {
        clientMutationId: "child",
        status: "failed",
        dependsOn: ["parent"],
      },
      {
        clientMutationId: "unrelated-history",
        status: "synced",
      },
    ]);

    expect([...retained]).toEqual(
      expect.arrayContaining(["child", "parent", "grandparent"]),
    );
    expect(retained.has("unrelated-history")).toBe(false);
  });

  it("keeps the sign-out decision inside the preserving database transaction", () => {
    const mutationsSource = readFileSync(
      resolve(process.cwd(), "features/shared/lib/offline/mutations.ts"),
      "utf8",
    );
    const clearStateSource = mutationsSource.slice(
      mutationsSource.indexOf("export async function clearOfflineState"),
    );

    expect(clearStateSource).not.toContain("countUnsyncedOfflineWork");
    expect(clearStateSource).toContain(
      "await clearOfflineDatabasePreservingUnsyncedWork(lock)",
    );
    expect(clearStateSource).toContain("readLegacyOfflineMutations()");
    expect(clearStateSource).toContain("insertStoredMutationsIfMissing(");
    expect(clearStateSource.indexOf("insertStoredMutationsIfMissing(")).toBeLessThan(
      clearStateSource.indexOf(
        "await clearOfflineDatabasePreservingUnsyncedWork(lock)",
      ),
    );

    const databaseSource = readFileSync(
      resolve(process.cwd(), "features/shared/lib/offline/database.ts"),
      "utf8",
    );
    const preservingSource = databaseSource.slice(
      databaseSource.indexOf(
        "export async function clearOfflineDatabasePreservingUnsyncedWork",
      ),
      databaseSource.indexOf("export async function clearOfflineDatabase(",
      ),
    );

    expect(preservingSource).toContain(
      'db.transaction("rw", [db.mutations, db.snapshots, db.blobs]',
    );
    expect(preservingSource).toContain("retainedUnsyncedWork");
    expect(preservingSource).toContain("isRetainableWriteBearingSnapshot");
    expect(preservingSource).toContain("collectRequiredOfflineMutationIds");
  });
});
