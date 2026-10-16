"use client";

/** Browser-side Web Push helpers. Subscribing always follows a user gesture. */

export type PushSupportState =
  | "unsupported"
  | "ios_install_required"
  | "unconfigured"
  | "denied"
  | "off"
  | "on";

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
  if (existing && Notification.permission === "granted") return "on";
  return "off";
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/notifications/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error("Could not save this device for notifications.");
}

/** Must be called from a click handler (explicit user action). */
export async function enablePush(): Promise<PushSupportState> {
  if (isIosDevice() && !isStandaloneApp()) return "ios_install_required";
  if (!pushApisAvailable()) return "unsupported";

  const configResponse = await fetch("/api/notifications/push/config", { cache: "no-store" });
  const config = (await configResponse.json().catch(() => null)) as
    | { supported?: boolean; publicKey?: string | null }
    | null;
  if (!configResponse.ok || !config?.supported || !config.publicKey) return "unconfigured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource,
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
