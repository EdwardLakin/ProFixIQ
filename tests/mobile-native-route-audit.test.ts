import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const ROLE_DASHBOARDS = [
  "features/mobile/dashboard/MobileManagerHome.tsx",
  "features/mobile/dashboard/MobileAdvisorHome.tsx",
  "features/mobile/dashboard/MobileLeadHandHome.tsx",
  "features/mobile/dashboard/MobileOperationalRoleHome.tsx",
  "features/mobile/dashboard/MobileTechHome.tsx",
  "features/mobile/config/mobile-tiles.ts",
  "components/layout/MobileBottomNav.tsx",
];

const FORBIDDEN_DESTINATIONS = [
  'href: "/work-orders/board"',
  'href: "/dashboard/workforce/attendance"',
  'href: "/parts/requests"',
  'href: "/parts/orders"',
  'href: "/sign-in"',
  'href: "/offline/sync"',
  'href: "/assistant"',
  'href: "/agent/planner"',
];

describe("mobile-native navigation", () => {
  it("keeps every role dashboard and mobile menu inside the mobile shell", () => {
    for (const path of ROLE_DASHBOARDS) {
      const source = read(path);
      for (const destination of FORBIDDEN_DESTINATIONS) {
        expect(source, `${path} contains ${destination}`).not.toContain(
          destination,
        );
      }
    }
  });

  it("provides mobile-native destinations for every configured static tile", () => {
    const source = read("features/mobile/config/mobile-tiles.ts");
    const hrefs = [...source.matchAll(/href:\s*"(\/mobile[^"]*)"/g)].map(
      (match) => match[1],
    );

    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of new Set(hrefs)) {
      const pathname = href.split(/[?#]/)[0];
      const routePath =
        pathname === "/mobile"
          ? "app/mobile/page.tsx"
          : `app${pathname}/page.tsx`;
      expect(existsSync(routePath), `missing mobile route for ${href}`).toBe(true);
    }
  });

  it("provides mobile-native destinations for high-frequency operations", () => {
    expect(read("app/mobile/workforce/attendance/page.tsx")).toContain(
      "Attendance & activity",
    );
    expect(read("app/mobile/dispatch/page.tsx")).toContain("Live shop floor");
    expect(read("app/mobile/parts/page.tsx")).toContain("Parts workflow");
    expect(read("app/mobile/fleet/page.tsx")).toContain("Fleet units");
    expect(read("app/mobile/fleet/pretrip/page.tsx")).toContain(
      "Start a pre-trip",
    );
    expect(read("app/mobile/fleet/service-requests/page.tsx")).toContain(
      "Service requests",
    );
    expect(read("app/mobile/offline/page.tsx")).toContain("Offline &amp; sync");
    expect(read("app/mobile/assistant/page.tsx")).toContain("Shop conversation");
  });

  it("uses the existing shop-scoped operations payload", () => {
    for (const path of [
      "app/mobile/workforce/attendance/page.tsx",
      "app/mobile/dispatch/page.tsx",
    ]) {
      expect(read(path)).toContain("getOperationsDashboardPayload");
      expect(read(path)).toContain('export const dynamic = "force-dynamic"');
    }
    const parts = read("app/mobile/parts/page.tsx");
    expect(parts).toContain("MobilePartsWorkflow");
    expect(parts).toContain('export const dynamic = "force-dynamic"');
  });

  it("keeps mobile inspection entry points from exposing desktop links", () => {
    for (const path of [
      "app/mobile/inspections/page.tsx",
      "app/mobile/inspections/[id]/page.tsx",
      "app/mobile/inspections/import/page.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain(">Desktop<");
      expect(source).not.toContain("Desktop view");
    }
  });
});
