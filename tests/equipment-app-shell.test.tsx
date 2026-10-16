import { existsSync, readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/equipment/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import EquipmentOperationsBoard, {
  equipmentBoardCards,
} from "@/features/equipment/components/EquipmentOperationsBoard";
import EquipmentShell from "@/features/equipment/components/EquipmentShell";
import { emptyFleetSummary } from "@/features/equipment/lib/equipmentDashboard";
import { EQUIPMENT_SECTIONS } from "@/features/equipment/lib/equipmentSections";
import {
  EQUIPMENT_SHELL_NAV,
  activeEquipmentShellKey,
  equipmentShellNavForRole,
} from "@/features/equipment/lib/equipmentShellNav";
import {
  isOutsideDesktopAppShell,
  isStandalonePublicRoute,
} from "@/features/shared/lib/routes/shellBoundaries";

const read = (path: string) => readFileSync(path, "utf8");
const pageFile = (href: string) => `app${href}/page.tsx`;

describe("Equipment owns its product shell", () => {
  it("takes every /equipment route out of the Shop desktop shell", () => {
    for (const path of [
      "/equipment",
      "/equipment/dashboard",
      "/equipment/dispatch",
      "/equipment/3f2b6c1e-0000-4000-8000-000000000000",
    ]) {
      expect(isOutsideDesktopAppShell(path)).toBe(true);
    }
  });

  it("leaves neighbouring routes unchanged", () => {
    expect(isOutsideDesktopAppShell("/dashboard")).toBe(false);
    expect(isOutsideDesktopAppShell("/work-orders")).toBe(false);
    expect(isOutsideDesktopAppShell("/equipmentx")).toBe(false);
    expect(isOutsideDesktopAppShell("/mobile/service")).toBe(true);
    expect(isStandalonePublicRoute("/equipment")).toBe(false);
    expect(isStandalonePublicRoute("/equipment-maintenance-software")).toBe(true);
  });

  it("has a layout that shapes navigation without granting access or reading data", () => {
    const layout = read("app/equipment/layout.tsx");
    expect(layout).toContain("EquipmentShell");
    expect(layout).not.toContain("createAdminSupabase");
    expect(layout).not.toContain("createServerSupabase");
    expect(layout).not.toMatch(/\.from\(/);
  });
});

describe("Equipment navigation registry", () => {
  it("lists the product sections in order with unique keys and hrefs", () => {
    expect(EQUIPMENT_SHELL_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Work",
      "Dispatch",
      "Assets",
      "PM",
      "Inspections",
      "Parts",
      "Customers",
      "Billing",
      "Reports",
      "Settings",
    ]);
    const hrefs = EQUIPMENT_SHELL_NAV.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps every navigation target inside /equipment, backed by a real page", () => {
    const targets = EQUIPMENT_SHELL_NAV.flatMap((item) => [
      item.href,
      ...(item.children ?? []).map((child) => child.href),
    ]);
    for (const href of targets) {
      expect(href.startsWith("/equipment")).toBe(true);
      expect(existsSync(pageFile(href))).toBe(true);
    }
  });

  it("keeps every existing Equipment page reachable", () => {
    const reachable = new Set(
      EQUIPMENT_SHELL_NAV.flatMap((item) => [
        item.href,
        ...(item.children ?? []).map((child) => child.href),
      ]),
    );
    for (const section of EQUIPMENT_SECTIONS.filter((entry) => !entry.external)) {
      expect(reachable.has(section.href)).toBe(true);
    }
  });

  it("points planned items at a canonical workspace instead of a copy", () => {
    const planned = EQUIPMENT_SHELL_NAV.filter((item) => item.state === "planned");
    expect(planned.map((item) => item.key)).toEqual([
      "dispatch",
      "parts",
      "customers",
      "billing",
      "reports",
      "settings",
    ]);
    for (const item of planned) {
      expect(item.summary).toBeTruthy();
      expect(item.canonical?.href.startsWith("/equipment")).toBe(false);
    }
  });

  it("mirrors the destination gate for role visibility", () => {
    const keys = (role: Parameters<typeof equipmentShellNavForRole>[0]) =>
      equipmentShellNavForRole(role).map((item) => item.key);
    expect(keys("owner")).toHaveLength(EQUIPMENT_SHELL_NAV.length);
    expect(keys("parts")).toContain("parts");
    expect(keys("parts")).not.toContain("settings");
    expect(keys("parts")).not.toContain("billing");
    expect(keys("advisor")).not.toContain("settings");
    expect(keys("advisor")).toContain("billing");
  });

  it("resolves the active section from the pathname", () => {
    expect(activeEquipmentShellKey("/equipment/dashboard")).toBe("dashboard");
    expect(activeEquipmentShellKey("/equipment/work-orders")).toBe("work");
    expect(activeEquipmentShellKey("/equipment/dispatch/")).toBe("dispatch");
    expect(activeEquipmentShellKey("/equipment")).toBe("assets");
    expect(activeEquipmentShellKey("/equipment/abc-123")).toBe("assets");
    expect(activeEquipmentShellKey("/equipment/components")).toBe("assets");
    expect(activeEquipmentShellKey("/equipment/components/xyz")).toBe("assets");
    expect(activeEquipmentShellKey("/equipment/pm")).toBe("pm");
    expect(activeEquipmentShellKey("/dashboard")).toBeNull();
  });
});

describe("Equipment planned entry points", () => {
  it.each(["dispatch", "parts", "customers", "billing", "reports", "settings"])(
    "serves /equipment/%s through the shared planned-page gate",
    (key) => {
      const page = read(pageFile(`/equipment/${key}`));
      expect(page).toContain(`itemKey="${key}"`);
    },
  );

  it("authenticates, applies the destination gate and entitlement, and reads no data", () => {
    const source = read("features/equipment/server/EquipmentPlannedPage.tsx");
    expect(source).toContain("requireShopPageAccess");
    expect(source).toContain("EQUIPMENT_DIRECTORY_ROLES");
    expect(source).toContain("item.visibleTo(canonicalRole)");
    expect(source).toContain("resolveEquipmentPageEntitlement");
    expect(source).not.toContain("createAdminSupabase");
    expect(source).not.toContain("createServerSupabase");
    expect(source).not.toMatch(/\.(from|rpc)\(/);
  });
});

describe("EquipmentShell", () => {
  beforeEach(() => {
    nav.pathname = "/equipment/dashboard";
  });

  const items = EQUIPMENT_SHELL_NAV.map(({ key, label, href, state, children }) => ({
    key,
    label,
    href,
    state,
    children,
  }));

  it("renders Equipment navigation and marks the current page", () => {
    render(
      <EquipmentShell items={items}>
        <p>page body</p>
      </EquipmentShell>,
    );
    const sections = screen.getByRole("navigation", { name: "Equipment sections" });
    expect(within(sections).getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(sections).getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/equipment/work-orders",
    );
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("flags planned sections so nobody mistakes them for a finished workspace", () => {
    render(
      <EquipmentShell items={items}>
        <p>page body</p>
      </EquipmentShell>,
    );
    expect(screen.getAllByText("Soon")).toHaveLength(6);
  });

  it("keeps Assets highlighted on a machine's detail page", () => {
    nav.pathname = "/equipment/3f2b6c1e-0000-4000-8000-000000000000";
    render(
      <EquipmentShell items={items}>
        <p>page body</p>
      </EquipmentShell>,
    );
    const sections = screen.getByRole("navigation", { name: "Equipment sections" });
    const assets = within(sections).getByRole("link", { name: "Assets" });
    expect(assets.className).toContain("accent-copper");
  });
});

describe("Equipment operations board", () => {
  it("shows real counts from asset records and never invents the rest", () => {
    const summary = emptyFleetSummary();
    summary.total = 12;
    summary.status.down = 2;
    summary.status.out_of_service = 1;
    summary.openWork = { assets: 4, orders: 6 };
    summary.pm.overdue = 3;
    summary.pm.due = 2;

    const cards = equipmentBoardCards(summary);
    const byKey = Object.fromEntries(cards.map((card) => [card.key, card.value]));
    expect(byKey["machines-down"]).toBe(3);
    expect(byKey["open-work"]).toBe(6);
    expect(byKey["pm-due"]).toBe(5);
    for (const key of ["field-jobs", "dispatch", "approvals", "parts-holds"]) {
      expect(byKey[key]).toBeNull();
    }
  });

  it("labels unconnected cards instead of showing a number", () => {
    render(<EquipmentOperationsBoard summary={emptyFleetSummary()} />);
    expect(screen.getAllByText("Not connected yet")).toHaveLength(4);
  });

  it("warns when counts are partial", () => {
    const summary = emptyFleetSummary();
    summary.partial = true;
    render(<EquipmentOperationsBoard summary={summary} />);
    expect(screen.getByRole("status").textContent).toContain("incomplete");
  });
});
