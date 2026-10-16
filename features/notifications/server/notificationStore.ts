import "server-only";

import { isSafeNotificationTargetPath } from "@/features/notifications/lib/pushContracts";
import type { NotificationAdmin } from "@/features/notifications/server/db";

export type CreateNotificationInput = {
  admin: NotificationAdmin;
  shopId: string;
  recipientUserId: string;
  eventType: string;
  /** Stable per logical event+recipient; repeats never create a second row. */
  dedupeKey: string;
  title: string;
  body?: string | null;
  targetPath: string;
  priority?: "normal" | "high";
  expiresAt?: string | null;
};

export type CreateNotificationResult =
  | { ok: true; id: string; created: boolean; pushQueued: number }
  | { ok: false; reason: "invalid" | "recipient_out_of_scope" | "error" };

/**
 * Producer entry point shared by every product. Verifies the recipient belongs
 * to the shop, inserts idempotently, and queues one push delivery per active
 * device subscription of that same user in that same shop.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<CreateNotificationResult> {
  if (
    !isSafeNotificationTargetPath(input.targetPath) ||
    input.dedupeKey.length < 8 ||
    input.dedupeKey.length > 300 ||
    !input.title.trim()
  ) {
    return { ok: false, reason: "invalid" };
  }
  const { admin } = input;

  const { data: recipient, error: recipientError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", input.recipientUserId)
    .eq("shop_id", input.shopId)
    .maybeSingle();
  if (recipientError) return { ok: false, reason: "error" };
  if (!recipient) return { ok: false, reason: "recipient_out_of_scope" };

  const row = {
    shop_id: input.shopId,
    recipient_user_id: input.recipientUserId,
    event_type: input.eventType,
    dedupe_key: input.dedupeKey,
    title: input.title.trim().slice(0, 200),
    body: input.body?.slice(0, 1000) ?? null,
    target_path: input.targetPath,
    priority: input.priority ?? "normal",
    expires_at: input.expiresAt ?? null,
  };

  const inserted = await admin
    .from("app_notifications")
    .upsert(row, { onConflict: "recipient_user_id,dedupe_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (inserted.error) return { ok: false, reason: "error" };

  let id: string | null = inserted.data?.id ?? null;
  const created = Boolean(id);
  if (!id) {
    const existing = await admin
      .from("app_notifications")
      .select("id")
      .eq("recipient_user_id", input.recipientUserId)
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle();
    if (existing.error || !existing.data) return { ok: false, reason: "error" };
    id = existing.data.id as string;
  }
  if (!created) return { ok: true, id, created: false, pushQueued: 0 };

  const { data: subs, error: subsError } = await admin
    .from("app_push_subscriptions")
    .select("id")
    .eq("shop_id", input.shopId)
    .eq("user_id", input.recipientUserId)
    .is("revoked_at", null);
  if (subsError) return { ok: true, id, created, pushQueued: 0 };

  const deliveries = ((subs ?? []) as Array<{ id: string }>).map((sub) => ({
    notification_id: id,
    subscription_id: sub.id,
  }));
  if (deliveries.length === 0) return { ok: true, id, created, pushQueued: 0 };

  const queued = await admin
    .from("app_notification_push_deliveries")
    .upsert(deliveries, {
      onConflict: "notification_id,subscription_id",
      ignoreDuplicates: true,
    });
  return { ok: true, id, created, pushQueued: queued.error ? 0 : deliveries.length };
}
