import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("inspection photo preview and markup contract", () => {
  it("renders one gallery and replaces the exact item photo list", () => {
    const itemCard = source(
      "features/inspections/lib/inspection/InspectionItemCard.tsx",
    );
    const screen = source(
      "features/inspections/screens/GenericInspectionScreen.tsx",
    );

    expect(itemCard).toContain("<PhotoUploadButton");
    expect(itemCard).not.toContain("PhotoThumbnail");
    expect(itemCard).toContain("onUpdatePhotos(sectionIndex, itemIndex, urls)");
    expect(screen).toContain("onUpdatePhotos={(");
    expect(screen).toContain("photoUrls,");
  });

  it("provides a medium modal, navigation and the existing markup editor", () => {
    const gallery = source(
      "features/inspections/components/inspection/InspectionPhotoGallery.tsx",
    );

    expect(gallery).toContain('maxWidth: "48rem"');
    expect(gallery).toContain("Previous inspection photo");
    expect(gallery).toContain("Next inspection photo");
    expect(gallery).toContain("ImageMarkupEditor");
    expect(gallery).toContain("Show marked up");
    expect(gallery).toContain("scope=line&lineId=");
  });

  it("uses canonical evidence with content-bound upload idempotency", () => {
    const upload = source("app/api/inspections/photos/upload/route.ts");

    expect(upload).toContain('bucket = "job-photos"');
    expect(upload).toContain('request.headers.get("Idempotency-Key")');
    expect(upload).toContain('crypto.createHash("sha256").update(bytes)');
    expect(upload).toContain("authorizeWorkOrderEvidence");
    expect(upload).toContain("existingMedia.storage_path !== path");
  });

  it("reuses the deployed evidence schema without adding SQL", () => {
    const load = source("app/api/inspections/load/route.ts");
    const gallery = source(
      "features/inspections/components/inspection/InspectionPhotoGallery.tsx",
    );

    expect(load).toContain("reconcileInspectionPhotoEvidence");
    expect(gallery).toContain("/media?scope=line&lineId=");
    expect(gallery).toContain("ImageMarkupEditor");
  });
});
