import { NextResponse } from "next/server";

import { resolveCurrentActor } from "@/features/shared/lib/currentActor";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const VISIBLE_STATUSES = ["requested", "quoted", "approved", "fulfilled"];

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const actor = await resolveCurrentActor(supabase);

  if (!actor.user || !actor.shopId) {
    console.info("[PartsRequests] server auth unavailable", {
      actorPresent: Boolean(actor.user),
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/requests/active",
      table: "part_requests",
    });
    return NextResponse.json({ error: "Unable to resolve shop context." }, { status: 401 });
  }

  const { error: contextError } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: actor.shopId,
  });

  if (contextError) {
    console.info("[PartsRequests] set_current_shop_id failed", {
      actorPresent: true,
      profileId: actor.profile?.id ?? null,
      profileRole: actor.role ?? null,
      activeShopId: actor.shopId,
      route: "/api/parts/requests/active",
      table: "part_requests",
      code: contextError.code,
      message: contextError.message,
    });
    return NextResponse.json({ error: contextError.message }, { status: 500 });
  }

  const { data: requests, error: requestsError } = await supabase
    .from("part_requests")
    .select("*")
    .eq("shop_id", actor.shopId)
    .in("status", VISIBLE_STATUSES)
    .order("created_at", { ascending: false });

  if (requestsError) return NextResponse.json({ error: requestsError.message }, { status: 500 });

  const requestIds = (requests ?? []).map((request) => request.id);
  const workOrderIds = Array.from(
    new Set(
      (requests ?? [])
        .map((request) => request.work_order_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const [itemsRes, workOrdersRes] = await Promise.all([
    requestIds.length
      ? supabase
          .from("part_request_items")
          .select("request_id, description, part_id, qty, quoted_price, status, qty_approved, qty_received, qty_consumed")
          .eq("shop_id", actor.shopId)
          .in("request_id", requestIds)
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length
      ? supabase
          .from("work_orders")
          .select(`
            id,
            custom_id,
            customer_id,
            vehicle_id,
            customers (
              first_name,
              last_name
            ),
            vehicles (
              year,
              make,
              model
            )
          `)
          .eq("shop_id", actor.shopId)
          .in("id", workOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = itemsRes.error ?? workOrdersRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    shopId: actor.shopId,
    requests: requests ?? [],
    items: itemsRes.data ?? [],
    workOrders: workOrdersRes.data ?? [],
  });
}
