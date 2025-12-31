// app/api/fleet/service-requests/convert-to-work-order/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

type RequestBody = {
  serviceRequestId: string;
};

export async function POST(req: Request) {
  try {
    const supabaseUser = createRouteHandlerClient<DB>({ cookies });
    const supabaseAdmin = createAdminSupabase();

    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (!body?.serviceRequestId) {
      return NextResponse.json(
        { error: "serviceRequestId is required." },
        { status: 400 },
      );
    }

    const serviceRequestId = body.serviceRequestId;

    const { data: sr, error: srErr } = await supabaseAdmin
      .from("fleet_service_requests")
      .select("*")
      .eq("id", serviceRequestId)
      .maybeSingle<FleetServiceRequestRow>();

    if (srErr || !sr) {
      console.error("[sr→wo] service request error:", srErr);
      return NextResponse.json(
        { error: "Service request not found." },
        { status: 404 },
      );
    }

    if (sr.work_order_id) {
      return NextResponse.json({
        status: "already_linked",
        workOrderId: sr.work_order_id,
      });
    }

    // Create a minimal work order linked back to this fleet request.
    const { data: wo, error: woErr } = await supabaseAdmin
      .from("work_orders")
      .insert({
        shop_id: sr.shop_id,
        vehicle_id: sr.vehicle_id,
        source_fleet_service_request_id: sr.id,
      })
      .select("id")
      .maybeSingle<WorkOrderRow>();

    if (woErr || !wo) {
      console.error("[sr→wo] work order create error:", woErr);
      return NextResponse.json(
        { error: "Failed to create work order." },
        { status: 500 },
      );
    }

    // Link back on the service request side
    const { error: linkErr } = await supabaseAdmin
      .from("fleet_service_requests")
      .update({
        work_order_id: wo.id,
        status: "scheduled",
      })
      .eq("id", serviceRequestId);

    if (linkErr) {
      console.error("[sr→wo] link update error:", linkErr);
      // We still return the WO ID; caller can repair link if needed.
    }

    return NextResponse.json({
      status: "converted",
      workOrderId: wo.id,
    });
  } catch (err) {
    console.error("[sr→wo] unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to convert service request to work order." },
      { status: 500 },
    );
  }
}