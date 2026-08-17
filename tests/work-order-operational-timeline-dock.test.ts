import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dock = readFileSync(
  "features/operations/components/WorkOrderOperationalTimelineDock.tsx",
  "utf8",
);
const server = readFileSync(
  "features/operations/server/getOperationalObservability.ts",
  "utf8",
);

describe("work-order operational timeline", () => {
  it("refreshes when opened and explains canonical event metadata", () => {
    expect(dock).toContain("if (!open) void load()");
    expect(dock).toContain("getOperationalEventPresentation(event)");
    expect(dock).toContain("Latest ${relativeTime(events[0].occurred_at)}");
  });

  it("does not discard older events from an explicitly filtered timeline", () => {
    expect(server).toContain("if (!hasOperationalEventFilter(input))");
    expect(server).toContain('eventsQuery = eventsQuery.gte("occurred_at", since7d)');
  });
});
