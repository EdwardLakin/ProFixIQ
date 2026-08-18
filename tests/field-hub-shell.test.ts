import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canUseFieldWorkspaceCapability,
  normalizeFieldWorkspaceCapabilities,
} from "@/features/mobile/service/fieldWorkspaceCapabilities";
import { resolveMobileWorkOrderHref } from "@/features/mobile/work-orders/mobileWorkOrderRouting";

const read = (path: string) => readFileSync(path, "utf8");
const mobileShell = read("components/layout/MobileShell.tsx");
const fieldShell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const fieldHub = read("features/mobile/service/FieldHub.tsx");
const fieldAccess = read("features/mobile/service/server/access.ts");
const workOrderPage = read("app/mobile/work-orders/page.tsx");
const workOrderQueue = read(
  "features/mobile/work-orders/MobileWorkOrderQueue.tsx",
);

describe("Field Hub workspace", () => {
  it("keeps the Field shell active while an operator moves through shared mobile workflows", () => {
    expect(mobileShell).toContain('pathname.startsWith("/mobile/service")');
    expect(mobileShell).toContain("FIELD_SURFACE_SESSION_KEY");
    expect(mobileShell).toContain(
      "<FieldWorkspaceShell>{children}</FieldWorkspaceShell>",
    );
    expect(mobileShell).toContain('pathname === "/mobile"');
    expect(fieldShell).toContain("Switch workspace");
  });

  it("links the Hub to canonical mobile operations instead of duplicating their data flows", () => {
    for (const href of [
      "/mobile/appointments",
      "/mobile/service/dispatch",
      "/mobile/work-orders",
      "/mobile/inspections",
      "/mobile/parts",
      "/mobile/service/purchase-orders",
      "/mobile/service/followups",
    ]) {
      expect(`${fieldShell}\n${fieldHub}`).toContain(href);
    }

    expect(fieldHub).toContain("<MobileServiceShell");
    expect(fieldHub).not.toContain('.from("');
  });

  it("shows optional modules only when the authenticated access response grants them", () => {
    const mechanicCapabilities = normalizeFieldWorkspaceCapabilities({
      canManageScheduling: false,
      canManageParts: false,
      canManageOperations: false,
      canConfigureFieldService: false,
      canSwitchWorkspace: false,
    });

    expect(
      canUseFieldWorkspaceCapability(
        mechanicCapabilities,
        "canManageScheduling",
      ),
    ).toBe(false);
    expect(
      canUseFieldWorkspaceCapability(mechanicCapabilities, "canManageParts"),
    ).toBe(false);
    expect(
      canUseFieldWorkspaceCapability(
        mechanicCapabilities,
        "canManageOperations",
      ),
    ).toBe(false);
    expect(canUseFieldWorkspaceCapability(mechanicCapabilities)).toBe(true);
    expect(fieldShell).toContain("normalizeFieldWorkspaceCapabilities");
    expect(fieldHub).toContain("canUseFieldWorkspaceCapability");
  });

  it("keeps permanent Field actions on canonical workflows", () => {
    for (const href of [
      "/mobile/appointments#new-appointment",
      "/mobile/service/new",
      "/mobile/work-orders/create",
      "/mobile/service/truck-inventory",
      "/mobile/inspections",
      "/mobile/work-orders?status=ready_to_invoice&mode=field_closeout",
    ]) {
      expect(fieldHub).toContain(`href: "${href}"`);
    }

    expect(fieldHub).toContain("FIELD_DASHBOARD_LAYOUT_SCOPE");
    expect(fieldHub).toContain("moveFieldDashboardCard");
    expect(fieldHub).toContain("setFieldDashboardCardVisibility");
    expect(fieldHub).toMatch(
      /title: "New work order"[\s\S]*?requiredCapability: "canManageOperations"/,
    );
    expect(fieldHub).toContain("getFieldDashboardLayoutCacheKey");
    expect(fieldHub).toContain("createFieldDashboardLayoutSaveQueue");
    expect(fieldHub).toContain('title: "Scan or create part"');
    expect(fieldHub).toMatch(
      /id: "dispatch_queue"[\s\S]*?requiredCapability: "canManageScheduling"/,
    );
    expect(fieldHub).toContain(
      "canManageScheduling={capabilities.canManageScheduling}",
    );
    expect(fieldShell).toContain('label: "Truck inventory"');
    expect(fieldShell.match(/label: "Truck inventory"/g)).toHaveLength(1);
  });

  it("does not leak Fleet navigation and hides workspace switching unless another product is verified", () => {
    expect(fieldHub).not.toContain('href: "/mobile/fleet"');
    expect(fieldShell).not.toContain('href: "/mobile/fleet"');
    expect(fieldShell).toContain("workspaceCapabilities.canSwitchWorkspace ?");
    expect(fieldShell).toContain('href="/sign-in"');
    expect(fieldAccess).toContain(
      "fleetActor.capabilities.canAccessFleetIntake",
    );
    expect(fieldAccess).not.toContain("resolveFleetActorScope");
  });

  it("exposes the field-safe purchase-order surface only to parts-capable operators", () => {
    expect(fieldHub).toContain('title: "Purchase orders"');
    expect(fieldHub).toContain('href: "/mobile/service/purchase-orders"');
    expect(fieldHub).toContain('requiredCapability: "canManageParts"');
    expect(fieldShell).toContain('label: "Purchase orders"');
    expect(fieldHub).not.toContain('href: "/parts/po"');
  });

  it("accepts only known work-order status filters from the URL", () => {
    expect(workOrderPage).toContain("SUPPORTED_STATUSES");
    expect(workOrderPage).toContain("SUPPORTED_STATUSES.has(requested)");
    expect(workOrderPage).toContain('key={`${status || "active"}');
    expect(workOrderPage).toContain(
      'requestedParams.mode === "field_closeout"',
    );
  });

  it("routes only opted-in ready-to-invoice rows to canonical Field closeout", () => {
    expect(
      resolveMobileWorkOrderHref({
        workOrderId: "wo/123",
        status: "ready_to_invoice",
        readyToInvoiceCloseout: true,
      }),
    ).toBe("/mobile/service/closeout/wo%2F123");
    expect(
      resolveMobileWorkOrderHref({
        workOrderId: "wo-123",
        status: "in_progress",
        readyToInvoiceCloseout: true,
      }),
    ).toBe("/mobile/work-orders/wo-123");
    expect(workOrderQueue).toContain("resolveMobileWorkOrderHref");
  });

  it("signs out the Field session locally before returning to its dedicated sign-in", () => {
    expect(fieldShell).toContain('signOut({ scope: "local" })');
    expect(fieldShell).toContain('router.replace("/field/sign-in")');
    expect(
      fieldShell.match(/onClick=\{\(\) => void signOut\(\)\}/g),
    ).toHaveLength(2);
  });
});
