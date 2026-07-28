// app/api/fleet/service-requests/convert-to-work-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";

type ConvertBody = {
  serviceRequestId: string;
};

type ConversionResult = {
  conversion_status: string;
  work_order_id: string;
};

function firstConversionResult(value: unknown): ConversionResult | null {
  if (!Array.isArray(value)) return null;
  const row = value[0];
  if (
    typeof row !== "object" ||
    row === null ||
    typeof (row as { work_order_id?: unknown }).work_order_id !== "string" ||
    typeof (row as { conversion_status?: unknown }).conversion_status !==
      "string"
  ) {
    return null;
  }
  return row as ConversionResult;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseRoute();
    const body = (await req.json().catch(() => null)) as ConvertBody | null;

    if (!body?.serviceRequestId) {
      return NextResponse.json(
        { error: "serviceRequestId is required." },
        { status: 400 },
      );
    }

    const serviceRequestId = body.serviceRequestId;
    const actor = await resolveFleetActorContext(supabase);
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!actor.capabilities.canConvertServiceRequestToWorkOrder) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase.rpc(
      "convert_fleet_service_request_to_work_order_atomic",
      {
        p_service_request_id: serviceRequestId,
      },
    );

    const conversion = firstConversionResult(data);
    if (error || !conversion?.work_order_id) {
      // eslint-disable-next-line no-console
      console.error(
        "[service-requests/convert-to-work-order] rpc error",
        error,
      );
      return NextResponse.json(
        {
          error:
            error?.message ??
            "Failed to create a structured work order from this request.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      workOrderId: conversion.work_order_id,
      status: conversion.conversion_status,
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
