import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routePath = "app/api/admin/create-user/route.ts";
const migrationPath =
  "supabase/migrations/20260804053000_seed_canonical_shop_membership.sql";

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
});
