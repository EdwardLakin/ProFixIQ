import "server-only";

import { hasAnyRole, ROLE_GROUPS } from "@/features/shared/lib/rbac";
import { getRoleDailySummary } from "@/features/agent/server/getRoleDailySummary";
import {
  getShopDayRange,
  getShopLocalDayWindow,
  shopLocalDateTimeToUtc,
} from "@/features/shared/lib/utils/shopDayWindow";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

/**
 * Phase 7 of the dashboard assistant plan: proactive conversation delivery.
 * Once a day, in each shop's own local morning, deliver each eligible staff
 * member's role-aware daily summary into their existing durable
 * shop-assistant thread — the same conversation surface `app/api/shop-
 * assistant/*` chat already reads and writes, and the same canonical
 * summary contract (getRoleDailySummary) the on-demand "Today" panel
 * already uses — instead of requiring them to open the assistant and ask
 * for it.
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
const DIGEST_SOURCE = "daily_assistant_digest" as const;

export type DailyAssistantDigestSummary = {
  shopId: string;
  inMorningWindow: boolean;
  eligibleStaff: number;
  delivered: number;
  alreadyDelivered: number;
  errors: string[];
};

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
 * The database uniqueness backing idempotent message delivery is scoped to
 * (thread_id, client_message_id) — but which thread is "the" thread to
 * append to for a given recipient is not stable across runs (a recipient
 * can start a new conversation, or two threads can each look "latest" to a
 * concurrent run). Scope the actual delivery check to (shop, recipient,
 * day) across every thread the recipient has, not just whichever thread
 * this run happens to pick, so a thread switch between two runs inside the
 * same morning window cannot produce a second digest for the same day.
 */
async function hasDeliveredDigestToday(
  admin: ReturnType<typeof createAdminSupabase>,
  shopId: string,
  userId: string,
  clientMessageId: string,
): Promise<boolean> {
  const { data: threads, error: threadsError } = await admin
    .from("shop_assistant_threads")
    .select("id")
    .eq("shop_id", shopId)
    .eq("user_id", userId);
  if (threadsError) {
    throw new Error(`Could not list assistant threads: ${threadsError.message}`);
  }
  const threadIds = (threads ?? []).map((thread) => thread.id);
  if (threadIds.length === 0) return false;

  const { data: existing, error: existingError } = await admin
    .from("shop_assistant_messages")
    .select("id")
    .in("thread_id", threadIds)
    .eq("client_message_id", clientMessageId)
    .limit(1)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Could not check for an existing daily digest: ${existingError.message}`);
  }
  return !!existing;
}

type EligibleStaffMember = {
  authUserId: string;
  profileId: string;
  role: string | null;
};

/**
 * Delivers one staff member's role-aware daily summary into their thread.
 * Idempotent per shop-local day: hasDeliveredDigestToday narrows (does not
 * fully close — a genuinely concurrent first delivery for the same
 * recipient could still race) the window before picking a thread to append
 * to, and the (thread_id, client_message_id) unique index every other
 * assistant message write already relies on is the backstop for that
 * specific race.
 */
async function deliverDigestToStaffMember(
  admin: ReturnType<typeof createAdminSupabase>,
  shopId: string,
  staff: EligibleStaffMember,
  localDayKey: string,
): Promise<"delivered" | "already_delivered"> {
  const clientMessageId = `daily-digest:${localDayKey}`;

  if (await hasDeliveredDigestToday(admin, shopId, staff.authUserId, clientMessageId)) {
    return "already_delivered";
  }

  // The canonical, role-aware summary contract — the same one the on-demand
  // "Today" panel already uses — rather than a bespoke formatter, so staff
  // never see two conflicting versions of "today's summary".
  const summary = await getRoleDailySummary({
    shopId,
    userId: staff.authUserId,
    profileId: staff.profileId,
    role: staff.role,
    supabaseClient: admin,
  });
  const content = summary.summaryText.trim();
  if (!content) return "already_delivered";

  const threadId = await findOrCreateAssistantThread(admin, shopId, staff.authUserId);

  const { data, error } = await admin
    .from("shop_assistant_messages")
    .insert({
      thread_id: threadId,
      shop_id: shopId,
      user_id: null,
      role: "assistant",
      kind: DIGEST_MESSAGE_KIND,
      content,
      payload: {
        source: DIGEST_SOURCE,
        localDayKey,
        role: summary.role,
        links: summary.links,
        actionItems: summary.actionItems,
      },
      client_message_id: clientMessageId,
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

  // getShopDayRange normalizes a null/empty/invalid timezone to a safe
  // fallback ("UTC") the same way every other shop-local-day caller in the
  // app already does; getShopLocalDayWindow itself requires an already-safe
  // IANA zone name and throws on anything else.
  const safeTimezone = getShopDayRange(shop?.timezone ?? null, now).timezone;
  const window = getShopLocalDayWindow(safeTimezone, now);

  // Compare against explicit zoned 06:00/10:00 boundaries rather than
  // elapsed milliseconds since local midnight: on a DST transition day the
  // shop-local day is not exactly 24 wall-clock hours, so an elapsed-time
  // comparison drifts against the actual local clock right when it matters
  // most (the morning window itself).
  const windowStartMs = Date.parse(
    shopLocalDateTimeToUtc(
      window.localDayKey,
      `${String(MORNING_WINDOW_START_HOUR).padStart(2, "0")}:00`,
      safeTimezone,
    ),
  );
  const windowEndMs = Date.parse(
    shopLocalDateTimeToUtc(
      window.localDayKey,
      `${String(MORNING_WINDOW_END_HOUR).padStart(2, "0")}:00`,
      safeTimezone,
    ),
  );
  const inMorningWindow = now.getTime() >= windowStartMs && now.getTime() < windowEndMs;
  if (!inMorningWindow) return empty(false);

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, user_id, role")
    .eq("shop_id", shopId);
  if (profilesError) return empty(true, [profilesError.message]);

  // Shop-wide operator roles only. Mechanics already get their own
  // narrower, assignment-scoped "Tech snapshot" summary on demand; the
  // audit is explicit that day-of orchestration keeps assignments and
  // technician findings under existing human authority, so this proactive
  // push starts with the roles that already see shop-wide state today.
  const eligible: EligibleStaffMember[] = (profiles ?? [])
    .filter((profile) => hasAnyRole(profile.role, ROLE_GROUPS.shopWideOperators))
    .map((profile) => ({
      authUserId: profile.user_id ?? profile.id,
      profileId: profile.id,
      role: profile.role,
    }));

  if (eligible.length === 0) return { ...empty(true), eligibleStaff: 0 };

  let delivered = 0;
  let alreadyDelivered = 0;
  const errors: string[] = [];

  for (const staff of eligible) {
    try {
      const outcome = await deliverDigestToStaffMember(
        admin,
        shopId,
        staff,
        window.localDayKey,
      );
      if (outcome === "delivered") delivered += 1;
      else alreadyDelivered += 1;
    } catch (error) {
      errors.push(
        `staff ${staff.authUserId}: ${error instanceof Error ? error.message : "unknown error"}`,
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
