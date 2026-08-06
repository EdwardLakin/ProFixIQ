import { NextResponse } from "next/server";

import {
  canAdministerFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import type { FleetPretripTemplateSection } from "@/features/fleet/types/driverPortal";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SaveBody = {
  fleetId?: string;
  name?: string;
  vehicleType?: string;
  sections?: FleetPretripTemplateSection[];
  operationKey?: string;
};

function validSections(value: unknown): value is FleetPretripTemplateSection[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 30 &&
    value.every(
      (section) =>
        section &&
        typeof section === "object" &&
        typeof section.id === "string" &&
        typeof section.title === "string" &&
        section.title.trim().length > 0 &&
        Array.isArray(section.items) &&
        section.items.length > 0 &&
        section.items.every(
          (item: FleetPretripTemplateSection["items"][number]) =>
            item &&
            typeof item.id === "string" &&
            /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(item.id) &&
            typeof item.label === "string" &&
            item.label.trim().length > 0 &&
            ["pass_fail", "number", "photo", "voice"].includes(item.type),
        ),
    )
  );
}

export async function GET(request: Request) {
  const requestedFleetId = new URL(request.url).searchParams.get("fleetId");
  const supabase = createServerSupabaseRoute();
  const actor = await resolveFleetActorContext(supabase, {
    requestedFleetId,
  });
  const fleetId = requestedFleetId ?? actor.primaryFleetId;

  if (!actor.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!fleetId || !canAdministerFleetForActor(actor, fleetId)) {
    return NextResponse.json(
      { error: "Fleet manager access required" },
      { status: 403 },
    );
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("fleet_pretrip_template_assignments")
    .select(
      "id,fleet_id,inspection_template_id,vehicle_type,version,active,created_at,retired_at,inspection_templates!inner(template_name,sections)",
    )
    .eq("fleet_id", fleetId)
    .order("vehicle_type", { ascending: true })
    .order("version", { ascending: false });

  if (error) {
    console.error("[fleet/pretrip/templates] list", error);
    return NextResponse.json(
      { error: "Unable to load pre-trip templates" },
      { status: 500 },
    );
  }

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SaveBody;
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: body.fleetId ?? null,
    });
    const fleetId = body.fleetId ?? actor.primaryFleetId;

    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !fleetId ||
      !UUID.test(fleetId) ||
      !canAdministerFleetForActor(actor, fleetId)
    ) {
      return NextResponse.json(
        { error: "Fleet manager access required" },
        { status: 403 },
      );
    }

    const name = body.name?.trim() ?? "";
    const vehicleType = body.vehicleType?.trim() ?? "";
    const operationKey = body.operationKey?.trim() ?? "";
    if (!name || name.length > 120) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 },
      );
    }
    if (!vehicleType || vehicleType.length > 80) {
      return NextResponse.json(
        { error: "Vehicle type is required" },
        { status: 400 },
      );
    }
    if (!validSections(body.sections)) {
      return NextResponse.json(
        { error: "Add at least one valid inspection section and item" },
        { status: 400 },
      );
    }
    const itemIds = body.sections.flatMap((section) =>
      section.items.map((item) => item.id),
    );
    if (new Set(itemIds).size !== itemIds.length || itemIds.length > 200) {
      return NextResponse.json(
        { error: "Inspection item ids must be unique" },
        { status: 400 },
      );
    }
    if (operationKey.length < 8 || operationKey.length > 160) {
      return NextResponse.json(
        { error: "Valid operation key is required" },
        { status: 400 },
      );
    }

    const sections = body.sections.map((section) => ({
      id: section.id,
      title: section.title.trim().slice(0, 120),
      items: section.items.map((item) => ({
        ...item,
        item: item.label.trim().slice(0, 240),
        label: item.label.trim().slice(0, 240),
        unit: item.unit?.trim().slice(0, 24) || null,
        required: Boolean(item.required),
        severity: ["safety", "compliance", "maintenance", "recommend"].includes(
          item.severity,
        )
          ? item.severity
          : "recommend",
        failureActions: {
          notifyDispatcher: Boolean(item.failureActions?.notifyDispatcher),
          flagForReview: Boolean(item.failureActions?.flagForReview),
          requirePhoto: Boolean(item.failureActions?.requirePhoto),
          markVehicleAttention: Boolean(
            item.failureActions?.markVehicleAttention,
          ),
        },
      })),
    }));

    const { data, error } = await supabase.rpc("save_fleet_pretrip_template", {
      p_fleet_id: fleetId,
      p_name: name,
      p_vehicle_type: vehicleType,
      p_sections: sections,
      p_failure_config: {
        dispatcherGatekeeper: true,
        driverCreatesWorkOrders: false,
      },
      p_operation_key: operationKey,
    });
    if (error) {
      const message = error.message || "Unable to publish pre-trip template";
      return NextResponse.json(
        {
          error: /required|template|section|item|operation|manager/i.test(
            message,
          )
            ? message
            : "Unable to publish pre-trip template",
        },
        { status: /access|required/i.test(message) ? 403 : 400 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[fleet/pretrip/templates] save", error);
    return NextResponse.json(
      { error: "Unable to publish pre-trip template" },
      { status: 500 },
    );
  }
}
