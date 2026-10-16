import "server-only";

import webpush from "web-push";

import type { PushSender } from "@/features/notifications/server/pushDelivery";

const PUSH_REQUEST_TIMEOUT_MS = 8_000;

export function readVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Standard Web Push (VAPID) over the browser's own push service; no provider. */
export function createWebPushSender(): PushSender | null {
  const config = readVapidConfig();
  if (!config) return null;
  return async (subscription, payload, options) => {
    try {
      await webpush.sendNotification(subscription, payload, {
        vapidDetails: config,
        TTL: options.ttlSeconds,
        urgency: options.urgency,
        // Bounded so one slow endpoint cannot stall the whole batch.
        timeout: PUSH_REQUEST_TIMEOUT_MS,
      });
      return { ok: true };
    } catch (error) {
      const statusCode =
        error && typeof error === "object" && "statusCode" in error &&
        typeof (error as { statusCode: unknown }).statusCode === "number"
          ? (error as { statusCode: number }).statusCode
          : null;
      return { ok: false, statusCode, code: statusCode ? `http_${statusCode}` : "network" };
    }
  };
}
