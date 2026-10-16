import "server-only";

import webpush from "web-push";

import type { PushSender } from "@/features/notifications/server/pushDelivery";

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
  return async (subscription, payload) => {
    try {
      await webpush.sendNotification(subscription, payload, {
        vapidDetails: config,
        TTL: 60 * 60,
        urgency: "high",
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
