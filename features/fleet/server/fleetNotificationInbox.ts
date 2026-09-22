import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import type { AssistantNotificationPageRow } from "@/features/agent/server/syncAssistantNotifications";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissedPretrip(row: AssistantNotificationPageRow): boolean {
  return (
    row.code === "fleet_pretrip_missed" &&
    row.entity_type === "fleet_dispatch_assignment"
  );
}

export async function projectFleetNotificationRows(params: {
  supabase: SupabaseClient<Database>;
  rows: AssistantNotificationPageRow[];
}): Promise<AssistantNotificationPageRow[]> {
  if (params.rows.length === 0) return [];

  const db = client(params.supabase);
  const notificationIds = params.rows.map((row) => row.id);
  const { data: dismissals, error: dismissalError } = await db
    .from("fleet_notification_dismissals")
    .select("notification_id")
    .in("notification_id", notificationIds);

  if (dismissalError) throw new Error(dismissalError.message);

  const dismissedIds = new Set(
    (dismissals ?? []).map((row) => row.notification_id),
  );

  const assignmentIds = Array.from(
    new Set(
      params.rows
        .filter(isMissedPretrip)
        .map((row) => row.entity_id)
        .filter((value): value is string => Boolean(value && UUID.test(value))),
    ),
  );

  const activeAssignmentIds = new Set<string>();
  if (assignmentIds.length > 0) {
    const { data: assignments, error: assignmentError } = await db
      .from("fleet_dispatch_assignments")
      .select("id")
      .in("id", assignmentIds)
      .eq("active", true)
      .eq("pretrip_required", true);

    if (assignmentError) throw new Error(assignmentError.message);
    for (const assignment of assignments ?? []) {
      activeAssignmentIds.add(assignment.id);
    }
  }

  return coalesceFleetNotificationRows({
    rows: params.rows,
    dismissedIds,
    activeAssignmentIds,
  });
}

export function coalesceFleetNotificationRows(params: {
  rows: AssistantNotificationPageRow[];
  dismissedIds: ReadonlySet<string>;
  activeAssignmentIds: ReadonlySet<string>;
}): AssistantNotificationPageRow[] {
  const seenMissedAssignments = new Set<string>();
  const projected: AssistantNotificationPageRow[] = [];

  for (const row of params.rows) {
    if (params.dismissedIds.has(row.id)) continue;

    if (isMissedPretrip(row)) {
      const assignmentId = row.entity_id;
      if (!assignmentId || !params.activeAssignmentIds.has(assignmentId)) {
        continue;
      }
      if (seenMissedAssignments.has(assignmentId)) continue;
      seenMissedAssignments.add(assignmentId);
    }

    projected.push(row);
  }

  return projected;
}

export async function recordFleetNotificationDismissal(params: {
  supabase: SupabaseClient<Database>;
  notificationId: string;
  shopId: string;
  fleetId: string | null;
  dismissedBy: string;
}): Promise<void> {
  const db = client(params.supabase);
  const { error } = await db.from("fleet_notification_dismissals").insert({
    notification_id: params.notificationId,
    shop_id: params.shopId,
    fleet_id: params.fleetId,
    dismissed_by: params.dismissedBy,
  });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}
