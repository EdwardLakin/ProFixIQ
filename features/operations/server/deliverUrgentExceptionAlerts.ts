import "server-only";

import { canAccessAssistantNotifications, canonicalizeRole } from "@/features/shared/lib/rbac";
import {
  syncAssistantNotifications,
  type PersistedAssistantNotification,
} from "@/features/agent/server/syncAssistantNotifications";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

/**
 * Phase 7 of the dashboard assistant plan: the "event-driven exceptions"
 * half of proactive conversation delivery — the "morning summaries" half
 * lives in deliverDailyAssistantDigest.ts. Rather than waiting for the next
 * morning's digest, push a critical-level notification into the relevant
 * recipient's durable assistant thread as soon as it is detected. This
 * never invents or duplicates a signal: it reuses exactly the same,
 * already-persisted assistant_notifications the dashboard already shows,
 * through the same canonical syncAssistantNotifications pipeline.
 *
 * Runs on every sweep — no morning-window gate, because an exception does
 * not wait for morning — and, unlike the shop-wide morning digest, extends
 * to mechanics too: syncAssistantNotifications already scopes a mechanic's
 * own notifications down to their assigned work, so there is no
 * over-exposure risk here the way there would be for the full shop-wide
 * digest.
 *
 * Purely informational and additive: this never mutates a work order,
 * approval, invoice, or the notification itself — only ever inserts a new
 * assistant-authored message once, ever, per (recipient, notification).
 */

const ALERT_MESSAGE_KIND = "state_update" as const;
const ALERT_SOURCE = "urgent_exception_alert" as const;

export type UrgentExceptionAlertsSummary = {
  shopId: string;
  eligibleStaff: number;
  candidates: number;
  delivered: number;
  alreadyDelivered: number;
  errors: string[];
};

type ExceptionCandidate = {
  id: string;
  code: string;
  title: string;
  message: string;
  href: string | null;
};

function toExceptionCandidates(
  notifications: PersistedAssistantNotification[],
): ExceptionCandidate[] {
  return notifications
    .filter((notification) => notification.level === "critical" && notification.status === "active")
    .map((notification) => ({
      id: notification.id,
      code: notification.code,
      title: notification.title,
      message: notification.message,
      href: notification.href,
    }));
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
 * A notification's assistant_notifications id is stable across resweeps
 * (the upsert path keys on (shop_id, fingerprint), so the same underlying
 * condition always maps back to the same row id) — making it a durable,
 * deliver-once-ever idempotency key, unlike the digest's per-day key. Scope
 * the check across every thread the recipient has, not just whichever one
 * this run picks as "latest", for the same reason the digest does.
 */
async function hasDeliveredAlert(
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
    throw new Error(`Could not check for an existing exception alert: ${existingError.message}`);
  }
  return !!existing;
}

