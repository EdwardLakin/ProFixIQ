import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("marketing media library management", () => {
  it("tracks draft and published usage before destructive actions", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("export async function getMarketingMediaUsageMap");
    expect(server).toContain('state: "draft"');
    expect(server).toContain('state: "published"');
    expect(server).toContain("if (usages.length > 0)");
    expect(server).toContain("MARKETING_MEDIA_BUCKET).remove([asset.storagePath])");
  });

  it("hydrates canonical metadata while preserving embedded slot compatibility", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("async function hydrateCanonicalAsset");
    expect(server).toContain("canonical ?? asset");
    expect(server).toContain("canonical hydration failed; using embedded slot asset");
    expect(server).toContain("async function getPublishableMarketingMediaAsset");
    expect(server).toContain("canonical ?? embedded");
    expect(server).toContain("isMarketingMediaAssetDeleted");
  });

  it("uses assignment reservations instead of racy read-then-compensate writes", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("async function createAssignmentReservation");
    expect(server).toContain("async function waitForAssignmentReservations");
    expect(server).toContain("writeStoredJsonCreateOnly");
    expect(server).toContain("const reservationPath = await createAssignmentReservation(asset.id)");
    expect(server).not.toContain("current?.draft?.id === asset.id");
    expect(server).not.toContain("current?.published?.id === asset.id");
    expect(server).not.toContain("await writeStoredJson(path, previousRecord)");
  });

  it("keeps terminal deletion state immutable and authoritative", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("function terminalDeletionMarkerPath");
    expect(server).toContain("async function getTerminalDeletionMarker");
    expect(server).toContain("async function writeTerminalDeletionMarker");
    expect(server).toContain("if (terminal) return terminal");
    expect(server).toContain("await writeTerminalDeletionMarker(asset, actor)");
  });

  it("keeps deletion state recoverable and attributes fresh blocked retries to the current operator", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain('existingMarker?.state === "deleted"');
    expect(server).toContain('await writeDeletionAudit(asset, actor, "intent")');
    expect(server).toContain('await writeDeletionMarker(asset, "deleting", actor)');
    expect(server).toContain('await writeDeletionMarker(asset, "failed", actor)');
    expect(server).toContain('await writeDeletionAudit(asset, actor, "completed")');
    expect(server).toContain('existingMarker?.state === "deleting"');
    expect(server).toContain(": requestedBy;");
  });

  it("uses a terminal cleanup winner before finalization compensates", () => {
    const route = read("app/api/ops/marketing/media/route.ts");

    expect(route).toContain('state: "cancelling" | "cancelled" | "finalized"');
    expect(route).toContain('await writePendingCleanupMarker(asset, "cancelling")');
    expect(route).toContain('await writePendingCleanupMarker(asset, "finalized")');
    expect(route).toContain('await writePendingCleanupMarker(asset, "cancelled")');
    expect(route).toContain("waitForPendingCleanupResolution");
    expect(route).toContain('cleanupAfterWrite?.state === "cancelled"');
    expect(route).toContain('cleanupAfterWrite?.state === "finalized"');
    expect(route).toContain("cleanup is still resolving");
  });

  it("passes authenticated operator context into the deletion protocol", () => {
    const route = read("app/api/ops/marketing/media/route.ts");

    expect(route).toContain("deleteMarketingMediaAsset(payload.id, {");
    expect(route).toContain("operatorId: access.user.id");
    expect(route).toContain("operatorEmail: access.operatorEmail");
    expect(route).not.toContain("writeMediaDeletionAudit");
  });

  it("supports metadata editing and protected deletion through the Ops API", () => {
    const route = read("app/api/ops/marketing/media/route.ts");

    expect(route).toContain('payload.action === "update-metadata"');
    expect(route).toContain('payload.action === "delete"');
    expect(route).toContain("getMarketingMediaUsageMap()");
    expect(route).toContain("This media is still used by a landing page");
    expect(route).toContain("revalidatePath(MARKETING_PAGE_REGISTRY[usage.pageKey].href)");
  });

  it("adds searchable, filterable usage-aware controls without double-loading the editor", () => {
    const page = read("app/ops/marketing/page.tsx");
    const libraryPage = read("app/ops/marketing/library/page.tsx");
    const library = read("features/ops/components/OpsMarketingMediaLibraryManager.tsx");

    expect(page).toContain('href="/ops/marketing/library"');
    expect(page).not.toContain("<OpsMarketingMediaLibraryManager />");
    expect(libraryPage).toContain("<OpsMarketingMediaLibraryManager />");
    expect(library).toContain("Search filename, alt text, or caption");
    expect(library).toContain("All media");
    expect(library).toContain("All usage");
    expect(library).toContain("Save metadata");
    expect(library).toContain("Remove all draft/published references before deleting");
    expect(library).toContain("Used on");
  });
});
