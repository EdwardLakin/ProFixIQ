import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/inspections/save/route.ts", "utf8");

describe("inspection save error classification", () => {
  it("prefers the versioned canonical writer with a rolling-deploy fallback", () => {
    expect(route).toContain('"save_inspection_progress_v2_atomic"');
    expect(route).toContain("isMissingVersionedWriter(error)");
    expect(route).toContain('rpc("save_inspection_progress_atomic", rpcArgs)');
  });

  it("keeps writer schema drift retryable instead of calling it a revision conflict", () => {
    expect(route).toContain("SCHEMA_COMPATIBILITY_ERROR");
    expect(route).toContain('code: "INSPECTION_WRITER_UNAVAILABLE"');
    expect(route).toContain("retryable: true");
    expect(route).toContain("{ status: 503 }");
    expect(route).not.toContain('lower.includes("conflict")');
  });

  it("limits 409 responses to actual inspection lifecycle conflicts", () => {
    expect(route).toContain("isInspectionRevisionConflict(message)");
    expect(route).toContain(
      'lower.includes("inspection save conflicts with a newer server version")',
    );
    expect(route).toContain('code: "INSPECTION_REVISION_CONFLICT"');
  });
});
