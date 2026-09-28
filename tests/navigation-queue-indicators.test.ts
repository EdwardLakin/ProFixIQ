import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hasPendingFleetIntake,
  indicatorsFromNotifications,
} from "@/features/shared/hooks/useNavigationQueueIndicators";

describe("navigation queue indicators", () => {
  it("only reports active actionable codes", () => {
    expect(indicatorsFromNotifications([
      { code: "approval_waiting", status: "active" },
      { code: "invoice_unsent_too_long", status: "acknowledged" },
      { code: "parts_waiting_too_long", status: "active" },
    ])).toMatchObject({
      quoteReview: true, parts: true, billing: false, workOrders: false,
    });
  });

  it("maps the actual producer's quote approval code, not an unused code", () => {
    const producer = readFileSync("features/agent/server/getOpsNotifications.ts", "utf8");
    expect(producer).toContain('code: "approval_waiting"');
    expect(indicatorsFromNotifications([{ code: "approval_waiting", status: "active" }]).quoteReview).toBe(true);
    expect(indicatorsFromNotifications([{ code: "quote_waiting", status: "active" }]).quoteReview).toBe(false);
  });

  it("does not poll an invisible or unauthorized notifications destination", () => {
    const sidebar = readFileSync("features/shared/components/RoleSidebar.tsx", "utf8");
    const hook = readFileSync("features/shared/hooks/useNavigationQueueIndicators.ts", "utf8");
    expect(sidebar).toContain("hasNotificationTile && canAccessAssistantNotifications(role)");
    expect(hook).toContain("includeNotifications");
    expect(hook).toContain('includeNotifications\n        ? fetch("/api/planner/notifications"');
    expect(hook).toContain("setSnapshot({ scope: feedKey, indicators: {} })");
    expect(hook).toContain("snapshot.scope === feedKey");
    expect(hook).toContain("generation !== version.current");
  });

  it("uses the same pending/terminal rule as Fleet intake", () => {
    expect(hasPendingFleetIntake([
      { status: "completed", workOrder: null },
      { status: "open", workOrder: { id: "wo-1" } },
    ])).toBe(false);
    expect(hasPendingFleetIntake([
      { status: "open", workOrder: null },
    ])).toBe(true);
  });
});
