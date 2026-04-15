export type ShopBoostEventName =
  | "preview_opened"
  | "preview_resumed"
  | "cta_clicked"
  | "activation_started"
  | "signup_completed"
  | "import_started"
  | "import_completed";

export type ShopBoostEventPayload = {
  demoId: string;
  intakeId?: string;
  readiness?: "READY" | "REVIEW_REQUIRED" | "BLOCKED";
  confidence?: number;
  source?: string;
  [key: string]: unknown;
};

export function trackShopBoostEvent(event: ShopBoostEventName, payload: ShopBoostEventPayload): void {
  if (typeof window === "undefined") return;

  const detail = {
    event,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("shop-boost-event", { detail }));

  const analyticsLayer = (window as Window & { dataLayer?: Array<Record<string, unknown>> }).dataLayer;
  analyticsLayer?.push(detail);

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info("[shop-boost-event]", detail);
  }
}
