import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("canonical AI accounting source", () => {
  it("persists through the single record_ai_usage_ledger RPC", () => {
    expect(telemetry).toContain('rpc("record_ai_usage_ledger"');
  });
});
