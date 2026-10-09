import { describe, expect, it } from "vitest";

import { openAIReasoningEffortParam } from "./openai-models";

describe("openAIReasoningEffortParam", () => {
  it("asks GPT-5 reasoning models for the requested effort", () => {
    expect(openAIReasoningEffortParam("gpt-5.4-mini")).toEqual({
      reasoning_effort: "low",
    });
    expect(openAIReasoningEffortParam("GPT-5.5", "medium")).toEqual({
      reasoning_effort: "medium",
    });
    expect(openAIReasoningEffortParam("o3-mini")).toEqual({
      reasoning_effort: "low",
    });
    expect(openAIReasoningEffortParam("o4-mini")).toEqual({
      reasoning_effort: "low",
    });
  });

  it("sends nothing to models that do not take the parameter", () => {
    expect(openAIReasoningEffortParam("gpt-4o-mini")).toEqual({});
    expect(openAIReasoningEffortParam("o1-mini")).toEqual({});
    expect(openAIReasoningEffortParam("gpt-5-chat-latest")).toEqual({});
    expect(openAIReasoningEffortParam("")).toEqual({});
  });
});
