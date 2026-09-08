import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("AI telemetry API", () => {
  it("keeps recordAITelemetry as the durable accounting entry point", () => {
    expect(telemetry).toContain("export async function recordAITelemetry");
  });
});
