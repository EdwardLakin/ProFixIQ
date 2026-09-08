import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("AI accounting failure policy", () => {
  it("logs durable-ledger failure instead of throwing into technician workflow", () => {
    expect(telemetry).toContain("ai_telemetry_persistence_failed");
    expect(telemetry).toContain("console.error");
  });
});
