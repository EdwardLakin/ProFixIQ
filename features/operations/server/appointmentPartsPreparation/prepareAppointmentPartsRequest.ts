import type { Database } from "@shared/types/types/supabase";
import { recordAutomationEvidence } from "@/features/ai/server/automationEvidence";
import { isAiAutomaticExecutionEnabled } from "@/features/ai/server/automationPolicy";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { buildPartsReadinessForMenuRepairItems } from "../appointmentPreparation/buildPartsReadiness";

type DB = Database;

type MenuRepairItemCompat = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  "vehicle_year" | "vehicle_make" | "vehicle_model" | "engine" | "drivetrain" | "transmission" | "fuel_type"
>;
type VehicleCompat = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  "year" | "make" | "model" | "engine" | "drivetrain" | "transmission" | "fuel_type"
>;

/**
 * Phase 5 of the dashboard assistant plan: the first deterministic GREEN
 * command — one whose contract makes unsafe inputs impossible, rather than
 * loosening a generic write tool's confirmation policy.
 *
 * This is the "parts_ordering" AI automation capability's shadow/execution
 * entry point (features/ai/automation). It creates only the internal
 * request needed to start the existing Parts workflow — never a supplier
 * choice or a purchase order — and only for an explicit, already-mapped,
 * active, vehicle-compatible menu repair on a work-order line that traces
 * back to a real booking.
 */
export const AUTOMATION_CAPABILITY = "parts_ordering" as const;
export const AUTOMATION_SOURCE = "prepare_appointment_parts_request" as const;

export type PrepareAppointmentPartsRequestResult =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      executed: boolean;
      menuRepairItemId: string;
      items: Array<{ description: string; qty: number; partNumber: string | null }>;
      requestId?: string;
    };

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * A menu repair item's vehicle-compatibility columns are nullable, meaning
 * "applies broadly" — an oil change isn't restricted to one year/make/model.
 * A field the menu item DOES specify must match the target vehicle exactly.
 * This never loosens a stated restriction; it only lets an unstated one pass.
 */
export function isVehicleCompatibleWithMenuRepairItem(
  vehicle: VehicleCompat,
  menuRepairItem: MenuRepairItemCompat,
): boolean {
  if (
    menuRepairItem.vehicle_year != null &&
    menuRepairItem.vehicle_year !== vehicle.year
  ) {
    return false;
  }

  const textFields: Array<[unknown, unknown]> = [
    [menuRepairItem.vehicle_make, vehicle.make],
    [menuRepairItem.vehicle_model, vehicle.model],
    [menuRepairItem.engine, vehicle.engine],
    [menuRepairItem.drivetrain, vehicle.drivetrain],
    [menuRepairItem.transmission, vehicle.transmission],
    [menuRepairItem.fuel_type, vehicle.fuel_type],
  ];
  return textFields.every(([required, actual]) => {
    const requiredText = normalizedText(required);
    if (!requiredText) return true;
    return requiredText === normalizedText(actual);
  });
}

export async function prepareAppointmentPartsRequest(input: {
  admin: ReturnType<typeof createAdminSupabase>;
  shopId: string;
  workOrderLineId: string;
}): Promise<PrepareAppointmentPartsRequestResult> {
  const { admin, shopId, workOrderLineId } = input;

  const { data: line, error: lineError } = await admin
    .from("work_order_lines")
    .select("id, shop_id, work_order_id, menu_item_id, vehicle_id, voided_at")
    .eq("shop_id", shopId)
    .eq("id", workOrderLineId)
    .maybeSingle();
  if (lineError) {
    return { eligible: false, reason: `Could not load work order line: ${lineError.message}` };
  }
  if (!line) return { eligible: false, reason: "Work order line not found." };
  if (line.voided_at) return { eligible: false, reason: "Line is voided." };
  // The exact, explicit mapping this command requires: a line created from a
  // specific menu repair item, not a fuzzy or inferred match.
  if (!line.menu_item_id) {
    return { eligible: false, reason: "Line has no explicit menu-repair-item mapping." };
  }

  const { data: workOrder, error: woError } = await admin
    .from("work_orders")
    .select("id, shop_id, vehicle_id, archived_at")
    .eq("shop_id", shopId)
    .eq("id", line.work_order_id)
    .maybeSingle();
  if (woError) {
    return { eligible: false, reason: `Could not load work order: ${woError.message}` };
  }
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
  if (bookingError) {
    return { eligible: false, reason: `Could not load booking: ${bookingError.message}` };
  }
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
    return {
      eligible: false,
      reason: `Could not check for an existing parts request: ${existingError.message}`,
    };
  }
  if (existingItem) {
    return { eligible: false, reason: "A parts request already exists for this line." };
  }

  const { data: menuRepairItem, error: menuError } = await admin
    .from("menu_repair_items")
    .select(
      "id, shop_id, name, is_active, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission, fuel_type",
    )
    .eq("shop_id", shopId)
    .eq("id", line.menu_item_id)
    .maybeSingle();
  if (menuError) {
    return { eligible: false, reason: `Could not load menu repair item: ${menuError.message}` };
  }
  if (!menuRepairItem) return { eligible: false, reason: "Mapped menu repair item not found." };
  if (!menuRepairItem.is_active) {
    return { eligible: false, reason: "Mapped menu repair item is not active." };
  }

  const vehicleId = line.vehicle_id ?? workOrder.vehicle_id;
  if (!vehicleId) return { eligible: false, reason: "No vehicle on the work order." };
  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .select("id, year, make, model, engine, drivetrain, transmission, fuel_type")
    .eq("shop_id", shopId)
    .eq("id", vehicleId)
    .maybeSingle();
  if (vehicleError) {
    return { eligible: false, reason: `Could not load vehicle: ${vehicleError.message}` };
  }
  if (!vehicle) return { eligible: false, reason: "Vehicle not found." };
  if (!isVehicleCompatibleWithMenuRepairItem(vehicle, menuRepairItem)) {
    return {
      eligible: false,
      reason: "Vehicle is not compatible with the mapped menu repair item.",
    };
  }

  const readiness = await buildPartsReadinessForMenuRepairItems({
    admin,
    shopId,
    menuRepairItemIds: [menuRepairItem.id],
  });
  if (readiness.error) {
    return {
      eligible: false,
      reason: `Could not resolve parts readiness: ${readiness.error}`,
    };
  }
  const readinessLines = readiness.readinessByMenuRepairItemId.get(menuRepairItem.id) ?? [];
  const requiredLines = readinessLines.filter((readinessLine) => readinessLine.isRequired);
  if (requiredLines.length === 0) {
    return {
      eligible: false,
      reason: "Mapped menu repair item has no required parts defined.",
    };
  }
  // "Exact parts mapping": every required part must resolve unambiguously
  // against the shop's own catalog. An unmatched required part means the
  // mapping isn't exact, so this fails closed rather than guessing.
  if (requiredLines.some((readinessLine) => readinessLine.status === "unmatched")) {
    return {
      eligible: false,
      reason: "A required part could not be matched to the shop's parts catalog.",
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
    p_notes: `Automatically prepared from active menu repair "${menuRepairItem.name}" (Phase 5 GREEN command).`,
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
