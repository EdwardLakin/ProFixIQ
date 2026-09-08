import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("durable AI pricing", () => {
  it("does not use the quota guard's blended token estimator", () => {
    expect(telemetry).not.toContain("estimateAICostUsd");
  });
});
