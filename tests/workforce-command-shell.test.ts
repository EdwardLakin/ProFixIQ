import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TILES } from "@/features/shared/config/tiles";
import {
  getWorkforceNavigation,
  isWorkforceNavigationItemActive,
  WORKFORCE_NAVIGATION,
} from "@/features/dashboard/app/dashboard/workforce/workforceNavigation";

describe("workforce command shell", () => {
  it("exposes Workforce only once in global navigation", () => {
    const workforceTiles = TILES.filter((tile) => tile.section === "Workforce");
    expect(workforceTiles).toHaveLength(1);
    expect(workforceTiles[0]).toMatchObject({
      href: "/dashboard/workforce",
      title: "Workforce Command",
    });
  });

  it("keeps owner/admin governance inside the shell and managers out of restricted views", () => {
    expect(
      getWorkforceNavigation("owner").some(
        (item) => item.href === "/dashboard/workforce/activity",
      ),
    ).toBe(true);
    expect(
      getWorkforceNavigation("admin").some(
        (item) => item.href === "/dashboard/workforce/documents",
      ),
    ).toBe(true);
    expect(
      getWorkforceNavigation("manager").map((item) => item.href),
    ).not.toEqual(
      expect.arrayContaining([
        "/dashboard/workforce/people",
        "/dashboard/workforce/documents",
        "/dashboard/workforce/certifications",
        "/dashboard/workforce/activity",
      ]),
    );
  });

  it("highlights person details and legacy time-off as their canonical shell sections", () => {
    const people = WORKFORCE_NAVIGATION.find(
      (item) => item.href === "/dashboard/workforce/people",
    );
    const schedule = WORKFORCE_NAVIGATION.find(
      (item) => item.href === "/dashboard/workforce/scheduling",
    );
    expect(
      people &&
        isWorkforceNavigationItemActive(
          "/dashboard/workforce/people/person-a",
          people,
        ),
    ).toBe(true);
    expect(
      schedule &&
        isWorkforceNavigationItemActive(
          "/dashboard/workforce/time-off",
          schedule,
        ),
    ).toBe(true);
  });

  it("renders one persistent shell around every Workforce child page", () => {
    const layout = readFileSync("app/dashboard/workforce/layout.tsx", "utf8");
    const shell = readFileSync(
      "features/dashboard/app/dashboard/workforce/WorkforceShell.tsx",
      "utf8",
    );
    expect(layout).toContain("<WorkforceShell");
    expect(layout).toContain('allow: ["owner", "admin", "manager"]');
    expect(shell).toContain('aria-label="Workforce sections"');
    expect(shell).toContain("Workforce Command");
    expect(shell).toContain("xl:grid-cols-8");
    expect(shell).not.toContain("overflow-x-auto");
  });

  it("does not advertise an unwired Insights placeholder", () => {
    expect(
      WORKFORCE_NAVIGATION.some(
        (item) => item.href === "/dashboard/workforce/insights",
      ),
    ).toBe(false);
    const legacyPage = readFileSync(
      "app/dashboard/workforce/insights/page.tsx",
      "utf8",
    );
    expect(legacyPage).toContain('redirect("/dashboard/workforce/overview")');
  });

  it("removes duplicate in-page quick-link navigation", () => {
    const pages = [
      "features/dashboard/app/dashboard/workforce/WorkforceOverviewClient.tsx",
      "features/dashboard/app/dashboard/workforce/AttendanceOverviewClient.tsx",
      "features/dashboard/app/dashboard/workforce/WorkforceDocumentsClient.tsx",
      "features/dashboard/app/dashboard/workforce/WorkforceCertificationsClient.tsx",
      "app/dashboard/workforce/insights/page.tsx",
    ].map((path) => readFileSync(path, "utf8"));
    expect(pages.join("\n")).not.toContain("WorkforceQuickLinks");
  });
});
