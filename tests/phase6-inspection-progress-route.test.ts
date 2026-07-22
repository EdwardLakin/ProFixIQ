import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/inspections/save/route.ts", "utf8");
const client = readFileSync(
  "features/inspections/lib/inspection/save.ts",
  "utf8",
);
const replay = readFileSync(
  "features/shared/lib/offline/replay.ts",
  "utf8",
);

describe("Phase 6 inspection progress route", () => {
  it("requires and forwards one stable operation key", () => {
    expect(route).toContain('headers.get("Idempotency-Key")');
    expect(route).toContain("A stable Idempotency-Key is required.");
    expect(client).toContain('"Idempotency-Key": payload.operationKey');
    expect(client).toContain("clientMutationId: operationKey");
    expect(client).toContain("operationKey?: string");
    expect(client).toContain(
      'orderKey: `${workOrderLineId}:inspection-progress`',
    );
  });

  it("uses only the canonical atomic RPC for critical writes", () => {
    expect(route).toContain('rpc("save_inspection_progress_atomic"');
    expect(route).not.toContain('.from("inspection_sessions")');
    expect(route).not.toContain('.from("inspections")');
  });

  it("preserves the operation key in queued replay payloads", () => {
    expect(client).toContain("operationKey: string");
    expect(replay).toContain("!workOrderLineId || !operationKey || !payload.session");
    expect(replay).toContain("{ ...payload, idempotencyKey: operationKey }");
    expect(replay).toContain("operationKey,");
  });

  it("preserves HTTP status and server revision acknowledgements", () => {
    expect(client).toContain("error.status = res.status");
    expect(client).toContain(
      "syncRevision: serverResponse.current?.sync_revision",
    );
    expect(route).toContain("isInspectionRevisionConflict(message)");
    expect(route).toContain("? 409");
    expect(route).toContain("INSPECTION_WRITER_UNAVAILABLE");
    expect(route).toContain("{ status: 503 }");
  });
});
