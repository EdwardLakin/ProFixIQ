import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const migration = read(
  "supabase/migrations/20261007204500_marketing_lifecycle_conversion.sql",
);
const linkUserRoute = read(
  "features/stripe/api/stripe/checkout/link-user/route.ts",
);
const guidedServer = read("features/onboarding-v2/guided/server.ts");
const instantHandoff = read(
  "features/onboarding-v2/guided/instantAnalysisHandoff.ts",
);
const lifecycleHelper = read(
  "features/analytics/server/lifecycle-conversion.ts",
);
const opsServer = read("features/ops/server/get-marketing-funnel.ts");
const runtimeFixture = read(
  "tests/security/marketing-lifecycle-conversion.runtime.sql",
);
const cleanReplay = read(".github/workflows/supabase-clean-replay-audit.yml");

describe("marketing lifecycle conversion", () => {
  it("uses additive service-role adapters instead of shared-table triggers", () => {
    expect(migration).toContain(
      "create or replace function public.record_marketing_signup_completed(",
    );
    expect(migration).toContain(
      "create or replace function public.record_marketing_onboarding_completed(",
    );
    expect(migration).not.toContain("create trigger capture_marketing_signup_completed");
    expect(migration).not.toContain(
      "create trigger capture_marketing_onboarding_completed",
    );
    expect(migration).toContain(
      "grant execute on function public.record_marketing_signup_completed(uuid, uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.record_marketing_onboarding_completed(uuid, uuid)",
    );
    expect(migration).toContain("to service_role");
  });

  it("counts signup only for a new auth identity on the claimed acquisition", () => {
    expect(migration).toContain("i.claimed_user_id = p_user_id");
    expect(migration).toContain("v_user_created_at < v_intent.created_at");
    expect(migration).toContain("me.event_name = 'checkout_started'");
    expect(migration).toContain("'signup_completed'");
    expect(linkUserRoute).toContain("recordMarketingSignupCompleted({");
    expect(linkUserRoute).toContain("intentId: metadata.intentId");
  });

  it("requires signup before onboarding and avoids mutable billing-session correlation", () => {
    expect(migration).toContain("i.claimed_shop_id = p_shop_id");
    expect(migration).toContain("i.claimed_user_id = v_session.created_by");
    expect(migration).toContain("me.event_name = 'signup_completed'");
    expect(migration).not.toContain("s.stripe_checkout_session_id");
    expect(guidedServer).toContain("recordMarketingOnboardingCompleted({");
    expect(instantHandoff).toContain("recordMarketingOnboardingCompleted({");
  });

  it("keeps lifecycle analytics idempotent, anonymous, and fail-open", () => {
    expect(migration).toContain("marketing_events_lifecycle_attempt_uidx");
    expect(migration).toContain("on conflict do nothing");
    expect(migration).not.toMatch(/insert into public\.marketing_events[\s\S]*?(user_id|shop_id)/i);
    expect(lifecycleHelper).toContain("LIFECYCLE_ANALYTICS_TIMEOUT_MS = 250");
    expect(lifecycleHelper).toContain("return false;");
    expect(lifecycleHelper).toContain("catch (error)");
  });

  it("extends Ops through one service-role lifecycle snapshot RPC", () => {
    expect(migration).toContain(
      "create or replace function public.get_ops_marketing_lifecycle_funnel_snapshot(",
    );
    expect(opsServer).toMatch(
      /admin\.rpc\(\s*"get_ops_marketing_lifecycle_funnel_snapshot"/,
    );
    expect(opsServer).toContain("checkoutToSignupPct");
    expect(opsServer).toContain("signupToOnboardingPct");
  });

  it("runs lifecycle behavior against the replayed database", () => {
    expect(runtimeFixture).toContain("record_marketing_signup_completed");
    expect(runtimeFixture).toContain("record_marketing_onboarding_completed");
    expect(runtimeFixture).toContain("existing-account acquisition emitted signup_completed");
    expect(runtimeFixture).toContain("billing-session replacement broke durable onboarding correlation");
    expect(cleanReplay).toContain(
      "tests/security/marketing-lifecycle-conversion.runtime.sql",
    );
  });
});
