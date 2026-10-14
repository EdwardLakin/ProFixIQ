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
    expect(server).toContain("return (await getMarketingMediaAsset(asset.id)) ?? asset");
    expect(server).toContain("canonical hydration failed; using embedded slot asset");
    expect(server).toContain("export async function updateMarketingMediaAssetMetadata");
    expect(server).toContain("writeStoredJson(`assets/${assetId}.json`, updated)");
  });

  it("serializes metadata edits and assignments against permanent deletion state", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain('state: "deleting" | "deleted" | "failed"');
    expect(server).toContain("async function writeDeletionMarker");
    expect(server).toContain("marker?.state === \"deleting\" || marker?.state === \"deleted\"");
    expect(server).toContain("if (await isMarketingMediaAssetUnavailable(assetId))");
    expect(server).toContain("await removeStoredJson(`assets/${assetId}.json`)");
    expect(server).toContain("getAssignableMarketingMediaAsset(asset.id)");
    expect(server).toContain("await removeStoredJson(path)");
    expect(server).toContain("const asset = await getAssignableMarketingMediaAsset(draftAsset.id)");
  });

  it("keeps deletion state recoverable across partial failures", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain('existingMarker?.state === "deleted"');
    expect(server).toContain('await writeDeletionMarker(asset, "deleting")');
    expect(server).toContain('await writeDeletionMarker(asset, "failed")');
    expect(server).toContain('await writeDeletionMarker(asset, "deleted")');
    expect(server).toContain("let mediaRemoved = false");
    expect(server).toContain("if (!mediaRemoved)");
  });

  it("claims stale uploads so cleanup cannot race finalization", () => {
    const route = read("app/api/ops/marketing/media/route.ts");

    expect(route).toContain("STALE_PENDING_MS = 24 * 60 * 60 * 1000");
    expect(route).toContain("function pendingCleanupPath(assetId: string)");
    expect(route).toContain("await writeContentJson(cleanupPath");
    expect(route).toContain("if (await contentObjectExists(cleanupPath))");
    expect(route).toContain("expired during finalization");
    expect(route).toContain("Keep the cancellation marker permanently");
    expect(route).toContain("if (canonical || usages.length > 0)");
  });

  it("audits permanent media deletion with authenticated operator context", () => {
    const route = read("app/api/ops/marketing/media/route.ts");

    expect(route).toContain("async function writeMediaDeletionAudit");
    expect(route).toContain('action: "marketing_media_deleted"');
    expect(route).toContain("operatorId: access.user.id");
    expect(route).toContain("operatorEmail: access.operatorEmail");
    expect(route).toContain("storagePath: input.asset.storagePath");
    expect(route).toContain("await writeMediaDeletionAudit");
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
