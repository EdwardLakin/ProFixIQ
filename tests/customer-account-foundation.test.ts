import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const migration = read(
  "supabase/migrations/20260811232403_customer_account_foundation.sql",
);
const customerPage = read("features/customers/app/customers/[id]/page.tsx");
const fleetRoute = read("app/api/portal/fleet/invites/route.ts");

describe("customer account foundation", () => {
  it("expands customer accounts without replacing canonical customer records", () => {
    expect(migration).toContain("add column if not exists account_type text");
    expect(migration).toContain(
      "'individual', 'business', 'fleet', 'enterprise'",
    );
    expect(migration).toContain(
      "parent_customer_id uuid references public.customers",
    );
    expect(migration).toContain(
      "default_bill_to_customer_id uuid references public.customers",
    );
    expect(migration).not.toMatch(/drop table|delete from public\.customers/i);
  });

  it("keeps contacts and locations inside the authenticated Shop boundary", () => {
    expect(migration).toContain(
      "create table if not exists public.customer_contacts",
    );
    expect(migration).toContain(
      "create table if not exists public.customer_locations",
    );
    expect(migration).toContain("public.is_staff_for_shop(shop_id)");
    expect(migration).toContain(
      "Customer contact or location must belong to the same shop",
    );
    expect(migration).toContain("to authenticated, service_role");
  });

  it("separates a staff creator from the customer portal identity", () => {
    expect(customerPage).toContain("user_id: null");
    expect(customerPage).toContain("created_by: user.id");
    expect(customerPage).toContain("account_type: newCustomer.customerType");
  });

  it("links Fleet to an explicitly verified existing customer", () => {
    expect(fleetRoute).toContain(
      'const customerId = String(body.customerId ?? "").trim()',
    );
    expect(fleetRoute).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(fleetRoute).toContain(
      "...(customerId ? { customer_id: customerId } : {})",
    );
  });
});
