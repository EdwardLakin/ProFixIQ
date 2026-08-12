import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read(
  "supabase/migrations/20260812050000_unified_customer_account_center.sql",
);
const fleetPolicyRepair = read(
  "supabase/migrations/20260812060000_repair_fleet_access_policy_recursion.sql",
);
const customerAccountHardening = read(
  "supabase/migrations/20260812062000_harden_customer_account_advisors.sql",
);
const generatedTypes = read("features/shared/types/types/supabase.ts");
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

  it("keeps long customer forms usable within a desktop viewport", () => {
    expect(directory).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(directory).toContain("min-h-0 overflow-y-auto");
    expect(directory).toContain("shrink-0 items-center");
  });

  it("keeps a canonical customer visible when optional service data fails", () => {
    expect(directory).toContain("let customerWasLoaded = false");
    expect(directory).toContain("if (!customerWasLoaded) setCustomer(null)");
    expect(directory).toContain(
      "Customer account loaded, but related service data could not be loaded.",
    );
  });

  it("breaks Fleet policy recursion without broadening Fleet access", () => {
    expect(fleetPolicyRepair).toContain("fleet_actor_can_read_fleet");
    expect(fleetPolicyRepair).toContain("fleet_actor_can_read_member");
    expect(fleetPolicyRepair).toContain("fleet_actor_can_manage_scope");
    expect(fleetPolicyRepair).toContain("security definer");
    expect(fleetPolicyRepair).toContain("profile.user_id = (select auth.uid())");
    expect(fleetPolicyRepair).not.toMatch(
      /create policy fleets_actor_select[\s\S]*?from public\.fleet_members/i,
    );
  });

  it("keeps privileged Fleet predicates outside the Data API surface", () => {
    expect(customerAccountHardening).toContain(
      "create schema if not exists rls_helpers",
    );
    expect(customerAccountHardening).toContain(
      "alter default privileges for role postgres in schema rls_helpers",
    );
    expect(customerAccountHardening).toContain(
      "using (rls_helpers.fleet_actor_can_read_fleet(id, shop_id))",
    );
    expect(customerAccountHardening).toContain(
      "drop function public.fleet_actor_can_read_fleet(uuid, uuid)",
    );
    expect(generatedTypes).not.toContain("fleet_actor_can_read_fleet:");
  });

  it("indexes Customer Account audit foreign keys used during retention", () => {
    expect(customerAccountHardening).toContain(
      "customer_account_operations_actor_idx",
    );
    expect(customerAccountHardening).toContain(
      "customer_account_operations_customer_idx",
    );
    expect(customerAccountHardening).toContain(
      "customer_account_merges_merged_by_idx",
    );
    expect(customerAccountHardening).toContain(
      "customer_account_merges_target_customer_idx",
    );
  });
});
