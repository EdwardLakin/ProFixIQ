import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("quote suggestion OpenAI compatibility", () => {
  it("uses Responses max_output_tokens instead of Chat Completions max_tokens", () => {
    const source = readFileSync("features/integrations/ai/index.ts", "utf8");
    expect(source).toContain("responses.create");
    expect(source).toContain("max_output_tokens");
    expect(source).not.toContain("chat.completions.create");
    expect(source).not.toContain("max_tokens");
  });

  it("logs training events with canonical insert_ai_event RPC argument names", () => {
    const source = readFileSync("features/integrations/ai/index.ts", "utf8");
    expect(source).toContain("p_event_type");
    expect(source).toContain("p_payload");
    expect(source).toContain("p_shop_id");
    expect(source).toContain("p_training_source");
    expect(source).not.toContain("trainingSource: source,\n    p_shop_id");
  });
});
