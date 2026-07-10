import { describe, expect, it } from "vitest";
import {
  WORK_ORDER_LINE_ALLOWED_TRANSITIONS,
  canTransitionWorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";

const beforeOnHoldTargets = ["on_hold", "in_progress", "waiting_parts", "completed", "awaiting_approval"] as const;

describe("canonical work-order line status transitions", () => {
  it("documents the previous on-hold transition map", () => {
    expect(beforeOnHoldTargets).not.toContain("awaiting");
  });

  it("allows the canonical release-hold transition from on_hold to awaiting", () => {
    expect(WORK_ORDER_LINE_ALLOWED_TRANSITIONS.on_hold).toContain("awaiting");
    expect(canTransitionWorkOrderLineStatus("on_hold", "awaiting")).toBe(true);
  });

  it("allows an active line to be placed on hold", () => {
    expect(canTransitionWorkOrderLineStatus("in_progress", "on_hold")).toBe(true);
    expect(canTransitionWorkOrderLineStatus("active", "on_hold")).toBe(true);
  });

  it("keeps closed-line regression transitions blocked", () => {
    expect(canTransitionWorkOrderLineStatus("completed", "in_progress")).toBe(false);
    expect(canTransitionWorkOrderLineStatus("ready_to_invoice", "in_progress")).toBe(false);
    expect(canTransitionWorkOrderLineStatus("invoiced", "in_progress")).toBe(false);
  });
});
