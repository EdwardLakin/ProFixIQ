import "server-only";

import {
  PUNCH_EVENT_TYPES,
  SHIFT_ACTIVITIES,
  SHIFT_STATUSES,
  deriveCurrentShiftActivity,
  type ShiftActivity,
} from "@/features/workforce/lib/shift-status";
import type { TechnicianCopilotAction } from "./actionContract";
import type { TechnicianWorkScope } from "./assignedWork";
import { deriveCopilotOperationId } from "./operationId";

type ShiftPunchIdentity = {
  authUserId: string;
  profileId: string;
  shopId: string;
  supabase: TechnicianWorkScope["supabase"];
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type ActiveShiftRow = { id: string };
type PunchEventRow = {
  event_type: string | null;
  timestamp: string | null;
  created_at: string | null;
};

async function loadActiveShiftId(
  supabase: TechnicianWorkScope["supabase"],
  shopId: string,
  userIds: readonly string[],
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tech_shifts")
    .select("id")
    .eq("shop_id", shopId)
    .in("user_id", [...new Set(userIds)])
    .eq("status", SHIFT_STATUSES.active)
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle<ActiveShiftRow>();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

async function loadShiftActivity(
  supabase: TechnicianWorkScope["supabase"],
  shiftId: string,
): Promise<ShiftActivity> {
  const { data, error } = await supabase
    .from("punch_events")
    .select("event_type,timestamp,created_at")
    .eq("shift_id", shiftId)
    .order("timestamp", { ascending: true });
  if (error) throw new Error(error.message);
  return deriveCurrentShiftActivity((data ?? []) as PunchEventRow[], true);
}

type PunchKind = "break" | "lunch";
type PunchDirection = "start" | "end";

function kindOf(
  type: Extract<
    TechnicianCopilotAction,
    {
      type:
        | "shift.break.start"
        | "shift.break.end"
        | "shift.lunch.start"
        | "shift.lunch.end";
    }
  >["type"],
): { kind: PunchKind; direction: PunchDirection } {
  return {
    kind: type.startsWith("shift.break") ? "break" : "lunch",
    direction: type.endsWith("start") ? "start" : "end",
  };
}

/**
 * shift.break.start/end and shift.lunch.start/end are orthogonal to the
 * repair session entirely, exactly like message.reply (see
 * respondToMessageReply in chat.ts): attendance, not job work. This runs
 * whether or not a repair session exists, never touches the session ledger,
 * and returns no clientAction.
 *
 * The write itself is the same atomic, idempotent RPC the admin/staff punch
 * correction screen already uses
 * (apply_canonical_offline_shift_punch_atomic — see
 * supabase/migrations/20260728213600_canonical_offline_shift_punch.sql),
 * keyed by an operation id derived from the turn id, so a replayed turn
 * cannot double-punch at the database level.
 *
 * This deliberately does NOT reuse app/api/mobile/shifts/route.ts's
 * break/lunch handling, which also auto-pauses and auto-resumes the
 * technician's active job labor timer around the punch. That logic is
 * explicitly locked to that file by
 * tests/mobile-shift-lifecycle-route.test.ts ("keeps break and lunch as
 * checked append-only writes guarded by route ordering") and isn't meant to
 * move or be duplicated here. So this action only ever punches the
 * attendance record — it never pauses or resumes a job timer. A technician
 * who also wants their active job's timer stopped already has job.hold for
 * that, in the same or a follow-up turn; the model's prompt says as much so
 * it can answer truthfully if asked.
 *
 * Idempotency for the two read-then-decide checks below (is there an active
 * shift, what's its current activity) is a state check rather than a
 * receipt, same reasoning as inspection.start's conflict check: a replayed
 * turn that already succeeded finds the activity has already moved (e.g.
 * already on break) and returns the same truthful, non-alarming reply
 * instead of double-punching.
 */
export async function respondToShiftPunch(input: {
  identity: ShiftPunchIdentity;
  turnId: string;
  action: Extract<
    TechnicianCopilotAction,
    {
      type:
        | "shift.break.start"
        | "shift.break.end"
        | "shift.lunch.start"
        | "shift.lunch.end";
    }
  >;
}): Promise<string> {
  const { kind, direction } = kindOf(input.action.type);
  const label = kind === "break" ? "break" : "lunch";
  const { supabase, shopId, profileId, authUserId } = input.identity;

  let shiftId: string | null;
  try {
    shiftId = await loadActiveShiftId(supabase, shopId, [profileId, authUserId]);
  } catch (error) {
    console.error("[technician-copilot] shift lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "I couldn't check your shift status. Try again.";
  }
  if (!shiftId) {
    return `You're not clocked in, so there's no shift to punch a ${label} on.`;
  }

  let activity: ShiftActivity;
  try {
    activity = await loadShiftActivity(supabase, shiftId);
  } catch (error) {
    console.error("[technician-copilot] shift activity lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "I couldn't check your shift status. Try again.";
  }

  if (direction === "start") {
    if (kind === "break" && activity === SHIFT_ACTIVITIES.onBreak) {
      return "You're already on break.";
    }
    if (kind === "lunch" && activity === SHIFT_ACTIVITIES.onLunch) {
      return "You're already on lunch.";
    }
    if (activity === SHIFT_ACTIVITIES.onBreak) {
      return "You're on break right now — end that first if you want to switch to lunch.";
    }
    if (activity === SHIFT_ACTIVITIES.onLunch) {
      return "You're on lunch right now — end that first if you want to switch to a break.";
    }
  } else {
    const expected =
      kind === "break" ? SHIFT_ACTIVITIES.onBreak : SHIFT_ACTIVITIES.onLunch;
    if (activity !== expected) {
      return `You're not on ${label} right now.`;
    }
  }

  const eventType =
    kind === "break"
      ? direction === "start"
        ? PUNCH_EVENT_TYPES.breakStart
        : PUNCH_EVENT_TYPES.breakEnd
      : direction === "start"
        ? PUNCH_EVENT_TYPES.lunchStart
        : PUNCH_EVENT_TYPES.lunchEnd;

  const rpc = supabase as unknown as RpcClient;
  const { error } = await rpc.rpc("apply_canonical_offline_shift_punch_atomic", {
    p_shop_id: shopId,
    p_actor_profile_id: profileId,
    p_actor_auth_user_id: authUserId,
    p_operation_key: `copilot:${deriveCopilotOperationId(input.turnId, input.action.type)}:shift-punch`,
    p_shift_id: shiftId,
    p_event_type: eventType,
    p_timestamp: new Date().toISOString(),
  });
  if (error) {
    console.error("[technician-copilot] shift punch failed", {
      eventType,
      error: error.message,
    });
    return `I couldn't ${direction === "start" ? "start" : "end"} that ${label}. Try again.`;
  }

  return direction === "start"
    ? `${label === "break" ? "Break" : "Lunch"} started.`
    : `${label === "break" ? "Break" : "Lunch"} ended.`;
}
