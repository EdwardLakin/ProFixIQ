import { describe, expect, it } from "vitest";
import {
  ACTION_APPROVAL_EVENT_TYPES,
  ACTION_EXECUTION_EVENT_TYPES,
  ACTION_PREVIEW_EVENT_TYPES,
  AI_ACTION_EVENT_TYPES,
  EVIDENCE_EVENT_TYPES,
  RECOMMENDATION_EVENT_TYPES,
  assertAiActionEventType,
  isAiActionEventType,
} from "@/features/ai/server/eventTypes";

describe("AI action event taxonomy", () => {
  it("accepts known event types", () => {
    expect(isAiActionEventType(AI_ACTION_EVENT_TYPES.RECOMMENDATION_CREATED)).toBe(true);
    expect(isAiActionEventType(AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_BLOCKED_EXECUTION)).toBe(true);
    expect(isAiActionEventType(AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_APPROVED)).toBe(true);
  });

  it("rejects unknown event types", () => {
    expect(isAiActionEventType("recommendation.closed")).toBe(false);
    expect(() => assertAiActionEventType("preview.ready")).toThrow("Invalid AI action event type");
  });

  it("keeps grouped arrays aligned", () => {
    expect(RECOMMENDATION_EVENT_TYPES).toContain(AI_ACTION_EVENT_TYPES.RECOMMENDATION_SUPERSEDED);
    expect(EVIDENCE_EVENT_TYPES).toEqual([AI_ACTION_EVENT_TYPES.EVIDENCE_SNAPSHOT_CREATED]);
    expect(ACTION_PREVIEW_EVENT_TYPES).toContain(AI_ACTION_EVENT_TYPES.ACTION_PREVIEW_READY);
    expect(ACTION_APPROVAL_EVENT_TYPES).toContain(AI_ACTION_EVENT_TYPES.ACTION_APPROVAL_REJECTED);
    expect(ACTION_EXECUTION_EVENT_TYPES).toContain(AI_ACTION_EVENT_TYPES.ACTION_EXECUTION_COMPENSATED);
  });
});
