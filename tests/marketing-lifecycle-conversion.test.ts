import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const migrationPath =
  "supabase/migrations/20261007204500_marketing_lifecycle_conversion.sql";

describe("marketing lifecycle conversion", () => {
  it("captures signup only for auth users created after the acquisition began", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("private.capture_marketing_signup_completed()");
    expect(migration).toContain("from auth.users as u");
    expect(migration).toContain("v_user_created_at < new.created_at");
    expect(migration).toContain("'signup_completed'");
    expect(migration).toContain("after update of status, claimed_user_id");
  });

  it("uses guided session completion as the onboarding success boundary", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("private.capture_marketing_onboarding_completed()");
    expect(migration).toContain("new.status <> 'completed'");
    expect(migration).toContain("old.status = 'completed'");
    expect(migration).toContain("on public.guided_onboarding_sessions");
    expect(migration).toContain("'onboarding_completed'");
  });

  it("correlates lifecycle rows through the anonymous checkout attempt only", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("v_attempt_id := substring(new.request_key from 5)::uuid");
    expect(migration).toContain("v_attempt_id := substring(v_request_key from 5)::uuid");
    expect(migration).toContain("me.event_name = 'checkout_started'");
    expect(migration).toContain("me.checkout_attempt_id = v_attempt_id");
  });

  it("is idempotent and cannot break signup or onboarding on analytics failure", () => {
    const migration = source(migrationPath);

    expect(migration).toContain("marketing_events_lifecycle_attempt_uidx");
    expect(migration.match(/on conflict do nothing/g)).toHaveLength(2);
    expect(migration.match(/exception\n  when others then/g)).toHaveLength(2);
    expect(migration).toContain("return new;");
  });

  it("extends Ops reporting through a new service-role-only single-snapshot wrapper", () => {
    const migration = source(migrationPath);
    const reader = source("features/ops/server/get-marketing-funnel.ts");

    expect(migration).toContain(
      "create or replace function public.get_ops_marketing_lifecycle_funnel_snapshot(",
    );
    expect(migration).toContain("select public.get_ops_marketing_funnel_snapshot(");
    expect(migration).toContain("'signupCompleted', l.signup_completed");
    expect(migration).toContain("'onboardingCompleted', l.onboarding_completed");
    expect(migration).toContain(
      "grant execute on function public.get_ops_marketing_lifecycle_funnel_snapshot(timestamptz, integer)",
    );
    expect(reader).toContain('admin.rpc("get_ops_marketing_lifecycle_funnel_snapshot"');
  });

  it("shows checkout to signup and signup to onboarding progression in Ops", () => {
    const reader = source("features/ops/server/get-marketing-funnel.ts");
    const component = source("features/ops/components/OpsMarketingFunnel.tsx");

    expect(reader).toContain("checkoutToSignupPct");
    expect(reader).toContain("signupToOnboardingPct");
    expect(reader).toContain('row.event_name === "signup_completed"');
    expect(reader).toContain('row.event_name === "onboarding_completed"');
    expect(component).toContain("Checkout → signup");
    expect(component).toContain("Signup → onboarding");
    expect(component).toContain("Onboarding completed");
  });

  it("keeps the generated Supabase lifecycle snapshot contract in sync", () => {
    const generated = source("features/shared/types/types/supabase.ts");

    expect(generated).toContain("get_ops_marketing_lifecycle_funnel_snapshot: {");
    expect(generated).toContain("p_breakdown_limit: number");
    expect(generated).toContain("p_since: string");
  });
});
