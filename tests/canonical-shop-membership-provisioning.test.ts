import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalizeRole } from "@/features/shared/lib/rbac";

const routePath = "app/api/admin/create-user/route.ts";
const migrationPath =
  "supabase/migrations/20260804053000_seed_canonical_shop_membership.sql";
const roleContractMigrationPath =
  "supabase/migrations/20260807180938_reconcile_profiles_role_contract.sql";

describe("canonical shop membership provisioning", () => {
  it("seeds shop_members before completing user provisioning", () => {
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain('.from("shop_members")');
    expect(source).toContain('onConflict: "shop_id,user_id"');
    expect(source).toContain("shop_membership_seed_failed");
    expect(source).toContain("rollbackCreatedAuthUser");
  });

  it("backfills staff profiles and supports every provisionable staff role", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("insert into public.shop_members");
    expect(migration).toContain("from public.profiles p");
    expect(migration).toContain("on conflict (shop_id, user_id)");
    expect(migration).toContain("'lead_hand'");
    expect(migration).toContain("'foreman'");
    expect(migration).toContain("'service'");
  });

  it("normalizes every historical RBAC alias before replacing legacy role checks", () => {
    const migration = readFileSync(roleContractMigrationPath, "utf8");
    const updateIndex = migration.indexOf("update public.profiles");

    for (const constraint of [
      "profiles_role_check",
      "profiles_role_chk",
      "profiles_role_canonical_check",
    ]) {
      const dropIndex = migration.indexOf(`drop constraint if exists ${constraint}`);
      expect(dropIndex).toBeGreaterThan(-1);
      expect(dropIndex).toBeLessThan(updateIndex);
    }

    const aliases = [
      ["tech", "mechanic"],
      ["technician", "mechanic"],
      ["service_advisor", "service"],
      ["service advisor", "service"],
      ["lead", "lead_hand"],
      ["leadhand", "lead_hand"],
      ["lead hand", "lead_hand"],
    ] as const;
    for (const [alias, canonical] of aliases) {
      expect(canonicalizeRole(alias)).toBe(canonical);
      expect(migration).toContain(`'${alias}'`);
      expect(migration).toContain(`'${canonical}'`);
    }

    expect(migration).toContain("add constraint profiles_role_canonical_check");
    expect(migration).toContain("validate constraint profiles_role_canonical_check");
    expect(migration).toContain("else 'unknown'");
  });
});
