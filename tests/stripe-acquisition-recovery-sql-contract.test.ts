import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260906150000_recover_stranded_stripe_acquisition_identity.sql";

async function migration(): Promise<string> {
  return readFile(migrationPath, "utf8");
}

describe("Stripe acquisition identity recovery SQL contract", () => {
  it("keeps the recovery RPC service-role only", async () => {
    const sql = await migration();

    expect(sql).toContain(
      "create or replace function public.recover_stranded_stripe_acquisition_identity(",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = pg_catalog, public, private");

    expect(sql).toMatch(
      /revoke all on function public\.recover_stranded_stripe_acquisition_identity\([\s\S]*?\) from public,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.recover_stranded_stripe_acquisition_identity\([\s\S]*?\) to service_role/i,
    );
  });

  it("binds the authenticated subject to the canonical profile and shop", async () => {
    const sql = await migration();

    expect(sql).toContain("where id = p_profile_id");
    expect(sql).toMatch(
      /and\s*\(\s*id = p_auth_user_id\s*or user_id = p_auth_user_id\s*\)/,
    );
    expect(sql).toContain("v_profile.shop_id is distinct from p_shop_id");
    expect(sql).toContain(
      "lower(coalesce(v_profile.role, '')) not in ('owner', 'admin')",
    );
    expect(sql).toContain("from auth.users");
    expect(sql).toContain("where id = p_auth_user_id");
  });

  it("requires exact completed acquisition evidence", async () => {
    const sql = await migration();

    expect(sql).toContain("v_intent.status <> 'completed'");
    expect(sql).toContain("v_intent.stripe_completion_event_id is null");
    expect(sql).toContain("v_intent.stripe_completion_created_at is null");
    expect(sql).toContain("v_intent.claimed_user_id is not null");
    expect(sql).toContain("v_intent.claimed_shop_id is not null");

    expect(sql).toContain(
      "v_intent.stripe_checkout_session_id is distinct from p_checkout_session_id",
    );
    expect(sql).toContain(
      "v_intent.stripe_customer_id is distinct from p_customer_id",
    );
    expect(sql).toContain(
      "v_intent.stripe_subscription_id is distinct from p_subscription_id",
    );
    expect(sql).toContain(
      "v_intent.stripe_price_id is distinct from p_stripe_price_id",
    );
  });

  it("uses compare-and-swap instead of overwriting newer billing state", async () => {
    const sql = await migration();

    expect(sql).toContain(
      "v_profile.stripe_checkout_session_id is distinct from p_expected_profile_checkout_session_id",
    );
    expect(sql).toContain(
      "v_profile.stripe_customer_id is distinct from p_expected_profile_customer_id",
    );
    expect(sql).toContain(
      "v_profile.stripe_subscription_id is distinct from p_expected_profile_subscription_id",
    );
    expect(sql).toContain(
      "v_shop.stripe_checkout_session_id is distinct from p_expected_shop_checkout_session_id",
    );
    expect(sql).toContain(
      "v_shop.stripe_customer_id is distinct from p_expected_shop_customer_id",
    );
    expect(sql).toContain(
      "v_shop.stripe_subscription_id is distinct from p_expected_shop_subscription_id",
    );
    expect(sql).toContain("'canonical_identity_changed'::text");
  });

  it("does not steal Stripe artifacts owned by another profile or shop", async () => {
    const sql = await migration();

    expect(sql).toContain("id <> p_profile_id");
    expect(sql).toContain("id <> p_shop_id");
    expect(sql).toContain(
      "'replacement_identity_owned_by_other_profile'::text",
    );
    expect(sql).toContain("'replacement_identity_owned_by_other_shop'::text");
  });

  it("allows an exact already-recovered retry but rejects another claimed intent", async () => {
    const sql = await migration();

    expect(sql).toContain("if v_intent.status = 'claimed' then");
    expect(sql).toContain(
      "v_intent.claimed_user_id is not distinct from p_auth_user_id",
    );
    expect(sql).toContain(
      "v_intent.claimed_shop_id is not distinct from p_shop_id",
    );
    expect(sql).toContain("'intent_consumed'::text");
  });
});
