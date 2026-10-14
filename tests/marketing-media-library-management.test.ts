import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("marketing media library management", () => {
  it("tracks draft and published usage before destructive actions", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("export async function getMarketingMediaUsageMap");
    expect(server).toContain('state: "draft"');
    expect(server).toContain('state: "published"');
    expect(server).toContain("if (usages.length > 0) return { deleted: false, usages };");
    expect(server).toContain("MARKETING_MEDIA_BUCKET).remove([asset.storagePath])");
  });

  it("propagates metadata changes into draft and published slot records", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("export async function updateMarketingMediaAssetMetadata");
    expect(server).toContain("writeStoredJson(`assets/${assetId}.json`, updated)");
    expect(server).toContain("draftSlotPath(usage.pageKey, usage.slotKey)");
    expect(server).toContain("publishedSlotPath(usage.pageKey, usage.slotKey)");
    expect(server).toContain("existing?.publishedAt");
  });

  it("cleans abandoned prepared uploads conservatively", () => {
    const route = read("app/api/ops/marketing/media/route.ts");

    expect(route).toContain("STALE_PENDING_MS = 24 * 60 * 60 * 1000");
    expect(route).toContain('listJsonItems("pending")');
    expect(route).toContain("new Date(asset.createdAt).getTime() > cutoff");
    expect(route).toContain("cleanedPending");
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
