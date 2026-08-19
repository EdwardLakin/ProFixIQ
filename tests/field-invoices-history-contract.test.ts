import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const route = read("app/api/mobile/service/invoices/route.ts");
const serverReader = read(
  "features/mobile/service/server/fieldInvoiceHistory.ts",
);
const page = read("app/mobile/service/invoices/page.tsx");
const shell = read("features/mobile/service/FieldWorkspaceShell.tsx");
const hub = read("features/mobile/service/FieldHub.tsx");

describe("Field invoices and history contract", () => {
  it("authorizes the Field actor before a privileged, shop-scoped read", () => {
    expect(route).toContain("requireMobileServiceOperatorApiAccess");
    expect(route).toContain("access.actor.canManageWorkOrders");
    expect(route.indexOf("access.actor.canManageWorkOrders")).toBeLessThan(
      route.indexOf("createAdminSupabase()"),
    );
    expect(serverReader).toContain('.eq("shop_id", args.shopId)');
    expect(serverReader).toContain('.eq("status", "invoiced")');
    expect(serverReader).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("keeps the page and navigation behind the canonical work-order capability", () => {
    expect(page).toContain('requiredCapability: "canManageWorkOrders"');
    expect(shell).toMatch(
      /label: "Invoices & history"[\s\S]*?href: "\/mobile\/service\/invoices"[\s\S]*?requiredCapability: "canManageOperations"/,
    );
    expect(hub).toMatch(
      /id: "unpaid_invoices"[\s\S]*?title: "Unpaid invoices"[\s\S]*?href: "\/mobile\/service\/invoices"[\s\S]*?requiredCapability: "canManageOperations"/,
    );
  });

  it("reuses canonical closeout, work-order, and invoice PDF routes", () => {
    const component = read(
      "features/mobile/service/FieldInvoicesHistory.tsx",
    );
    expect(component).toContain("/mobile/service/closeout/");
    expect(component).toContain("/mobile/work-orders/");
    expect(component).toContain("/api/work-orders/");
    expect(component).toContain("/invoice-pdf");
    expect(component).not.toContain("RecordManualPayment");
  });
});
