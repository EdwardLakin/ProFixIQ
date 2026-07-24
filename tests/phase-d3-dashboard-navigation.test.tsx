import React from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TILES } from "@/features/shared/config/tiles";
import { getOwnerSidebarTiles } from "@/features/shared/lib/ownerSidebarNav";
import { MOBILE_TILES } from "@/features/mobile/config/mobile-tiles";
import { ROUTE_META } from "@/features/shared/lib/routeMeta";
import {
  getOperationalViewsForRole,
  OperationalViewSwitcher,
} from "@/features/dashboard/components/OperationalViewSwitcher";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let mockPathname = "/dashboard";
let mockSearchParams = "";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function tilesFor(role: string) {
  const roleTiles = TILES.filter((tile) => tile.roles.includes(role as never));
  return role === "owner" ? getOwnerSidebarTiles(roleTiles) : roleTiles;
}

function sectionTitles(role: string, section: string) {
  return tilesFor(role)
    .filter((tile) => tile.section === section)
    .map((tile) => tile.title);
}

function duplicateCount<T>(values: T[], value: T) {
  return values.filter((item) => item === value).length;
}

describe("Phase D3 dashboard operational navigation", () => {
  it("groups canonical daily operational views under Dashboard", () => {
    const dashboard = sectionTitles("owner", "Dashboard");

    expect(dashboard).toEqual(expect.arrayContaining([
      "Shop Overview",
      "Work Order Board",
      "Shop Health",
      "Performance",
    ]));
  });

  it("keeps Work Order Board out of Operations and Time & Attendance in Workforce", () => {
    const ownerTiles = tilesFor("owner");
    const operations = ownerTiles.filter((tile) => tile.section === "Operations");
    const workforce = ownerTiles.filter((tile) => tile.section === "Workforce");

    expect(operations.map((tile) => tile.href)).not.toContain("/work-orders/board");
    expect(workforce.map((tile) => tile.href)).toContain("/dashboard/workforce");
    expect(duplicateCount(ownerTiles.map((tile) => tile.href), "/work-orders/board")).toBe(1);
    expect(duplicateCount(ownerTiles.map((tile) => tile.href), "/dashboard/workforce")).toBe(1);
  });

  it("keeps Workforce navigation management-only", () => {
    expect(sectionTitles("owner", "Workforce")).toEqual([
      "Workforce Command",
    ]);
  });

  it("does not leave active Dispatch Board labels in canonical navigation", () => {
    const activeNavigation = [
      "features/shared/config/tiles.ts",
      "features/shared/lib/ownerSidebarNav.ts",
      "features/shared/components/RoleHubTiles/tiles.ts",
      "features/mobile/config/mobile-tiles.ts",
      "features/shared/components/DashboardQuickActions.tsx",
      "features/shared/lib/routeMeta.ts",
    ].map(read).join("\n");

    expect(activeNavigation).not.toContain('"Dispatch Board"');
    expect(activeNavigation).not.toContain("/dashboard/manager/dispatch");
  });

  it("preserves role visibility for Dashboard links", () => {
    expect(sectionTitles("manager", "Dashboard")).toEqual(expect.arrayContaining([
      "Shop Overview",
      "Work Order Board",
      "Performance",
    ]));

    expect(sectionTitles("advisor", "Dashboard")).toEqual(expect.arrayContaining([
      "Shop Overview",
      "Work Order Board",
    ]));
    expect(sectionTitles("advisor", "Dashboard")).not.toContain("Attendance & Activity");
    expect(sectionTitles("advisor", "Dashboard")).not.toContain("Performance");
    expect(sectionTitles("mechanic", "Dashboard")).not.toContain("Attendance & Activity");
  });

  it("keeps mobile daily views first without duplicates", () => {
    expect(MOBILE_TILES.slice(0, 3).map((tile) => tile.title)).toEqual([
      "Shop Overview",
      "Work Order Board",
      "Attendance & Activity",
    ]);
    expect(duplicateCount(MOBILE_TILES.map((tile) => tile.href), "/mobile/work-orders")).toBe(1);
    expect(duplicateCount(MOBILE_TILES.map((tile) => tile.href), "/mobile/workforce/attendance")).toBe(1);
  });

  it("updates route metadata for the three operational views", () => {
    expect(ROUTE_META["/dashboard"].title("/dashboard")).toBe("Shop Overview");
    expect(ROUTE_META["/work-orders/board"].title("/work-orders/board")).toBe("Work Order Board");
    expect(ROUTE_META["/dashboard/workforce/attendance"].title("/dashboard/workforce/attendance")).toBe("Attendance & Activity");
  });

  it("renders the operational switcher on all three pages and highlights the active page", () => {
    expect(read("app/dashboard/_components/OperationsDashboardView.tsx")).toContain("OperationalViewSwitcher");
    expect(read("app/work-orders/board/page.tsx")).toContain("OperationalViewSwitcher");
    expect(read("features/dashboard/app/dashboard/workforce/AttendanceOverviewClient.tsx")).toContain("OperationalViewSwitcher");

    mockPathname = "/work-orders/board";
    mockSearchParams = "stage=waiting_parts";
    render(<OperationalViewSwitcher role="manager" />);

    expect(screen.getByRole("link", { name: "Shop Overview" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Work Order Board" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Work Order Board" })).toHaveAttribute("href", "/work-orders/board?stage=waiting_parts");
    expect(screen.getByRole("link", { name: "Attendance & Activity" })).toHaveAttribute("href", "/dashboard/workforce/attendance");
  });

  it("does not render unauthorized switcher links for restricted roles", () => {
    expect(getOperationalViewsForRole("advisor").map((view) => view.label)).toEqual([
      "Shop Overview",
      "Work Order Board",
    ]);
    expect(getOperationalViewsForRole("mechanic").map((view) => view.label)).toEqual([
      "Shop Overview",
      "Work Order Board",
    ]);
  });

  it("keeps legacy dispatch redirect unchanged", () => {
    expect(read("app/dashboard/manager/dispatch/page.tsx")).toContain('redirect("/work-orders/board")');
  });
});
