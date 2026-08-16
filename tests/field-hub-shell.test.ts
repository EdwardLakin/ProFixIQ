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
const workOrderPage = read("app/mobile/work-orders/page.tsx");
const workOrderQueue = read(
  "features/mobile/work-orders/MobileWorkOrderQueue.tsx",
);

describe("Field Hub workspace", () => {
  it("keeps the Field shell active while an operator moves through shared mobile workflows", () => {
    expect(mobileShell).toContain('pathname.startsWith("/mobile/service")');
    expect(mobileShell).toContain("FIELD_SURFACE_SESSION_KEY");
    expect(mobileShell).toContain("<FieldWorkspaceShell>{children}</FieldWorkspaceShell>");
    expect(mobileShell).toContain('pathname === "/mobile"');
    expect(fieldShell).toContain("Switch workspace");
  });

  it("links the Hub to canonical mobile operations instead of duplicating their data flows", () => {
    for (const href of [
      "/mobile/appointments",
      "/mobile/work-orders",
      "/mobile/inspections",
      "/mobile/parts",
      "/mobile/fleet",
      "/mobile/service/followups",
    ]) {
      expect(`${fieldShell}\n${fieldHub}`).toContain(href);
    }

    expect(fieldHub).toContain("<MobileServiceShell embedded />");
    expect(fieldHub).not.toContain('.from("');
  });

  it("shows optional modules only when the authenticated access response grants them", () => {
    const mechanicCapabilities = normalizeFieldWorkspaceCapabilities({
      canManageScheduling: false,
      canManageParts: false,
      canAccessFleet: false,
      canConfigureFieldService: false,
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
      canUseFieldWorkspaceCapability(mechanicCapabilities, "canAccessFleet"),
    ).toBe(false);
    expect(canUseFieldWorkspaceCapability(mechanicCapabilities)).toBe(true);
    expect(fieldShell).toContain("normalizeFieldWorkspaceCapabilities");
    expect(fieldHub).toContain("canUseFieldWorkspaceCapability");
  });

  it("treats purchase orders as an explicit next slice until a field-safe surface exists", () => {
    expect(fieldHub).toContain('title: "Purchase orders"');
    expect(fieldHub).toContain('status: "next"');
    expect(fieldHub).not.toContain('href: "/parts/po"');
  });

  it("accepts only known work-order status filters from the URL", () => {
    expect(workOrderPage).toContain("SUPPORTED_STATUSES");
    expect(workOrderPage).toContain("SUPPORTED_STATUSES.has(requested)");
    expect(workOrderPage).toContain('key={`${status || "active"}');
    expect(workOrderPage).toContain('requestedParams.mode === "field_closeout"');
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
    expect(fieldShell.match(/onClick=\{\(\) => void signOut\(\)\}/g)).toHaveLength(
      2,
    );
  });
});
