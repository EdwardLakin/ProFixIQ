import { existsSync, readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/equipment/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
const prefs = vi.hoisted(() => ({ navigationIndicators: true, loading: false }));
vi.mock("@/features/shared/hooks/useNotificationPreferences", () => ({
  useNotificationPreferences: () => ({
    preferences: { navigationIndicators: prefs.navigationIndicators },
    loading: prefs.loading,
  }),
}));
vi.mock("@/features/shared/lib/supabase/client", () => ({
  createBrowserSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "auth-user" } } } }),
    },
  }),
}));
vi.mock("@/features/copilot/technician/components/TechnicianCopilotShell", () => ({
  TechnicianCopilotShell: ({ shouldCheck }: { shouldCheck: boolean }) => (
    <div data-testid="copilot" data-should-check={String(shouldCheck)} />
  ),
}));
vi.mock("@/features/chat/components/InboxModal", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Inbox" /> : null,
}));

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
      "Field",
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
    // Technicians get the field entry only; no link that bounces them.
    expect(keys("mechanic")).toEqual(["field"]);
    expect(keys("customer")).toEqual([]);
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
    expect(activeEquipmentShellKey("/equipment/field")).toBe("field");
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
    prefs.navigationIndicators = true;
    prefs.loading = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ unread_count: 2 }, { unread_count: 1 }, { unread_count: null }],
      })),
    );
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

  it("keeps the asset-engine links in the markup at every width", () => {
    render(
      <EquipmentShell items={items}>
        <p>page body</p>
      </EquipmentShell>,
    );
    for (const name of ["Components", "Measurements", "Undercarriage", "Fluid analysis"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toBeTruthy();
      // No ancestor may hide the link below lg.
      let node: HTMLElement | null = link;
      while (node && node.tagName !== "ASIDE") {
        expect(node.className).not.toMatch(/(^|\s)hidden(\s|$)/);
        node = node.parentElement;
      }
    }
  });

  it("provides sign out and the shared inbox with an unread badge", async () => {
    render(
      <EquipmentShell items={items}>
        <p>page body</p>
      </EquipmentShell>,
    );
    expect(screen.getByRole("link", { name: "Sign out" })).toHaveAttribute(
      "href",
      "/auth/signout",
    );
    const inbox = screen.getByRole("button", { name: /Inbox/ });
    expect(await screen.findByLabelText("3 unread")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Inbox" })).toBeNull();
    fireEvent.click(inbox);
    expect(screen.getByRole("dialog", { name: "Inbox" })).toBeTruthy();
  });

  it("hides the unread badge when the saved navigation-indicator preference is off", async () => {
    prefs.navigationIndicators = false;
    render(
      <EquipmentShell items={items}>
        <p>page body</p>
      </EquipmentShell>,
    );
    await screen.findByRole("button", { name: /Inbox/ });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByLabelText("3 unread")).toBeNull();
  });

  it("keeps the technician CoPilot launcher for technicians only", () => {
    const { unmount } = render(
      <EquipmentShell items={items} isTechnician>
        <p>page body</p>
      </EquipmentShell>,
    );
    expect(screen.getByTestId("copilot")).toHaveAttribute("data-should-check", "true");
    unmount();
    render(
      <EquipmentShell items={items}>
        <p>page body</p>
      </EquipmentShell>,
    );
    expect(screen.getByTestId("copilot")).toHaveAttribute("data-should-check", "false");
  });

  it("points the brand link at the supplied home", () => {
    render(
      <EquipmentShell items={items} homeHref="/dashboard">
        <p>page body</p>
      </EquipmentShell>,
    );
    expect(screen.getByRole("link", { name: /Equipment/ })).toHaveAttribute("href", "/dashboard");
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
    render(<EquipmentOperationsBoard summary={emptyFleetSummary()} role="owner" />);
    expect(screen.getAllByText("Not connected yet")).toHaveLength(4);
  });

  it("warns when counts are partial", () => {
    const summary = emptyFleetSummary();
    summary.partial = true;
    render(<EquipmentOperationsBoard summary={summary} role="owner" />);
    expect(screen.getByRole("status").textContent).toContain("incomplete");
  });

  it("links only to destinations the role can open", () => {
    const { unmount } = render(
      <EquipmentOperationsBoard summary={emptyFleetSummary()} role="owner" />,
    );
    expect(screen.getByText("Parts holds").closest("a")).not.toBeNull();
    expect(screen.getByText("Dispatch").closest("a")).not.toBeNull();
    unmount();

    // service: opens Work/Assets/PM but not scheduling or parts.
    render(<EquipmentOperationsBoard summary={emptyFleetSummary()} role="service" />);
    expect(screen.getByText("Open work orders").closest("a")).not.toBeNull();
    for (const title of ["Dispatch", "Active field jobs", "Parts holds"]) {
      expect(screen.getByText(title).closest("a")).toBeNull();
    }
  });
});
