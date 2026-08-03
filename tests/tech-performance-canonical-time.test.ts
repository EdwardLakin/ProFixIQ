import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  derivePerformanceMetrics,
  getShopPerformanceRange,
  mergedIntervalHours,
} from "../features/stats/lib/techPerformanceMetrics";
import type { TechLeaderboardRow } from "../features/shared/lib/stats/getTechLeaderboard";

describe("technician performance canonical time contract", () => {
  it("builds calendar boundaries in the shop timezone", () => {
    const range = getShopPerformanceRange(
      "weekly",
      "America/Los_Angeles",
      new Date("2026-07-27T00:30:00.000Z"),
    );

    expect(range).toEqual({
      start: "2026-07-20T07:00:00.000Z",
      endInclusive: "2026-07-27T06:59:59.999Z",
      endExclusive: "2026-07-27T07:00:00.000Z",
    });
  });

  it("falls back to UTC when the saved shop timezone is invalid", () => {
    const range = getShopPerformanceRange(
      "monthly",
      "not/a-timezone",
      new Date("2026-07-26T18:00:00.000Z"),
    );

    expect(range).toEqual({
      start: "2026-07-01T00:00:00.000Z",
      endInclusive: "2026-07-31T23:59:59.999Z",
      endExclusive: "2026-08-01T00:00:00.000Z",
    });
  });

  it("excludes unbounded legacy cards but lets canonical open shifts run to now", () => {
    const rangeStart = "2026-07-20T00:00:00.000Z";
    const rangeEnd = "2026-07-27T00:00:00.000Z";
    const now = new Date("2026-07-22T20:00:00.000Z");

    expect(
      mergedIntervalHours(
        [{ start: "2026-01-01T00:00:00.000Z", end: null }],
        rangeStart,
        rangeEnd,
        now,
      ),
    ).toBe(0);

    expect(
      mergedIntervalHours(
        [
          {
            start: "2026-07-22T16:00:00.000Z",
            end: null,
            useNowWhenOpen: true,
          },
        ],
        rangeStart,
        rangeEnd,
        now,
      ),
    ).toBe(4);
  });

  it("merges overlapping canonical shifts and legacy timecards without dropping history", () => {
    const hours = mergedIntervalHours(
      [
        {
          start: "2026-07-20T15:00:00.000Z",
          end: "2026-07-20T17:00:00.000Z",
        },
        {
          start: "2026-07-20T16:00:00.000Z",
          end: "2026-07-20T19:00:00.000Z",
          fallbackHours: 3,
        },
        {
          start: "2026-07-21T15:00:00.000Z",
          end: null,
          fallbackHours: 8,
        },
      ],
      "2026-07-20T00:00:00.000Z",
      "2026-07-22T00:00:00.000Z",
    );

    expect(hours).toBe(12);
  });

  it("clips intervals to the requested range and derives concrete percentages", () => {
    const attendanceHours = mergedIntervalHours(
      [
        {
          start: "2026-07-19T23:00:00.000Z",
          end: "2026-07-20T03:00:00.000Z",
        },
      ],
      "2026-07-20T00:00:00.000Z",
      "2026-07-21T00:00:00.000Z",
    );
    const row = derivePerformanceMetrics({
      techId: "tech-1",
      name: "Test Tech",
      role: "mechanic",
      jobs: 1,
      revenue: 600,
      laborCost: 100,
      profit: 0,
      billedHours: 3,
      clockedHours: 0,
      flaggedHours: 3,
      actualJobHours: 2,
      attendanceHours,
      revenuePerHour: 0,
      efficiencyPct: 0,
      productivityPct: 0,
      overallPerformancePct: 0,
    } satisfies TechLeaderboardRow);

    expect(row.attendanceHours).toBe(3);
    expect(row.clockedHours).toBe(3);
    expect(row.efficiencyPct).toBe(150);
    expect(row.productivityPct).toBeCloseTo(66.67, 2);
    expect(row.overallPerformancePct).toBe(100);
    expect(row.profit).toBe(500);
  });

  it("keeps the route shop-scoped and filters attendance rows to shifts", () => {
    const route = readFileSync(
      "features/stats/api/tech-leaderboard/route.ts",
      "utf8",
    );
    expect(route).toContain("requireShopScopedApiAccess");
    expect(route).toContain("requestedShopId !== access.profile.shop_id");
    expect(route).toContain('.eq("type", "shift")');
  });

  it("redacts financial metrics and omits fake peer comparisons on tech pages", () => {
    for (const path of [
      "app/tech/performance/page.tsx",
      "app/mobile/tech/performance/page.tsx",
    ]) {
      const page = readFileSync(path, "utf8");
      const payload = page.slice(
        page.indexOf("body: JSON.stringify"),
        page.indexOf("if (!res.ok", page.indexOf("body: JSON.stringify")),
      );
      expect(payload).toContain("peers: []");
      expect(payload).not.toContain("revenue:");
      expect(payload).not.toContain("laborCost:");
      expect(payload).not.toContain("profit:");
    }
  });
});
