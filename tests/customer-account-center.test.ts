import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260812050000_unified_customer_account_center.sql",
);
const accountCenter = read(
  "features/customers/components/CustomerAccountDetails.tsx",
);
const directory = read("features/customers/app/customers/[id]/page.tsx");
const desktopWorkOrder = read(
  "features/work-orders/app/work-orders/create/page.tsx",
);
const mobileWorkOrder = read("app/mobile/work-orders/create/page.tsx");

describe("unified Customer Account Center", () => {
  it("normalizes duplicate identity inside each Shop", () => {
    expect(migration).toContain("identity_name text");
    expect(migration).toContain("identity_email text");
    expect(migration).toContain("identity_phone text");
    expect(migration).toContain("find_customer_account_duplicates");
    expect(migration).toContain("CUSTOMER_DUPLICATE_REVIEW_REQUIRED");
    expect(migration).toContain("vehicles_shop_normalized_vin_idx");
  });

  it("keeps all primary creation surfaces on the canonical command", () => {
    for (const source of [directory, desktopWorkOrder, mobileWorkOrder]) {
      expect(source).toContain("createCustomerAccount");
    }
    expect(desktopWorkOrder).toContain("matchExisting: true");
    expect(mobileWorkOrder).toContain("matchExisting: true");
    expect(directory).toContain("CustomerDuplicateReviewError");
  });

  it("adds commercial controls without a second competing settings table", () => {
    expect(migration).toContain("alter table public.customer_settings");
    expect(migration).toContain("primary_billing_contact_id");
    expect(migration).toContain("primary_approval_contact_id");
    expect(migration).toContain("po_required boolean");
    expect(migration).toContain("payment_terms text");
    expect(migration).toContain("tax_exempt boolean");
    expect(migration).toContain("account_status text");
    expect(migration).not.toContain(
      "create table public.customer_account_settings",
    );
  });

  it("preserves history through archive and merge instead of deletion", () => {
    expect(migration).toContain("customer_account_merges");
    expect(migration).toContain("merge_customer_accounts_atomic");
    expect(migration).toContain("archive_customer_account_atomic");
    expect(migration).toContain(
      'drop policy if exists "staff can delete customers in shop"',
    );
    expect(migration).toContain(
      "revoke delete on table public.customers from authenticated",
    );
    expect(migration).not.toMatch(/delete from public\.customers/i);
  });

  it("presents account, Fleet, invoice, lifecycle, and pricing controls together", () => {
    expect(accountCenter).toContain("Customer Account Center");
    expect(accountCenter).toContain("Commercial controls");
    expect(accountCenter).toContain("Fleet workspace");
    expect(accountCenter).toContain("Outstanding");
    expect(accountCenter).toContain("Merge duplicate");
    expect(accountCenter).toContain("<CustomerPricingPanel");
  });
});
