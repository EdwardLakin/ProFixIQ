import { describe, expect, it } from "vitest";
import {
  hasPendingFleetIntake,
  indicatorsFromNotifications,
} from "@/features/shared/hooks/useNavigationQueueIndicators";

describe("navigation queue indicators", () => {
  it("only reports active actionable codes", () => {
    expect(indicatorsFromNotifications([
      { code: "quote_waiting", status: "active" },
      { code: "invoice_unsent_too_long", status: "acknowledged" },
      { code: "parts_waiting_too_long", status: "active" },
    ])).toMatchObject({
      quoteReview: true, parts: true, billing: false, workOrders: false,
    });
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
