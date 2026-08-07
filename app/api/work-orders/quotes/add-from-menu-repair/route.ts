import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database, Json } from "@shared/types/types/supabase";
import { getActiveMenuRepairPricingSnapshot } from "@/features/parts/server/getActiveMenuRepairPricingSnapshot";
import { normalizeLaborHoursInput } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import {
  COMPLETED_REPAIR_SOURCE,
  COMPLETED_REPAIR_STATUSES,
  matchesCompletedRepairVehicle,
  resolveCompletedRepairSubtotal,
} from "@/features/menu-repair-items/lib/completedRepair";
import {
  customerVisibleReuseParts,
  persistReusePartRequest,
  type ReusePartPersistenceInput,
} from "./reusePartPersistence";

type DB = Database;
type QuoteInsert = DB["public"]["Tables"]["work_order_quote_lines"]["Insert"];

type Body = {
  workOrderId?: string;
  menuRepairItemId?: string;
  notes?: string | null;
  laborHours?: number | null;
};

type MenuRepairItemLite = Pick<
  DB["public"]["Tables"]["menu_repair_items"]["Row"],
  | "id"
  | "shop_id"
  | "name"
  | "complaint"
  | "cause"
  | "correction"
  | "labor_hours"
  | "labor_rate"
  | "price_estimate"
  | "pricing_valid_days"
  | "parts"
  | "is_active"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "engine"
  | "drivetrain"
  | "transmission"
  | "fuel_type"
  | "source_work_order_line_id"
  | "last_pricing_source"
>;

type WorkOrderLite = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  | "id"
  | "shop_id"
  | "vehicle_id"
  | "vehicle_year"
  | "vehicle_make"
  | "vehicle_model"
  | "vehicle_engine"
  | "vehicle_drivetrain"
  | "vehicle_transmission"
  | "vehicle_fuel_type"
>;

type VehicleLite = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  | "id"
  | "shop_id"
  | "year"
  | "make"
  | "model"
  | "engine"
  | "drivetrain"
  | "transmission"
  | "fuel_type"
>;

type SnapshotPart = NonNullable<Awaited<ReturnType<typeof getActiveMenuRepairPricingSnapshot>>>["parts"][number];

type ReusePart = ReusePartPersistenceInput;

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveQty(value: unknown): number {
  const qty = finiteNumber(value);
  return qty != null && qty > 0 ? qty : 1;
}

function money(value: unknown): number | null {
  const n = finiteNumber(value);
  return n == null || n < 0 ? null : n;
}

function vehicleContext(args: {
  workOrder: WorkOrderLite;
  vehicle: VehicleLite | null;
  repairItem: MenuRepairItemLite;
}): Record<string, Json> {
  const { workOrder, vehicle, repairItem } = args;
  return {
    work_order_vehicle_id: workOrder.vehicle_id,
    year: vehicle?.year ?? workOrder.vehicle_year ?? repairItem.vehicle_year ?? null,
    make: vehicle?.make ?? workOrder.vehicle_make ?? repairItem.vehicle_make ?? null,
    model: vehicle?.model ?? workOrder.vehicle_model ?? repairItem.vehicle_model ?? null,
    engine: vehicle?.engine ?? workOrder.vehicle_engine ?? repairItem.engine ?? null,
    drivetrain: vehicle?.drivetrain ?? workOrder.vehicle_drivetrain ?? repairItem.drivetrain ?? null,
    transmission:
      vehicle?.transmission ?? workOrder.vehicle_transmission ?? repairItem.transmission ?? null,
    fuel_type: vehicle?.fuel_type ?? workOrder.vehicle_fuel_type ?? repairItem.fuel_type ?? null,
  };
}

function partsFromSnapshot(parts: SnapshotPart[]): ReusePart[] {
  return parts
    .map((part) => ({
      description: safeTrim(part.partName),
      partNumber: safeTrim(part.quotedPartNumber) || null,
      supplierPartNumber: safeTrim(part.supplierPartNumber) || null,
      qty: positiveQty(part.qty),
      unitCost: money(part.unitCost),
      unitPrice: money(part.unitSell),
      availability: safeTrim(part.availability) || null,
      leadTime: safeTrim(part.leadTime) || null,
      notes: safeTrim(part.notes) || null,
      source: "pricing_snapshot" as const,
      sourcePricingPartId: part.id,
      sourceMenuRepairItemPartId: part.menuRepairItemPartId,
    }))
    .filter((part) => part.description.length > 0);
}

