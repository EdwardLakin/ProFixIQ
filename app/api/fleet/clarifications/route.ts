import { NextResponse } from "next/server";

import {
  removeFleetDriverEvidence,
  uploadFleetDriverEvidence,
  type FleetEvidenceMediaType,
} from "@/features/fleet/lib/fleetDriverEvidence";
import { resolveFleetActorContext } from "@/features/fleet/lib/resolveFleetActorContext";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admin = createAdminSupabase();
  let uploadedPaths: string[] = [];

  try {
    const formData = await request.formData();
    const clarificationId = String(formData.get("clarificationId") ?? "");
    const responseText = String(formData.get("responseText") ?? "").trim();
    const file = formData.get("evidence");

    if (!UUID.test(clarificationId)) {
      return NextResponse.json(
        { error: "Valid clarification request required" },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase);
    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (actor.actorType !== "fleet_driver") {
      return NextResponse.json(
        { error: "Fleet driver access required" },
        { status: 403 },
      );
    }

    const { data: clarification, error: clarificationError } = await admin
      .from("fleet_defect_clarifications")
      .select(
        "id,fleet_id,response_type,status,fleet_unit_defects!inner(reported_by)",
      )
      .eq("id", clarificationId)
      .maybeSingle();
    if (clarificationError || !clarification) {
      return NextResponse.json(
        { error: "Clarification request was not found" },
        { status: 404 },
      );
    }

    const defect = Array.isArray(clarification.fleet_unit_defects)
      ? clarification.fleet_unit_defects[0]
      : clarification.fleet_unit_defects;
    if (!defect || defect.reported_by !== actor.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (clarification.status !== "requested") {
      return NextResponse.json(
        { error: "This clarification request is no longer open" },
        { status: 409 },
      );
    }

    if (
      clarification.response_type === "answer" &&
      file instanceof File &&
      file.size
    ) {
      return NextResponse.json(
        { error: "Send a quick answer without an attachment" },
        { status: 400 },
      );
    }

    const uploads =
      file instanceof File && file.size
        ? [
            {
              file,
              itemId: null,
              mediaType: clarification.response_type as FleetEvidenceMediaType,
            },
          ]
        : [];
    if (clarification.response_type !== "answer" && uploads.length === 0) {
      return NextResponse.json(
        {
          error:
            clarification.response_type === "photo"
              ? "Add the requested photo"
              : "Add the requested voice note",
        },
        { status: 400 },
      );
    }
    if (clarification.response_type === "answer" && !responseText) {
      return NextResponse.json(
        { error: "Add a quick answer" },
        { status: 400 },
      );
    }

    const metadata = await uploadFleetDriverEvidence({
      admin,
      prefix: `${clarification.fleet_id}/clarifications/${clarification.id}`,
      uploads,
    });
    uploadedPaths = metadata.map((item) => item.storagePath);

    const { data, error } = await supabase.rpc(
      "respond_fleet_defect_clarification",
      {
        p_clarification_id: clarification.id,
        // PostgreSQL function arguments accept SQL NULL, but generated
        // function types cannot express argument nullability. An empty answer
        // is already rejected above when the response type requires text.
        p_response_text: responseText,
        p_evidence: metadata,
      },
    );
    if (error) {
      await removeFleetDriverEvidence(admin, uploadedPaths);
      uploadedPaths = [];
      const message = error.message || "Unable to send the response";
      return NextResponse.json(
        {
          error: /required|request|driver|photo|voice|answer/i.test(message)
            ? message
            : "Unable to send the response",
        },
        { status: /driver|belong/i.test(message) ? 403 : 400 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    if (uploadedPaths.length) {
      await removeFleetDriverEvidence(admin, uploadedPaths);
    }
    console.error("[fleet/clarifications]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to send the response",
      },
      { status: 500 },
    );
  }
}
