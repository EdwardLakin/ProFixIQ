import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("marketing media library deletion fence compatibility", () => {
  it("keeps canonical assignment reservations behind both canonical and library deletion fences", () => {
    const server = read("features/marketing/media/server.ts");

    expect(server).toContain("async function getLibraryDeletionFence");
    expect(server).toContain('return `library-deleting/${assetId}.json`');
    expect(server).toContain('return `library-deleted/${assetId}.json`');
    expect(server).toContain("getDeletionMarker(assetId)");
    expect(server).toContain("getLibraryDeletionFence(assetId)");
    expect(server).toContain('libraryFence?.state === "deleting"');
    expect(server).toContain('libraryFence?.state === "deleted"');

    const reservation = server.slice(server.indexOf("async function createAssignmentReservation"));
    expect(reservation.match(/isMarketingMediaAssetUnavailable\(assetId\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
