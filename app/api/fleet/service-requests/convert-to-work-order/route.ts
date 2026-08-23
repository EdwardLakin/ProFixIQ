// app/api/fleet/service-requests/convert-to-work-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";
import { SHOP_FLEET_REQUEST_INTAKE_ROLES } from "@/features/fleet/lib/shopFleetRequestIntake";
import { mapFleetServiceRequestError } from "@/features/fleet/lib/fleetServiceRequestError";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

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
    const requestHost =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (
      req.headers.get("x-profixiq-product-host") === "fleet" ||
      isFleetProductHostname(requestHost)
    ) {
      return NextResponse.json(
        { error: "Work orders are created in ProFixIQ Shop." },
        { status: 403 },
      );
    }

    const access = await requireShopScopedApiAccess({
      allowRoles: SHOP_FLEET_REQUEST_INTAKE_ROLES,
    });
    if (!access.ok) return access.response;

    const body = (await req.json().catch(() => null)) as ConvertBody | null;

    if (!body?.serviceRequestId) {
      return NextResponse.json(
        { error: "serviceRequestId is required." },
        { status: 400 },
      );
    }

    const { data, error } = await access.supabase.rpc(
      "convert_owned_fleet_service_request_to_work_order_atomic",
      {
        p_service_request_id: body.serviceRequestId,
      },
    );

    const conversion = firstConversionResult(data);
    if (error || !conversion?.work_order_id) {
      console.error(
        "[service-requests/convert-to-work-order] rpc error",
        error,
      );
      const failure = mapFleetServiceRequestError(
        error,
        "Failed to create a structured work order from this request.",
      );
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }

    return NextResponse.json({
      workOrderId: conversion.work_order_id,
      status: conversion.conversion_status,
    });
  } catch (err) {
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
