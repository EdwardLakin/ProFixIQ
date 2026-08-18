import { describe, expect, it } from "vitest";

import { selectDeterministicShopAssistantPlan } from "@/features/shop-assistant/server/orchestrator/planner";

const clock = {
  now: "2026-08-17T18:00:00.000Z",
  timezone: "America/Edmonton",
  todayStart: "2026-08-17T06:00:00.000Z",
  todayEnd: "2026-08-18T06:00:00.000Z",
};

const availableToolNames = new Set([
  "list_pending_approvals",
  "list_parts_blockers",
  "read_daily_activity",
  "recommend_work_assignments",
  "list_technician_assignments",
  "list_technician_load",
  "find_customers",
]);

function plan(question: string) {
  return selectDeterministicShopAssistantPlan({
    question,
    pageContext: { pageType: "assistant", pageTitle: "Shop Assistant" },
    threadContext: {},
    clock,
    availableToolNames,
  });
}

describe("shop assistant prefilled prompts", () => {
  it.each([
    [
      "Which work orders are waiting on approvals right now?",
      "list_pending_approvals",
    ],
    ["Summarize the jobs delayed by parts.", "list_parts_blockers"],
    [
      "What changed today across bookings, invoices, and technician activity?",
      "read_daily_activity",
    ],
    [
      "Which queued jobs should be assigned next?",
      "recommend_work_assignments",
    ],
  ])("routes %s to %s", (question, expectedTool) => {
    const result = plan(question);
    expect(result.kind).toBe("tools");
    if (result.kind !== "tools") return;
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]?.name).toBe(expectedTool);
    expect(result.calls[0]?.mode).toBe("read");
  });

  it("uses the exact shop-local day window for the activity prompt", () => {
    const result = plan(
      "What changed today across bookings, invoices, and technician activity?",
    );
    expect(result.kind).toBe("tools");
    if (result.kind !== "tools") return;
    expect(result.calls[0]?.input).toMatchObject({
      startsAt: clock.todayStart,
      endsAt: clock.todayEnd,
    });
  });

  it("routes named technician assignment questions independently of shift load", () => {
    const result = plan("What is Test Mechanic assigned to?");
    expect(result.kind).toBe("tools");
    if (result.kind !== "tools") return;
    expect(result.calls).toEqual([
      {
        name: "list_technician_assignments",
        input: { query: "Test Mechanic", limit: 20 },
        mode: "read",
      },
    ]);
  });

  it("keeps customer lookup deterministic when the model is unavailable", () => {
    const result = plan("Find customer Jane Doe");
    expect(result.kind).toBe("tools");
    if (result.kind !== "tools") return;
    expect(result.calls).toEqual([
      {
        name: "find_customers",
        input: { query: "Jane Doe", limit: 10 },
        mode: "read",
      },
    ]);
  });
});
