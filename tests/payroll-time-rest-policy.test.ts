import { describe, expect, it } from "vitest";
import { parsePayrollRestEvents, type PayrollPolicySnapshot } from "../features/payroll-time/server/payrollTime";

const basePolicy: PayrollPolicySnapshot = {
  paid_breaks_per_day: 2,
  paid_break_duration_minutes: 15,
  breaks_are_paid: true,
  lunch_is_paid: false,
  default_lunch_duration_minutes: 30,
  lunch_required_after_minutes: 300,
  daily_overtime_after_minutes: 480,
  suspicious_shift_minutes: 960,
};

const shiftStart = "2026-07-01T08:00:00.000Z";
const shiftEnd = "2026-07-01T16:30:00.000Z";

describe("payroll rest event policy parser", () => {
  it("keeps two regular breaks paid and deducts lunch only", () => {
    const rest = parsePayrollRestEvents({
      shiftStart,
      shiftEnd,
      policy: basePolicy,
      events: [
        { id: "b1s", event_type: "break_start", timestamp: "2026-07-01T10:00:00.000Z" },
        { id: "b1e", event_type: "break_end", timestamp: "2026-07-01T10:15:00.000Z" },
        { id: "ls", event_type: "lunch_start", timestamp: "2026-07-01T12:00:00.000Z" },
        { id: "le", event_type: "lunch_end", timestamp: "2026-07-01T12:30:00.000Z" },
        { id: "b2s", event_type: "break_start", timestamp: "2026-07-01T15:00:00.000Z" },
        { id: "b2e", event_type: "break_end", timestamp: "2026-07-01T15:15:00.000Z" },
      ],
    });
    expect(rest.paidBreakMinutes).toBe(30);
    expect(rest.unpaidBreakMinutes).toBe(30);
    expect(510 - rest.unpaidBreakMinutes).toBe(480);
  });

  it("does not add fake break time when no break is punched", () => {
    const rest = parsePayrollRestEvents({ shiftStart, shiftEnd, policy: basePolicy, events: [] });
    expect(rest.paidBreakMinutes).toBe(0);
    expect(rest.unpaidBreakMinutes).toBe(0);
  });

  it("does not cross-match break starts with lunch ends", () => {
    const rest = parsePayrollRestEvents({
      shiftStart,
      shiftEnd,
      policy: basePolicy,
      events: [
        { id: "b1s", event_type: "break_start", timestamp: "2026-07-01T10:00:00.000Z" },
        { id: "le", event_type: "lunch_end", timestamp: "2026-07-01T10:30:00.000Z" },
      ],
    });
    expect(rest.lunchPairs).toHaveLength(0);
    expect(rest.breakPairs[0].end_event_id).toBe("auto_closed_shift_end");
    expect(rest.warnings.map((w) => w.code)).toContain("unclosed_lunch");
    expect(rest.warnings.map((w) => w.code)).toContain("unclosed_break");
  });

  it("supports paid lunch and unpaid regular break policy switches", () => {
    const policy = { ...basePolicy, breaks_are_paid: false, lunch_is_paid: true };
    const rest = parsePayrollRestEvents({
      shiftStart,
      shiftEnd,
      policy,
      events: [
        { event_type: "break_start", timestamp: "2026-07-01T10:00:00.000Z" },
        { event_type: "break_end", timestamp: "2026-07-01T10:15:00.000Z" },
        { event_type: "lunch_start", timestamp: "2026-07-01T12:00:00.000Z" },
        { event_type: "lunch_end", timestamp: "2026-07-01T12:30:00.000Z" },
      ],
    });
    expect(rest.paidBreakMinutes).toBe(30);
    expect(rest.unpaidBreakMinutes).toBe(15);
  });
});
