import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile role dashboard layout", () => {
  it("uses a shared overflow-safe dashboard shell", () => {
    const source = read("features/mobile/dashboard/MobileDashboardPrimitives.tsx");
    expect(source).toContain("overflow-x-hidden");
    expect(source).toContain("grid-cols-2");
    expect(source).toContain("items.slice(0, 3)");
    expect(source).toContain("items.slice(0, 4)");
  });

  it("keeps owner, admin, manager and foreman copy role-aware", () => {
    const source = read("features/mobile/dashboard/MobileManagerHome.tsx");
    for (const role of ["owner", "admin", "manager", "foreman"]) {
      expect(source).toContain(`${role}:`);
    }
    expect(source).toContain("/dashboard/workforce/attendance");
    expect(source).toContain("/work-orders/board");
  });

  it("gives advisor and lead hand dashboards one primary action and compact metrics", () => {
    const advisor = read("features/mobile/dashboard/MobileAdvisorHome.tsx");
    const lead = read("features/mobile/dashboard/MobileLeadHandHome.tsx");
    expect(advisor).toContain("+ Create work order");
    expect(lead).toContain("Open dispatch");
    expect(advisor).toContain("MobileMetricGrid");
    expect(lead).toContain("MobileMetricGrid");
  });
});
