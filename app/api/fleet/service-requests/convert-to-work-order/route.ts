// app/api/fleet/service-requests/convert-to-work-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ConvertPayload = {
  serviceRequestId: string;
};

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type WorkOrderInsert =
  DB["public"]["Tables"]["work_orders"]["Insert"];

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const body = (await req.json().catch(() => null)) as ConvertPayload | null;
  const serviceRequestId = body?.serviceRequestId;

  if (!serviceRequestId) {
    return NextResponse.json(
      { error: "serviceRequestId is required" },
      { status: 400 },
    );
  }

  // Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  // Profile for shop + role
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json(
      { error: "Unable to resolve shop for user" },
      { status: 400 },
    );
  }

  const allowedRoles: ProfileRow["role"][] = [
    "owner",
    "admin",
    "manager",
    "fleet_manager",
    "dispatcher",
  ];

  if (!allowedRoles.includes(profile.role)) {
    return NextResponse.json(
      { error: "Not authorized to convert service requests" },
      { status: 403 },
    );
  }

  // Get service request (guard by shop)
  const { data: sr, error: srError } = await supabase
    .from("fleet_service_requests")
    .select(
      "id, shop_id, vehicle_id, title, summary, severity, status, work_order_id",
    )
    .eq("id", serviceRequestId)
    .eq("shop_id", profile.shop_id)
    .maybeSingle<FleetServiceRequestRow>();

  if (srError || !sr) {
    return NextResponse.json(
      { error: "Service request not found for this shop" },
      { status: 404 },
    );
  }

  // Already linked – just ensure status is in_shop
  if (sr.work_order_id) {
    if (sr.status !== "in_shop") {
      await supabase
        .from("fleet_service_requests")
        .update({ status: "in_shop" })
        .eq("id", sr.id);
    }

    return NextResponse.json(
      {
        workOrderId: sr.work_order_id,
        status: "already_linked",
      },
      { status: 200 },
    );
  }

  // Create a new work order (typed, no `any`)
  const newWorkOrder = {
    shop_id: sr.shop_id,
    vehicle_id: sr.vehicle_id,
    status: "in_progress",
    // These fields exist on your work_orders table; we assert the shape
    title: sr.title,
    summary: sr.summary,
    created_by_profile_id: profile.id,
  } as WorkOrderInsert;

  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .insert(newWorkOrder)
    .select("id")
    .single();

  if (woError || !wo) {
    console.error("Work order create error:", woError);
    return NextResponse.json(
      { error: "Failed to create work order" },
      { status: 500 },
    );
  }

  // Link SR → WO and mark status as in_shop
  const { error: linkError } = await supabase
    .from("fleet_service_requests")
    .update({
      status: "in_shop",
      work_order_id: wo.id,
    })
    .eq("id", sr.id);

  if (linkError) {
    console.error("Failed to link service request to work order:", linkError);
    return NextResponse.json(
      {
        error:
          "Work order created, but service request link failed. Please refresh.",
        workOrderId: wo.id,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      workOrderId: wo.id,
      status: "converted",
    },
    { status: 201 },
  );
}