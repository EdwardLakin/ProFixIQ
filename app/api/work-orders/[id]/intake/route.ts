import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import { IntakeV1Schema } from "@/features/work-orders/intake/schema.zod";
import type { IntakeMode, IntakeV1 } from "@/features/work-orders/intake/types";
import { buildPrefilledIntake, makeVehicleLabel } from "@/features/work-orders/intake/mappers";
import { buildIntakeSuggestedLines } from "@/features/work-orders/intake/server/buildIntakeSuggestedLines";

type DB = Database;
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type WorkOrderLineInsert = DB["public"]["Tables"]["work_order_lines"]["Insert"];

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function text(message: string, status = 400) {
  return new NextResponse(message, { status });
}

function clean(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function getMode(url: string): IntakeMode {
  try {
    const u = new URL(url);
    const m = u.searchParams.get("mode");
    if (m === "portal" || m === "app" || m === "fleet") return m;
  } catch {}
  return "portal";
}

function isInternalShopRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager" || role === "advisor";
}

async function requireFleetIntakeAccess(params: {
  supabase: ReturnType<typeof createRouteHandlerClient<DB>>;
  userId: string;
  workOrder: Pick<
    DB["public"]["Tables"]["work_orders"]["Row"],
    "id" | "shop_id" | "vehicle_id"
  >;
}): Promise<boolean> {
  const { supabase, userId, workOrder } = params;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profileErr && profile?.id && isInternalShopRole(profile.role)) {
    return profile.shop_id === workOrder.shop_id;
  }

  if (!workOrder.vehicle_id) return false;

  const { data: fleetVehicles, error: fleetVehicleErr } = await supabase
    .from("fleet_vehicles")
    .select("fleet_id")
    .eq("vehicle_id", workOrder.vehicle_id);

  if (fleetVehicleErr || !fleetVehicles?.length) return false;

  const fleetIds = Array.from(
    new Set((fleetVehicles ?? []).map((row) => row.fleet_id).filter(Boolean)),
  );
  if (!fleetIds.length) return false;

  const { data: membership, error: membershipErr } = await supabase
    .from("fleet_members")
    .select("fleet_id")
    .eq("user_id", userId)
    .in("fleet_id", fleetIds)
    .limit(1)
    .maybeSingle();

  if (membershipErr || !membership?.fleet_id) return false;
  return true;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const mode = getMode(req.url);

  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return text("Not authenticated.", 401);

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id, intake_json")
    .eq("id", id)
    .maybeSingle();

  if (woErr) return text(woErr.message, 500);
  if (!wo) return text("Work order not found.", 404);
  if (!wo.shop_id) return text("Work order missing shop_id.", 400);

  if (mode === "fleet") {
    const canAccess = await requireFleetIntakeAccess({
      supabase,
      userId: auth.user.id,
      workOrder: {
        id: wo.id,
        shop_id: wo.shop_id,
        vehicle_id: wo.vehicle_id,
      },
    });
    if (!canAccess) return text("Forbidden.", 403);
  }

  let displayName: string | null = null;
  if (wo.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, name, business_name, first_name, last_name")
      .eq("id", wo.customer_id)
      .maybeSingle();

    displayName =
      cust?.business_name ??
      cust?.name ??
      (cust?.first_name || cust?.last_name
        ? [cust?.first_name, cust?.last_name].filter(Boolean).join(" ")
        : null) ??
      null;
  }

  const vehicles: Array<{ vehicle_id: string; label?: string | null; unit_number?: string | null }> = [];

  if (wo.customer_id) {
    const { data: vs } = await supabase
      .from("vehicles")
      .select("id, unit_number, year, make, model, vin")
      .eq("customer_id", wo.customer_id)
      .order("created_at", { ascending: false });

    (vs ?? []).forEach((v) => {
      const labelParts = [
        v.year ? String(v.year) : null,
        v.make ?? null,
        v.model ?? null,
        v.vin ? v.vin.slice(-6) : null,
      ].filter(Boolean);

      const label = labelParts.length ? labelParts.join(" ") : null;

      vehicles.push({
        vehicle_id: v.id,
        unit_number: v.unit_number ?? null,
        label: makeVehicleLabel({
          vehicle_id: v.id,
          unit_number: v.unit_number ?? null,
          label,
        }),
      });
    });
  }

  let intake: IntakeV1;
  const raw = (wo as { intake_json?: unknown }).intake_json;

  if (raw && typeof raw === "object") {
    intake = IntakeV1Schema.parse(raw);
  } else {
    const fallbackVehicleId =
      wo.vehicle_id ??
      (vehicles.length === 1 ? vehicles[0].vehicle_id : null) ??
      (vehicles[0]?.vehicle_id ?? null);

    intake = buildPrefilledIntake({
      profile: {
        customer_id: wo.customer_id ?? "",
        vehicles: vehicles.map((v) => ({
          vehicle_id: v.vehicle_id,
          unit_number: v.unit_number ?? null,
          label: v.label ?? null,
        })),
      },
      selected_vehicle_id: fallbackVehicleId,
    });

    if (wo.vehicle_id) intake.subject.vehicle_id = wo.vehicle_id;
    if (wo.customer_id) intake.subject.customer_id = wo.customer_id;
  }

  return json({
    workOrderId: wo.id,
    mode,
    displayName,
    vehicles,
    intake,
  });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = createRouteHandlerClient<DB>({ cookies });

  let body: { intake?: IntakeV1; mode?: IntakeMode } | null = null;
  try {
    body = (await req.json()) as { intake?: IntakeV1; mode?: IntakeMode };
  } catch {
    return text("Invalid JSON.");
  }

  if (!body?.intake) return text("Missing intake.");
  const parsed = IntakeV1Schema.parse(body.intake);

  if (body.mode === "fleet") {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return text("Not authenticated.", 401);

    const { data: workOrder, error: workOrderErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, vehicle_id")
      .eq("id", id)
      .maybeSingle();

    if (workOrderErr) return text(workOrderErr.message, 500);
    if (!workOrder) return text("Work order not found.", 404);
    if (!workOrder.shop_id) return text("Work order missing shop_id.", 400);

    const canAccess = await requireFleetIntakeAccess({
      supabase,
      userId: auth.user.id,
      workOrder,
    });
    if (!canAccess) return text("Forbidden.", 403);
  }

  const { error } = await supabase
    .from("work_orders")
    .update({
      intake_json: parsed,
      intake_status: "draft",
      intake_submitted_at: null,
      intake_submitted_by: null,
    })
    .eq("id", id);

  if (error) return text(error.message, 500);
  return json({ ok: true });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = createRouteHandlerClient<DB>({ cookies });

  let body: { intake?: IntakeV1; mode?: IntakeMode } | null = null;
  try {
    body = (await req.json()) as { intake?: IntakeV1; mode?: IntakeMode };
  } catch {
    return text("Invalid JSON.");
  }

  if (!body?.intake) return text("Missing intake.");
  const parsed = IntakeV1Schema.parse(body.intake);
  const mode = body.mode ?? "portal";

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return text(authErr.message, 401);
  if (!auth?.user?.id) return text("Not authenticated.", 401);

  const { data: workOrder, error: workOrderErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id, customer_id")
    .eq("id", id)
    .maybeSingle();

  if (workOrderErr) return text(workOrderErr.message, 500);
  if (!workOrder) return text("Work order not found.", 404);
  if (!workOrder.shop_id) return text("Work order missing shop_id.", 400);

  if (mode === "fleet") {
    const canAccess = await requireFleetIntakeAccess({
      supabase,
      userId: auth.user.id,
      workOrder,
    });
    if (!canAccess) return text("Forbidden.", 403);
  }

  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: workOrder.shop_id,
  });

  if (ctxErr) return text(ctxErr.message, 500);

  const { error: saveErr } = await supabase
    .from("work_orders")
    .update({
      intake_json: parsed,
      intake_status: "submitted",
      intake_submitted_at: new Date().toISOString(),
      intake_submitted_by: auth.user.id,
    })
    .eq("id", id);

  if (saveErr) return text(saveErr.message, 500);

  const { data: menuItems, error: menuErr } = await supabase
    .from("menu_items")
    .select("*")
    .eq("shop_id", workOrder.shop_id)
    .eq("is_active", true);

  if (menuErr) return text(menuErr.message, 500);

  const suggestedLines = buildIntakeSuggestedLines({
    intake: parsed,
    menuItems: (menuItems ?? []) as MenuItemRow[],
  });

  const { data: existingLines, error: existingErr } = await supabase
    .from("work_order_lines")
    .select("id, description")
    .eq("work_order_id", id);

  if (existingErr) return text(existingErr.message, 500);

  const existingDescriptions = new Set(
    (existingLines ?? [])
      .map((line) => clean(line.description).toLowerCase())
      .filter(Boolean),
  );

  const linesToInsert = suggestedLines
    .filter(
      (line: ReturnType<typeof buildIntakeSuggestedLines>[number]) =>
        !existingDescriptions.has(clean(line.description).toLowerCase()),
    )
    .map(
      (line: ReturnType<typeof buildIntakeSuggestedLines>[number]): WorkOrderLineInsert => ({
        work_order_id: id,
        shop_id: workOrder.shop_id,
        vehicle_id: parsed.subject.vehicle_id || workOrder.vehicle_id || null,
        description: line.description,
        complaint: line.complaint,
        notes: line.notes,
        job_type: line.jobType,
        labor_time: line.laborTime,
        status: "awaiting",
        priority: 3,
        menu_item_id: line.menuItemId ?? null,
        inspection_template_id: line.inspectionTemplateId ?? null,
      }),
    );

  if (linesToInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from("work_order_lines")
      .insert(linesToInsert);

    if (insertErr) return text(insertErr.message, 500);
  }

  return json({
    ok: true,
    inserted: linesToInsert.length,
    suggestions: suggestedLines,
  });
}
