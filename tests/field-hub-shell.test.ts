import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const mobileShell = read("components/layout/MobileShell.tsx");
const fieldShell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const fieldHub = read("features/mobile/service/FieldHub.tsx");
const workOrderPage = read("app/mobile/work-orders/page.tsx");

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

  it("treats purchase orders as an explicit next slice until a field-safe surface exists", () => {
    expect(fieldHub).toContain('title: "Purchase orders"');
    expect(fieldHub).toContain('status: "next"');
    expect(fieldHub).not.toContain('href: "/parts/po"');
  });

  it("accepts only known work-order status filters from the URL", () => {
    expect(workOrderPage).toContain("SUPPORTED_STATUSES");
    expect(workOrderPage).toContain("SUPPORTED_STATUSES.has(requested)");
    expect(workOrderPage).toContain('<MobileWorkOrderQueue initialStatus={status} />');
  });

  it("signs out the Field session locally before returning to its dedicated sign-in", () => {
    expect(fieldShell).toContain('signOut({ scope: "local" })');
    expect(fieldShell).toContain('router.replace("/field/sign-in")');
  });
});