async function deliverAlertToStaffMember(
  admin: ReturnType<typeof createAdminSupabase>,
  shopId: string,
  authUserId: string,
  notification: ExceptionCandidate,
): Promise<"delivered" | "already_delivered"> {
  const clientMessageId = `exception:${notification.id}`;

  if (await hasDeliveredAlert(admin, shopId, authUserId, clientMessageId)) {
    return "already_delivered";
  }

  const threadId = await findOrCreateAssistantThread(admin, shopId, authUserId);
  const content = [
    notification.title,
    notification.message,
    notification.href ? `Review: ${notification.href}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await admin
    .from("shop_assistant_messages")
    .insert({
      thread_id: threadId,
      shop_id: shopId,
      user_id: null,
      role: "assistant",
      kind: ALERT_MESSAGE_KIND,
      content,
      payload: {
        source: ALERT_SOURCE,
        notificationId: notification.id,
        code: notification.code,
        href: notification.href,
      },
      client_message_id: clientMessageId,
    })
    .select("id")
    .maybeSingle();

  if (!error && data) return "delivered";
  if (error?.code !== "23505") {
    throw new Error(`Could not deliver exception alert: ${error?.message ?? "unknown error"}`);
  }
  return "already_delivered";
}

/**
 * Sweeps one shop: for every staff member who can see assistant
 * notifications at all (the same gate syncAssistantNotifications itself
 * enforces), delivers any currently-active, critical-level notification
 * they have not already received into their thread.
 */
export async function deliverUrgentExceptionAlerts(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
}): Promise<UrgentExceptionAlertsSummary> {
  const { admin, shopId } = input;
  const errors: string[] = [];

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, user_id, role")
    .eq("shop_id", shopId);
  if (profilesError) {
    return {
      shopId,
      eligibleStaff: 0,
      candidates: 0,
      delivered: 0,
      alreadyDelivered: 0,
      errors: [profilesError.message],
    };
  }

  const eligible = (profiles ?? [])
    .filter((profile) => canAccessAssistantNotifications(profile.role))
    .map((profile) => ({
      authUserId: profile.user_id ?? profile.id,
      profileId: profile.id,
      role: profile.role,
    }));

  let candidates = 0;
  let delivered = 0;
  let alreadyDelivered = 0;

  const deliverCandidates = async (
    authUserId: string,
    urgent: ExceptionCandidate[],
  ) => {
    candidates += urgent.length;
    for (const notification of urgent) {
      const outcome = await deliverAlertToStaffMember(admin, shopId, authUserId, notification);
      if (outcome === "delivered") delivered += 1;
      else alreadyDelivered += 1;
    }
  };

  // Shop-wide (non-mechanic) recipients all see the same threshold-based
  // notification set — the per-role visibility split inside
  // syncAssistantNotifications only ever affects durable, non-critical
  // categories (parts-pick/parts-workflow), never a critical/urgent one —
  // so compute it once per shop and reuse it, instead of rerunning the
  // full shop-wide scan (work orders, lines, invoices, staffing,
  // optimization, suggestions, parts) once per recipient. A shop with many
  // staff would otherwise make this sweep's duration grow linearly with
  // headcount, on a cron that runs every ten minutes.
  const nonMechanicStaff = eligible.filter(
    (staff) => canonicalizeRole(staff.role) !== "mechanic",
  );
  const mechanicStaff = eligible.filter(
    (staff) => canonicalizeRole(staff.role) === "mechanic",
  );

  if (nonMechanicStaff.length > 0) {
    let urgent: ExceptionCandidate[] = [];
    try {
      const notifications = await syncAssistantNotifications({
        shopId,
        role: nonMechanicStaff[0].role,
        supabaseClient: admin,
      });
      urgent = toExceptionCandidates(notifications);
    } catch (error) {
      errors.push(
        `shop-wide: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    // Delivery is still isolated per recipient: one recipient's thread
    // failing to create does not block delivery to the rest.
    for (const staff of nonMechanicStaff) {
      try {
        await deliverCandidates(staff.authUserId, urgent);
      } catch (error) {
        errors.push(
          `staff ${staff.authUserId}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
  }

  for (const staff of mechanicStaff) {
    try {
      // Assignment columns (work_order_lines.assigned_tech_id,
      // work_order_line_technicians.technician_id, labor segments) store
      // the canonical profile id, not the auth user id — pass both, the
      // same way getRoleDailySummary's own notification scoping already
      // does, or a linked mechanic (profiles.id !== profiles.user_id)
      // silently gets none of their own assigned critical work.
      const notifications = await syncAssistantNotifications({
        shopId,
        userId: staff.profileId,
        assignmentUserIds: [staff.authUserId, staff.profileId],
        role: staff.role,
        supabaseClient: admin,
      });
      await deliverCandidates(staff.authUserId, toExceptionCandidates(notifications));
    } catch (error) {
      errors.push(
        `staff ${staff.authUserId}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  return {
    shopId,
    eligibleStaff: eligible.length,
    candidates,
    delivered,
    alreadyDelivered,
    errors,
  };
}
