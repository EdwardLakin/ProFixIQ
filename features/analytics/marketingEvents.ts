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
  checkoutMode?: "trial" | "paid";
  checkoutAttemptId?: string;
};

const ACQUISITION_SOURCE_PATHS = new Set([
  "/",
  "/compare-plans",
  "/request-demo",
  "/repair-shop-management-software",
  "/heavy-duty-shop-management-software",
  "/diesel-repair-shop-software",
  "/heavy-duty-work-order-software",
  "/heavy-duty-inspection-software",
  "/compare/fullbay-alternative",
  "/compare/profixiq-vs-fullbay",
  "/fleet-repair-management-software",
  "/dvir-defect-tracking-software",
  "/fleet-preventive-maintenance-software",
  "/mobile-truck-repair-software",
  "/service-truck-work-order-software",
  "/heavy-equipment-repair-software",
  "/off-highway-equipment-repair-software",
  "/field-service",
  "/fleet-maintenance",
]);

const PUBLIC_PERSISTED_EVENT_NAMES = new Set<MarketingEventName>([
  "marketing_trial_click",
  "marketing_demo_click",
  "marketing_subscribe_click",
  "pricing_view",
]);

export function isAcquisitionMarketingPath(pathname: string): boolean {
  return ACQUISITION_SOURCE_PATHS.has(pathname);
}

function normalizePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value === "stripe_checkout") return value;
  try {
    return new URL(value, "https://profixiq.com").pathname;
  } catch {
    return undefined;
  }
}

function anonymousSessionId(): string | undefined {
  try {
    const key = "pfq-marketing-session-id";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    return undefined;
  }
}

function persistMarketingEvent(detail: Record<string, unknown>) {
  const body = JSON.stringify(detail);
  if (typeof navigator.sendBeacon === "function") {
    const payload = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/analytics/marketing-events", payload)) return;
  }

  void fetch("/api/analytics/marketing-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

export function trackMarketingEvent(
  event: MarketingEventName,
  payload: MarketingEventPayload = {},
): void {
  if (typeof window === "undefined") return;

  const detail = {
    event,
    source: normalizePath(payload.source),
    destination: normalizePath(payload.destination),
    packageKey: payload.packageKey,
    interval: payload.interval,
    checkoutMode: payload.checkoutMode,
    checkoutAttemptId: payload.checkoutAttemptId,
    anonymousSessionId: anonymousSessionId(),
    timestamp: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("profixiq-marketing-event", { detail }));

  const analyticsWindow = window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
  };
  const analyticsLayer = (analyticsWindow.dataLayer ??= []);
  analyticsLayer.push(detail);

  if (PUBLIC_PERSISTED_EVENT_NAMES.has(event)) {
    persistMarketingEvent(detail);
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info("[profixiq-marketing-event]", detail);
  }
}
