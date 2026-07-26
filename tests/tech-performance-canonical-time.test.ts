import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("technician performance canonical time contract", () => {
  const leaderboardHelper = readFileSync(
    "features/shared/lib/stats/getTechLeaderboard.ts",
    "utf8",
  );
  const leaderboardRoute = readFileSync(
    "features/stats/api/tech-leaderboard/route.ts",
    "utf8",
  );
  const mobilePerformance = readFileSync(
    "app/mobile/tech/performance/page.tsx",
    "utf8",
  );
  const desktopPerformance = readFileSync("app/tech/performance/page.tsx", "utf8");
  const aiRoute = readFileSync(
    "app/api/ai/summarize-tech-performance/route.ts",
    "utf8",
  );

  it("routes all leaderboard consumers through the same API route", () => {
    expect(leaderboardHelper).toContain('fetch("/api/stats/tech-leaderboard"');
    expect(leaderboardHelper).not.toContain(".from(");
  });

  it("uses live shift punches for clocked hours and job labor segments for actual job hours", () => {
    expect(leaderboardRoute).toContain("requireShopScopedApiAccess");
    expect(leaderboardRoute).toContain('.from("tech_shifts")');
    expect(leaderboardRoute).toContain('.from("work_order_line_labor_segments")');
    expect(leaderboardRoute).toContain("row.clockedHours = row.attendanceHours");
    expect(leaderboardRoute).not.toContain('.from("payroll_time_entries")');
  });

  it("keeps the stats route tenant-scoped even though it uses admin reads", () => {
    expect(leaderboardRoute).toContain("requestedShopId !== access.profile.shop_id");
    expect(leaderboardRoute).toContain('return NextResponse.json({ error: "Forbidden" }, { status: 403 })');
  });

  it("sends the full current metric row to the AI summary route on mobile and desktop", () => {
    expect(mobilePerformance).toContain("tech: myRow");
    expect(mobilePerformance).toContain("peers: rows");
    expect(desktopPerformance).toContain("tech: myRow");
    expect(desktopPerformance).toContain("peers: rows");
  });

  it("does not crash AI summaries when legacy revenue fields are missing", () => {
    expect(aiRoute).toContain("function safeNumber");
    expect(aiRoute).toContain("tech.clockedHours ?? tech.attendanceHours");
    expect(aiRoute).toContain("tech.flaggedHours ?? tech.billedHours");
  });
});
