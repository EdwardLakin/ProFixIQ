import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileHome = () => readFileSync("app/mobile/page.tsx", "utf8");
const operationalHome = () =>
  readFileSync("features/mobile/dashboard/MobileOperationalRoleHome.tsx", "utf8");

describe("remaining mobile role dashboards", () => {
  it("routes all supported operational roles away from the generic fallback", () => {
    const source = mobileHome();

    for (const role of ["parts", "dispatcher", "fleet_manager", "driver"]) {
      expect(source).toContain(`role === \"${role}\"`);
    }
    expect(source).toContain("<MobileOperationalRoleHome");
    expect(source).toContain("overflow-x-hidden");
  });

  it("provides dedicated parts, dispatch, fleet manager, and driver experiences", () => {
    const source = operationalHome();

    expect(source).toContain("Parts desk");
    expect(source).toContain("Review new requests");
    expect(source).toContain("Open dispatch board");
    expect(source).toContain("Fleet operations");
    expect(source).toContain("Start pre-trip inspection");
  });

  it("uses shared responsive dashboard primitives and limits attention/actions", () => {
    const source = operationalHome();

    expect(source).toContain("MobileDashboardPage");
    expect(source).toContain("MobileMetricGrid");
    expect(source).toContain("MobileAttentionList");
    expect(source).toContain("MobileActionGrid");
  });

  it("preserves technician statistics while removing the generic shop console", () => {
    const source = mobileHome();

    expect(source).toContain("setTechStats");
    expect(source).toContain("workedHours");
    expect(source).toContain("billedHours");
    expect(source).not.toContain("Shop Console");
  });
});
