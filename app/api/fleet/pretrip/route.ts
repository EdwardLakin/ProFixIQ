// app/api/fleet/pretrip/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import type { Database, Json } from "@shared/types/types/supabase";
import {
  removeFleetDriverEvidence,
  uploadFleetDriverEvidence,
  type FleetEvidenceMediaType,
  type FleetEvidenceUploadInput,
} from "@/features/fleet/lib/fleetDriverEvidence";
import {
  partitionFleetIdsByManagement,
  resolveFleetActorContext,
  resolveFleetActorScope,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { resolveSelectedFleetRequestScope } from "@/features/fleet/lib/resolveSelectedFleetRequestScope";
import {
  DEFAULT_FLEET_PRETRIP_TEMPLATE,
  normalizeFleetPretripTemplateSections,
  type FleetPretripTemplateSection,
} from "@/features/fleet/types/driverPortal";

type DB = Database;
type FleetPretripReportRow =
  DB["public"]["Tables"]["fleet_pretrip_reports"]["Row"];
type VehicleRow = DB["public"]["Tables"]["vehicles"]["Row"];
type SubmitFleetPretripArgs =
  DB["public"]["Functions"]["submit_fleet_pretrip_report"]["Args"];

type PretripJoinedRow = FleetPretripReportRow & {
  vehicles: Pick<VehicleRow, "unit_number" | "license_plate" | "vin"> | null;
};

type CreatePretripBody = {
  unitId: string;
  fleetId: string | null;
  odometer: string | null;
  engineHours: string | null;
  readingCorrectionReason: string | null;
  location: string | null;
  notes: string | null;
  defects: Record<string, "ok" | "defect" | "na">;
  answers?: Record<
    string,
    { status?: "ok" | "defect" | "na"; value?: string | number | null }
  >;
  evidenceMeta?: Array<{
    itemId?: string | null;
    mediaType?: FleetEvidenceMediaType;
  }>;
  templateAssignmentId?: string | null;
  trailerVehicleId?: string | null;
};

type ListPretripBody = { shopId?: string | null; fleetId?: string | null };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function numericInput(value: string | null, label: string) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a valid non-negative number.`);
  }
  return parsed;
}

type TemplateAssignmentRow = {
  id: string;
  version: number;
  vehicle_type: string;
  inspection_template_id: string;
  inspection_templates:
    | { template_name: string; sections: unknown }
    | Array<{ template_name: string; sections: unknown }>;
};

function joinedTemplate(value: TemplateAssignmentRow["inspection_templates"]) {
  return Array.isArray(value) ? value[0] : value;
}

function templateItems(sections: FleetPretripTemplateSection[]) {
  return sections.flatMap((section) => section.items);
}

function sanitizeChecklist(args: {
  raw: Partial<CreatePretripBody>;
  templateAssignment: TemplateAssignmentRow | null;
  uploads: FleetEvidenceUploadInput[];
  engineHours: number | null;
  correctionReason: string | null;
}) {
  const answers: Record<string, { status?: string; value?: number | null }> =
    {};
  const defects: Record<string, "ok" | "defect" | "na"> = {};
  const defectMeta: Record<string, Json> = {};

  const templateRow = args.templateAssignment
    ? joinedTemplate(args.templateAssignment.inspection_templates)
    : null;
  const sections = templateRow?.sections;
  const customSections = normalizeFleetPretripTemplateSections(sections);
  const template = customSections.length
    ? {
        assignmentId: args.templateAssignment?.id ?? null,
        templateId: args.templateAssignment?.inspection_template_id ?? null,
        name: templateRow?.template_name ?? "Fleet pre-trip",
        vehicleType: args.templateAssignment?.vehicle_type ?? "Fleet asset",
        version: args.templateAssignment?.version ?? 1,
        sections: customSections,
      }
    : DEFAULT_FLEET_PRETRIP_TEMPLATE;

  const submittedAnswers = args.raw.answers ?? {};
  for (const item of templateItems(template.sections)) {
    const answer = submittedAnswers[item.id] ?? {};
    const matchingUploads = args.uploads.filter(
      (upload) => upload.itemId === item.id,
    );

    if (item.type === "pass_fail") {
      const status = answer.status;
      if (status !== "ok" && status !== "defect" && status !== "na") {
        if (item.required) throw new Error(`Complete ${item.label}.`);
        continue;
      }
      answers[item.id] = { status };
      defects[item.id] = status;
      if (status === "defect") {
        if (
          item.failureActions?.requirePhoto &&
          !matchingUploads.some((upload) => upload.mediaType === "photo")
        ) {
          throw new Error(`Add a photo for ${item.label}.`);
        }
        defectMeta[item.id] = {
          label: item.label,
          severity: item.severity,
          failureActions: item.failureActions,
        };
      }
      continue;
    }

    if (item.type === "number") {
      const rawValue = answer.value;
      const value =
        rawValue === null || rawValue === undefined || rawValue === ""
          ? null
          : Number(rawValue);
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new Error(`${item.label} must be a valid non-negative number.`);
      }
      if (item.required && value === null)
        throw new Error(`Enter ${item.label}.`);
      answers[item.id] = { value };
      continue;
    }

    const mediaType: FleetEvidenceMediaType =
      item.type === "photo" ? "photo" : "voice";
    if (
      item.required &&
      !matchingUploads.some((upload) => upload.mediaType === mediaType)
    ) {
      throw new Error(
        item.type === "photo" ? `Add ${item.label}.` : `Record ${item.label}.`,
      );
    }
  }

  // Preserve compatibility for clients still submitting the original fixed
  // defects object while the mobile clients roll forward.
  if (!args.templateAssignment && !args.raw.answers) {
    for (const [key, value] of Object.entries(args.raw.defects ?? {})) {
      if (value === "ok" || value === "defect" || value === "na") {
        defects[key] = value;
      }
    }
  }

  return {
    defects,
    defectMeta,
    answers,
    location: args.raw.location?.trim() || null,
    engineHours: args.engineHours,
    readingCorrectionReason: args.correctionReason,
    template,
    source: "fleet_driver_portal_v3",
  };
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const multipart = req.headers
    .get("content-type")
    ?.includes("multipart/form-data");
  let raw: Partial<CreatePretripBody & ListPretripBody> = {};
  let uploads: FleetEvidenceUploadInput[] = [];

  if (multipart) {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: "Pre-trip form data is invalid" },
        { status: 400 },
      );
    }
    const payload = formData.get("payload");
    if (typeof payload !== "string") {
      return NextResponse.json(
        { error: "Pre-trip payload is required" },
        { status: 400 },
      );
    }
    try {
      raw = JSON.parse(payload) as Partial<CreatePretripBody & ListPretripBody>;
    } catch {
      return NextResponse.json(
        { error: "Pre-trip payload is invalid" },
        { status: 400 },
      );
    }
    const files = formData
      .getAll("evidence")
      .filter(
        (value): value is File => value instanceof File && value.size > 0,
      );
    const metadata = raw.evidenceMeta ?? [];
    if (files.length !== metadata.length) {
      return NextResponse.json(
        { error: "Evidence metadata does not match the selected files" },
        { status: 400 },
      );
    }
    uploads = files.map((file, index) => ({
      file,
      itemId: metadata[index]?.itemId?.trim() || null,
      mediaType: metadata[index]?.mediaType === "voice" ? "voice" : "photo",
    }));
  } else {
    raw = (await req.json().catch(() => ({}))) as Partial<
      CreatePretripBody & ListPretripBody
    >;
  }

  if (typeof raw.unitId === "string") {
    try {
      const actor = await resolveFleetActorContext(supabase, {
        requestedFleetId: raw.fleetId ?? null,
      });
      if (!actor.userId || !actor.capabilities.canCreatePretripReports) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      let fleetId = raw.fleetId ?? actor.primaryFleetId ?? null;
      let scope = resolveFleetActorScope(actor, {
        explicitFleetId: fleetId,
        preferMembershipFleet: true,
      });

      if (!fleetId && actor.isInternal && actor.shopId) {
        const { data: enrollment } = await supabase
          .from("fleet_vehicles")
          .select("fleet_id")
          .eq("shop_id", actor.shopId)
          .eq("vehicle_id", raw.unitId)
          .or("active.is.null,active.eq.true")
          .limit(1)
          .maybeSingle();
        fleetId = enrollment?.fleet_id ?? null;
        scope = resolveFleetActorScope(actor, { explicitFleetId: fleetId });
      }

      if (!fleetId || !scope?.shopId) {
        return NextResponse.json(
          { error: "Fleet scope is required for this unit." },
          { status: 403 },
        );
      }

      const { data: vehicleMembership, error: membershipError } = await supabase
        .from("fleet_vehicles")
        .select("vehicle_id,shop_id")
        .eq("fleet_id", fleetId)
        .eq("vehicle_id", raw.unitId)
        .or("active.is.null,active.eq.true")
        .maybeSingle();
      if (membershipError || !vehicleMembership) {
        return NextResponse.json(
          { error: "Vehicle is not available in your fleet." },
          { status: 403 },
        );
      }
      if (
        vehicleMembership.shop_id &&
        vehicleMembership.shop_id !== scope.shopId
      ) {
        return NextResponse.json(
          { error: "Vehicle is not available in your shop." },
          { status: 403 },
        );
      }

      if (!actor.isInternal) {
        const { data: assignment, error: assignmentError } = await supabase
          .from("fleet_dispatch_assignments")
          .select("id")
          .eq("shop_id", scope.shopId)
          .eq("fleet_id", fleetId)
          .eq("vehicle_id", raw.unitId)
          .eq("driver_profile_id", actor.userId)
          .eq("active", true)
          .maybeSingle();
        if (assignmentError || !assignment) {
          return NextResponse.json(
            { error: "This unit is not assigned to your driver account." },
            { status: 403 },
          );
        }
      }

      const odometer = numericInput(raw.odometer ?? null, "Odometer");
      const engineHours = numericInput(raw.engineHours ?? null, "Engine hours");
      const correctionReason = raw.readingCorrectionReason?.trim() || null;
      const templateAssignmentId = raw.templateAssignmentId?.trim() || null;
      const trailerVehicleId = raw.trailerVehicleId?.trim() || null;
      if (templateAssignmentId && !UUID.test(templateAssignmentId)) {
        return NextResponse.json(
          { error: "The assigned pre-trip template is invalid." },
          { status: 400 },
        );
      }
      if (trailerVehicleId && !UUID.test(trailerVehicleId)) {
        return NextResponse.json(
          { error: "The selected trailer is invalid." },
          { status: 400 },
        );
      }
      let templateAssignment: TemplateAssignmentRow | null = null;
      if (templateAssignmentId) {
        const { data, error } = await supabaseAdmin
          .from("fleet_pretrip_template_assignments")
          .select(
            "id,version,vehicle_type,inspection_template_id,inspection_templates!inner(template_name,sections)",
          )
          .eq("id", templateAssignmentId)
          .eq("shop_id", scope.shopId)
          .eq("fleet_id", fleetId)
          .eq("active", true)
          .maybeSingle();
        if (error || !data) {
          return NextResponse.json(
            { error: "The assigned pre-trip template is no longer active." },
            { status: 409 },
          );
        }
        templateAssignment = data as unknown as TemplateAssignmentRow;
      }

      const checklist = sanitizeChecklist({
        raw,
        templateAssignment,
        uploads,
        engineHours,
        correctionReason,
      });
      const reportId = randomUUID();
      const uploadedEvidence = await uploadFleetDriverEvidence({
        admin: supabaseAdmin,
        prefix: `${fleetId}/${reportId}`,
        uploads,
      });

      const pretripArgs = {
        p_report_id: reportId,
        p_fleet_id: fleetId,
        p_vehicle_id: raw.unitId,
        p_trailer_vehicle_id: trailerVehicleId,
        p_odometer_km: odometer,
        p_checklist: checklist as Json,
        p_notes: raw.notes?.trim() || null,
        p_template_assignment_id: templateAssignmentId,
        p_evidence: uploadedEvidence,
      };
      const { data: inserted, error: insertError } = await supabase.rpc(
        "submit_fleet_pretrip_report",
        // PostgreSQL permits SQL NULL for these deliberately optional inputs;
        // generated function types do not encode argument nullability.
        pretripArgs as unknown as SubmitFleetPretripArgs,
      );

      if (insertError || !inserted) {
        await removeFleetDriverEvidence(
          supabaseAdmin,
          uploadedEvidence.map((item) => item.storagePath),
        );
        const message =
          insertError?.message ?? "Failed to save pre-trip report.";
        if (
          insertError?.code === "23505" ||
          /already complete/i.test(message)
        ) {
          return NextResponse.json(
            {
              error:
                "Today’s pre-trip is already complete for this driver and unit.",
            },
            { status: 409 },
          );
        }
        if (/below the latest reading/i.test(message)) {
          return NextResponse.json(
            { error: message, requiresCorrectionReason: true },
            { status: 409 },
          );
        }
        console.error("[fleet/pretrip] insert error", insertError);
        return NextResponse.json(
          { error: "Failed to save pre-trip report." },
          { status: 500 },
        );
      }

      const { error: pmEvaluationError } = await supabase.rpc(
        "evaluate_fleet_pm_due_events",
        {
          p_fleet_id: fleetId,
          p_vehicle_id: raw.unitId,
        },
      );
      if (pmEvaluationError) {
        console.error(
          "[fleet/pretrip] PM evaluation deferred",
          pmEvaluationError,
        );
      }

      const payload =
        inserted && typeof inserted === "object" && !Array.isArray(inserted)
          ? (inserted as Record<string, unknown>)
          : { report: inserted };
      return NextResponse.json({
        ...payload,
        pmEvaluationQueued: !pmEvaluationError,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save pre-trip report.";
      const status =
        /must be a valid|complete |add |enter |required|invalid/i.test(message)
          ? 400
          : 500;
      console.error("[fleet/pretrip] create error", error);
      return NextResponse.json({ error: message }, { status });
    }
  }

  try {
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: raw.fleetId ?? null,
    });
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const scope = raw.fleetId
      ? resolveSelectedFleetRequestScope(actor, {
          explicitShopId: raw.shopId ?? null,
          explicitFleetId: raw.fleetId,
        })
      : resolveFleetActorScope(actor, {
          explicitShopId: raw.shopId ?? null,
          preferMembershipFleet: !actor.isInternal,
        });
    if (!scope?.shopId) {
      return NextResponse.json(
        { error: "Unable to resolve fleet for pre-trip reports." },
        { status: 400 },
      );
    }

    // The service-role client bypasses RLS, so every query keeps the trusted
    // shop predicate and external access is split by each Fleet membership's
    // role. A user can manage one Fleet while remaining driver-only in another.
    const select =
      "id,shop_id,fleet_id,vehicle_id,driver_profile_id,driver_name,has_defects,inspection_date,created_at,status,vehicles!inner(unit_number,license_plate,vin)";
    let reportRows: PretripJoinedRow[] = [];

    if (actor.isInternal) {
      let query = supabaseAdmin
        .from("fleet_pretrip_reports")
        .select(select)
        .eq("shop_id", scope.shopId)
        .order("inspection_date", { ascending: false })
        .limit(250);
      if (scope.fleetIds?.length) {
        query = query.in("fleet_id", scope.fleetIds);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      reportRows = (data ?? []) as unknown as PretripJoinedRow[];
    } else {
      const scopedFleetIds = scope.fleetIds ?? [];
      const { managerFleetIds, driverFleetIds } = partitionFleetIdsByManagement(
        actor,
        scopedFleetIds,
      );
      const results = await Promise.all([
        managerFleetIds.length
          ? supabaseAdmin
              .from("fleet_pretrip_reports")
              .select(select)
              .eq("shop_id", scope.shopId)
              .in("fleet_id", managerFleetIds)
              .order("inspection_date", { ascending: false })
              .limit(250)
          : Promise.resolve({ data: [] as unknown[], error: null }),
        driverFleetIds.length
          ? supabaseAdmin
              .from("fleet_pretrip_reports")
              .select(select)
              .eq("shop_id", scope.shopId)
              .in("fleet_id", driverFleetIds)
              .eq("driver_profile_id", actor.userId)
              .order("inspection_date", { ascending: false })
              .limit(250)
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);
      const error = results.map((result) => result.error).find(Boolean);
      if (error) throw new Error(error.message);
      reportRows = Array.from(
        new Map(
          results
            .flatMap((result) => result.data ?? [])
            .map((row) => [String((row as { id: string }).id), row]),
        ).values(),
      ) as unknown as PretripJoinedRow[];
      reportRows.sort((left, right) =>
        (right.inspection_date ?? right.created_at).localeCompare(
          left.inspection_date ?? left.created_at,
        ),
      );
      reportRows = reportRows.slice(0, 250);
    }

    const reports = reportRows.map((row) => {
      const vehicle = row.vehicles;
      return {
        id: row.id,
        shop_id: row.shop_id,
        unit_id: row.vehicle_id,
        unit_label:
          vehicle?.unit_number ||
          vehicle?.license_plate ||
          vehicle?.vin ||
          row.vehicle_id,
        plate: vehicle?.license_plate ?? null,
        driver_name: row.driver_name,
        has_defects: row.has_defects,
        inspection_date: row.inspection_date,
        created_at: row.created_at,
        status: row.status ?? (row.has_defects ? "open" : "reviewed"),
      };
    });
    return NextResponse.json({ reports });
  } catch (error) {
    console.error("[fleet/pretrip] list error", error);
    return NextResponse.json(
      { error: "Failed to load pre-trip reports." },
      { status: 500 },
    );
  }
}
