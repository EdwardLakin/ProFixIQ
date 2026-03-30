import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { createPricingSnapshotFromWorkOrderLine } from "@/features/menu-repair-items/server/createPricingSnapshotFromWorkOrderLine";

export const runtime = "nodejs";

type DB = Database;

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];

type MenuRepairItemInsert = DB["public"]["Tables"]["menu_repair_items"]["Insert"];
type MenuRepairItemUpdate = DB["public"]["Tables"]["menu_repair_items"]["Update"];

interface RequestBody {
  workOrderLineId?: string;
}

interface UpsertResponse {
  ok: boolean;
  menuRepairItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
}

type AllocationJoined = Pick<AllocationRow, "qty" | "unit_cost" | "part_id"> & {
  parts: { name: PartRow["name"] }[] | { name: PartRow["name"] } | null;
};

type WorkOrderLineLite = Pick<
  WorkOrderLineRow,
  | "id"
  | "work_order_id"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "notes"
  | "labor_time"
  | "price_estimate"
  | "shop_id"
>;

type WorkOrderLite = Pick<WorkOrderRow, "id" | "shop_id" | "vehicle_id">;

type VehicleLite = Pick<
  VehicleRow,
  "year" | "make" | "model" | "engine" | "drivetrain" | "transmission" | "fuel_type"
>;

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNonNeg(n: number): number {
  return n < 0 ? 0 : n;
}

function partNameFromJoin(j: AllocationJoined["parts"]): string | null {
  if (!j) return null;
  if (Array.isArray(j)) {
    const nm = j[0]?.name;
    return typeof nm === "string" && nm.trim().length ? nm.trim() : null;
  }
  const rec = j as { name?: unknown };
  return typeof rec?.name === "string" && rec.name.trim().length ? rec.name.trim() : null;
}

function compactKeyPart(v: unknown): string {
  return (
    safeTrim(v)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "na"
  );
}

