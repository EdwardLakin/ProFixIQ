import { NextResponse } from "next/server";

import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveCurrentActor } from "@/features/shared/lib/currentActor";

const BILLING_STATUSES = ["completed", "ready_to_invoice", "invoiced"] as const;

export async function GET(request: Request) {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user || !actor.shopId) {
    console.info("[Billing] server auth unavailable", {
      actorPresent: Boolean(actor.user),
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/billing/work-orders",
      table: "work_orders",
    });
    return NextResponse.json({ error: "You must be signed in to view billing." }, { status: 401 });
  }

  const status = new URL(request.url).searchParams.get("status");
  let query = supabase
    .from("work_orders")
    .select(
      `
      *,
      customers:customers(first_name,last_name,email),
      vehicles:vehicles(year,make,model,license_plate)
    `,
    )
    .eq("shop_id", actor.shopId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  } else {
    query = query.in("status", [...BILLING_STATUSES]);
  }

  const { data, error } = await query;

  if (error) {
    console.info("[Billing] query failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/billing/work-orders",
      table: "work_orders",
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
