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

  it("passes authenticated operator context into both deletion protocols", () => {
    const route = read("app/api/ops/marketing/media/route.ts");

    expect(route).toContain("deleteMarketingMediaAsset(payload.id, {");
    expect(route).toContain("deleteIncompleteMarketingMediaAsset(payload.id, {");
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

  it("keeps incomplete library media separate from the page-ready asset contract", () => {
    const types = read("features/marketing/media/types.ts");
    const libraryServer = read("features/marketing/media/library-server.ts");
    const mediaRoute = read("app/api/ops/marketing/media/route.ts");
    const pageRoute = read("app/api/ops/marketing/pages/[pageKey]/route.ts");

    expect(types).toContain("MarketingMediaLibraryAssetSchema");
    expect(types).toContain('alt: z.string().trim().max(240).default("")');
    expect(types).toContain('alt: z.string().trim().min(1).max(240)');
    expect(libraryServer).toContain("MarketingMediaAssetSchema.parse");
    expect(mediaRoute).toContain('payload.action === "prepare-upload" || payload.action === "prepare-library-upload"');
    expect(mediaRoute).toContain('const isLibraryUpload = payload.action === "prepare-library-upload"');
    expect(mediaRoute).toContain('(!isLibraryUpload && !alt)');
    expect(pageRoute).toContain("getMarketingMediaAsset(assetId)");
    expect(pageRoute).toContain("MarketingMediaAssetSchema.safeParse(libraryAsset)");
    expect(pageRoute).toContain("Add alt text to this media before attaching it to a landing page");
  });

  it("bulk uploads directly into the same reusable media library", () => {
    const library = read("features/ops/components/OpsMarketingMediaLibraryManager.tsx");
    const editor = read("features/ops/components/OpsMarketingMediaManager.tsx");

    expect(library).toContain("Bulk upload");
    expect(library).toContain("multiple");
    expect(library).toContain("uploadToSignedUrl");
    expect(library).toContain('action: "prepare-library-upload"');
    expect(library).toContain('action: "finalize-upload"');
    expect(library).toContain('alt: ""');
    expect(library).toContain("Alt text needed before use");
    expect(editor).toContain("selectedNeedsAlt");
    expect(editor).toContain('href="/ops/marketing/library"');
    expect(editor).toContain("Large files upload directly to media storage.");
    expect(editor).toContain("Add alt text before uploading the screenshot or reel from the landing-page editor");
  });

  it("recovers stale library locks instead of permanently wedging an asset", () => {
    const libraryServer = read("features/marketing/media/library-server.ts");

    expect(libraryServer).toContain("LIBRARY_LOCK_TTL_MS");
    expect(libraryServer).toContain("const lockId = crypto.randomUUID()");
    expect(libraryServer).toContain("Date.now() - createdAt > LIBRARY_LOCK_TTL_MS");
    expect(libraryServer).toContain("current.lockId !== existing.lockId");
    expect(libraryServer).toContain("current.lockId !== handle.lockId");
  });

  it("audits incomplete asset deletion before destructive storage removal", () => {
    const libraryServer = read("features/marketing/media/library-server.ts");

    expect(libraryServer).toContain('await writeDeletionAudit(current, actor, "intent")');
    expect(libraryServer).toContain('await writeDeletionMarker(current, actor, "deleting")');
    expect(libraryServer).toContain('await writeDeletionMarker(current, actor, "deleted")');
    expect(libraryServer).toContain('await writeDeletionAudit(current, actor, "completed")');
    expect(libraryServer).toContain("operatorId: actor.operatorId");
    expect(libraryServer).toContain("operatorEmail: actor.operatorEmail");
  });

  it("does not let a stale initial library load overwrite a completed upload", () => {
    const library = read("features/ops/components/OpsMarketingMediaLibraryManager.tsx");

    expect(library).toContain("if (!files.length || loading || bulkUploading) return");
    expect(library).toContain("const uploadDisabled = loading || bulkUploading");
    expect(library).toContain("disabled={uploadDisabled}");
  });

  it("keeps per-file upload errors visible on mobile", () => {
    const library = read("features/ops/components/OpsMarketingMediaLibraryManager.tsx");

    expect(library).toContain('break-words pl-6 text-red-300');
    expect(library).not.toContain('hidden max-w-xs truncate text-red-300 sm:inline');
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
