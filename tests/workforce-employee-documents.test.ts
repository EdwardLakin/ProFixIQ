import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260728213900_employee_document_intake_integrity.sql",
);
const uploadRoute = read(
  "app/api/admin/people/[id]/documents/route.ts",
);
const signedUrlRoute = read(
  "app/api/workforce/documents-readiness/[id]/signed-url/route.ts",
);
const personRoute = read("app/api/admin/people/[id]/route.ts");
const personClient = read(
  "features/dashboard/app/dashboard/admin/PersonDetailClient.tsx",
);

describe("workforce employee document intake", () => {
  it("provisions a private, size-limited employee document bucket", () => {
    expect(migration).toContain("'employee_docs'");
    expect(migration).toContain("false");
    expect(migration).toContain("10485760");
    expect(migration).toContain("'application/pdf'");
    expect(migration).toContain("'image/jpeg'");
  });

  it("validates and tenant-scopes document uploads", () => {
    expect(uploadRoute).toContain('requiredCapability: "canManageUsers"');
    expect(uploadRoute).toContain('.eq("shop_id", shopId)');
    expect(uploadRoute).toContain("MAX_DOCUMENT_BYTES");
    expect(uploadRoute).toContain("isValidScheduleDateKey");
    expect(uploadRoute).toContain("EXTENSION_BY_CONTENT_TYPE");
    expect(uploadRoute).toContain("randomUUID()");
  });

  it("cleans up storage if metadata creation fails", () => {
    expect(uploadRoute).toContain(
      ".remove([storagePath])",
    );
    expect(uploadRoute).toContain('"people.document.uploaded"');
  });

  it("restricts signed retrieval to the private shop path and records access", () => {
    expect(signedUrlRoute).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(signedUrlRoute).toContain('bucket !== "employee_docs"');
    expect(signedUrlRoute).toContain(
      'doc.file_path.startsWith(`${access.profile.shop_id}/`)',
    );
    expect(signedUrlRoute).toContain('"people.document.viewed"');
  });

  it("replaces the person-workspace placeholder with real records and upload controls", () => {
    expect(personRoute).toContain('.from("employee_documents")');
    expect(personRoute).toContain("documents: documents ?? []");
    expect(personClient).toContain("Upload document");
    expect(personClient).toContain("Open secure document");
    expect(personClient).not.toContain(
      "Documents are intentionally deferred",
    );
  });
});
