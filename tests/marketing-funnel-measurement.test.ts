import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("marketing funnel measurement", () => {
  it("mounts the global acquisition bridge", () => {
    const layout = source("app/layout.tsx");
    expect(layout).toContain("MarketingEventBridge");
    expect(layout).toContain("<MarketingEventBridge />");
  });

  it("tracks public CTA clicks and pricing views without broad page-view aliases", () => {
    const bridge = source("features/analytics/MarketingEventBridge.tsx");
    expect(bridge).toContain('normalized === "/request-demo"');
    expect(bridge).toContain('normalized === "/compare-plans"');
    expect(bridge).toContain('normalized === "/subscribe"');
    expect(bridge).toContain('trackMarketingEvent("pricing_view"');
    expect(bridge).not.toContain('trackMarketingEvent("signup_completed"');
    expect(bridge).not.toContain('trackMarketingEvent("onboarding_completed"');
  });

  it("tracks trial and paid CTA intent with checkout attribution", () => {
    const pricing = source("features/shared/components/ui/PricingSection.tsx");
    expect(pricing).toContain('"marketing_trial_click"');
    expect(pricing).toContain('"marketing_subscribe_click"');
    expect(pricing).toContain("packageKey");
    expect(pricing).toContain("checkoutAttemptId");
  });

  it("counts checkout_started only after Stripe returns a checkout URL", () => {
    const pricingPage = source("app/compare-plans/page.tsx");
    const successBlock = pricingPage.indexOf("if (data?.url)");
    const checkoutEvent = pricingPage.indexOf(
      'trackMarketingEvent("checkout_started"',
    );
    const redirect = pricingPage.indexOf("window.location.href = data.url");

    expect(successBlock).toBeGreaterThan(-1);
    expect(checkoutEvent).toBeGreaterThan(successBlock);
    expect(redirect).toBeGreaterThan(checkoutEvent);
  });

  it("buffers events even when an analytics provider has not loaded yet", () => {
    const events = source("features/analytics/marketingEvents.ts");
    expect(events).toContain("analyticsWindow.dataLayer ??= []");
    expect(events).toContain("analyticsLayer.push(detail)");
  });
});
