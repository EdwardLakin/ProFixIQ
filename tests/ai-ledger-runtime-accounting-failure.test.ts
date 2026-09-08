import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("non-blocking AI accounting", () => {
  it("contains its RPC failure and returns without throwing", () => {
    expect(telemetry).toContain("try {");
    expect(telemetry).toContain("catch");
    expect(telemetry).toContain("ai_telemetry_persistence_failed");
  });
});
