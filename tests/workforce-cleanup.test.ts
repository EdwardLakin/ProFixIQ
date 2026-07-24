import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TILES } from "@/features/shared/config/tiles";
import { composeWorkforceActivity } from "@/features/workforce/server/buildWorkforceActivity";
import { getWorkforceNavigation } from "@/features/dashboard/app/dashboard/workforce/workforceNavigation";

const shopId = "shop-a";
const nowIso = "2026-07-10T18:00:00.000Z";
const from = "2026-07-10T06:00:00.000Z";
const to = "2026-07-11T06:00:00.000Z";

function activity(overrides: Partial<Parameters<typeof composeWorkforceActivity>[0]> = {}) {
  return composeWorkforceActivity({
    shopId,
    nowIso,
    from,
    to,
    profiles: [
      { id: "tech-a", full_name: "Shop A Tech", email: "a@example.com", role: "technician" },
      { id: "tech-b", full_name: "Shop B Tech", email: "b@example.com", role: "technician" },
    ],
    shifts: [],
    punches: [],
    segments: [],
    lines: [],
    workOrders: [],
    customers: [],
    vehicles: [],
    ...overrides,
  } as any);
}

describe("workforce cleanup consolidation", () => {
  it("keeps duplicate legacy admin workforce tiles out of active tile navigation", () => {
    expect(TILES.map((tile) => tile.href)).not.toEqual(
      expect.arrayContaining([
        "/dashboard/admin/people",
        "/dashboard/admin/employees",
        "/dashboard/admin/payroll-time",
        "/dashboard/admin",
        "/dashboard/owner/create-user",
      ]),
    );
  });

  it("legacy workforce admin routes are server redirects", () => {
    expect(readFileSync("app/dashboard/admin/people/page.tsx", "utf8")).toContain('redirect("/dashboard/workforce/people")');
    expect(readFileSync("app/dashboard/admin/payroll-time/page.tsx", "utf8")).toContain('redirect("/dashboard/workforce/payroll-review")');
    expect(readFileSync("app/dashboard/admin/employees/page.tsx", "utf8")).toContain('redirect("/dashboard/workforce/people")');
    expect(readFileSync("app/dashboard/admin/page.tsx", "utf8")).toContain('redirect("/dashboard/workforce/overview")');
    expect(readFileSync("app/dashboard/admin/audit/page.tsx", "utf8")).toContain('redirect("/dashboard/workforce/activity")');
    expect(readFileSync("app/dashboard/admin/scheduling/page.tsx", "utf8")).toContain('redirect("/dashboard/workforce/scheduling")');
    expect(readFileSync("app/dashboard/admin/employee-docs/page.tsx", "utf8")).toContain('redirect("/dashboard/workforce/documents")');
  });

  it("uses one role-aware Workforce shell navigation source", () => {
    expect(getWorkforceNavigation("owner").map((item) => item.label)).toEqual([
      "Command",
      "People",
      "Attendance",
      "Schedule",
      "Payroll",
      "Documents",
      "Certifications",
      "Activity",
    ]);
    expect(getWorkforceNavigation("manager").map((item) => item.label)).toEqual([
      "Command",
      "Attendance",
      "Schedule",
      "Payroll",
    ]);
  });

  it("scopes punch events through same-shop shifts and ignores cross-shop shift punches", () => {
    const result = activity({
      shifts: [
        { id: "shift-a", shop_id: shopId, user_id: "tech-a", start_time: "2026-07-10T17:00:00.000Z", end_time: null, status: "active", type: "shift", created_at: null },
        { id: "shift-b", shop_id: "shop-b", user_id: "tech-b", start_time: "2026-07-10T17:00:00.000Z", end_time: null, status: "active", type: "shift", created_at: null },
      ],
      punches: [
        { id: "p-a", shift_id: "shift-a", user_id: "tech-a", profile_id: null, event_type: "start_shift", timestamp: "2026-07-10T17:00:00.000Z", note: null, created_at: null },
        { id: "p-b", shift_id: "shift-b", user_id: "tech-b", profile_id: null, event_type: "break_start", timestamp: "2026-07-10T17:05:00.000Z", note: null, created_at: null },
      ],
    });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].userId).toBe("tech-a");
    expect(result.activities[0].operationalState).toBe("clocked_in_idle");
  });

  it("uses half-open shop-day windows for shifts, punches, and logs", () => {
    const source = readFileSync("features/workforce/server/buildWorkforceActivity.ts", "utf8");
    expect(source).toContain('.lt("start_time", to)');
    expect(source).toContain('.lt("timestamp", to)');
    expect(source).not.toContain('.lte("timestamp", to)');
  });

  it("uses no-active-job attendance copy and exposes an Add person action", () => {
    expect(readFileSync("features/workforce/server/buildWorkforceActivity.ts", "utf8")).toContain("Clocked in — no active job");
    expect(readFileSync("features/dashboard/app/dashboard/admin/PeoplePageClient.tsx", "utf8")).toContain("Add person");
  });

  it("overview metrics display unavailable/malformed values as warnings instead of zero", () => {
    const source = readFileSync("features/dashboard/app/dashboard/workforce/WorkforceOverviewClient.tsx", "utf8");
    expect(source).toContain('return typeof value === "number" && Number.isFinite(value) ? value : null');
    expect(source).toContain('return typeof value === "number" && Number.isFinite(value) ? String(value) : "—"');
    expect(source).toContain("Some workforce overview metrics were unavailable or malformed.");
  });
});
