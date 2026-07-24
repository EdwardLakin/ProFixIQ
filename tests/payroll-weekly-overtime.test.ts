import { describe, expect, it } from "vitest";
import { applyWeeklyOvertime } from "@/features/payroll-time/lib/overtime";

describe("weekly overtime classification", () => {
  it("does not double-count minutes already classified as daily overtime", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      user_id: "tech-1",
      work_date: `2026-07-${String(20 + index).padStart(2, "0")}`,
      regular_minutes: 480,
      overtime_minutes: index === 0 ? 120 : 0,
    }));

    const result = applyWeeklyOvertime(rows, 2400, 1);

    expect(result.reduce((sum, row) => sum + row.regular_minutes, 0)).toBe(2400);
    expect(result.reduce((sum, row) => sum + row.overtime_minutes, 0)).toBe(600);
    expect(result[5].regular_minutes).toBe(0);
    expect(result[5].overtime_minutes).toBe(480);
  });

  it("resets the running threshold at the configured shop week boundary", () => {
    const result = applyWeeklyOvertime(
      [
        { user_id: "tech-1", work_date: "2026-07-25", regular_minutes: 600, overtime_minutes: 0 },
        { user_id: "tech-1", work_date: "2026-07-26", regular_minutes: 600, overtime_minutes: 0 },
      ],
      600,
      0,
    );

    expect(result[0].overtime_minutes).toBe(0);
    expect(result[1].overtime_minutes).toBe(0);
  });
});
