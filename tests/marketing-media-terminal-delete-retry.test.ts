import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("marketing media terminal delete retry recovery", () => {
  it("re-runs metadata cleanup before reporting a terminal retry as successful", () => {
    const libraryServer = read("features/marketing/media/library-server.ts");
    const terminalRetry = libraryServer.slice(
      libraryServer.indexOf('if (existingMarker?.state === "deleted")'),
      libraryServer.indexOf('if (existingMarker?.state !== "deleting")'),
    );

    expect(terminalRetry).toContain('await removeJson(`assets/${assetId}.json`)');
    expect(terminalRetry).toContain('await writeDeletionAudit(current, actor, "completed")');
    expect(terminalRetry.indexOf('await removeJson(`assets/${assetId}.json`)')).toBeLessThan(
      terminalRetry.indexOf('await writeDeletionAudit(current, actor, "completed")'),
    );
    expect(terminalRetry).toContain('await removeJson(`${LIBRARY_DELETING_PREFIX}/${assetId}.json`)');
    expect(terminalRetry).toContain("return { deleted: true, usages: [], asset: current }");
  });
});
