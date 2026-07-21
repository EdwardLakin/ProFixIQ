import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile inspection form imports", () => {
  it("uses the canonical durable import queue with tenant-scoped approval", () => {
    const migration = read(
      "supabase/migrations/20260721170000_mobile_inspection_form_imports.sql",
    );
    expect(migration).toContain("'inspection_form'");
    expect(migration).toContain("shop_id = public.current_shop_id()");
    expect(migration).toContain("for update");
    expect(migration).toContain("result_record_id");
    expect(migration).toContain("approve_inspection_form_import");
  });

  it("keeps upload processing out of the request and resumable by cron", () => {
    const uploadRoute = read("app/api/inspection-form-imports/route.ts");
    const worker = read(
      "features/inspections/server/inspection-form-import-job.ts",
    );
    const tick = read("app/api/internal/import-jobs/tick/route.ts");
    expect(uploadRoute).toContain("after(async () =>");
    expect(uploadRoute).toContain('import_type: "inspection_form"');
    expect(worker).toContain('.eq("status", "queued")');
    expect(worker).toContain('status: "processing"');
    expect(tick).toContain('"inspection_form"');
    expect(tick).toContain('update({ status: "queued", error_message: null })');
    expect(read("app/api/fleet/forms/upload/route.ts")).toContain(
      "createInspectionFormImport",
    );
  });

  it("provides camera-first mobile upload and lightweight review routes", () => {
    expect(existsSync("app/mobile/inspections/import/page.tsx")).toBe(true);
    expect(existsSync("app/mobile/inspections/import/[jobId]/page.tsx")).toBe(
      true,
    );
    const importer = read(
      "features/inspections/components/FleetFormImportCard.tsx",
    );
    const review = read(
      "features/inspections/components/InspectionFormImportReview.tsx",
    );
    expect(importer).toContain('capture="environment"');
    expect(importer).toContain("Pages in reading order");
    expect(review).toContain("Approve and save template");
    expect(review).toContain("Copy desktop link");
  });

  it("supports typed customer and fleet names from a server-scoped directory", () => {
    const importer = read(
      "features/inspections/components/FleetFormImportCard.tsx",
    );
    const uploadRoute = read("app/api/inspection-form-imports/route.ts");
    expect(importer).toContain("Search or type a customer name");
    expect(importer).toContain("Search or type a fleet name");
    expect(importer).toContain("customerName");
    expect(importer).toContain("fleetName");
    expect(uploadRoute).toContain('.from("customers")');
    expect(uploadRoute).toContain('.from("fleets")');
    expect(uploadRoute).toContain('.eq("shop_id", access.profile.shop_id)');
  });

  it("uploads mobile photos directly with signed storage targets", () => {
    const importer = read(
      "features/inspections/components/FleetFormImportCard.tsx",
    );
    const uploadRoute = read("app/api/inspection-form-imports/route.ts");
    expect(importer).toContain("uploadToSignedUrl");
    expect(importer).toContain('action: "prepare"');
    expect(importer).toContain('action: "finalize"');
    expect(uploadRoute).toContain("createSignedUploadUrl");
    expect(uploadRoute).toContain("request-size limit");
  });

  it("removes the browser-only sessionStorage handoff", () => {
    expect(read("app/inspections/fleet-review/page.tsx")).not.toContain(
      "sessionStorage",
    );
    expect(
      read("features/inspections/components/FleetFormImportCard.tsx"),
    ).not.toContain("sessionStorage");
  });
});
