import { describe, expect, it } from "vitest";

import {
  evidenceItemMatchesUrl,
  evidenceStorageObject,
  evidenceUrlIdentity,
  uniqueEvidenceUrls,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

describe("work-order evidence URL identity", () => {
  it("recognizes signed, public and authenticated storage URLs", () => {
    expect(
      evidenceStorageObject(
        "https://example.supabase.co/storage/v1/object/sign/job-photos/wo/1/lines/2/photo.jpg?token=one",
      ),
    ).toEqual({
      bucket: "job-photos",
      path: "wo/1/lines/2/photo.jpg",
    });
    expect(
      evidenceStorageObject(
        "/storage/v1/object/authenticated/inspection_photos/shops/a/inspections/b/photo.jpg",
      ),
    ).toEqual({
      bucket: "inspection_photos",
      path: "shops/a/inspections/b/photo.jpg",
    });
  });

  it("deduplicates refreshed signed URLs for one immutable object", () => {
    const first =
      "https://example.test/storage/v1/object/sign/job-photos/wo/1/lines/2/photo.jpg?token=old";
    const refreshed =
      "https://example.test/storage/v1/object/sign/job-photos/wo/1/lines/2/photo.jpg?token=new";

    expect(evidenceUrlIdentity(first)).toBe(evidenceUrlIdentity(refreshed));
    expect(uniqueEvidenceUrls([first, refreshed])).toEqual([first]);
  });

  it("matches inspection URLs to canonical media by bucket and path", () => {
    const item: WorkOrderEvidenceItem = {
      id: "media-1",
      workOrderId: "work-order-1",
      workOrderLineId: "line-1",
      quoteLineId: null,
      kind: "photo",
      source: "inspection_photo",
      visibility: "internal",
      fileName: "photo.jpg",
      contentType: "image/jpeg",
      fileSize: 10,
      createdAt: null,
      storageBucket: "job-photos",
      storagePath: "wo/work-order-1/lines/line-1/photo.jpg",
      sourceUrl: null,
      displayUrl: null,
      annotation: null,
    };

    expect(
      evidenceItemMatchesUrl(
        item,
        "/storage/v1/object/sign/job-photos/wo/work-order-1/lines/line-1/photo.jpg?token=abc",
      ),
    ).toBe(true);
  });
});
