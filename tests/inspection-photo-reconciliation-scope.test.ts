import { describe, expect, it } from "vitest";

import {
  inspectionPhotoBelongsToScope,
  inspectionPhotoStorageObject,
} from "@/features/inspections/server/reconcileInspectionPhotoEvidence";

const scope = {
  shopId: "shop-a",
  workOrderId: "work-order-a",
  workOrderLineId: "line-a",
  inspectionIds: new Set(["inspection-a", "inspection-legacy"]),
};

describe("inspection photo reconciliation scope", () => {
  it("accepts the exact canonical work-order object", () => {
    const object = inspectionPhotoStorageObject(
      "/storage/v1/object/sign/job-photos/wo/work-order-a/lines/line-a/photo.jpg?token=one",
    );
    expect(object).not.toBeNull();
    expect(inspectionPhotoBelongsToScope({ ...scope, object: object! })).toBe(
      true,
    );
  });

  it("accepts a historical photo only for an authorized inspection", () => {
    const object = inspectionPhotoStorageObject(
      "shops/shop-a/inspections/inspection-legacy/photo.jpg",
    );
    expect(object).not.toBeNull();
    expect(inspectionPhotoBelongsToScope({ ...scope, object: object! })).toBe(
      true,
    );
  });

  it.each([
    "shops/shop-b/inspections/inspection-a/photo.jpg",
    "shops/shop-a/inspections/inspection-other/photo.jpg",
    "wo/work-order-b/lines/line-a/photo.jpg",
    "wo/work-order-a/lines/line-b/photo.jpg",
  ])("rejects a cross-scope object: %s", (value) => {
    const object = inspectionPhotoStorageObject(value);
    expect(object).not.toBeNull();
    expect(inspectionPhotoBelongsToScope({ ...scope, object: object! })).toBe(
      false,
    );
  });

  it.each([
    "shops/shop-a/inspections/inspection-a/../photo.jpg",
    "shops/shop-a/inspections/inspection-a/%2e%2e/photo.jpg",
    "shops/shop-a/inspections/inspection-a/folder/photo.jpg",
    "javascript:alert(1)",
  ])("rejects malformed or traversal-style input: %s", (value) => {
    const object = inspectionPhotoStorageObject(value);
    expect(
      object && inspectionPhotoBelongsToScope({ ...scope, object }),
    ).not.toBe(true);
  });
});
