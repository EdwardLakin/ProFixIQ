import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile role dashboard layout", () => {
  it("uses a shared overflow-safe dashboard shell and mobile href normalizer", () => {
    const source = read(
      "features/mobile/dashboard/MobileDashboardPrimitives.tsx",
    );
    expect(source).toContain("overflow-x-hidden");
    expect(source).toContain("grid-cols-2");
    expect(source).toContain("items.slice(0, 3)");
    expect(source).toContain("items.slice(0, 4)");
    expect(source).toContain("requireMobileHref");
  });

  it("keeps owner, admin, manager and foreman copy role-aware and mobile-native", () => {
    const source = read("features/mobile/dashboard/MobileManagerHome.tsx");
    for (const role of ["owner", "admin", "manager", "foreman"]) {
      expect(source).toContain(`${role}:`);
    }
    expect(source).toContain("/mobile/workforce/attendance");
    expect(source).toContain("/mobile/dispatch");
    expect(source).not.toContain("/dashboard/workforce/attendance");
    expect(source).not.toContain("/work-orders/board");
  });

  it("gives advisor, service and lead hand roles compact mobile dashboards", () => {
    const home = read("app/mobile/page.tsx");
    const tiles = read("features/mobile/config/mobile-tiles.ts");
    const advisor = read("features/mobile/dashboard/MobileAdvisorHome.tsx");
    const lead = read("features/mobile/dashboard/MobileLeadHandHome.tsx");

    expect(home).toContain('role === "advisor" || role === "service"');
    expect(tiles).toContain('| "service"');
    expect(advisor).toContain("+ Create work order");
    expect(lead).toContain("Open dispatch");
    expect(advisor).toContain("MobileMetricGrid");
    expect(lead).toContain("MobileMetricGrid");
    expect(lead).toContain("/mobile/dispatch");
    expect(lead).toContain("/mobile/workforce/attendance");
  });

  it("keeps operational role dashboard destinations mobile-native", () => {
    const source = read(
      "features/mobile/dashboard/MobileOperationalRoleHome.tsx",
    );
    for (const href of [
      "/mobile/parts",
      "/mobile/dispatch",
      "/mobile/fleet",
      "/mobile/fleet/pretrip",
      "/mobile/fleet/service-requests",
      "/mobile/messages",
    ]) {
      expect(source).toContain(href);
    }
  });
});
