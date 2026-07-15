import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/inspections/save/route.ts", "utf8");
const client = readFileSync(
  "features/inspections/lib/inspection/save.ts",
  "utf8",
);

describe("Phase 6 inspection progress route", () => {
  it("requires and forwards one stable operation key", () => {
    expect(route).toContain('headers.get("Idempotency-Key")');
    expect(route).toContain("A stable Idempotency-Key is required.");
    expect(client).toContain('"Idempotency-Key": payload.operationKey');
    expect(client).toContain("clientMutationId: operationKey");
  });

  it("uses only the canonical atomic RPC for critical writes", () => {
    expect(route).toContain('rpc("save_inspection_progress_atomic"');
    expect(route).not.toContain('.from("inspection_sessions")');
    expect(route).not.toContain('.from("inspections")');
  });

  it("preserves the operation key in queued replay payloads", () => {
    expect(client).toContain("operationKey: string");
    expect(client).toContain("!payload.operationKey");
    expect(client).toContain("await postInspectionSave(payload as InspectionSavePayload)");
  });

  it("preserves HTTP status for permanent-error classification", () => {
    expect(client).toContain("error.status = res.status");
  });
});
