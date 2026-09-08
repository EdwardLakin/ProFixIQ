import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260908143000_add_private_ai_usage_ledger.sql",
  "utf8",
);

describe("AI ledger attribution", () => {
  it("allows intentional global events while validating scoped user/shop pairs", () => {
    expect(migration).toContain("shop_id uuid references public.shops(id)");
    expect(migration).toContain("user_id uuid references public.profiles(id)");
    expect(migration).toContain("if p_user_id is not null and p_shop_id is not null");
  });
});
