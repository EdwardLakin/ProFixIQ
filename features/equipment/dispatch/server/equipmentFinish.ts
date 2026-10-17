import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { EquipmentDispatchError } from "@/features/equipment/dispatch/server/equipmentDispatchService";
import { punchOffLine } from "@/features/equipment/dispatch/server/punchOffService";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
import { isDemoAccessExpired } from "@/features/shared/lib/server/demo-shop";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { errorStatus } from "@/features/work-orders/server/applyJobPunchTransition";

type DB = Database;

export type EquipmentFinishOutcome =
  | { handled: false }
  | { handled: true; ok: true; payload: Record<string, unknown> }
  | { handled: true; ok: false; status: number; error: string };

const NO_RUNNING_TIMER = /no running timer/i;

/**
 * Equipment shops: "the last one to punch off the job closes the line."
 *
 * The shared Finish route calls this first. It only takes over when the shop
 * holds the Equipment add-on AND the technician has a running timer on the
 * line. Every other case returns `handled: false` and the route continues with
 * the existing finish exactly as before (other products, technicians without a
 * timer, a failed profile lookup).
 *
 * If the add-on cannot be verified, the existing finish is only safe when nobody
 * else is running on the line (the two paths then do the same thing). When
 * another technician is running, completing the line would strand their timer,
 * so the request fails with a retryable 503 instead.
 *
 * The database command wraps the canonical punch transition, so assignment,
 * product-access, approval, inspection and cause/correction rules still apply.
 * Retries with the same key replay without a second effect.
 */
export async function finishViaEquipmentLastOff(input: {
  userSupabase: SupabaseClient<DB>;
  authUserId: string;
  lineId: string;
  operationKey: string;
  cause?: string | null;
  correction?: string | null;
}): Promise<EquipmentFinishOutcome> {
  const { profile } = await resolveAuthenticatedStaffProfile(
    input.userSupabase,
    input.authUserId,
  );
  if (!profile?.shop_id) return { handled: false };

  // The route accepts any non-empty key; the command needs at least 8
  // characters, so derive a longer one. It stays stable for a given
  // (line, key), which keeps retries idempotent.
  const operationKey = `finish:${input.lineId}:${input.operationKey}`;

  // A retry of a Finish this command already answered must replay that answer,
  // whatever the add-on looks like now. The standard finish keeps its receipts
  // elsewhere, so reclassifying the retry would run the Finish a second time.
  const receipt = await hasEquipmentFinishReceipt(profile.shop_id, operationKey);
  if (receipt === "unknown") {
    return { handled: true, ok: false, status: 503, error: RETRY_MESSAGE };
  }

  if (receipt === "none") {
    let entitled: boolean;
    try {
      entitled = (await resolveEquipmentAddonEntitlementForShop(profile.shop_id)).enabled;
    } catch (error) {
      console.error("[equipment/finish] entitlement lookup failed", error);
      return failClosedIfOthersRunning({ shopId: profile.shop_id, lineId: input.lineId, technicianId: profile.id });
    }
    if (!entitled) return { handled: false };
  }

  // The same gates the standard finish applies before it reaches the database.
  if (isDemoAccessExpired(profile.demo_access_expires_at)) {
    return { handled: true, ok: false, status: 403, error: "Forbidden" };
  }
  if (!getActorCapabilities({ role: profile.role }).canPerformAssignedWork) {
    return {
      handled: true,
      ok: false,
      status: 403,
      error: "This staff role is not permitted to perform assigned work.",
    };
  }

  try {
    const result = await punchOffLine({
      // Server-only command: this route has authenticated the technician; the
      // function re-checks identity and runs the canonical guards.
      supabase: createAdminSupabase(),
      shopId: profile.shop_id,
      technicianId: profile.id,
      actorUserId: profile.id,
      operationKey,
      request: {
        lineId: input.lineId,
        cause: input.cause?.trim() || undefined,
        correction: input.correction?.trim() || undefined,
      },
    });
    return {
      handled: true,
      ok: true,
      payload: {
        success: true,
        lineClosed: result.lineClosed,
        remaining: result.remaining,
        idempotent: result.idempotent,
        // The canonical finish receipt enqueues repair learning in the database.
        ...(result.lineClosed
          ? { menuRepairLearning: { ok: false, state: "pending" as const } }
          : {}),
      },
    };
  } catch (error) {
    if (error instanceof EquipmentDispatchError) {
      // No running timer on this line: not a last-off case, so the standard
      // finish decides (for example a lead completing a line they never timed).
      if (NO_RUNNING_TIMER.test(error.message)) return { handled: false };
      return { handled: true, ok: false, status: errorStatus(error.message), error: error.message };
    }
    throw error;
  }
}

async function hasEquipmentFinishReceipt(
  shopId: string,
  operationKey: string,
): Promise<"exists" | "none" | "unknown"> {
  const { data, error } = await createAdminSupabase()
    .from("scheduler_operation_keys")
    .select("operation_key")
    .eq("shop_id", shopId)
    .eq("operation_name", "equipment_punch_off")
    .eq("operation_key", operationKey)
    .limit(1);
  if (error) {
    console.error("[equipment/finish] receipt lookup failed", error);
    return "unknown";
  }
  return (data ?? []).length > 0 ? "exists" : "none";
}

const RETRY_MESSAGE = "Equipment status could not be verified. Try again in a moment.";

async function failClosedIfOthersRunning(input: {
  shopId: string;
  lineId: string;
  technicianId: string;
}): Promise<EquipmentFinishOutcome> {
  const { data, error } = await createAdminSupabase()
    .from("work_order_line_labor_segments")
    .select("technician_id")
    .eq("shop_id", input.shopId)
    .eq("work_order_line_id", input.lineId)
    .neq("technician_id", input.technicianId)
    .is("ended_at", null)
    .limit(1);
  // Unknown or someone else running: do not complete the line around them.
  if (error || (data ?? []).length > 0) {
    return { handled: true, ok: false, status: 503, error: RETRY_MESSAGE };
  }
  // Nobody else is running, so the standard finish does exactly what the
  // punch-off would have done.
  return { handled: false };
}
