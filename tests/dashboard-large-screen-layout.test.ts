import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("large-screen dashboard layout", () => {
  it("uses one wide application frame for dashboard and operational surfaces", () => {
    for (const path of [
      "features/shared/components/AppShell.tsx",
      "features/shared/components/RoleHubTiles/RoleHubTiles.tsx",
      "features/dashboard/app/dashboard/advisor/page.tsx",
      "features/dashboard/app/dashboard/admin/AdminSurface.tsx",
      "features/dashboard/app/dashboard/workforce/WorkforceShell.tsx",
      "features/dashboard/app/dashboard/admin/BillingClient.tsx",
      "features/dashboard/app/dashboard/owner/reports/page.tsx",
      "features/dashboard/app/dashboard/owner/settings/page.tsx",
      "app/parts/page.tsx",
      "app/work-orders/board/page.tsx",
    ]) {
      expect(read(path), path).toContain("max-w-[1800px]");
    }
  });

  it("treats scaled 1080p TV viewports as desktop dashboard density", () => {
    const responsive = read(
      "features/dashboard/lib/dashboard-responsive-layout.ts",
    );
    expect(responsive).toContain('if (width < 1280) return "laptop"');
    expect(responsive).not.toContain('if (width < 1536) return "laptop"');
  });

  it("moves four-up dashboard grids to the xl breakpoint", () => {
    const roleTiles = read(
      "features/shared/components/RoleHubTiles/RoleHubTiles.tsx",
    );
    const advisor = read(
      "features/dashboard/app/dashboard/advisor/page.tsx",
    );
    const moduleSystem = read(
      "features/dashboard/components/DashboardModuleSystem.tsx",
    );
    const stats = read(
      "features/dashboard/widgets/modules/StatsOverviewWidgetModule.tsx",
    );

    expect(roleTiles).toContain("sm:grid-cols-2 xl:grid-cols-4");
    expect(advisor).toContain("sm:grid-cols-2 xl:grid-cols-4");
    expect(moduleSystem).toContain("grid-cols-2 xl:grid-cols-4");
    expect(stats).toContain("md:grid-cols-2 xl:grid-cols-4");
  });
});
