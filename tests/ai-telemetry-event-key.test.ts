import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const telemetry = readFileSync(
  "features/shared/lib/server/ai-telemetry.ts",
  "utf8",
);

describe("AI telemetry event identity", () => {
  it("prefers explicit event keys and provider request ids for durable dedupe", () => {
    expect(telemetry).toContain("event_key");
    expect(telemetry).toContain("provider_request_id");
  });
});
