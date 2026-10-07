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

  it("records checkout_started at the authoritative Stripe attachment boundary", () => {
    const pricing = source("features/shared/components/ui/PricingSection.tsx");
    const pricingPage = source("app/compare-plans/page.tsx");
    const migration = source(
      "supabase/migrations/20261007021000_create_marketing_events.sql",
    );

    expect(pricing).not.toContain('trackMarketingEvent("checkout_started"');
    expect(pricingPage).toContain('throw new Error(message)');
    expect(pricingPage).not.toContain('toast.error("Checkout failed"');
    expect(migration).toContain(
      "create or replace function public.attach_stripe_acquisition_checkout",
    );
    expect(migration).toContain("event_name = 'checkout_started'");
    expect(migration).toContain("'stripe_checkout'");
    expect(migration).toContain("v_request_key::uuid");
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
  });
});
