import { describe, expect, it } from "vitest";
import {
  addScheduleDateKeyDays,
  isValidScheduleDateKey,
  normalizeScheduleClockTime,
  normalizeUnpaidBreakMinutes,
  scheduleClockMinutes,
  scheduleDateKeyDistance,
} from "@/features/workforce/lib/scheduleValidation";

describe("workforce schedule validation", () => {
  it("accepts real calendar dates, including leap day", () => {
    expect(isValidScheduleDateKey("2028-02-29")).toBe(true);
    expect(isValidScheduleDateKey("2027-02-29")).toBe(false);
    expect(isValidScheduleDateKey("2026-13-01")).toBe(false);
    expect(isValidScheduleDateKey("2026-7-28")).toBe(false);
  });

  it("adds whole shop-calendar days without local timezone drift", () => {
    expect(addScheduleDateKeyDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addScheduleDateKeyDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(() => addScheduleDateKeyDays("not-a-date", 1)).toThrow();
    expect(() => addScheduleDateKeyDays("2026-07-28", 0.5)).toThrow();
  });

  it("measures calendar-day distance in either direction", () => {
    expect(scheduleDateKeyDistance("2026-07-28", "2026-08-02")).toBe(5);
    expect(scheduleDateKeyDistance("2026-08-02", "2026-07-28")).toBe(-5);
    expect(scheduleDateKeyDistance("2026-02-30", "2026-03-01")).toBeNull();
  });

  it("normalizes valid schedule clocks and rejects malformed values", () => {
    expect(normalizeScheduleClockTime(" 08:15 ")).toBe("08:15:00");
    expect(normalizeScheduleClockTime("23:59:30")).toBe("23:59:30");
    expect(normalizeScheduleClockTime("")).toBeNull();
    expect(normalizeScheduleClockTime(null)).toBeNull();
    expect(normalizeScheduleClockTime("24:00")).toBeUndefined();
    expect(normalizeScheduleClockTime(815)).toBeUndefined();
    expect(scheduleClockMinutes("08:15:00")).toBe(495);
    expect(scheduleClockMinutes("invalid")).toBeNaN();
  });

  it("accepts only whole, non-negative break minutes within one day", () => {
    expect(normalizeUnpaidBreakMinutes(undefined)).toBe(0);
    expect(normalizeUnpaidBreakMinutes("30")).toBe(30);
    expect(normalizeUnpaidBreakMinutes(1440)).toBe(1440);
    expect(normalizeUnpaidBreakMinutes(-1)).toBeUndefined();
    expect(normalizeUnpaidBreakMinutes(30.5)).toBeUndefined();
    expect(normalizeUnpaidBreakMinutes(1441)).toBeUndefined();
  });
});
