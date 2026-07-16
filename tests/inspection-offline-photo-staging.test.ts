import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const staging = read(
  "features/inspections/lib/inspection/inspectionPhotoStaging.ts",
);
const upload = read(
  "features/inspections/lib/inspection/PhotoUploadButton.tsx",
);
const drafts = read("features/inspections/lib/inspection/offlineDrafts.ts");
const replay = read("features/shared/lib/offline/replay.ts");
const mutations = read("features/shared/lib/offline/mutations.ts");
const screen = read("features/inspections/screens/GenericInspectionScreen.tsx");
const route = read("app/api/inspections/photos/upload/route.ts");
const findings = read("features/inspections/lib/inspection/findings/page.tsx");

describe("technician inspection offline photo staging", () => {
  it("stores the blob before queueing a scoped inspection photo mutation", () => {
    expect(staging).toContain("await saveOfflineBlob");
    expect(staging).toContain("actionType: INSPECTION_PHOTO_ACTION");
    expect(staging).toContain('"inspection:upload-photo"');
    expect(staging).toContain("scope,");
    expect(staging).toContain("workOrderLineId: args.workOrderLineId");
  });

  it("accepts only bounded image evidence on both client and server", () => {
    expect(upload).toContain("MAX_PHOTO_BYTES");
    expect(upload).toContain('startsWith("image/")');
    expect(route).toContain("MAX_PHOTO_BYTES");
    expect(route).toContain("Inspection evidence must be an image.");
    expect(route).toContain("Inspection photos must be 15 MB or smaller.");
  });

  it("recovers queued previews and exposes their sync state", () => {
    expect(upload).toContain("listStagedInspectionPhotos");
    expect(upload).toContain("URL.createObjectURL(record.blob)");
    expect(upload).toContain("Queued on device");
    expect(upload).toContain("Waiting to retry");
    expect(upload).toContain("Sync needs review");
  });

  it("replays through the authenticated inspection upload route", () => {
    expect(replay).toContain(
      '"inspection:upload-photo": replayInspectionPhotoMutation',
    );
    expect(staging).toContain('fetch("/api/inspections/photos/upload"');
    expect(staging).toContain('"Idempotency-Key": operationKey');
    expect(staging).toContain("record.userId !== mutation.userId");
    expect(staging).toContain("record.shopId !== mutation.shopId");
  });

  it("writes the uploaded URL back to the recovered item draft", () => {
    expect(staging).toContain("appendInspectionPhotoToOfflineDraft");
    expect(drafts).toContain("photoUrls.includes(args.url)");
    expect(drafts).toContain("photoUrls: [...photoUrls, args.url]");
    expect(staging).toContain("INSPECTION_PHOTO_SYNCED_EVENT");
    expect(screen).toContain("draftKey={draftKey}");
  });

  it("removes staged bytes after success or dismissal and retains active blobs", () => {
    expect(staging).toContain("await removeOfflineBlob");
    expect(upload).toContain("dismissOfflineMutation");
    expect(mutations).toContain(
      'mutation.actionType === "inspection:upload-photo"',
    );
    expect(mutations).toContain(
      'item.actionType === "inspection:upload-photo"',
    );
  });

  it("does not finalize an inspection while evidence is still staged", () => {
    expect(staging).toContain("getPendingInspectionPhotoCount");
    expect(findings).toContain(
      "await getPendingInspectionPhotoCount(draftKey)",
    );
    expect(findings).toContain("still waiting to sync");
  });
});
