import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  canManageFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";

export const dynamic = "force-dynamic";

type DefectAction =
  | "list"
  | "acknowledge"
  | "monitor"
  | "request_info"
  | "schedule"
  | "escalate"
  | "close";
type Body = {
  action?: DefectAction;
  fleetId?: string | null;
  defectIds?: string[];
  deferredUntil?: string | null;
  reason?: string | null;
  requestedForDate?: string | null;
  responseType?: "answer" | "photo" | "voice" | null;
  resolutionCode?: "duplicate" | "not_issue" | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const supabase = createServerSupabaseRoute();
    const actor = await resolveFleetActorContext(supabase, {
      requestedFleetId: body.fleetId ?? null,
    });

    if (!actor.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fleetId = body.fleetId ?? actor.primaryFleetId ?? null;
    if (fleetId && !UUID.test(fleetId)) {
      return NextResponse.json({ error: "Invalid fleet" }, { status: 400 });
    }

    const action = body.action ?? "list";
    if (action === "list") {
      if (!actor.capabilities.canRunFleetDispatchActions) {
        return NextResponse.json(
          { error: "Fleet dispatch access required" },
          { status: 403 },
        );
      }
      const { data, error } = await supabase.rpc("get_fleet_defect_queue", {
        p_fleet_id: fleetId ?? undefined,
      });
      if (error) throw new Error(error.message);
      const payload = (data && typeof data === "object" ? data : {}) as Record<
        string,
        unknown
      >;
      const items = Array.isArray(payload.items)
        ? (payload.items as Array<Record<string, unknown>>)
        : [];
      const defectIds = items
        .map((item) => String(item.id ?? ""))
        .filter((id) => UUID.test(id));

      if (!defectIds.length) return NextResponse.json(payload);

      const { data: clarifications, error: clarificationError } = await supabase
        .from("fleet_defect_clarifications")
        .select(
          "id,defect_id,prompt,response_type,status,requested_at,response_text,responded_at",
        )
        .in("defect_id", defectIds)
        .order("requested_at", { ascending: false });
      if (clarificationError) throw new Error(clarificationError.message);

      const clarificationRows = clarifications ?? [];
      const clarificationIds = clarificationRows.map((row) => row.id);
      const evidenceResult = clarificationIds.length
        ? await supabase
            .from("fleet_driver_evidence")
            .select("id,clarification_id,media_type")
            .in("clarification_id", clarificationIds)
        : { data: [], error: null };
      if (evidenceResult.error) throw new Error(evidenceResult.error.message);

      const evidenceByClarification = new Map<
        string,
        Array<{ id: string; mediaType: string }>
      >();
      for (const evidence of evidenceResult.data ?? []) {
        if (!evidence.clarification_id) continue;
        const current =
          evidenceByClarification.get(evidence.clarification_id) ?? [];
        current.push({ id: evidence.id, mediaType: evidence.media_type });
        evidenceByClarification.set(evidence.clarification_id, current);
      }

      const latestByDefect = new Map<
        string,
        (typeof clarificationRows)[number]
      >();
      for (const clarification of clarificationRows) {
        if (!latestByDefect.has(clarification.defect_id)) {
          latestByDefect.set(clarification.defect_id, clarification);
        }
      }

      return NextResponse.json({
        ...payload,
        items: items.map((item) => {
          const clarification = latestByDefect.get(String(item.id));
          return {
            ...item,
            clarification: clarification
              ? {
                  id: clarification.id,
                  prompt: clarification.prompt,
                  responseType: clarification.response_type,
                  status: clarification.status,
                  requestedAt: clarification.requested_at,
                  responseText: clarification.response_text,
                  respondedAt: clarification.responded_at,
                  evidence: evidenceByClarification.get(clarification.id) ?? [],
                }
              : null,
          };
        }),
      });
    }

    if (fleetId && !canManageFleetForActor(actor, fleetId)) {
      return NextResponse.json(
        { error: "Fleet management access required" },
        { status: 403 },
      );
    }
    if (!fleetId && !actor.isInternal) {
      return NextResponse.json(
        { error: "Fleet management access required" },
        { status: 403 },
      );
    }

    const defectIds = Array.from(new Set(body.defectIds ?? []));
    if (!defectIds.length || defectIds.some((id) => !UUID.test(id))) {
      return NextResponse.json(
        { error: "Select at least one valid defect" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase.rpc("manage_fleet_driver_intake", {
      p_action: action,
      p_defect_ids: defectIds,
      p_action_date:
        action === "monitor"
          ? body.deferredUntil || undefined
          : action === "schedule"
            ? body.requestedForDate || undefined
            : undefined,
      p_reason: body.reason?.trim() || undefined,
      p_response_type: body.responseType || undefined,
      p_resolution_code: body.resolutionCode || undefined,
    });
    if (error) {
      const message = error.message || "Unable to update fleet defects";
      const status = /access|required|forbidden/i.test(message) ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[fleet/defects] error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update fleet defects",
      },
      { status: 500 },
    );
  }
}
