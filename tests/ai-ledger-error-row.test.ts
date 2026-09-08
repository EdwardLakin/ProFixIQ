import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const structured = readFileSync(
  "features/shared/lib/server/openai-structured.ts",
  "utf8",
);

describe("AI provider failure accounting", () => {
  it("records a durable error event without fabricating successful cost", () => {
    expect(structured).toContain('status: "error"');
    expect(structured).toContain('error_code: /timed out/i.test(message)');
  });
});
