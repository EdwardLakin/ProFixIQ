import { describe, expect, it } from "vitest";
import {
  attentionFeedback,
  buildOpsDashboardMetrics,
  opsFeedbackNeedsAttention,
  type OpsFeedbackSummary,
} from "@/features/ops/lib/dashboard";
import { legacyStatusForFeedback, type FeedbackStatus } from "@/features/feedback/lib/feedback";

function feedback(
  id: string,
  status: FeedbackStatus,
  options: { needsAttention?: boolean; updatedAt?: string } = {},
): OpsFeedbackSummary {
  const updatedAt = options.updatedAt ?? "2026-10-12T01:00:00.000Z";
  return {
    id,
    description: `Feedback ${id}`,
    intent: "bug_report",
    status: legacyStatusForFeedback(status),
    normalized_json: {
      feedback: {
        version: 1,
        clusterId: id,
        isCanonical: true,
        status,
        kind: "bug",
        surface: "shop",
        title: `Feedback ${id}`,
        summary: `Summary ${id}`,
        severity: options.needsAttention ? "high" : "normal",
        needsAttention: options.needsAttention === true,
        recommendation: "Review this feedback.",
        aiMode: "fallback",
        aiModel: null,
        duplicateConfidence: null,
        firstSeenAt: "2026-10-12T00:00:00.000Z",
        lastSeenAt: updatedAt,
      },
    },
    reporter_id: `user-${id}`,
    shop_id: `shop-${id}`,
    created_at: "2026-10-12T00:00:00.000Z",
    updated_at: updatedAt,
  };
}

describe("ops dashboard feedback triage", () => {
  it("summarizes feedback lifecycle states", () => {
    const items = [
      feedback("new", "new"),
      feedback("urgent", "new", { needsAttention: true }),
      feedback("working", "in_progress"),
      feedback("completed", "completed"),
      feedback("declined", "declined"),
    ];

    expect(buildOpsDashboardMetrics(items)).toEqual({
      totalSubmissions: 5,
      newSubmissions: 2,
      needsAttention: 1,
      inProgress: 1,
      completed: 1,
    });
    expect(opsFeedbackNeedsAttention(items[1])).toBe(true);
  });

  it("prioritizes attention flags before newer ordinary feedback", () => {
    const items = [
      feedback("newer-normal", "new", { updatedAt: "2026-10-12T03:00:00.000Z" }),
      feedback("urgent-old", "reviewing", {
        needsAttention: true,
        updatedAt: "2026-10-12T01:00:00.000Z",
      }),
      feedback("newest-urgent", "new", {
        needsAttention: true,
        updatedAt: "2026-10-12T04:00:00.000Z",
      }),
      feedback("completed", "completed", { needsAttention: true }),
    ];

    expect(attentionFeedback(items).map(({ id }) => id)).toEqual([
      "newest-urgent",
      "urgent-old",
      "newer-normal",
    ]);
  });

  it("limits the attention queue without mutating the input", () => {
    const items = [
      feedback("one", "new"),
      feedback("two", "new"),
      feedback("three", "reviewing"),
    ];
    const originalOrder = items.map(({ id }) => id);

    expect(attentionFeedback(items, 2)).toHaveLength(2);
    expect(items.map(({ id }) => id)).toEqual(originalOrder);
  });
});
