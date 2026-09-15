import type { Database } from "@shared/types/types/supabase";
import { recordAutomationEvidence } from "@/features/ai/server/automationEvidence";
import { isAiAutomaticExecutionEnabled } from "@/features/ai/server/automationPolicy";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { findMenuRepairItemForWorkOrderLine } from "@/features/menu-repair-items/server/findMenuRepairItemForWorkOrderLine";
import {
  COMPLETED_REPAIR_SOURCE,
  COMPLETED_REPAIR_STATUSES,
  matchesCompletedRepairVehicle,
} from "@/features/menu-repair-items/lib/completedRepair";
import {
  buildPartsReadinessForMenuRepairItems,
  type PartReadinessLine,
} from "../appointmentPreparation/buildPartsReadiness";

type DB = Database;

type WorkOrderLine = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "shop_id" | "work_order_id" | "vehicle_id" | "voided_at"
>;
type WorkOrder = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  | "id"
  | "shop_id"
  | "vehicle_id"
  | "archived_at"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_engine"
  | "vehicle_drivetrain"
  | "vehicle_transmission"
>;
type MenuRepairItem = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  | "id"
  | "shop_id"
  | "name"
  | "is_active"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "engine"
  | "drivetrain"
  | "transmission"
  | "source_work_order_line_id"
  | "last_pricing_source"
>;
type Vehicle = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "engine" | "drivetrain" | "transmission"
>;

/**
 * Phase 5 of the dashboard assistant plan: the first deterministic GREEN
 * command — one whose contract makes unsafe inputs impossible, rather than
 * loosening a generic write tool's confirmation policy.
 *
 * This is the "appointment_parts_preparation" AI automation capability's
 * shadow/execution entry point (features/ai/automation) — a distinct
 * capability from "parts_ordering" (which means placing an authorized
 * order after fitment/availability/customer approval, a materially larger
 * authority than creating a pre-approval internal request). It creates
 * only the internal request needed to start the existing Parts workflow —
 * never a supplier choice or a purchase order — and only for a work-order
 * line whose exact, durable menu-repair mapping is an active,
 * vehicle-compatible repair learned from completed technician work, on a
 * work order that traces back to a real booking.
 */
export const AUTOMATION_CAPABILITY = "appointment_parts_preparation" as const;
export const AUTOMATION_SOURCE = "prepare_appointment_parts_request" as const;

// A stable, machine-checkable marker prefixed onto the created request's
// notes. Phase 6's internal notification (features/agent/server/
// syncAssistantNotifications.ts) uses this — together with the fact that a
// service-role-created request always has a null requested_by — to durably
// identify which part_requests rows this GREEN command produced, without
// requiring a new column on the shared, pre-existing part_requests table.
export const AUTOMATED_PART_REQUEST_NOTES_MARKER = `[ai:${AUTOMATION_CAPABILITY}]` as const;

export type AppointmentPartsCandidate = {
  line: WorkOrderLine;
  workOrder: WorkOrder;
  menuRepairItem: MenuRepairItem;
};

export type ResolveAppointmentPartsCandidateResult =
  | { eligible: false; reason: string }
  | { eligible: true; candidate: AppointmentPartsCandidate };

export type PrepareAppointmentPartsRequestResult =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      executed: boolean;
      menuRepairItemId: string;
      items: Array<{ description: string; qty: number; partNumber: string | null }>;
      requestId?: string;
    };

/**
 * Phase 1 (cheap, per-line, batchable): resolve whether a work-order line
 * is a genuine candidate for the GREEN parts-request command, without
 * touching the shop's parts catalog yet — that step is batched once across
 * every candidate line in a sweep (see syncAppointmentPartsPreparation)
 * rather than repeated per line.
 *
 * A dependency-query failure throws — it is an infrastructure failure, not
 * a business-rule ineligibility — so a caller sweeping many lines can tell
 * "this line simply doesn't qualify" apart from "something is broken" and
 * report the latter as a real error instead of silent non-eligibility.
 */
