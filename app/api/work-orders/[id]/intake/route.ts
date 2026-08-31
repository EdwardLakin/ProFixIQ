import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

import { IntakeV1Schema } from "@/features/work-orders/intake/schema.zod";
import type { IntakeMode, IntakeV1 } from "@/features/work-orders/intake/types";
import {
  buildPrefilledIntake,
  makeVehicleLabel,
} from "@/features/work-orders/intake/mappers";
import { buildIntakeSuggestedLines } from "@/features/work-orders/intake/server/buildIntakeSuggestedLines";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  resolveShopProductAccess,
  SHOP_PRODUCT_CAPABILITIES,
} from "@/features/shared/lib/product-access";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";

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

async function requireFleetIntakeAccess(params: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  userId: string;
  workOrder: Pick<
    DB["public"]["Tables"]["work_orders"]["Row"],
    "id" | "shop_id" | "vehicle_id"
  >;
}): Promise<boolean> {
  const { supabase, userId, workOrder } = params;

  const actor = await resolveFleetActorContext(supabase, { userId });
  if (!actor.capabilities.canAccessFleetIntake) return false;

  if (actor.isInternal) {
    return actor.shopId === workOrder.shop_id;
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

  return actor.fleetMemberships.some(
    (membership) =>
      membership.shopId === workOrder.shop_id &&
      fleetIds.includes(membership.fleetId),
  );
}

type IntakeAccessDecision = "allowed" | "denied" | "unavailable";

async function resolveIntakeAccess(params: {
  supabase: ReturnType<typeof createServerSupabaseRoute>;
  userId: string;
  mode: IntakeMode;
  workOrder: Pick<
    DB["public"]["Tables"]["work_orders"]["Row"],
    "id" | "shop_id" | "customer_id" | "vehicle_id"
  >;
}): Promise<IntakeAccessDecision> {
  const { supabase, userId, mode, workOrder } = params;

  try {
    if (mode === "fleet") {
      return (await requireFleetIntakeAccess({
        supabase,
        userId,
        workOrder,
      }))
        ? "allowed"
        : "denied";
    }

    if (mode === "portal") {
      const actor = await requirePortalCustomerActor(supabase);
      return actor.customer.id === workOrder.customer_id &&
        actor.customer.shop_id === workOrder.shop_id
        ? "allowed"
        : "denied";
    }

    const { profile, error } = await resolveAuthenticatedStaffProfile(
      supabase,
      userId,
    );
    if (error) return "unavailable";
    const actor = getActorCapabilities({ role: profile?.role });
    if (
      profile?.shop_id !== workOrder.shop_id ||
      !actor.isKnownRole ||
      actor.canonicalRole === "customer"
    ) {
      return "denied";
    }

    const productAccess = await resolveShopProductAccess({
      supabase,
      shopId: workOrder.shop_id,
      capabilities: SHOP_PRODUCT_CAPABILITIES,
    });
    if (productAccess.error) return "unavailable";
    return productAccess.entitled ? "allowed" : "denied";
  } catch (error) {
    if (error instanceof PortalAccessError) return "denied";
    return "unavailable";
  }
}

function intakeAccessError(decision: IntakeAccessDecision): Response | null {
  if (decision === "allowed") return null;
  return text(
    decision === "unavailable"
      ? "Authorization service unavailable."
      : "Forbidden.",
    decision === "unavailable" ? 503 : 403,
  );
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const mode = getMode(req.url);

  const supabase = createServerSupabaseRoute();

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

  const accessError = intakeAccessError(
    await resolveIntakeAccess({
      supabase,
      userId: auth.user.id,
      mode,
      workOrder: wo,
    }),
  );
  if (accessError) return accessError;

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

  const vehicles: Array<{
    vehicle_id: string;
    label?: string | null;
    unit_number?: string | null;
  }> = [];

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
      vehicles[0]?.vehicle_id ??
      null;

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

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabaseRoute();

  let body: { intake?: IntakeV1; mode?: IntakeMode } | null = null;
  try {
    body = (await req.json()) as { intake?: IntakeV1; mode?: IntakeMode };
  } catch {
    return text("Invalid JSON.");
  }

  if (!body?.intake) return text("Missing intake.");
  const parsed = IntakeV1Schema.parse(body.intake);

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return text("Not authenticated.", 401);

  const { data: workOrder, error: workOrderErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id")
    .eq("id", id)
    .maybeSingle();
  if (workOrderErr) return text(workOrderErr.message, 500);
  if (!workOrder) return text("Work order not found.", 404);
  if (!workOrder.shop_id) return text("Work order missing shop_id.", 400);

  const accessError = intakeAccessError(
    await resolveIntakeAccess({
      supabase,
      userId: auth.user.id,
      mode: body.mode ?? "portal",
      workOrder,
    }),
  );
  if (accessError) return accessError;

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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabaseRoute();

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

  const accessError = intakeAccessError(
    await resolveIntakeAccess({
      supabase,
      userId: auth.user.id,
      mode,
      workOrder,
    }),
  );
  if (accessError) return accessError;

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
      (
        line: ReturnType<typeof buildIntakeSuggestedLines>[number],
      ): WorkOrderLineInsert => ({
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
