import "server-only";

import { hasAnyRole, ROLE_GROUPS } from "@/features/shared/lib/rbac";
import {
  getOpsNotifications,
  type OpsNotification,
} from "@/features/agent/server/getOpsNotifications";
import { getShopLocalDayWindow } from "@/features/shared/lib/utils/shopDayWindow";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

/**
 * Phase 7 of the dashboard assistant plan: proactive conversation delivery.
 * Once a day, in each shop's own local morning, deliver a digest of the
 * shop's current ops notifications into every eligible staff member's
 * existing durable shop-assistant thread — the same conversation surface
 * `app/api/shop-assistant/*` chat already reads and writes — instead of
 * requiring them to ask for it.
 *
 * Purely informational and additive: this creates or appends to a thread
 * exactly the way a live chat turn would (shop_assistant_threads /
 * shop_assistant_messages, unchanged schema), and never mutates a work
 * order, approval, invoice, or notification itself. Delivery is idempotent
 * per shop-local day (a unique index on (thread_id, client_message_id)
 * already backs every other assistant message write), so an hourly sweep
 * that keeps finding itself inside the morning window is safe to re-run.
 */

const MORNING_WINDOW_START_HOUR = 6;
const MORNING_WINDOW_END_HOUR = 10;
const DIGEST_MESSAGE_KIND = "state_update" as const;
const MAX_DIGEST_ITEMS = 6;
const DIGEST_SOURCE = "daily_assistant_digest" as const;

export type DailyAssistantDigestSummary = {
  shopId: string;
  inMorningWindow: boolean;
  eligibleStaff: number;
  delivered: number;
  alreadyDelivered: number;
  errors: string[];
};

function levelRank(level: OpsNotification["level"]): number {
  return level === "urgent" ? 3 : level === "warning" ? 2 : 1;
}

/**
 * Formats the digest a person actually reads. Returns null when there is
 * nothing worth surfacing, so a quiet shop does not get a daily "all clear"
 * message cluttering their thread.
 */
export function buildDailyDigestMessage(
  localDayKey: string,
  notifications: OpsNotification[],
): string | null {
  if (notifications.length === 0) return null;

  const sorted = [...notifications].sort(
    (a, b) => levelRank(b.level) - levelRank(a.level),
  );
  const urgentCount = sorted.filter((item) => item.level === "urgent").length;
  const warningCount = sorted.filter((item) => item.level === "warning").length;

  const lines = [
    `Good morning — here's the ${localDayKey} shop digest.`,
    "",
    `${sorted.length} item(s) need attention (${urgentCount} urgent, ${warningCount} warning).`,
  ];

  for (const item of sorted.slice(0, MAX_DIGEST_ITEMS)) {
    lines.push(`• ${item.title}: ${item.message}`);
  }
  if (sorted.length > MAX_DIGEST_ITEMS) {
    lines.push(`…and ${sorted.length - MAX_DIGEST_ITEMS} more on the dashboard.`);
  }

  return lines.join("\n");
}

async function findOrCreateAssistantThread(
  admin: ReturnType<typeof createAdminSupabase>,
  shopId: string,
  userId: string,
): Promise<string> {
  const { data: existing, error } = await admin
    .from("shop_assistant_threads")
    .select("id")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load assistant thread: ${error.message}`);
  if (existing) return existing.id;

  const { data: created, error: createError } = await admin
    .from("shop_assistant_threads")
    .insert({ shop_id: shopId, user_id: userId })
    .select("id")
    .single();
  if (createError || !created) {
    throw new Error(
      `Could not create assistant thread: ${createError?.message ?? "no thread id returned"}`,
    );
  }
  return created.id;
}

/**
 * Delivers the digest into one staff member's thread. Idempotent per
 * shop-local day via the same (thread_id, client_message_id) unique index
 * every other assistant message write already relies on: a conflicting
 * insert means today's digest already exists in that thread, not an error.
 */
async function deliverDigestToStaffMember(
  admin: ReturnType<typeof createAdminSupabase>,
  shopId: string,
  userId: string,
  localDayKey: string,
  content: string,
): Promise<"delivered" | "already_delivered"> {
  const threadId = await findOrCreateAssistantThread(admin, shopId, userId);

  const { data, error } = await admin
    .from("shop_assistant_messages")
    .insert({
      thread_id: threadId,
      shop_id: shopId,
      user_id: null,
      role: "assistant",
      kind: DIGEST_MESSAGE_KIND,
      content,
      payload: { source: DIGEST_SOURCE, localDayKey },
      client_message_id: `daily-digest:${localDayKey}`,
    })
    .select("id")
    .maybeSingle();

  if (!error && data) return "delivered";
  if (error?.code !== "23505") {
    throw new Error(`Could not deliver daily digest: ${error?.message ?? "unknown error"}`);
  }
  return "already_delivered";
}

/**
 * Sweeps one shop: only actually delivers while it is currently morning in
 * the shop's own timezone, so an hourly cron converges on "once per
 * shop-local day" without needing per-shop scheduling.
 */
export async function deliverDailyAssistantDigest(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  now?: Date;
}): Promise<DailyAssistantDigestSummary> {
  const { admin, shopId } = input;
  const now = input.now ?? new Date();
  const empty = (inMorningWindow: boolean, errors: string[] = []): DailyAssistantDigestSummary => ({
    shopId,
    inMorningWindow,
    eligibleStaff: 0,
    delivered: 0,
    alreadyDelivered: 0,
    errors,
  });

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("timezone")
    .eq("id", shopId)
    .maybeSingle();
  if (shopError) return empty(false, [shopError.message]);

  const window = getShopLocalDayWindow(shop?.timezone ?? null, now);
  const hoursSinceMidnight = (now.getTime() - window.dayStartMs) / (1000 * 60 * 60);
  const inMorningWindow =
    hoursSinceMidnight >= MORNING_WINDOW_START_HOUR &&
    hoursSinceMidnight < MORNING_WINDOW_END_HOUR;
  if (!inMorningWindow) return empty(false);

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, user_id, role")
    .eq("shop_id", shopId);
  if (profilesError) return empty(true, [profilesError.message]);

  // Shop-wide operator roles only — mirrors the shop-wide (not user-scoped)
  // notification set this digest is built from. Mechanics already get a
  // narrower, assignment-scoped notification view; handing them this
  // shop-wide digest would over-expose work that isn't theirs.
  const eligible = (profiles ?? [])
    .filter((profile) => hasAnyRole(profile.role, ROLE_GROUPS.shopWideOperators))
    .map((profile) => ({ authUserId: profile.user_id ?? profile.id }));

  if (eligible.length === 0) return { ...empty(true), eligibleStaff: 0 };

  const notifications = await getOpsNotifications(shopId, admin);
  const content = buildDailyDigestMessage(window.localDayKey, notifications);
  if (!content) {
    return { ...empty(true), eligibleStaff: eligible.length };
  }

  let delivered = 0;
  let alreadyDelivered = 0;
  const errors: string[] = [];

  for (const { authUserId } of eligible) {
    try {
      const outcome = await deliverDigestToStaffMember(
        admin,
        shopId,
        authUserId,
        window.localDayKey,
        content,
      );
      if (outcome === "delivered") delivered += 1;
      else alreadyDelivered += 1;
    } catch (error) {
      errors.push(
        `staff ${authUserId}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return {
    shopId,
    inMorningWindow: true,
    eligibleStaff: eligible.length,
    delivered,
    alreadyDelivered,
    errors,
  };
}