export async function resolveAppointmentPartsCandidate(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  workOrderLineId: string;
}): Promise<ResolveAppointmentPartsCandidateResult> {
  const { admin, shopId, workOrderLineId } = input;

  const { data: line, error: lineError } = await admin
    .from("work_order_lines")
    .select("id, shop_id, work_order_id, vehicle_id, voided_at")
    .eq("shop_id", shopId)
    .eq("id", workOrderLineId)
    .maybeSingle();
  if (lineError) throw new Error(`Could not load work order line: ${lineError.message}`);
  if (!line) return { eligible: false, reason: "Work order line not found." };
  if (line.voided_at) return { eligible: false, reason: "Line is voided." };

  const { data: workOrder, error: woError } = await admin
    .from("work_orders")
    .select(
      "id, shop_id, vehicle_id, archived_at, vehicle_year, vehicle_make, vehicle_model, vehicle_engine, vehicle_drivetrain, vehicle_transmission",
    )
    .eq("shop_id", shopId)
    .eq("id", line.work_order_id)
    .maybeSingle();
  if (woError) throw new Error(`Could not load work order: ${woError.message}`);
  if (!workOrder) return { eligible: false, reason: "Work order not found." };
  if (workOrder.archived_at) return { eligible: false, reason: "Work order is archived." };

  // "An explicitly booked service": the work order must trace back to a
  // real, still-active booking — not just any work order a line happens to
  // live on.
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrder.id)
    .is("cancelled_at", null)
    .maybeSingle();
  if (bookingError) throw new Error(`Could not load booking: ${bookingError.message}`);
  if (!booking) {
    return { eligible: false, reason: "Work order is not linked to an active booking." };
  }

  // Duplicate/idempotency protection: never request parts for a line that
  // already has any parts request activity, automated or manual.
  const { data: existingItem, error: existingError } = await admin
    .from("part_request_items")
    .select("id")
    .eq("shop_id", shopId)
    .eq("work_order_line_id", line.id)
    .limit(1)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Could not check for an existing parts request: ${existingError.message}`);
  }
  if (existingItem) {
    return { eligible: false, reason: "A parts request already exists for this line." };
  }

  // The exact, durable menu-repair mapping: the same lookup the work-order
  // workflow already relies on (source_work_order_line_id / template_key
  // against menu_repair_items) — not work_order_lines.menu_item_id, which
  // points at the unrelated menu_items catalog domain.
  const menuRepairItemId = await findMenuRepairItemForWorkOrderLine({
    supabase: admin,
    workOrderLineId: line.id,
  });
  if (!menuRepairItemId) {
    return { eligible: false, reason: "No exact matching menu repair item for this line." };
  }

  const { data: menuRepairItem, error: menuError } = await admin
    .from("menu_repair_items")
    .select(
      "id, shop_id, name, is_active, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission, source_work_order_line_id, last_pricing_source",
    )
    .eq("shop_id", shopId)
    .eq("id", menuRepairItemId)
    .maybeSingle();
  if (menuError) throw new Error(`Could not load menu repair item: ${menuError.message}`);
  if (!menuRepairItem) return { eligible: false, reason: "Mapped menu repair item not found." };
  if (!menuRepairItem.is_active) {
    return { eligible: false, reason: "Mapped menu repair item is not active." };
  }

  // Provenance: only a menu repair item learned from completed technician
  // work is authoritative enough to drive an automatic parts request — the
  // same bar the manual "reuse a completed repair" flow already enforces.
  if (
    !menuRepairItem.source_work_order_line_id ||
    menuRepairItem.last_pricing_source !== COMPLETED_REPAIR_SOURCE
  ) {
    return {
      eligible: false,
      reason: "Mapped menu repair item is not backed by completed work.",
    };
  }
  const { data: sourceLine, error: sourceLineError } = await admin
    .from("work_order_lines")
    .select("id")
    .eq("id", menuRepairItem.source_work_order_line_id)
    .eq("shop_id", shopId)
    .in("status", [...COMPLETED_REPAIR_STATUSES])
    .maybeSingle();
  if (sourceLineError) {
    throw new Error(
      `Could not verify menu repair item provenance: ${sourceLineError.message}`,
    );
  }
  if (!sourceLine) {
    return {
      eligible: false,
      reason: "Mapped menu repair item's source work is no longer completed.",
    };
  }

  const vehicleId = line.vehicle_id ?? workOrder.vehicle_id;
  if (!vehicleId) return { eligible: false, reason: "No vehicle on the work order." };
  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .select("id, year, make, model, engine, drivetrain, transmission")
    .eq("shop_id", shopId)
    .eq("id", vehicleId)
    .maybeSingle();
  if (vehicleError) throw new Error(`Could not load vehicle: ${vehicleError.message}`);
  if (!vehicle) return { eligible: false, reason: "Vehicle not found." };

  if (!isVehicleCompatible(vehicle, workOrder, menuRepairItem)) {
    return {
      eligible: false,
      reason: "Vehicle is not compatible with the mapped menu repair item.",
    };
  }

  return { eligible: true, candidate: { line, workOrder, menuRepairItem } };
}

function isVehicleCompatible(
  vehicle: Vehicle,
  workOrder: WorkOrder,
  menuRepairItem: MenuRepairItem,
): boolean {
  // A learned repair is vehicle history, not a generic service catalog —
  // reuse the same canonical, exact-YMM-required matcher the manual
  // "reuse a completed repair" flow uses, falling back to the work order's
  // own denormalized vehicle fields the same way that flow does when the
  // linked vehicle record is missing a value.
  return matchesCompletedRepairVehicle(
    {
      year: vehicle.year ?? workOrder.vehicle_year,
      make: vehicle.make ?? workOrder.vehicle_make,
      model: vehicle.model ?? workOrder.vehicle_model,
      engine: vehicle.engine ?? workOrder.vehicle_engine,
      drivetrain: vehicle.drivetrain ?? workOrder.vehicle_drivetrain,
      transmission: vehicle.transmission ?? workOrder.vehicle_transmission,
    },
    {
      year: menuRepairItem.vehicle_year,
      make: menuRepairItem.vehicle_make,
      model: menuRepairItem.vehicle_model,
      engine: menuRepairItem.engine,
      drivetrain: menuRepairItem.drivetrain,
      transmission: menuRepairItem.transmission,
    },
  );
}

/**
 * Phase 2 (batchable): given a resolved candidate and its already-computed
 * parts readiness (batched once per sweep across every candidate's menu
 * repair item), decide whether the parts mapping is exact, record shadow
 * evidence, and — only when this shop's automation policy allows it —
 * create the internal parts request.
 */
export async function finalizeAppointmentPartsRequest(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  candidate: AppointmentPartsCandidate;
  readinessLines: PartReadinessLine[];
}): Promise<PrepareAppointmentPartsRequestResult> {
  const { admin, shopId, candidate, readinessLines } = input;
  const { line, workOrder, menuRepairItem } = candidate;

  const requiredLines = readinessLines.filter((readinessLine) => readinessLine.isRequired);
  if (requiredLines.length === 0) {
    return {
      eligible: false,
      reason: "Mapped menu repair item has no required parts defined.",
    };
  }
  // "Exact parts mapping": every required part must resolve unambiguously
  // against the shop's own catalog (buildPartsReadinessForMenuRepairItems
  // itself treats a normalized part number/SKU collision across more than
  // one distinct catalog part as unmatched, not an arbitrary pick). A
  // required part that resolved but is short on stock is still an exact
  // mapping — that is precisely the case a parts request exists for.
  if (requiredLines.some((readinessLine) => readinessLine.status === "unmatched")) {
    return {
      eligible: false,
      reason: "A required part could not be matched unambiguously to the shop's parts catalog.",
    };
  }

  const items = requiredLines.map((readinessLine) => ({
    description: readinessLine.partName,
    qty: readinessLine.qtyRequired,
    partNumber: readinessLine.partNumber,
  }));

  // Always record the shadow observation, whether or not this shop is
  // enabled for real execution — this is the telemetry Phase 5's rollout
  // gate is measured against.
  await recordAutomationEvidence({
    shopId,
    capability: AUTOMATION_CAPABILITY,
    evidenceKey: `work_order_line:${line.id}`,
    outcome: "observed",
    source: AUTOMATION_SOURCE,
    sourceEntityType: "work_order_line",
    sourceEntityId: line.id,
    metadata: { menuRepairItemId: menuRepairItem.id, itemCount: items.length },
  });

  const executionEnabled = await isAiAutomaticExecutionEnabled(
    admin,
    shopId,
    AUTOMATION_CAPABILITY,
  );
  if (!executionEnabled) {
    return { eligible: true, executed: false, menuRepairItemId: menuRepairItem.id, items };
  }

  // Narrow (does not fully close) the window where an overlapping run
  // could double-create a request: re-check as close to the mutating call
  // as possible, not just once at the top of the resolve step. Fully
  // closing this needs an atomic, durable operation key inside
  // create_part_request_with_items itself, which is pre-existing, shared,
  // multiply-called code this change does not touch.
  const { data: raceCheck, error: raceCheckError } = await admin
    .from("part_request_items")
    .select("id")
    .eq("shop_id", shopId)
    .eq("work_order_line_id", line.id)
    .limit(1)
    .maybeSingle();
  if (raceCheckError) {
    throw new Error(
      `Could not re-check for an existing parts request: ${raceCheckError.message}`,
    );
  }
  if (raceCheck) {
    return { eligible: true, executed: false, menuRepairItemId: menuRepairItem.id, items };
  }

  // Create only the internal request needed to start the existing Parts
  // workflow — the same canonical, service-role-callable creator every
  // other parts-request path in the app already uses. This never selects a
  // supplier or places a purchase order; it only reaches "requested".
  type CreatePartRequestArgs =
    DB["public"]["Functions"]["create_part_request_with_items"]["Args"];
  const rpcArgs: CreatePartRequestArgs = {
    p_work_order_id: workOrder.id,
    p_items: items.map((item) => ({
      description: item.description,
      qty: item.qty,
      partNumber: item.partNumber ?? undefined,
    })) as unknown as CreatePartRequestArgs["p_items"],
    p_job_id: line.id,
    p_notes: `${AUTOMATED_PART_REQUEST_NOTES_MARKER} Automatically prepared from active menu repair "${menuRepairItem.name}" (Phase 5 GREEN command).`,
  };
  const { data, error: createError } = await admin.rpc(
    "create_part_request_with_items",
    rpcArgs,
  );
  // The generated RPC return-type union across every function in the schema
  // defeats narrowing here (a known supabase-js/postgrest-js inference
  // limit for large Functions maps); the migration declares this function's
  // real return type as a plain uuid string.
  const requestId = data as unknown as string | null;
  if (createError || !requestId) {
    throw new Error(
      `Automated parts request creation failed: ${createError?.message ?? "no request id returned"}`,
    );
  }

  return {
    eligible: true,
    executed: true,
    menuRepairItemId: menuRepairItem.id,
    items,
    requestId,
  };
}

/**
 * Convenience single-line entry point (used directly by tests and any
 * future non-batched caller). A sweep across many lines should call
 * resolveAppointmentPartsCandidate, a single batched
 * buildPartsReadinessForMenuRepairItems across every resolved candidate,
 * and finalizeAppointmentPartsRequest instead of this — see
 * syncAppointmentPartsPreparation — so the shop's full parts catalog isn't
 * re-scanned once per line.
 */
export async function prepareAppointmentPartsRequest(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  workOrderLineId: string;
}): Promise<PrepareAppointmentPartsRequestResult> {
  const { admin, shopId, workOrderLineId } = input;
  const resolved = await resolveAppointmentPartsCandidate({ admin, shopId, workOrderLineId });
  if (!resolved.eligible) return resolved;

  const readiness = await buildPartsReadinessForMenuRepairItems({
    admin,
    shopId,
    menuRepairItemIds: [resolved.candidate.menuRepairItem.id],
  });
  if (readiness.error) {
    throw new Error(`Could not resolve parts readiness: ${readiness.error}`);
  }

  return finalizeAppointmentPartsRequest({
    admin,
    shopId,
    candidate: resolved.candidate,
    readinessLines:
      readiness.readinessByMenuRepairItemId.get(resolved.candidate.menuRepairItem.id) ?? [],
  });
}
