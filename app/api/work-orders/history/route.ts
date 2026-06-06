import { NextResponse } from "next/server";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";

export async function GET(request: Request) {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user || !actor.shopId) {
    console.info("[ServiceHistory] server auth unavailable", {
      actorPresent: Boolean(actor.user),
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/work-orders/history",
      table: "history",
    });
    return NextResponse.json({ error: "You must be signed in to view service history." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  let query = supabase
    .from("history")
    .select("id, customer_id, vehicle_id, work_order_id, service_date, description, notes, created_at, work_order_number, invoice_number, historical_status, payment_state, approval_state, odometer, advisor_name, assigned_tech_name, labor_sale, parts_sale, tax, total, symptom, cause, correction, source_external_id, source_row_id, imported_from_session_id, customers:customers(first_name,last_name,email,phone), vehicles:vehicles(year,make,model,license_plate,vin,unit_number)")
    .eq("shop_id", actor.shopId)
    .order("service_date", { ascending: false })
    .limit(300);

  if (from) query = query.gte("service_date", new Date(`${from}T00:00:00Z`).toISOString());
  if (to) {
    const toEnd = new Date(`${to}T00:00:00Z`);
    toEnd.setHours(23, 59, 59, 999);
    query = query.lte("service_date", toEnd.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    console.info("[ServiceHistory] query failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/work-orders/history",
      table: "history",
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
