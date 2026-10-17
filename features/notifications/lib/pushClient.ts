"use client";

/** Browser-side Web Push helpers. Subscribing always follows a user gesture. */

export type PushSupportState =
  | "unsupported"
  | "ios_install_required"
  | "unconfigured"
  | "denied"
  | "off"
  /** Permission granted; Safari/iOS need a second, fresh tap to subscribe. */
  | "ready_to_finish"
  | "on";

export type PreparedPush = {
  publicKey: string;
  registration: ServiceWorkerRegistration;
};

export function isWebKitBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return isIosDevice() || (/Safari\//.test(ua) && !/Chrome|Chromium|Android|Edg\//.test(ua));
}

export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function pushApisAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

export async function readPushState(): Promise<PushSupportState> {
  // iOS only exposes Web Push to the installed Home Screen app.
  if (isIosDevice() && !isStandaloneApp()) return "ios_install_required";
  if (!pushApisAvailable()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await getRegistration();
  const existing = await registration?.pushManager.getSubscription();
  if (existing && Notification.permission === "granted") {
    // A local subscription must not mask a server-wide outage (VAPID missing).
    const config = await fetchPushConfig();
    if (config && !config.supported) return "unconfigured";
    return "on";
  }
  return "off";
}

async function fetchPushConfig(): Promise<{ supported: boolean; publicKey: string | null } | null> {
  try {
    const response = await fetch("/api/notifications/push/config", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { supported?: boolean; publicKey?: string | null };
    return { supported: Boolean(body.supported && body.publicKey), publicKey: body.publicKey ?? null };
  } catch {
    return null;
  }
}

/**
 * Loads everything subscribing needs ahead of the click, so the gesture handler
 * can call pushManager.subscribe() without awaiting network first (WebKit
 * rejects subscriptions that lose their user activation).
 */
export async function preparePush(): Promise<PreparedPush | "unconfigured" | null> {
  if (!pushApisAvailable()) return null;
  const config = await fetchPushConfig();
  if (!config) return null;
  if (!config.supported || !config.publicKey) return "unconfigured";
  const registration = await navigator.serviceWorker.ready;
  return { publicKey: config.publicKey, registration };
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/notifications/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("Could not save this device for notifications.");
}

/**
 * Must be called from a click handler (explicit user action). Pass the result of
 * preparePush() so no network await precedes subscribe(). On WebKit, answering
 * the permission prompt consumes the activation, so the subscription is
 * created on a second tap ("ready_to_finish").
 */
export async function enablePush(
  prepared: PreparedPush | "unconfigured" | null,
): Promise<PushSupportState> {
  if (isIosDevice() && !isStandaloneApp()) return "ios_install_required";
  if (!pushApisAvailable()) return "unsupported";
  if (prepared === "unconfigured") return "unconfigured";
  if (!prepared) throw new Error("Notifications are still loading. Try again in a moment.");

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "off";
    if (isWebKitBrowser()) return "ready_to_finish";
  }
  if (Notification.permission !== "granted") return "denied";

  const subscription =
    (await prepared.registration.pushManager.getSubscription()) ??
    (await prepared.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(prepared.publicKey) as BufferSource,
    }));
  await postSubscription(subscription);
  return "on";
}

export async function disablePush(): Promise<PushSupportState> {
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    // Revoke server-side first so a failed unsubscribe still stops delivery.
    await fetch("/api/notifications/push/subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  }
  return readPushState();
}

/** Re-associates an existing device subscription with the current session. */
export async function refreshExistingSubscription(): Promise<void> {
  if (!pushApisAvailable() || Notification.permission !== "granted") return;
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await postSubscription(subscription);
}

/** Local-only; safe after the session is gone. The push service then returns 410. */
export async function dropLocalSubscription(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe().catch(() => undefined);
}

/** Best-effort renewal after the browser rotated/expired the subscription. */
export async function renewSubscription(): Promise<void> {
  if (!pushApisAvailable() || Notification.permission !== "granted") return;
  const registration = await getRegistration();
  if (!registration) return;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return postSubscription(existing);
  const config = await fetchPushConfig();
  if (!config?.supported || !config.publicKey) return;
  const created = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource,
  });
  await postSubscription(created);
}
