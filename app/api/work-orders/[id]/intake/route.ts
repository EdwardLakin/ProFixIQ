import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
import {
  requirePortalCustomerActor,
} from "@/features/portal/server/requirePortalActor";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import type { Database } from "@shared/types/types/supabase";

import { IntakeV1Schema } from "@/features/work-orders/intake/schema.zod";
import type { IntakeMode, IntakeV1 } from "@/features/work-orders/intake/types";
import { buildPrefilledIntake, makeVehicleLabel } from "@/features/work-orders/intake/mappers";
import { buildIntakeSuggestedLines } from "@/features/work-orders/intake/server/buildIntakeSuggestedLines";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

type DB = Database;
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type WorkOrderLineInsert = DB["public"]["Tables"]["work_order_lines"]["Insert"];

type IntakeWorkOrderScope = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  "id" | "shop_id" | "customer_id" | "vehicle_id"
>;

/**
 * Authorizes a request against a specific work order for the given intake
 * mode. Every method (GET/PUT/POST) must call this before reading or
 * writing intake data — mode alone (e.g. `?mode=app`) is caller-supplied
 * and must never be trusted as proof of access.
 */
export async function authorizeIntakeAccess(params: {
  mode: IntakeMode;
  workOrder: IntakeWorkOrderScope;
  fallbackSupabase: SupabaseClient<DB>;
}): Promise<
  | { ok: true; supabase: SupabaseClient<DB> }
  | { ok: false; response: NextResponse }
> {
  const { mode, workOrder, fallbackSupabase } = params;

  if (mode === "app") {
    const access = await requireShopScopedApiAccess({
      allowRoles: ROLE_GROUPS.workOrderManagers,
    });
    if (!access.ok) return { ok: false, response: access.response };
    if (access.profile.shop_id !== workOrder.shop_id) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, supabase: access.supabase };
  }

  if (mode === "portal") {
    try {
      const actor = await requirePortalCustomerActor(fallbackSupabase);
      if (
        !workOrder.customer_id ||
        actor.customer.id !== workOrder.customer_id
      ) {
        return {
          ok: false,
          response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
      }
      return { ok: true, supabase: fallbackSupabase };
    } catch (error) {
      if (error instanceof PortalAccessError) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: error.message },
            { status: error.status },
          ),
        };
      }
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Portal authorization failed." },
          { status: 401 },
        ),
      };
    }
  }

  // fleet
  const {
    data: { user },
    error: authErr,
  } = await fallbackSupabase.auth.getUser();
  if (authErr || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    };
  }

  const canAccess = await requireFleetIntakeAccess({
    supabase: fallbackSupabase,
    userId: user.id,
    workOrder,
  });
  if (!canAccess) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }
  return { ok: true, supabase: fallbackSupabase };
}

/**
 * Rejects an intake payload that tries to move a work order to a different
 * customer, or attach a vehicle that doesn't belong to that customer.
 * Scanning/OCR and client-side dropdowns are untrusted input; the server
 * is the only place this is safe to enforce.
 */
export async function verifyIntakeSubjectScope(params: {
  supabase: SupabaseClient<DB>;
  workOrder: IntakeWorkOrderScope;
  intake: IntakeV1;
}): Promise<NextResponse | null> {
  const { supabase, workOrder, intake } = params;
  const subjectCustomerId = intake.subject.customer_id || null;
  const subjectVehicleId = intake.subject.vehicle_id || null;

  if (
    workOrder.customer_id &&
    subjectCustomerId &&
    subjectCustomerId !== workOrder.customer_id
  ) {
    return NextResponse.json(
      { error: "Intake cannot change the customer linked to this work order." },
      { status: 403 },
    );
  }

  if (subjectVehicleId && workOrder.customer_id) {
    const { data: vehicle, error: vehicleErr } = await supabase
      .from("vehicles")
      .select("id, customer_id")
      .eq("id", subjectVehicleId)
      .maybeSingle();

    if (vehicleErr) {
      return NextResponse.json({ error: vehicleErr.message }, { status: 500 });
    }
    if (!vehicle || vehicle.customer_id !== workOrder.customer_id) {
      return NextResponse.json(
        { error: "The selected vehicle does not belong to this work order's customer." },
        { status: 403 },
      );
    }
  }

  return null;
}

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

  const supabase = createServerSupabaseRoute();

  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id, intake_json")
    .eq("id", id)
    .maybeSingle();

  if (woErr) return text(woErr.message, 500);
  if (!wo) return text("Work order not found.", 404);
  if (!wo.shop_id) return text("Work order missing shop_id.", 400);

  const access = await authorizeIntakeAccess({
    mode,
    workOrder: {
      id: wo.id,
      shop_id: wo.shop_id,
      customer_id: wo.customer_id,
      vehicle_id: wo.vehicle_id,
    },
    fallbackSupabase: supabase,
  });
  if (!access.ok) return access.response;

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
  const supabase = createServerSupabaseRoute();

  let body: { intake?: IntakeV1; mode?: IntakeMode } | null = null;
  try {
    body = (await req.json()) as { intake?: IntakeV1; mode?: IntakeMode };
  } catch {
    return text("Invalid JSON.");
  }

  if (!body?.intake) return text("Missing intake.");
  const parsed = IntakeV1Schema.parse(body.intake);
  const mode: IntakeMode = body.mode ?? "portal";

  const { data: workOrder, error: workOrderErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, customer_id, vehicle_id")
    .eq("id", id)
    .maybeSingle();

  if (workOrderErr) return text(workOrderErr.message, 500);
  if (!workOrder) return text("Work order not found.", 404);
  if (!workOrder.shop_id) return text("Work order missing shop_id.", 400);

  const access = await authorizeIntakeAccess({
    mode,
    workOrder,
    fallbackSupabase: supabase,
  });
  if (!access.ok) return access.response;

  const scopeError = await verifyIntakeSubjectScope({
    supabase: access.supabase,
    workOrder,
    intake: parsed,
  });
  if (scopeError) return scopeError;

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
  const supabase = createServerSupabaseRoute();

  let body: { intake?: IntakeV1; mode?: IntakeMode } | null = null;
  try {
    body = (await req.json()) as { intake?: IntakeV1; mode?: IntakeMode };
  } catch {
    return text("Invalid JSON.");
  }

  if (!body?.intake) return text("Missing intake.");
  const parsed = IntakeV1Schema.parse(body.intake);
  const mode: IntakeMode = body.mode ?? "portal";

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

  const access = await authorizeIntakeAccess({
    mode,
    workOrder,
    fallbackSupabase: supabase,
  });
  if (!access.ok) return access.response;

  const scopeError = await verifyIntakeSubjectScope({
    supabase: access.supabase,
    workOrder,
    intake: parsed,
  });
  if (scopeError) return scopeError;

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
    // Alias of `inserted`: the desktop create-work-order quick-intake
    // caller (features/work-orders/app/work-orders/create/page.tsx) reads
    // `createdLines` — keep both names so neither caller silently reports
    // zero lines created.
    createdLines: linesToInsert.length,
    suggestions: suggestedLines,
  });
}
