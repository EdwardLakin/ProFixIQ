import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const authorization = read(
  "features/invoices/server/authorizeInvoicePdfAccess.ts",
);
const versionRoute = read("app/api/invoice-versions/[id]/pdf/route.ts");
const workOrderRoute = read("app/api/work-orders/[id]/invoice-pdf/route.ts");

describe("invoice PDF authorization", () => {
  it("limits staff PDF access to the canonical billing roles", () => {
    expect(authorization).toContain("ROLE_GROUPS.billingOperators");
    expect(authorization).toContain("resolveAuthenticatedStaffProfile");
    expect(authorization).toContain("profile?.shop_id === input.shopId");
    expect(authorization).toContain("actor.isKnownRole");
    expect(authorization).toContain("BILLING_ROLES.has(actor.canonicalRole)");
  });

  it("requires durable portal membership for customer PDF access", () => {
    expect(authorization).toContain('"profixiq_is_portal_customer_for"');
    expect(authorization).toContain("p_customer_id: input.customerId");
    expect(authorization).toContain("p_shop_id: input.shopId");
    expect(authorization).toContain("!portalAccessError && portalAccess === true");
  });

  it("gates service-role invoice-version rendering before financial data is returned", () => {
    expect(versionRoute).toContain("canAccessInvoicePdf");
    expect(versionRoute).toContain("customerId: workOrder?.customer_id ?? null");
    expect(versionRoute).toContain('NextResponse.json({ error: "Forbidden" }, { status: 403 })');
    expect(versionRoute).not.toContain('select("user_id")');
    expect(versionRoute).not.toContain("customer?.user_id === user.id");
  });

  it("adds the same financial gate to work-order invoice PDFs", () => {
    expect(workOrderRoute).toContain(
      '.select("id,shop_id,custom_id,customer_id")',
    );
    expect(workOrderRoute).toContain("canAccessInvoicePdf");
    expect(workOrderRoute).toContain("customerId: workOrder.customer_id");
    expect(workOrderRoute).toContain('NextResponse.json({ error: "Forbidden" }, { status: 403 })');
  });
});
