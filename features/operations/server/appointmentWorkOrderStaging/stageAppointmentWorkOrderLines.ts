import { recordAutomationEvidence } from "@/features/ai/server/automationEvidence";
import { isAiAutomaticExecutionEnabled } from "@/features/ai/server/automationPolicy";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { MatchedMenuItem } from "../appointmentPreparation/buildAppointmentPreparations";

/**
 * Phase 6 of the dashboard assistant plan: stage_appointment_work_order_lines
 * — a narrowly scoped GREEN command whose contract makes unsafe inputs
 * impossible, in the same spirit as Phase 5's prepare_appointment_parts_request.
 *
 * This reuses the "work_order_line_creation" automation capability slot —
 * already provisioned in features/ai/automation/types.ts and the
 * ai_automation_capability_settings/ai_automation_evidence CHECK
 * constraints, but never previously implemented by any command. Its
 * artifact here is deliberately narrower than that capability's own
 * label might suggest: it stages a reviewable, non-live proposal in a
 * dedicated internal table — never a real, punchable work_order_lines row
 * on an existing or new work order. The advisor still creates the real
 * work order themselves; this only removes the manual "search for and add
 * this exact repair" step once the Phase 4 day-of readiness projection has
 * already proven the match is exact and its required parts are ready.
 */
export const AUTOMATION_CAPABILITY = "work_order_line_creation" as const;
export const AUTOMATION_SOURCE = "stage_appointment_work_order_lines" as const;

export type StagedPart = {
  partName: string;
  partNumber: string | null;
  qtyRequired: number;
  matchedPartId: string | null;
};

export type StagedLine = {
  menuRepairItemId: string;
  name: string;
  laborHours: number | null;
  parts: StagedPart[];
};

export type AppointmentWorkOrderStagingCandidate = {
  bookingId: string;
  shopId: string;
  eligibleLines: StagedLine[];
};

export type ResolveAppointmentWorkOrderStagingResult =
  | { eligible: false; reason: string }
  | { eligible: true; candidate: AppointmentWorkOrderStagingCandidate };

/**
 * Pure function: given an already-computed appointment_preparations row's
 * status and matched menu items (Phase 4's projection — no additional
 * queries needed here), decide which matched repairs are exact and
 * parts-ready enough to stage. A matched item is eligible only when it is
 * active, has at least one required part, and every required part's
 * readiness is "ready" — an optional part being short doesn't block
 * staging, mirroring the same required-parts-first verdict rule the
 * day-of readiness notification and the staff-facing preparation list
 * both already use.
 */
export function resolveAppointmentWorkOrderStagingCandidate(input: {
  bookingId: string;
  shopId: string;
  preparationStatus: string | null;
  matchedMenuItems: MatchedMenuItem[];
}): ResolveAppointmentWorkOrderStagingResult {
  const { bookingId, shopId, preparationStatus, matchedMenuItems } = input;

  if (preparationStatus !== "active") {
    return { eligible: false, reason: "Booking's preparation is not active." };
  }

  const eligibleLines: StagedLine[] = [];
  for (const item of matchedMenuItems) {
    if (!item.isActive) continue;

    const requiredParts = item.partsReadiness.filter((line) => line.isRequired);
    if (requiredParts.length === 0) continue;
    if (requiredParts.some((line) => line.status !== "ready")) continue;

    eligibleLines.push({
      menuRepairItemId: item.menuRepairItemId,
      name: item.name,
      laborHours: item.laborHours,
      parts: requiredParts.map((line) => ({
        partName: line.partName,
        partNumber: line.partNumber,
        qtyRequired: line.qtyRequired,
        matchedPartId: line.matchedPartId,
      })),
    });
  }

  if (eligibleLines.length === 0) {
    return {
      eligible: false,
      reason: "No matched repair has every required part ready.",
    };
  }

  return { eligible: true, candidate: { bookingId, shopId, eligibleLines } };
}

/**
 * Record shadow evidence unconditionally, then — only when this shop's
 * automation policy allows it — write the staged proposal. Idempotent by
 * design: appointment_work_order_staging is keyed one row per booking_id,
 * upserted fresh on every sweep so the proposal stays current as parts
 * readiness changes, exactly like appointment_preparations itself.
 */
export async function finalizeAppointmentWorkOrderStaging(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  candidate: AppointmentWorkOrderStagingCandidate;
}): Promise<{ executed: boolean }> {
  const { admin, candidate } = input;

  await recordAutomationEvidence({
    shopId: candidate.shopId,
    capability: AUTOMATION_CAPABILITY,
    evidenceKey: `booking:${candidate.bookingId}`,
    outcome: "observed",
    source: AUTOMATION_SOURCE,
    sourceEntityType: "booking",
    sourceEntityId: candidate.bookingId,
    metadata: { lineCount: candidate.eligibleLines.length },
  });

  const executionEnabled = await isAiAutomaticExecutionEnabled(
    admin,
    candidate.shopId,
    AUTOMATION_CAPABILITY,
  );
  if (!executionEnabled) {
    return { executed: false };
  }

  const { error } = await admin
    .from("appointment_work_order_staging")
    .upsert(
      {
        shop_id: candidate.shopId,
        booking_id: candidate.bookingId,
        staged_lines: candidate.eligibleLines,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "booking_id" },
    );
  if (error) {
    throw new Error(
      `Could not stage appointment work order lines: ${error.message}`,
    );
  }

  return { executed: true };
}

/**
 * Remove a booking's staged proposal once it's no longer eligible (the
 * booking converted, was cancelled, or no matched repair is parts-ready
 * anymore). Never touches a real work order or line — only this internal
 * staging table.
 */
export async function clearAppointmentWorkOrderStaging(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  bookingIds: string[];
}): Promise<void> {
  const { admin, shopId, bookingIds } = input;
  if (bookingIds.length === 0) return;

  const { error } = await admin
    .from("appointment_work_order_staging")
    .delete()
    .eq("shop_id", shopId)
    .in("booking_id", bookingIds);
  if (error) {
    throw new Error(
      `Could not clear stale staged appointment work order lines: ${error.message}`,
    );
  }
}
