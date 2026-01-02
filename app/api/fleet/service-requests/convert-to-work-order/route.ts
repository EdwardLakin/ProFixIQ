// app/api/fleet/service-requests/convert-to-work-order/route.ts
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type ConvertBody = {
  serviceRequestId: string;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json().catch(() => null)) as ConvertBody | null;

    if (!body?.serviceRequestId) {
      return NextResponse.json(
        { error: "serviceRequestId is required." },
        { status: 400 },
      );
    }

    const serviceRequestId = body.serviceRequestId;

    // Load the service request (fleet-scoped row; RLS enforces membership)
    const { data: sr, error: srError } = await supabase
      .from("fleet_service_requests")
      .select(
        `
        id,
        fleet_id,
        shop_id,
        vehicle_id,
        status,
        work_order_id,
        title,
        summary
      `,
      )
      .eq("id", serviceRequestId)
      .single();

    if (srError || !sr) {
      return NextResponse.json(
        { error: "Service request not found." },
        { status: 404 },
      );
    }

    if (sr.work_order_id) {
      return NextResponse.json({
        workOrderId: sr.work_order_id,
        status: "already_linked",
      });
    }

    // Create a new work order sourced from this service request
    // NOTE: work_orders are still shop-scoped in your current schema.
    const { data: workOrder, error: woError } = await supabase
      .from("work_orders")
      .insert({
        shop_id: sr.shop_id,
        vehicle_id: sr.vehicle_id,
        status: "awaiting_approval",
        approval_state: "pending",
        source_fleet_service_request_id: sr.id,
      })
      .select("id")
      .single();

    if (woError || !workOrder) {
      // eslint-disable-next-line no-console
      console.error(
        "[service-requests/convert-to-work-order] insert error",
        woError,
      );
      return NextResponse.json(
        { error: "Failed to create work order from service request." },
        { status: 500 },
      );
    }

    // Link back on the service request
    const { error: linkError } = await supabase
      .from("fleet_service_requests")
      .update({
        work_order_id: workOrder.id,
        status: "scheduled",
      })
      .eq("id", sr.id);

    if (linkError) {
      // eslint-disable-next-line no-console
      console.error(
        "[service-requests/convert-to-work-order] link error",
        linkError,
      );
      // still return the WO id
    }

    return NextResponse.json({
      workOrderId: workOrder.id,
      status: "converted",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[service-requests/convert-to-work-order] unexpected error",
      err,
    );
    return NextResponse.json(
      { error: "Failed to convert service request to work order." },
      { status: 500 },
    );
  }
}