function partsFromMenuRepairItem(parts: Json): ReusePart[] {
  if (!Array.isArray(parts)) return [];

  return parts
    .map<ReusePart | null>((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return null;
      const record = part as Record<string, Json>;
      const description =
        safeTrim(record.description) ||
        safeTrim(record.name) ||
        safeTrim(record.part_name) ||
        safeTrim(record.label);
      if (!description) return null;
      return {
        description,
        partNumber:
          safeTrim(record.partNumber) || safeTrim(record.part_number) || safeTrim(record.sku) || null,
        supplierPartNumber: safeTrim(record.supplier_part_number) || null,
        qty: positiveQty(record.qty ?? record.quantity),
        unitCost: money(record.unitCost ?? record.unit_cost ?? record.cost),
        unitPrice: money(record.unitPrice ?? record.unit_price ?? record.price),
        availability: safeTrim(record.availability) || null,
        leadTime: safeTrim(record.leadTime ?? record.lead_time) || null,
        notes: safeTrim(record.notes) || null,
        source: "menu_repair_item" as const,
      };
    })
    .filter((part): part is ReusePart => part !== null);
}

function partTotal(parts: ReusePart[], usePricing: boolean): number | null {
  if (!usePricing) return null;
  if (parts.length === 0) return 0;
  if (!parts.every((part) => part.unitPrice != null)) return null;
  return parts.reduce((sum, part) => sum + (part.unitPrice ?? 0) * part.qty, 0);
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const body = (await req.json().catch(() => null)) as Body | null;

    const workOrderId = safeTrim(body?.workOrderId);
    const menuRepairItemId = safeTrim(body?.menuRepairItemId);
    const notes = safeTrim(body?.notes) || null;

    if (!workOrderId || !menuRepairItemId) {
      return NextResponse.json(
        { ok: false, error: "Missing workOrderId or menuRepairItemId" },
        { status: 400 },
      );
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
    }

    const shopId = safeTrim((profile as { shop_id?: unknown } | null)?.shop_id);
    if (!shopId) {
      return NextResponse.json({ ok: false, error: "Missing shop context" }, { status: 400 });
    }

    const { data: repairItem, error: repairErr } = await supabase
      .from("menu_repair_items")
      .select(
        "id, shop_id, name, complaint, cause, correction, labor_hours, labor_rate, price_estimate, pricing_valid_days, parts, is_active, vehicle_year, vehicle_make, vehicle_model, engine, drivetrain, transmission, fuel_type, source_work_order_line_id, last_pricing_source",
      )
      .eq("id", menuRepairItemId)
      .eq("shop_id", shopId)
      .maybeSingle<MenuRepairItemLite>();

    if (repairErr) {
      return NextResponse.json({ ok: false, error: repairErr.message }, { status: 500 });
    }

    if (!repairItem?.id || repairItem.shop_id !== shopId) {
      return NextResponse.json({ ok: false, error: "Repair item not found" }, { status: 404 });
    }

    if (repairItem.is_active !== true) {
      return NextResponse.json({ ok: false, error: "Repair item is inactive" }, { status: 409 });
    }

    if (
      !repairItem.source_work_order_line_id ||
      repairItem.last_pricing_source !== COMPLETED_REPAIR_SOURCE
    ) {
      return NextResponse.json(
        { ok: false, error: "Repair item is not backed by completed work" },
        { status: 409 },
      );
    }

    const { data: sourceLine, error: sourceLineError } = await supabase
      .from("work_order_lines")
      .select("id, status")
      .eq("id", repairItem.source_work_order_line_id)
      .eq("shop_id", shopId)
      .in("status", [...COMPLETED_REPAIR_STATUSES])
      .maybeSingle();
    if (sourceLineError) {
      return NextResponse.json({ ok: false, error: sourceLineError.message }, { status: 500 });
    }
    if (!sourceLine?.id) {
      return NextResponse.json(
        { ok: false, error: "Repair item is not backed by completed work" },
        { status: 409 },
      );
    }

    const { data: workOrder, error: workOrderErr } = await supabase
      .from("work_orders")
      .select(
        "id, shop_id, vehicle_id, vehicle_year, vehicle_make, vehicle_model, vehicle_engine, vehicle_drivetrain, vehicle_transmission, vehicle_fuel_type",
      )
      .eq("id", workOrderId)
      .eq("shop_id", shopId)
      .maybeSingle<WorkOrderLite>();

    if (workOrderErr) {
      return NextResponse.json({ ok: false, error: workOrderErr.message }, { status: 500 });
    }

    if (!workOrder?.id || workOrder.shop_id !== shopId) {
      return NextResponse.json({ ok: false, error: "Work order not found" }, { status: 404 });
    }

    let vehicle: VehicleLite | null = null;
    if (workOrder.vehicle_id) {
      const { data: vehicleRow, error: vehicleErr } = await supabase
        .from("vehicles")
        .select("id, shop_id, year, make, model, engine, drivetrain, transmission, fuel_type")
        .eq("id", workOrder.vehicle_id)
        .eq("shop_id", shopId)
        .maybeSingle<VehicleLite>();

      if (vehicleErr) {
        return NextResponse.json({ ok: false, error: vehicleErr.message }, { status: 500 });
      }
      vehicle = vehicleRow ?? null;
    }

    if (
      !matchesCompletedRepairVehicle(
        {
          year: vehicle?.year ?? workOrder.vehicle_year,
          make: vehicle?.make ?? workOrder.vehicle_make,
          model: vehicle?.model ?? workOrder.vehicle_model,
          engine: vehicle?.engine ?? workOrder.vehicle_engine,
          drivetrain: vehicle?.drivetrain ?? workOrder.vehicle_drivetrain,
          transmission: vehicle?.transmission ?? workOrder.vehicle_transmission,
        },
        {
          year: repairItem.vehicle_year,
          make: repairItem.vehicle_make,
          model: repairItem.vehicle_model,
          engine: repairItem.engine,
          drivetrain: repairItem.drivetrain,
          transmission: repairItem.transmission,
        },
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "Repair history does not match this vehicle" },
        { status: 409 },
      );
    }

    const activeSnapshot = await getActiveMenuRepairPricingSnapshot({
      supabase,
      menuRepairItemId: repairItem.id,
      shopId,
    });

    const pricingStatus = activeSnapshot?.pricingStatus ?? "expired";
    const snapshotParts = partsFromSnapshot(activeSnapshot?.parts ?? []);
    const fallbackParts = partsFromMenuRepairItem(repairItem.parts);
    const reuseParts = snapshotParts.length > 0 ? snapshotParts : fallbackParts;
    const hasSnapshot = Boolean(activeSnapshot?.snapshotId);
    const freshSnapshot = pricingStatus === "fresh" && hasSnapshot;

    const laborOverride =
      typeof body?.laborHours === "number" && Number.isFinite(body.laborHours)
        ? body.laborHours
        : null;
    const laborHours = normalizeLaborHoursInput(laborOverride ?? repairItem.labor_hours, true);
    const laborRate = money(repairItem.labor_rate);
    const completeFreshParts =
      freshSnapshot && (reuseParts.length === 0 || reuseParts.every((part) => part.unitPrice != null));
    const pricedFreshPartsTotal = partTotal(reuseParts, completeFreshParts);
    const hasFreshReusablePricing =
      activeSnapshot?.totalSell != null ||
      pricedFreshPartsTotal != null ||
      (laborHours != null && laborRate != null);
    const useFinalPricing = freshSnapshot && completeFreshParts && hasFreshReusablePricing;
    const partsVerificationRequired = !useFinalPricing;
    const laborTotal =
      useFinalPricing && laborHours != null && laborRate != null ? laborHours * laborRate : null;
    const partsTotal = partTotal(reuseParts, useFinalPricing);
    const snapshotPartsTotal = useFinalPricing
      ? money(activeSnapshot?.totalSell)
      : null;
    const subtotal = resolveCompletedRepairSubtotal({
      useFinalPricing,
      snapshotPartsTotal,
      partsTotal,
      laborTotal,
    });
    const grandTotal = subtotal;
    const status = useFinalPricing ? "quoted" : "pending_parts";
    const initialStatus = reuseParts.length > 0 ? "pending_parts" : status;
    const stage = "advisor_pending";
    const vehicleUsed = vehicleContext({ workOrder, vehicle, repairItem });

    const metadata: Record<string, Json | undefined> = {
      source: "menu_repair_reuse",
      source_menu_repair_item_id: repairItem.id,
      source_menu_repair_pricing_snapshot_id: activeSnapshot?.snapshotId ?? undefined,
      pricing_status_at_reuse: pricingStatus,
      pricing_valid_until_at_reuse: activeSnapshot?.validUntil ?? null,
      pricing_valid_days: activeSnapshot?.pricingValidDays ?? repairItem.pricing_valid_days ?? null,
      pricing_reuse_policy: useFinalPricing
        ? "fresh_snapshot_persisted_with_explicit_sell"
        : "verification_required_before_customer_send",
      parts_verification_required: partsVerificationRequired,
      vehicle: vehicleUsed,
      parts_source: snapshotParts.length > 0 ? "pricing_snapshot" : fallbackParts.length > 0 ? "menu_repair_item" : null,
      parts: customerVisibleReuseParts(reuseParts, useFinalPricing),
      supplier_id: activeSnapshot?.supplierId ?? null,
      supplier_name: activeSnapshot?.supplierName ?? null,
      currency: activeSnapshot?.currency ?? null,
      quoted_at: activeSnapshot?.quotedAt ?? null,
      snapshot_parts_total_at_reuse: snapshotPartsTotal,
      technician_or_advisor_note_at_reuse: notes,
    };

    const quoteRow: QuoteInsert = {
      work_order_id: workOrder.id,
      work_order_line_id: null,
      shop_id: shopId,
      vehicle_id: workOrder.vehicle_id,
      suggested_by: user.id,
      description: repairItem.name,
      job_type: "repair",
      est_labor_hours: laborHours,
      labor_hours: laborHours,
      labor_total: laborTotal,
      parts_total: partsTotal,
      subtotal,
      tax_total: null,
      grand_total: grandTotal,
      notes,
      status: initialStatus,
      stage,
      ai_complaint: notes || repairItem.complaint || null,
      ai_cause: repairItem.cause || null,
      ai_correction: repairItem.correction || null,
      qty: 1,
      metadata: metadata as Json,
      group_id: null,
      sent_to_customer_at: null,
      approved_at: null,
      declined_at: null,
    };

    const { data: created, error: createErr } = await supabase
      .from("work_order_quote_lines")
      .insert(quoteRow)
      .select("id")
      .single();

    if (createErr || !created?.id) {
      return NextResponse.json(
        { ok: false, error: createErr?.message ?? "Failed to create quote line" },
        { status: 500 },
      );
    }

    let partRequestCreated = false;
    let persistedStatus = initialStatus;
    let persistedStage: string | null = stage;
    let persistedPartsVerificationRequired = partsVerificationRequired;
    if (reuseParts.length > 0) {
      const partRequestResult = await persistReusePartRequest(supabase, {
        shopId,
        workOrderId: workOrder.id,
        quoteLineId: created.id,
        requestedBy: user.id,
        notes: [
          useFinalPricing
            ? "Fresh menu repair pricing persisted to the canonical parts request."
            : "Menu repair reuse requires parts/pricing verification before customer send.",
          `Pricing status at reuse: ${pricingStatus}`,
          activeSnapshot?.validUntil ? `Pricing valid until: ${activeSnapshot.validUntil}` : null,
          notes,
        ]
          .filter(Boolean)
          .join("\n"),
        parts: reuseParts,
        includeExplicitSell: useFinalPricing,
      });

      if (partRequestResult.error) {
        const { error: quoteCleanupError } = await supabase
          .from("work_order_quote_lines")
          .delete()
          .eq("id", created.id)
          .eq("shop_id", shopId);
        const error = quoteCleanupError
          ? `${partRequestResult.error}; quote cleanup failed: ${quoteCleanupError.message}`
          : partRequestResult.error;
        return NextResponse.json({ ok: false, error }, { status: 500 });
      }
      partRequestCreated = partRequestResult.created;
      persistedStatus = partRequestResult.sync?.status || initialStatus;
      persistedStage = partRequestResult.sync?.stage ?? stage;
      persistedPartsVerificationRequired = (partRequestResult.sync?.pendingCount ?? 0) > 0;
    }

    return NextResponse.json({
      ok: true,
      workOrderQuoteLineId: created.id,
      quoteLineId: created.id,
      pricingStatus,
      partsVerificationRequired: persistedPartsVerificationRequired,
      partRequestCreated,
      activePricingSnapshotId: activeSnapshot?.snapshotId ?? null,
      validUntil: activeSnapshot?.validUntil ?? null,
      status: persistedStatus,
      stage: persistedStage,
      message: "Added to Quote Review",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}
