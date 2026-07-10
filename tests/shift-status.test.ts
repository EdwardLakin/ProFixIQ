import { describe, expect, it } from "vitest";
import {
  PUNCH_EVENT_TYPES,
  SHIFT_ACTIVITIES,
  SHIFT_STATUSES,
  deriveCurrentShiftActivity,
  isActiveShiftStatus,
  isBreakEvent,
  isCompletedShiftStatus,
  isLunchEvent,
  latestValidPunchEvent,
} from "@/features/workforce/lib/shift-status";

describe("canonical shift lifecycle helpers", () => {
  it("exposes canonical active/completed shift statuses", () => {
    expect(SHIFT_STATUSES.active).toBe("active");
    expect(SHIFT_STATUSES.completed).toBe("completed");
    expect(isActiveShiftStatus("active")).toBe(true);
    expect(isCompletedShiftStatus("completed")).toBe(true);
    expect(isActiveShiftStatus("break")).toBe(false);
  });

  it("classifies break and lunch events without treating them as shift statuses", () => {
    expect(isBreakEvent(PUNCH_EVENT_TYPES.breakStart)).toBe(true);
    expect(isBreakEvent(PUNCH_EVENT_TYPES.breakEnd)).toBe(true);
    expect(isLunchEvent(PUNCH_EVENT_TYPES.lunchStart)).toBe(true);
    expect(isLunchEvent(PUNCH_EVENT_TYPES.lunchEnd)).toBe(true);
    expect(isBreakEvent("active")).toBe(false);
    expect(isLunchEvent("completed")).toBe(false);
  });

  it("derives working from start_shift and returned break/lunch intervals", () => {
    expect(deriveCurrentShiftActivity([{ event_type: "start_shift", timestamp: "2026-07-10T10:00:00.000Z" }])).toBe(SHIFT_ACTIVITIES.working);
    expect(deriveCurrentShiftActivity([
      { event_type: "start_shift", timestamp: "2026-07-10T10:00:00.000Z" },
      { event_type: "break_start", timestamp: "2026-07-10T12:00:00.000Z" },
      { event_type: "break_end", timestamp: "2026-07-10T12:15:00.000Z" },
    ])).toBe(SHIFT_ACTIVITIES.working);
    expect(deriveCurrentShiftActivity([
      { event_type: "start_shift", timestamp: "2026-07-10T10:00:00.000Z" },
      { event_type: "lunch_start", timestamp: "2026-07-10T13:00:00.000Z" },
      { event_type: "lunch_end", timestamp: "2026-07-10T13:30:00.000Z" },
    ])).toBe(SHIFT_ACTIVITIES.working);
  });

  it("derives on_break and on_lunch from the latest valid event", () => {
    expect(deriveCurrentShiftActivity([
      { event_type: "start_shift", timestamp: "2026-07-10T10:00:00.000Z" },
      { event_type: "break_start", timestamp: "2026-07-10T12:00:00.000Z" },
    ])).toBe(SHIFT_ACTIVITIES.onBreak);
    expect(deriveCurrentShiftActivity([
      { event_type: "start_shift", timestamp: "2026-07-10T10:00:00.000Z" },
      { event_type: "lunch_start", timestamp: "2026-07-10T13:00:00.000Z" },
    ])).toBe(SHIFT_ACTIVITIES.onLunch);
  });

  it("falls back safely for off-shift and ignores malformed latest events", () => {
    expect(deriveCurrentShiftActivity([], false)).toBe(SHIFT_ACTIVITIES.offShift);
    const latest = latestValidPunchEvent([
      { event_type: "start_shift", timestamp: "2026-07-10T10:00:00.000Z" },
      { event_type: "not_real", timestamp: "2026-07-10T19:00:00.000Z" },
    ]);
    expect(latest.eventType).toBe(PUNCH_EVENT_TYPES.startShift);
    expect(deriveCurrentShiftActivity([{ event_type: "end_shift", timestamp: "2026-07-10T18:00:00.000Z" }])).toBe(SHIFT_ACTIVITIES.offShift);
  });

  it("orders same-time events deterministically with end_shift winning ties", () => {
    const sameTime = "2026-07-10T18:00:00.000Z";
    const latest = latestValidPunchEvent([
      { id: "z", event_type: "break_start", timestamp: sameTime, created_at: sameTime },
      { id: "a", event_type: "end_shift", timestamp: sameTime, created_at: sameTime },
      { id: "y", event_type: "lunch_end", timestamp: sameTime, created_at: sameTime },
    ]);

    expect(latest.eventType).toBe(PUNCH_EVENT_TYPES.endShift);
    expect(deriveCurrentShiftActivity([
      { id: "z", event_type: "break_start", timestamp: sameTime, created_at: sameTime },
      { id: "a", event_type: "end_shift", timestamp: sameTime, created_at: sameTime },
    ])).toBe(SHIFT_ACTIVITIES.offShift);
  });

});
