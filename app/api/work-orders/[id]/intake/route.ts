import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import { IntakeV1Schema } from "@/features/work-orders/intake/schema.zod";
import type { IntakeMode, IntakeV1 } from "@/features/work-orders/intake/types";
import { buildPrefilledIntake, makeVehicleLabel } from "@/features/work-orders/intake/mappers";

type DB = Database;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function text(message: string, status = 400) {
  return new NextResponse(message, { status });
}

function getMode(url: string): IntakeMode {
  try {
    const u = new URL(url);
    const m = u.searchParams.get("mode");
    if (m === "portal" || m === "app" || m === "fleet") return m;
  } catch {}
  return "portal";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const mode = getMode(req.url);

  const supabase = createRouteHandlerClient<DB>({ cookies });

  // best-effort auth (used for submitted_by later)
  await supabase.auth.getUser();

  // Work order
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, customer_id, vehicle_id, intake_json")
    .eq("id", id)
    .maybeSingle();

  if (woErr) return text(woErr.message, 500);
  if (!wo) return text("Work order not found.", 404);

  // Customer display name (best-effort)
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

  // Vehicles for selection
  const vehicles: Array<{ vehicle_id: string; label?: string | null; unit_number?: string | null }> =
    [];

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

  // Intake payload
  let intake: IntakeV1;
  const raw = (wo as any).intake_json as unknown;

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
    body = (await req.json()) as any;
  } catch {
    return text("Invalid JSON.");
  }

  if (!body?.intake) return text("Missing intake.");
  const parsed = IntakeV1Schema.parse(body.intake);

  // Save draft: draft status + clear submission fields
  const { error } = await supabase
    .from("work_orders")
    .update({
      intake_json: parsed as any,
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
    body = (await req.json()) as any;
  } catch {
    return text("Invalid JSON.");
  }

  if (!body?.intake) return text("Missing intake.");
  const parsed = IntakeV1Schema.parse(body.intake);

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return text(authErr.message, 401);
  if (!auth?.user?.id) return text("Not authenticated.", 401);

  // Submit: submitted status + timestamp + submitted_by
  const { error } = await supabase
    .from("work_orders")
    .update({
      intake_json: parsed as any,
      intake_status: "submitted",
      intake_submitted_at: new Date().toISOString(),
      intake_submitted_by: auth.user.id,
    })
    .eq("id", id);

  if (error) return text(error.message, 500);
  return json({ ok: true });
}