function buildTemplateKey(args: {
  shopId: string;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
  name: string;
  complaint: string | null;
}): string {
  return [
    args.shopId,
    args.year ?? "na",
    compactKeyPart(args.make),
    compactKeyPart(args.model),
    compactKeyPart(args.engine),
    compactKeyPart(args.drivetrain),
    compactKeyPart(args.transmission),
    compactKeyPart(args.name || args.complaint || "repair"),
  ].join("::");
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    const body: UpsertResponse = {
      ok: false,
      error: "auth_error",
      detail: userErr?.message ?? "Not signed in",
    };
    return NextResponse.json(body, { status: 401 });
  }

  const json = (await req.json().catch(() => null)) as RequestBody | null;
  const lineId = typeof json?.workOrderLineId === "string" ? json.workOrderLineId.trim() : "";

  if (!lineId) {
    const body: UpsertResponse = {
      ok: false,
      error: "bad_request",
      detail: "workOrderLineId is required",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const { data: wol, error: wolErr } = await supabase
    .from("work_order_lines")
    .select(
      "id, work_order_id, description, complaint, cause, correction, notes, labor_time, price_estimate, shop_id",
    )
    .eq("id", lineId)
    .maybeSingle<WorkOrderLineLite>();

  if (wolErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "line_load_failed",
      detail: wolErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (!wol?.work_order_id) {
    const body: UpsertResponse = {
      ok: false,
      error: "not_found",
      detail: "Work order line not found",
    };
    return NextResponse.json(body, { status: 404 });
  }

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id")
    .eq("id", wol.work_order_id)
    .maybeSingle<WorkOrderLite>();

  if (woErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "order_load_failed",
      detail: woErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  let shopId = safeTrim(wo?.shop_id || wol.shop_id);

  if (!shopId) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<Pick<ProfileRow, "shop_id">>();

    shopId = safeTrim(prof?.shop_id);
  }

  if (!shopId) {
    const body: UpsertResponse = {
      ok: false,
      error: "missing_shop",
      detail: "Cannot save repair item — missing shop for work order line",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
  if (ctxErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "shop_context_failed",
      detail: ctxErr.message,
    };
    return NextResponse.json(body, { status: 403 });
  }

  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("labor_rate")
    .eq("id", shopId)
    .maybeSingle();

  if (shopErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "shop_load_failed",
      detail: shopErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  const laborRate =
    typeof shop?.labor_rate === "number" && Number.isFinite(shop.labor_rate)
      ? shop.labor_rate
      : 0;

  let vehicleYear: number | null = null;
  let vehicleMake: string | null = null;
  let vehicleModel: string | null = null;
  let engine: string | null = null;
  let drivetrain: string | null = null;
  let transmission: string | null = null;
  let fuelType: string | null = null;

  if (wo?.vehicle_id) {
    const { data: veh } = await supabase
      .from("vehicles")
      .select("year, make, model, engine, drivetrain, transmission, fuel_type")
      .eq("id", wo.vehicle_id)
      .maybeSingle<VehicleLite>();

    vehicleYear = typeof veh?.year === "number" ? veh.year : num(veh?.year) || null;
    vehicleMake = safeTrim(veh?.make) || null;
    vehicleModel = safeTrim(veh?.model) || null;
    engine = safeTrim(veh?.engine) || null;
    drivetrain = safeTrim(veh?.drivetrain) || null;
    transmission = safeTrim(veh?.transmission) || null;
    fuelType = safeTrim(veh?.fuel_type) || null;
  }

  const { data: rawAllocations, error: allocErr } = await supabase
    .from("work_order_part_allocations")
    .select("qty, unit_cost, part_id, parts(name)")
    .eq("work_order_line_id", wol.id);

  if (allocErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "parts_load_failed",
      detail: allocErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  const allocations = (rawAllocations ?? []) as AllocationJoined[];

  const parts = allocations
    .map((a) => {
      const quantity = clampNonNeg(num(a.qty));
      const unitCost = clampNonNeg(num(a.unit_cost));
      if (quantity <= 0) return null;

      const name = partNameFromJoin(a.parts) ?? "Part";
      return {
        name,
        qty: quantity,
        unit_cost: unitCost,
        part_id: typeof a.part_id === "string" && a.part_id.length ? a.part_id : null,
      };
    })
    .filter((p): p is { name: string; qty: number; unit_cost: number; part_id: string | null } => Boolean(p));

  const laborHours =
    typeof wol.labor_time === "number" && Number.isFinite(wol.labor_time)
      ? clampNonNeg(wol.labor_time)
      : null;

  const name = safeTrim(wol.description) || safeTrim(wol.complaint) || "Repair item";
  const complaint = safeTrim(wol.complaint) || null;
  const cause = safeTrim(wol.cause) || null;
  const correction = safeTrim(wol.correction) || null;
  const notes = safeTrim(wol.notes) || null;
  const priceEstimate =
    typeof wol.price_estimate === "number" && Number.isFinite(wol.price_estimate)
      ? wol.price_estimate
      : null;

  const templateKey = buildTemplateKey({
    shopId,
    year: vehicleYear,
    make: vehicleMake,
    model: vehicleModel,
    engine,
    drivetrain,
    transmission,
    name,
    complaint,
  });

  const insertPayload: MenuRepairItemInsert = {
    shop_id: shopId,
    source_work_order_id: wol.work_order_id,
    source_work_order_line_id: wol.id,
    name,
    complaint,
    cause,
    correction,
    notes,
    vehicle_year: vehicleYear,
    vehicle_make: vehicleMake,
    vehicle_model: vehicleModel,
    engine,
    drivetrain,
    transmission,
    fuel_type: fuelType,
    labor_hours: laborHours,
    labor_rate: laborRate || null,
    price_estimate: priceEstimate,
    parts: parts as unknown as MenuRepairItemInsert["parts"],
    template_key: templateKey,
    usage_count: 1,
    is_active: true,
  };

  const { data: existing, error: existingErr } = await supabase
    .from("menu_repair_items")
    .select("id, usage_count")
    .eq("shop_id", shopId)
    .eq("template_key", templateKey)
    .maybeSingle();

  if (existingErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "existing_lookup_failed",
      detail: existingErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (existing?.id) {
    const updatePayload: MenuRepairItemUpdate = {
      source_work_order_id: wol.work_order_id,
      source_work_order_line_id: wol.id,
      name,
      complaint,
      cause,
      correction,
      notes,
      vehicle_year: vehicleYear,
      vehicle_make: vehicleMake,
      vehicle_model: vehicleModel,
      engine,
      drivetrain,
      transmission,
      fuel_type: fuelType,
      labor_hours: laborHours,
      labor_rate: laborRate || null,
      price_estimate: priceEstimate,
      parts: parts as unknown as MenuRepairItemUpdate["parts"],
      usage_count: (existing.usage_count ?? 0) + 1,
      is_active: true,
    };

    const { error: updErr } = await supabase
      .from("menu_repair_items")
      .update(updatePayload)
      .eq("id", existing.id);

    if (updErr) {
      const body: UpsertResponse = {
        ok: false,
        error: "update_failed",
        detail: updErr.message,
      };
      return NextResponse.json(body, { status: 400 });
    }

    try {
      await createPricingSnapshotFromWorkOrderLine({
        supabase,
        workOrderLineId: lineId,
        menuRepairItemId: existing.id,
        pricingValidDays: 30,
        uploadedBy: user.id,
        quoteSource: "work_order_capture",
        quoteReference: lineId,
      });
    } catch {
      // fail open: repair promotion should still succeed even if snapshot creation fails
    }

    return NextResponse.json({
      ok: true,
      menuRepairItemId: existing.id,
      updated: true,
    } satisfies UpsertResponse);
  }

  const { data: created, error: insErr } = await supabase
    .from("menu_repair_items")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr || !created) {
    const body: UpsertResponse = {
      ok: false,
      error: "insert_failed",
      detail: insErr?.message ?? "Failed to create repair item",
    };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    await createPricingSnapshotFromWorkOrderLine({
      supabase,
      workOrderLineId: lineId,
      menuRepairItemId: created.id,
      pricingValidDays: 30,
      uploadedBy: user.id,
      quoteSource: "work_order_capture",
      quoteReference: lineId,
    });
  } catch {
    // fail open: repair promotion should still succeed even if snapshot creation fails
  }

  return NextResponse.json({
    ok: true,
    menuRepairItemId: created.id,
    updated: false,
  } satisfies UpsertResponse);
}
