import { NextResponse } from "next/server";

import { adaptImportedTemplateForFleetPretrip } from "@/features/fleet/lib/importedPretripTemplate";
import {
  canAdministerFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  fleetId?: string;
  templateId?: string;
  vehicleType?: string;
  operationKey?: string;
};

/**
 * Publishes a template imported from a customer's paper form as that fleet's
 * driver pre-trip inspection.
 *
 * Approving an import creates a shop inspection template; it does not reach
 * fleet drivers, because the driver runner needs per-item ids, driver field
 * types, severities and dispatcher failure actions. This adapts the approved
 * import into that shape and publishes it through the same guarded RPC the
 * pre-trip builder uses, so versioning, assignment and authorization stay in
 * one place.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
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

    const templateId = body.templateId?.trim() ?? "";
    const operationKey = body.operationKey?.trim() ?? "";
    if (!UUID.test(templateId)) {
      return NextResponse.json(
        { error: "A valid imported template is required" },
        { status: 400 },
      );
    }
    if (operationKey.length < 8 || operationKey.length > 160) {
      return NextResponse.json(
        { error: "Valid operation key is required" },
        { status: 400 },
      );
    }

    // Read the template through the caller's own session so row-level security
    // decides whether they can see it, then use the admin client only for the
    // fleet's shop lookup below.
    const { data: template, error: templateError } = await supabase
      .from("inspection_templates")
      .select("id, template_name, sections, vehicle_type, tags")
      .eq("id", templateId)
      .maybeSingle();
    if (templateError) {
      return NextResponse.json(
        { error: "Unable to load the imported template" },
        { status: 500 },
      );
    }
    if (!template) {
      return NextResponse.json(
        { error: "Imported template not found" },
        { status: 404 },
      );
    }

    const admin = createAdminSupabase();
    const { data: fleet, error: fleetError } = await admin
      .from("fleets")
      .select("shop_id")
      .eq("id", fleetId)
      .maybeSingle();
    if (fleetError || !fleet?.shop_id) {
      return NextResponse.json({ error: "Fleet not found" }, { status: 404 });
    }

    const { sections, droppedItems, droppedSections } =
      adaptImportedTemplateForFleetPretrip(template.sections);
    if (!sections.length) {
      return NextResponse.json(
        {
          error:
            "This template has no inspection rows a driver can run. Check it in the template editor first.",
        },
        { status: 400 },
      );
    }

    const vehicleType =
      body.vehicleType?.trim() ||
      template.vehicle_type?.trim() ||
      "All fleet assets";

    const { data, error } = await supabase.rpc("save_fleet_pretrip_template", {
      p_fleet_id: fleetId,
      p_name: (template.template_name ?? "Imported pre-trip").slice(0, 120),
      p_vehicle_type: vehicleType.slice(0, 80),
      p_sections: sections,
      p_failure_config: {
        dispatcherGatekeeper: true,
        driverCreatesWorkOrders: false,
        importedFromTemplateId: template.id,
      },
      p_operation_key: operationKey,
    });
    if (error) {
      const message = error.message || "Unable to publish pre-trip template";
      return NextResponse.json(
        {
          error: /required|template|section|item|operation|manager|found/i.test(
            message,
          )
            ? message
            : "Unable to publish pre-trip template",
        },
        { status: /access|required/i.test(message) ? 403 : 400 },
      );
    }

    return NextResponse.json({
      ...(typeof data === "object" && data !== null ? data : {}),
      vehicleType,
      sectionCount: sections.length,
      itemCount: sections.reduce(
        (total, section) => total + section.items.length,
        0,
      ),
      droppedItems,
      droppedSections,
    });
  } catch (error) {
    console.error("[fleet/pretrip/templates/from-import] publish", error);
    return NextResponse.json(
      { error: "Unable to publish pre-trip template" },
      { status: 500 },
    );
  }
}
