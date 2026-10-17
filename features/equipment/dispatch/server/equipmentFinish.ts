import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import { EquipmentDispatchError } from "@/features/equipment/dispatch/server/equipmentDispatchService";
import { punchOffLine } from "@/features/equipment/dispatch/server/punchOffService";
import { resolveEquipmentAddonEntitlementForShop } from "@/features/equipment/server/equipmentAddonEntitlement";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";
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
 * timer, entitlement or profile lookups that fail). Failing open to the
 * existing behavior is deliberate: this never blocks a Finish that worked.
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

  try {
    const entitlement = await resolveEquipmentAddonEntitlementForShop(profile.shop_id);
    if (!entitlement.enabled) return { handled: false };
  } catch (error) {
    console.error("[equipment/finish] entitlement lookup failed; using standard finish", error);
    return { handled: false };
  }

  try {
    const result = await punchOffLine({
      // Server-only command: this route has authenticated the technician; the
      // function re-checks identity and runs the canonical guards.
      supabase: createAdminSupabase(),
      shopId: profile.shop_id,
      technicianId: profile.id,
      actorUserId: profile.id,
      operationKey: input.operationKey,
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
