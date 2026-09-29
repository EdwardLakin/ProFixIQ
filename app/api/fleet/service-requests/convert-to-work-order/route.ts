// app/api/fleet/service-requests/convert-to-work-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";
import { canAcceptFleetServiceRequests } from "@/features/fleet/lib/shopFleetRequestIntake";
import { mapFleetServiceRequestError } from "@/features/fleet/lib/fleetServiceRequestError";
import {
  parseDiagnosisRow,
  refineHandoffFailure,
  type FleetHandoffDiagnosis,
} from "@/features/fleet/lib/fleetHandoffDiagnosis";
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

    const access = await requireShopScopedApiAccess();
    if (!access.ok) return access.response;

    // The database function enforces the same boundary independently, so
    // this is a fast-path rejection, not the real gate.
    if (!(await canAcceptFleetServiceRequests(access))) {
      return NextResponse.json(
        { error: "Fleet request intake access required." },
        { status: 403 },
      );
    }

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
      const mapped = mapFleetServiceRequestError(
        error,
        "Failed to create a structured work order from this request.",
      );

      // The conversion RPC reports several unrelated blockers as one
      // handoff failure. Establish which one applies so the UI only offers
      // billing-owner recovery when that is really the problem.
      let diagnosis: FleetHandoffDiagnosis | null = null;
      if (
        mapped.reason === "handoff_unavailable" ||
        mapped.reason === "ownership_conflict"
      ) {
        const { data: diagnosisData, error: diagnosisError } =
          await access.supabase.rpc("diagnose_fleet_service_request_handoff", {
            p_service_request_id: body.serviceRequestId,
          });
        if (diagnosisError) {
          console.error(
            "[service-requests/convert-to-work-order] diagnosis error",
            diagnosisError,
          );
        } else {
          diagnosis = parseDiagnosisRow(diagnosisData);
        }
      }

      const failure = refineHandoffFailure(mapped, diagnosis);
      return NextResponse.json(
        {
          error: failure.error,
          reason: failure.reason,
          ...(diagnosis ? { diagnosis } : {}),
        },
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
