import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessOfflineStorage } from "@/features/shared/lib/offline/storage-health";

const read = (path: string) => readFileSync(path, "utf8");

describe("offline shop-pilot hardening", () => {
  it("blocks replay until the server verifies the same authenticated user and shop", () => {
    const route = read("app/api/offline/session-check/route.ts");
    const session = read("features/shared/lib/offline/session.ts");
    const replay = read("features/shared/lib/offline/replay.ts");
    expect(route).toContain("resolveCurrentActor");
    expect(route).toContain("actor.user.id");
    expect(route).toContain("actor.shopId");
    expect(session).toContain("body.userId !== scope.userId");
    expect(session).toContain("body.shopId !== scope.shopId");
    expect(replay).toContain("assertOfflineReplaySession");
    expect(replay.indexOf("assertOfflineReplaySession")).toBeLessThan(
      replay.lastIndexOf("replayQueuedMutations({ handlers })"),
    );
  });

  it("gives expired, revoked, mismatched, and unavailable verification distinct outcomes", () => {
    const session = read("features/shared/lib/offline/session.ts");
    expect(session).toContain('"reauthenticate"');
    expect(session).toContain('"access_revoked"');
    expect(session).toContain('"scope_changed"');
    expect(session).toContain('"verification_unavailable"');
  });

  it("marks low capacity and large photo queues before capture becomes unsafe", () => {
    expect(
      assessOfflineStorage({
        usage: 950,
        quota: 1000,
        persistent: true,
        pendingBlobBytes: 0,
        pendingBlobCount: 0,
      }).level,
    ).toBe("critical");
    expect(
      assessOfflineStorage({
        usage: 100 * 1024 * 1024,
        quota: 1024 * 1024 * 1024,
        persistent: true,
        pendingBlobBytes: 300 * 1024 * 1024,
        pendingBlobCount: 45,
      }).level,
    ).toBe("warning");
    expect(
      assessOfflineStorage({
        usage: 100 * 1024 * 1024,
        quota: 2 * 1024 * 1024 * 1024,
        persistent: true,
        pendingBlobBytes: 10 * 1024 * 1024,
        pendingBlobCount: 2,
      }).level,
    ).toBe("ready");
  });

  it("prevents an app update from activating over pending device work", () => {
    const runtime = read("features/shared/components/pwa/PwaRuntime.tsx");
    const syncCenter = read("app/offline/sync/page.tsx");
    expect(runtime).toContain("disabled={activatingUpdate || pending > 0}");
    expect(runtime).toContain('"Sync first"');
    expect(syncCenter).toContain("navigator.serviceWorker?.getRegistration?.()");
    expect(syncCenter).toContain("No version-skew risk is currently detected.");
  });
});
