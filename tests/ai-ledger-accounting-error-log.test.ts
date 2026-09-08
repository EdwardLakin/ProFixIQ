import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("AI accounting persistence observability", () => {
  it("emits a distinct high-signal log marker on durable write failure", () => {
    expect(telemetry).toContain("ai_telemetry_persistence_failed");
  });
});
