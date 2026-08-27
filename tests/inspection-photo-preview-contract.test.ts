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

  it("mounts the editor at the viewport root with a scroll-safe image workspace", () => {
    const editor = source(
      "features/work-orders/components/evidence/ImageMarkupEditor.tsx",
    );

    expect(editor).toContain("createPortal(");
    expect(editor).toContain("document.body");
    expect(editor).toContain("h-[100dvh]");
    expect(editor).toContain("max-w-[96rem]");
    expect(editor).toContain("overscroll-contain");
    expect(editor).toContain("max-h-[calc(100dvh-13rem)]");
    expect(editor).not.toContain("max-w-6xl");
  });

  it("uses canonical evidence with content-bound upload idempotency", () => {
    const upload = source("app/api/inspections/photos/upload/route.ts");

    expect(upload).toContain('? "job-photos" : "inspection_photos"');
    expect(upload).toContain('request.headers.get("Idempotency-Key")');
    expect(upload).toContain('crypto.createHash("sha256").update(bytes)');
    expect(upload).toContain("authorizeInspectionMutation");
    expect(upload.indexOf("file.arrayBuffer()")).toBeLessThan(
      upload.indexOf("authorizeInspectionMutation({"),
    );
    expect(upload).toContain("committedPhotoReplay:");
    expect(upload).toContain('authorization.replay.kind === "photo"');
    expect(upload.indexOf("authorizeInspectionMutation({")).toBeLessThan(
      upload.indexOf(".upload(path, bytes"),
    );
    expect(upload).toContain("existingMedia.storage_path !== path");
    expect(upload).toMatch(
      /bucket === "job-photos" \? supabase\.storage : admin\.storage/,
    );
    expect(upload).toContain(
      '"save_work_order_inspection_photo_evidence_atomic"',
    );
    expect(upload).toContain('p_storage_bucket: "job-photos"');
    expect(upload).toContain(
      "row: { ...atomicResult.photo, image_url: signed.signedUrl }",
    );
    expect(upload).toContain('savedError.code === "42501"');
    expect(upload).toContain("saved = await ensureInspectionPhotoRow({");
  });

  it("reuses the deployed evidence schema without adding SQL", () => {
    const load = source("app/api/inspections/load/route.ts");
    const reconciliation = source(
      "features/inspections/server/reconcileInspectionPhotoEvidence.ts",
    );
    const gallery = source(
      "features/inspections/components/inspection/InspectionPhotoGallery.tsx",
    );

    expect(load).toContain("reconcileInspectionPhotoEvidence");
    expect(load).toContain("sessionClient: supabase");
    expect(load).not.toContain("authorizeWorkOrderEvidence");
    expect(reconciliation).toContain("authorizeInspectionMutation");
    expect(
      reconciliation.indexOf("authorizeInspectionMutation({"),
    ).toBeLessThan(reconciliation.indexOf("createAdminSupabase()"));
    expect(reconciliation).toContain("if (!authorization.ok)");
    expect(gallery).toContain("/media?scope=line&lineId=");
    expect(gallery).toContain("ImageMarkupEditor");
  });
});
