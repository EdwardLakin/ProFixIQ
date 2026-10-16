import "server-only";

import {
  buildPushPayload,
  classifyPushFailure,
  nextRetryDelaySeconds,
} from "@/features/notifications/lib/pushContracts";
import type { NotificationAdmin } from "@/features/notifications/server/db";

export type PushSendResult =
  | { ok: true }
  | { ok: false; statusCode: number | null; code: string };

export type PushSendOptions = {
  /** Web Push urgency derived from the notification priority. */
  urgency: "normal" | "high";
  /** Push-service retention; never longer than the notification's remaining life. */
  ttlSeconds: number;
};

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: PushSendOptions,
) => Promise<PushSendResult>;

type Delivery = {
  id: string;
  notification_id: string;
  subscription_id: string;
  attempts: number;
};

export type PushRunSummary = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  expired: number;
  suppressed: number;
  /** Accepted by the push service but the status write failed (may re-send). */
  persistFailures: number;
  /** Claimed but returned to the queue because the run budget was spent. */
  released: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60;
/** Stay inside the claim lease (120s) so leases do not expire mid-run. */
const RUN_BUDGET_MS = 90_000;
const TRANSIENT_READ_RETRY_SECONDS = 60;

/**
 * Sends due deliveries. Each delivery is re-validated against current state so
 * a reassigned/removed user, a user who left the shop, a revoked device, or an
 * acknowledged/expired notification never produces a push. Read failures are
 * retried, never treated as "suppressed".
 */
export async function processPushDeliveries(input: {
  admin: NotificationAdmin;
  send: PushSender;
  now?: Date;
  limit?: number;
  runBudgetMs?: number;
}): Promise<PushRunSummary> {
  const { admin, send } = input;
  const now = input.now ?? new Date();
  const startedAt = Date.now();
  const budget = input.runBudgetMs ?? RUN_BUDGET_MS;
  const summary: PushRunSummary = {
    claimed: 0, sent: 0, retried: 0, failed: 0, expired: 0, suppressed: 0,
    persistFailures: 0, released: 0,
  };

  const claim = await admin.rpc("claim_app_push_deliveries", {
    p_limit: input.limit ?? 25,
    p_lease_seconds: 120,
  });
  if (claim.error) throw new Error(`claim failed: ${claim.error.message}`);
  const deliveries = (claim.data ?? []) as Delivery[];
  summary.claimed = deliveries.length;

  /** Writes a delivery status, retrying briefly; returns whether it persisted. */
  const finish = async (id: string, patch: Record<string, unknown>): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await admin
        .from("app_notification_push_deliveries")
        .update(patch)
        .eq("id", id);
      if (!error) return true;
    }
    return false;
  };

  const retryLater = async (delivery: Delivery, code: string, seconds: number) => {
    const delay = nextRetryDelaySeconds(delivery.attempts);
    if (delay === null) {
      await finish(delivery.id, { status: "failed", last_error_code: code });
      summary.failed += 1;
      return;
    }
    await finish(delivery.id, {
      status: "pending",
      next_attempt_at: new Date(now.getTime() + Math.max(seconds, delay) * 1000).toISOString(),
      last_error_code: code,
    });
    summary.retried += 1;
  };

  for (const delivery of deliveries) {
    if (Date.now() - startedAt > budget) {
      // Return unprocessed leases to the queue without burning an attempt.
      await finish(delivery.id, {
        status: "pending",
        attempts: Math.max(0, delivery.attempts - 1),
        next_attempt_at: now.toISOString(),
      });
      summary.released += 1;
      continue;
    }

    const [notificationRes, subscriptionRes] = await Promise.all([
      admin
        .from("app_notifications")
        .select("id, shop_id, recipient_user_id, target_path, priority, expires_at, acknowledged_at")
        .eq("id", delivery.notification_id)
        .maybeSingle(),
      admin
        .from("app_push_subscriptions")
        .select("id, shop_id, user_id, endpoint, p256dh, auth_secret, revoked_at, expires_at")
        .eq("id", delivery.subscription_id)
        .maybeSingle(),
    ]);
    if (notificationRes.error || subscriptionRes.error) {
      await retryLater(delivery, "state_read_failed", TRANSIENT_READ_RETRY_SECONDS);
      continue;
    }
    const notification = notificationRes.data;
    const subscription = subscriptionRes.data;

    const staleSnapshot =
      !notification ||
      !subscription ||
      subscription.revoked_at !== null ||
      subscription.shop_id !== notification.shop_id ||
      subscription.user_id !== notification.recipient_user_id ||
      notification.acknowledged_at !== null ||
      (notification.expires_at && Date.parse(notification.expires_at) <= now.getTime()) ||
      (subscription.expires_at && Date.parse(subscription.expires_at) <= now.getTime());
    if (staleSnapshot || !notification || !subscription) {
      await finish(delivery.id, { status: "suppressed" });
      summary.suppressed += 1;
      continue;
    }

    // The snapshots can both predate a transfer; check live membership.
    const membership = await admin
      .from("profiles")
      .select("id")
      .eq("id", notification.recipient_user_id)
      .eq("shop_id", notification.shop_id)
      .maybeSingle();
    if (membership.error) {
      await retryLater(delivery, "membership_read_failed", TRANSIENT_READ_RETRY_SECONDS);
      continue;
    }
    if (!membership.data) {
      await admin
        .from("app_push_subscriptions")
        .update({ revoked_at: now.toISOString(), revoked_reason: "recipient_left_shop" })
        .eq("id", subscription.id)
        .is("revoked_at", null);
      await finish(delivery.id, { status: "suppressed", last_error_code: "recipient_left_shop" });
      summary.suppressed += 1;
      continue;
    }

    const remainingSeconds = notification.expires_at
      ? Math.floor((Date.parse(notification.expires_at) - now.getTime()) / 1000)
      : DEFAULT_TTL_SECONDS;

    let result: PushSendResult;
    try {
      result = await send(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
        },
        JSON.stringify(buildPushPayload(notification)),
        {
          urgency: notification.priority === "high" ? "high" : "normal",
          ttlSeconds: Math.max(1, Math.min(DEFAULT_TTL_SECONDS, remainingSeconds)),
        },
      );
    } catch {
      result = { ok: false, statusCode: null, code: "send_exception" };
    }

    if (result.ok) {
      const persisted = await finish(delivery.id, {
        status: "sent",
        sent_at: now.toISOString(),
        last_error_code: null,
      });
      if (!persisted) {
        // The push service already accepted it; the lease will expire and this
        // may re-send once. Surface it loudly rather than count a clean success.
        summary.persistFailures += 1;
        console.error("[push-delivery] sent but could not persist status", delivery.id);
      } else {
        summary.sent += 1;
      }
      await admin
        .from("app_push_subscriptions")
        .update({ consecutive_failures: 0 })
        .eq("id", subscription.id);
      continue;
    }

    const kind = classifyPushFailure(result.statusCode);
    if (kind === "gone") {
      await admin
        .from("app_push_subscriptions")
        .update({ revoked_at: now.toISOString(), revoked_reason: "push_service_gone" })
        .eq("id", subscription.id)
        .is("revoked_at", null);
      await finish(delivery.id, { status: "expired", last_error_code: result.code });
      summary.expired += 1;
    } else if (kind === "transient") {
      await retryLater(delivery, result.code, 0);
    } else {
      await finish(delivery.id, { status: "failed", last_error_code: result.code });
      summary.failed += 1;
    }
  }
  return summary;
}
