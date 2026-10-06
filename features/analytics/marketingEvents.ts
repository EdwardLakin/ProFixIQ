export type MarketingEventName =
  | "marketing_trial_click"
  | "marketing_demo_click"
  | "marketing_subscribe_click"
  | "pricing_view"
  | "checkout_started"
  | "signup_completed"
  | "onboarding_completed";

export type MarketingEventPayload = {
  source?: string;
  destination?: string;
  packageKey?: string;
  interval?: "monthly" | "yearly";
  [key: string]: unknown;
};

export function trackMarketingEvent(
  event: MarketingEventName,
  payload: MarketingEventPayload = {},
): void {
  if (typeof window === "undefined") return;

  const detail = {
    event,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("profixiq-marketing-event", { detail }));

  const analyticsLayer = (
    window as Window & { dataLayer?: Array<Record<string, unknown>> }
  ).dataLayer;
  analyticsLayer?.push(detail);

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info("[profixiq-marketing-event]", detail);
  }
}
