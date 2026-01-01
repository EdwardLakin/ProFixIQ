import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type FleetPretripReportRow =
  DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];

type PretripWithVehicle = FleetPretripReportRow & {
  vehicles: Pick<VehicleRow, "unit_number" | "license_plate" | "vin"> | null;
};

type ConvertBody = {
  pretripId: string;
};

type DefectState = "ok" | "defect" | "na";

type ChecklistPayload = {
  defects?: Record<string, DefectState>;
  // allow other keys without caring about their shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const body = (await req.json().catch(() => null)) as ConvertBody | null;

    if (!body?.pretripId) {
      return NextResponse.json(
        { error: "pretripId is required." },
        { status: 400 },
      );
    }

    const pretripId = body.pretripId;

    // Load the pretrip
    const { data: pretripRow, error: pretripError } = await supabase
      .from("fleet_pretrip_reports")
      .select(
        `
        id,
        shop_id,
        vehicle_id,
        driver_name,
        has_defects,
        inspection_date,
        checklist,
        notes,
        vehicles!inner (
          unit_number,
          license_plate,
          vin
        )
      `,
      )
      .eq("id", pretripId)
      .maybeSingle();

    if (pretripError || !pretripRow) {
      return NextResponse.json(
        { error: "Pre-trip report not found." },
        { status: 404 },
      );
    }

    // Bridge through unknown so TS is happy with the join shape
    const pretrip = pretripRow as unknown as PretripWithVehicle;

    // Check if already linked
    const { data: existing, error: existingError } = await supabase
      .from("fleet_service_requests")
      .select("id")
      .eq("source_pretrip_id", pretripId)
      .maybeSingle();

    if (existingError) {
      // eslint-disable-next-line no-console
      console.error(
        "[pretrip/convert-to-service-request] existing check error",
        existingError,
      );
      return NextResponse.json(
        { error: "Failed to check existing service request." },
        { status: 500 },
      );
    }

    if (existing?.id) {
      return NextResponse.json({
        serviceRequestId: existing.id,
        status: "already_linked",
      });
    }

    const vehicle = pretrip.vehicles;

    const unitLabel =
      vehicle?.unit_number ||
      vehicle?.license_plate ||
      vehicle?.vin ||
      pretrip.vehicle_id;

    const checklist = (pretrip.checklist ?? {}) as ChecklistPayload;
    const defects = checklist.defects ?? {};

    const defectKeys = Object.entries(defects)
      .filter(([, v]) => v === "defect")
      .map(([k]) => k);

    // Pick a dominant severity
    let severity: "safety" | "compliance" | "maintenance" | "recommend" =
      "recommend";
    if (defectKeys.some((k) => k === "brakes" || k === "steering")) {
      severity = "safety";
    } else if (
      defectKeys.some(
        (k) => k === "suspension" || k === "tires" || k === "lights",
      )
    ) {
      severity = "compliance";
    } else if (defectKeys.length > 0) {
      severity = "maintenance";
    }

    const title = `Pre-trip defects – ${unitLabel}`;
    const summaryParts: string[] = [];

    if (defectKeys.length > 0) {
      summaryParts.push(
        `Driver ${pretrip.driver_name ?? "unknown"} reported defects on: ${defectKeys.join(", ")}.`,
      );
    } else {
      summaryParts.push(
        `Pre-trip from driver ${pretrip.driver_name ?? "unknown"} with no specific systems flagged, but a service request was requested.`,
      );
    }

    if (pretrip.notes) {
      summaryParts.push(`Driver notes: ${pretrip.notes}`);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: inserted, error: insertError } = await supabase
      .from("fleet_service_requests")
      .insert({
        shop_id: pretrip.shop_id,
        vehicle_id: pretrip.vehicle_id,
        source_pretrip_id: pretrip.id,
        title,
        summary: summaryParts.join(" "),
        severity,
        status: "open",
        created_by_profile_id: user?.id ?? null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      // eslint-disable-next-line no-console
      console.error(
        "[pretrip/convert-to-service-request] insert error",
        insertError,
      );
      return NextResponse.json(
        { error: "Failed to create service request from pre-trip." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      serviceRequestId: inserted.id,
      status: "created",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[pretrip/convert-to-service-request] error", err);
    return NextResponse.json(
      { error: "Failed to convert pre-trip to service request." },
      { status: 500 },
    );
  }
}