import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("marketing media deleted upload replay protection", () => {
  it("invalidates pending upload state when media is deleted", () => {
    const route = read("app/api/ops/marketing/media/route.ts");
    const deletion = route.slice(route.indexOf('payload.action === "delete"'));

    expect(deletion).toContain("await invalidatePreparedUpload(payload.id)");
    expect(route).toContain('removeContentObject(`pending/${assetId}.json`)');
    expect(route).toContain("removeContentObject(pendingCleanupPath(assetId))");
  });

  it("rejects and cleans finalize replays after terminal deletion", () => {
    const route = read("app/api/ops/marketing/media/route.ts");
    const finalize = route.slice(route.indexOf('payload.action === "finalize-upload"'));

    expect(route).toContain("async function readTerminalDeletedAsset");
    expect(route).toContain('`library-deleted/${assetId}.json`');
    expect(route).toContain('`deleted/${assetId}.json`');
    expect(finalize.match(/rejectDeletedFinalization\(id\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(route).toContain("Deleted marketing media replay cleanup failed");
  });
});
