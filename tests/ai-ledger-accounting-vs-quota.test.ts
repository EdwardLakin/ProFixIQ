import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);
const guard = readFileSync(
  "features/shared/lib/server/ai-ops-guard.ts",
  "utf8",
);

describe("AI accounting vs quota enforcement", () => {
  it("keeps durable cost accounting in telemetry rather than quota guard", () => {
    expect(telemetry).toContain("record_ai_usage_ledger");
    expect(guard).toContain("estimateAICostUsd");
  });
});
