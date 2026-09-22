import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  canManageFleetForActor,
  resolveFleetActorContext,
} from "@/features/fleet/lib/resolveFleetActorContext";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { projectFleetNotificationRows } from "@/features/fleet/server/fleetNotificationInbox";

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

type MissedPayloadRow = Record<string, unknown> & {
  id?: unknown;
  serviceDate?: unknown;
};

const LOOKUP_CHUNK_SIZE = 100;

function chunks<T>(values: T[], size = LOOKUP_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

type ComplianceLookupRow = {
  id: string;
  shop_id: string;
  assignment_id: string;
  service_date: string;
};

type NotificationLookupRow = {
  id: string;
  level: "info" | "warning" | "critical";
  code: string;
  title: string;
  message: string;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: "active" | "acknowledged" | "resolved";
  metadata: unknown;
  last_seen_at: string;
  shop_id: string;
  fingerprint: string;
};

async function actionableMissedPretrips(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  missed: MissedPayloadRow[],
) {
  const complianceIds = missed
    .map((item) => String(item.id ?? ""))
    .filter((id) => UUID.test(id));

  if (complianceIds.length === 0) return [];

  const complianceRows: ComplianceLookupRow[] = [];
  for (const idChunk of chunks(complianceIds)) {
    const { data, error } = await supabase
      .from("fleet_pretrip_compliance")
      .select("id,shop_id,assignment_id,service_date")
      .in("id", idChunk);

    if (error) throw new Error(error.message);
    complianceRows.push(...(data ?? []));
  }

  const byFingerprint = new Map<
    string,
    { complianceId: string; serviceDate: string }
  >();
  for (const row of complianceRows ?? []) {
    const fingerprint = `fleet-pretrip-missed:${row.assignment_id}:${row.service_date}`;
    byFingerprint.set(`${row.shop_id}::${fingerprint}`, {
      complianceId: row.id,
      serviceDate: row.service_date,
    });
  }

  const shopIds = Array.from(
    new Set(complianceRows.map((row) => row.shop_id)),
  );
  const fingerprints = Array.from(
    new Set(
      complianceRows.map(
        (row) =>
          `fleet-pretrip-missed:${row.assignment_id}:${row.service_date}`,
      ),
    ),
  );

  if (shopIds.length === 0 || fingerprints.length === 0) return [];

  const notifications: NotificationLookupRow[] = [];
  for (const fingerprintChunk of chunks(fingerprints)) {
    const { data, error } = await supabaseAdmin
      .from("assistant_notifications")
      .select(
        "id,level,code,title,message,href,entity_type,entity_id,status,metadata,last_seen_at,shop_id,fingerprint",
      )
      .eq("source", "fleet")
      .eq("code", "fleet_pretrip_missed")
      .eq("status", "active")
      .in("shop_id", shopIds)
      .in("fingerprint", fingerprintChunk);

    if (error) throw new Error(error.message);
    notifications.push(...((data ?? []) as NotificationLookupRow[]));
  }

  notifications.sort((left, right) => {
    const seen = right.last_seen_at.localeCompare(left.last_seen_at);
    return seen || right.id.localeCompare(left.id);
  });

  const projected = await projectFleetNotificationRows({
    supabase: supabaseAdmin,
    rows: notifications.map((row) => ({
      id: row.id,
      level: row.level,
      code: row.code,
      title: row.title,
      message: row.message,
      href: row.href,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      status: row.status,
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : null,
      last_seen_at: row.last_seen_at,
    })),
  });

  const projectedIds = new Set(projected.map((row) => row.id));
  const notificationByComplianceId = new Map<string, string>();

  for (const row of notifications ?? []) {
    if (!projectedIds.has(row.id)) continue;
    const match = byFingerprint.get(`${row.shop_id}::${row.fingerprint}`);
    if (match) notificationByComplianceId.set(match.complianceId, row.id);
  }

  return missed
    .map((item) => {
      const complianceId = String(item.id ?? "");
      const notificationId = notificationByComplianceId.get(complianceId);
      return notificationId ? { ...item, notificationId } : null;
    })
    .filter((item): item is MissedPayloadRow & { notificationId: string } =>
      Boolean(item),
    );
}

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
      const missed = Array.isArray(payload.missed)
        ? (payload.missed as MissedPayloadRow[])
        : [];
      const actionableMissed = await actionableMissedPretrips(
        supabase,
        missed,
      );
      const summary =
        payload.summary &&
        typeof payload.summary === "object" &&
        !Array.isArray(payload.summary)
          ? {
              ...(payload.summary as Record<string, unknown>),
              missedPretrips: actionableMissed.length,
            }
          : payload.summary;
      const defectIds = items
        .map((item) => String(item.id ?? ""))
        .filter((id) => UUID.test(id));

      if (!defectIds.length) {
        return NextResponse.json({
          ...payload,
          summary,
          missed: actionableMissed,
        });
      }

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
        summary,
        missed: actionableMissed,
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
