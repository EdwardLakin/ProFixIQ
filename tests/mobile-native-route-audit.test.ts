import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile-native navigation", () => {
  it("keeps role dashboard actions inside the mobile shell", () => {
    for (const path of [
      "features/mobile/dashboard/MobileManagerHome.tsx",
      "features/mobile/dashboard/MobileOperationalRoleHome.tsx",
      "features/mobile/config/mobile-tiles.ts",
    ]) {
      const source = read(path);
      expect(source).not.toContain('href: "/work-orders/board"');
      expect(source).not.toContain('href: "/dashboard/workforce/attendance"');
      expect(source).not.toContain('href: "/parts/requests"');
      expect(source).not.toContain('href: "/parts/orders"');
    }
  });

  it("provides mobile-native destinations for high-frequency operations", () => {
    expect(read("app/mobile/workforce/attendance/page.tsx")).toContain("Attendance & activity");
    expect(read("app/mobile/dispatch/page.tsx")).toContain("Live shop floor");
    expect(read("app/mobile/parts/page.tsx")).toContain("Parts workflow");
  });

  it("uses the existing shop-scoped operations payload", () => {
    for (const path of [
      "app/mobile/workforce/attendance/page.tsx",
      "app/mobile/dispatch/page.tsx",
      "app/mobile/parts/page.tsx",
    ]) {
      expect(read(path)).toContain("getOperationsDashboardPayload");
      expect(read(path)).toContain('export const dynamic = "force-dynamic"');
    }
  });
});
