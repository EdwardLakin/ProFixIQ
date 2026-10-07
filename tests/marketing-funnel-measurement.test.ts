import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("marketing funnel measurement", () => {
  it("mounts the global acquisition bridge", () => {
    const layout = source("app/layout.tsx");
    expect(layout).toContain("MarketingEventBridge");
    expect(layout).toContain("<MarketingEventBridge />");
  });

  it("scopes CTA classification to known public acquisition source paths", () => {
    const bridge = source("features/analytics/MarketingEventBridge.tsx");
    const events = source("features/analytics/marketingEvents.ts");

    expect(bridge).toContain("isAcquisitionMarketingPath(window.location.pathname)");
    expect(bridge).toContain('pathname === "/request-demo"');
    expect(bridge).toContain('pathname === "/compare-plans"');
    expect(bridge).toContain('pathname === "/subscribe"');
    expect(bridge).toContain('trackMarketingEvent("pricing_view"');
    expect(events).toContain('"/compare/fullbay-alternative"');
    expect(events).toContain('"/mobile-truck-repair-software"');
    expect(bridge).not.toContain("anchor.textContent");
    expect(bridge).not.toContain('trackMarketingEvent("signup_completed"');
    expect(bridge).not.toContain('trackMarketingEvent("onboarding_completed"');
  });

  it("strips query strings and live Stripe checkout URLs from analytics", () => {
    const bridge = source("features/analytics/MarketingEventBridge.tsx");
    const events = source("features/analytics/marketingEvents.ts");
    const pricingPage = source("app/compare-plans/page.tsx");

    expect(bridge).toContain("new URL(href, window.location.origin).pathname");
    expect(events).toContain('if (value === "stripe_checkout") return value;');
    expect(pricingPage).not.toContain("destination: data.url");
  });

  it("keeps authenticated billing recovery out of acquisition pricing metrics", () => {
    const pricing = source("features/shared/components/ui/PricingSection.tsx");
    expect(pricing).toContain(
      "isAcquisitionMarketingPath(window.location.pathname)",
    );
    expect(pricing).toContain("if (isAcquisition)");
    expect(pricing).toContain('"marketing_trial_click"');
    expect(pricing).toContain('"marketing_subscribe_click"');
  });

  it("keeps outcome events out of the anonymous collector", () => {
    const events = source("features/analytics/marketingEvents.ts");
    const route = source("app/api/analytics/marketing-events/route.ts");

    expect(events).toContain("PUBLIC_PERSISTED_EVENT_NAMES");
    expect(events).not.toContain(
      'PUBLIC_PERSISTED_EVENT_NAMES = new Set<MarketingEventName>([\n  "checkout_started"',
    );
    expect(route).not.toContain('  "checkout_started",\n  "signup_completed"');
    expect(route).not.toContain('  "signup_completed",');
    expect(route).not.toContain('  "onboarding_completed",');
  });

  it("records a new checkout only after canonical Stripe attachment with the bare attempt UUID", () => {
    const checkout = source("app/api/stripe/checkout/route.ts");
    const helper = source("features/analytics/server/checkout-started.ts");

    expect(checkout).toContain("checkoutAttemptId: attemptId");
    expect(checkout).not.toContain("checkoutAttemptId: `acq:${attemptId}`");

    const createIndex = checkout.indexOf(
      "const session = await stripe.checkout.sessions.create(",
    );
    const attachIndex = checkout.indexOf(
      "await attachStripeAcquisitionCheckout({",
      createIndex,
    );
    const recordIndex = checkout.indexOf(
      "await recordCheckoutStarted();",
      attachIndex,
    );

    expect(createIndex).toBeGreaterThan(-1);
    expect(attachIndex).toBeGreaterThan(createIndex);
    expect(recordIndex).toBeGreaterThan(attachIndex);
    expect(helper).toContain('.from("marketing_events").insert({');
    expect(helper).toContain('event_name: "checkout_started"');
    expect(helper).toContain('destination: "stripe_checkout"');
    expect(helper).toContain("checkout_attempt_id: input.checkoutAttemptId");
  });

  it("reconciles attached checkout_started before intent expiry can short-circuit", () => {
    const checkout = source("app/api/stripe/checkout/route.ts");
    const retryStart = checkout.indexOf("if (intent.checkoutSessionId) {");
    const retryEnd = checkout.indexOf("const metadata = acquisitionMetadata", retryStart);
    const retryBlock = checkout.slice(retryStart, retryEnd);
    const recordIndex = retryBlock.indexOf("await recordCheckoutStarted();");
    const firstStatusIndex = retryBlock.indexOf('intent.status === "expired"');
    const retrieveIndex = retryBlock.indexOf(
      "await stripe.checkout.sessions.retrieve(",
    );
    const openIndex = retryBlock.indexOf('existing.status === "open"');
    const completeIndex = retryBlock.indexOf('existing.status === "complete"');
    const inactiveIndex = retryBlock.indexOf(
      "Checkout attempt is no longer active",
    );
    const secondStatusIndex = retryBlock.indexOf(
      'intent.status === "expired"',
      firstStatusIndex + 1,
    );
    const retryRecords = retryBlock.match(/await recordCheckoutStarted\(\);/g) ?? [];

    expect(retryStart).toBeGreaterThan(-1);
    expect(retryEnd).toBeGreaterThan(retryStart);
    expect(recordIndex).toBeGreaterThan(-1);
    expect(firstStatusIndex).toBeGreaterThan(recordIndex);
    expect(retrieveIndex).toBeGreaterThan(firstStatusIndex);
    expect(openIndex).toBeGreaterThan(retrieveIndex);
    expect(completeIndex).toBeGreaterThan(retrieveIndex);
    expect(inactiveIndex).toBeGreaterThan(retrieveIndex);
    expect(secondStatusIndex).toBeGreaterThan(inactiveIndex);
    expect(retryRecords).toHaveLength(1);
  });

  it("strictly bounds checkout analytics persistence latency", () => {
    const helper = source("features/analytics/server/checkout-started.ts");

    expect(helper).toContain("MARKETING_PERSISTENCE_TIMEOUT_MS = 250");
    expect(helper).toContain("Promise.race([");
    expect(helper).toContain("setTimeout(");
    expect(helper).toContain("marketing_checkout_started_persistence_timed_out");
  });

  it("makes duplicate checkout_started attempts idempotent", () => {
    const migration = source(
      "supabase/migrations/20261007021000_create_marketing_events.sql",
    );
    const helper = source("features/analytics/server/checkout-started.ts");

    expect(migration).toContain(
      "create unique index if not exists marketing_events_checkout_started_attempt_uidx",
    );
    expect(migration).toContain("on public.marketing_events (checkout_attempt_id)");
    expect(migration).toContain("where event_name = 'checkout_started'");
    expect(migration).toContain("and checkout_attempt_id is not null");
    expect(helper).toContain('error.code === "23505"');
  });

  it("does not let failed Stripe create or attachment paths record checkout_started", () => {
    const checkout = source("app/api/stripe/checkout/route.ts");
    const retryEnd = checkout.indexOf("const metadata = acquisitionMetadata");
    const ownerStart = checkout.indexOf(
      "const access = await requireShopScopedApiAccess",
      retryEnd,
    );
    const newCheckoutBlock = checkout.slice(retryEnd, ownerStart);

    const createIndex = newCheckoutBlock.indexOf(
      "const session = await stripe.checkout.sessions.create(",
    );
    const attachIndex = newCheckoutBlock.indexOf(
      "await attachStripeAcquisitionCheckout({",
    );
    const recordIndex = newCheckoutBlock.indexOf(
      "await recordCheckoutStarted();",
    );

    expect(createIndex).toBeGreaterThan(-1);
    expect(attachIndex).toBeGreaterThan(createIndex);
    expect(recordIndex).toBeGreaterThan(attachIndex);
    expect(
      newCheckoutBlock.match(/await recordCheckoutStarted\(\);/g) ?? [],
    ).toHaveLength(1);
  });

  it("keeps the canonical Stripe acquisition RPC unchanged by analytics", () => {
    const analyticsMigration = source(
      "supabase/migrations/20261007021000_create_marketing_events.sql",
    );
    const canonicalStripeMigration = source(
      "supabase/migrations/20260725171300_harden_p0_006_stripe_identity.sql",
    );

    expect(analyticsMigration).not.toContain("attach_stripe_acquisition_checkout");
    expect(canonicalStripeMigration).toContain(
      "create or replace function public.attach_stripe_acquisition_checkout",
    );
  });

  it("includes marketing_events in the generated Supabase contract", () => {
    const types = source("features/shared/types/types/supabase.ts");
    expect(types).toContain("marketing_events: {");
    expect(types).toContain("checkout_attempt_id: string | null");
    expect(types).toContain("anonymous_session_id: string | null");
  });

  it("bounds and rate-limits the first-party public collector", () => {
    const route = source("app/api/analytics/marketing-events/route.ts");

    expect(route).toContain("readBoundedJson(request, REQUEST_MAX_BYTES)");
    expect(route).toContain("enforcePublicRouteRateLimit({");
    expect(route).toContain('route: "marketing-events"');
    expect(route).not.toContain("request.json()");
  });

  it("persists sanitized intent events through the first-party collector", () => {
    const events = source("features/analytics/marketingEvents.ts");
    const route = source("app/api/analytics/marketing-events/route.ts");
    const migration = source(
      "supabase/migrations/20261007021000_create_marketing_events.sql",
    );

    expect(events).toContain('navigator.sendBeacon("/api/analytics/marketing-events"');
    expect(events).toContain('fetch("/api/analytics/marketing-events"');
    expect(route).toContain('.from("marketing_events").insert({');
    expect(route).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(migration).toContain("create table if not exists public.marketing_events");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "revoke all on table public.marketing_events from anon, authenticated",
    );
    expect(migration).toContain(
      "grant insert on table public.marketing_events to service_role",
    );
  });
});
