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

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
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
};

/**
 * Sends due deliveries. Each delivery is re-validated against current state so
 * a reassigned/removed user, revoked device, acknowledged or expired
 * notification never produces a push.
 */
export async function processPushDeliveries(input: {
  admin: NotificationAdmin;
  send: PushSender;
  now?: Date;
  limit?: number;
}): Promise<PushRunSummary> {
  const { admin, send } = input;
  const now = input.now ?? new Date();
  const summary: PushRunSummary = {
    claimed: 0, sent: 0, retried: 0, failed: 0, expired: 0, suppressed: 0,
  };

  const claim = await admin.rpc("claim_app_push_deliveries", {
    p_limit: input.limit ?? 50,
    p_lease_seconds: 120,
  });
  if (claim.error) throw new Error(`claim failed: ${claim.error.message}`);
  const deliveries = (claim.data ?? []) as Delivery[];
  summary.claimed = deliveries.length;

  const finish = (id: string, patch: Record<string, unknown>) =>
    admin.from("app_notification_push_deliveries").update(patch).eq("id", id);

  for (const delivery of deliveries) {
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
    const notification = notificationRes.data;
    const subscription = subscriptionRes.data;

    const suppressed =
      !notification ||
      !subscription ||
      subscription.revoked_at !== null ||
      subscription.shop_id !== notification.shop_id ||
      subscription.user_id !== notification.recipient_user_id ||
      notification.acknowledged_at !== null ||
      (notification.expires_at && Date.parse(notification.expires_at) <= now.getTime()) ||
      (subscription.expires_at && Date.parse(subscription.expires_at) <= now.getTime());
    if (suppressed) {
      await finish(delivery.id, { status: "suppressed" });
      summary.suppressed += 1;
      continue;
    }

    let result: PushSendResult;
    try {
      result = await send(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
        },
        JSON.stringify(buildPushPayload(notification)),
      );
    } catch {
      result = { ok: false, statusCode: null, code: "send_exception" };
    }

    if (result.ok) {
      await finish(delivery.id, { status: "sent", sent_at: now.toISOString(), last_error_code: null });
      await admin
        .from("app_push_subscriptions")
        .update({ consecutive_failures: 0 })
        .eq("id", subscription.id);
      summary.sent += 1;
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
      continue;
    }

    const delay = kind === "transient" ? nextRetryDelaySeconds(delivery.attempts) : null;
    if (delay === null) {
      await finish(delivery.id, { status: "failed", last_error_code: result.code });
      summary.failed += 1;
    } else {
      await finish(delivery.id, {
        status: "pending",
        next_attempt_at: new Date(now.getTime() + delay * 1000).toISOString(),
        last_error_code: result.code,
      });
      summary.retried += 1;
    }
  }
  return summary;
}
