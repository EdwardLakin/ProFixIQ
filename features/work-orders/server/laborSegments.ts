import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type LaborSegmentRow =
  DB["public"]["Tables"]["work_order_line_labor_segments"]["Row"];

type LaborSegmentInsert =
  DB["public"]["Tables"]["work_order_line_labor_segments"]["Insert"];

export async function startLaborSegment(params: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  workOrderLineId: string;
  technicianId: string;
  actorId: string;
  startedAtIso: string;
  source?: string;
}) {
  const payload: LaborSegmentInsert = {
    shop_id: params.shopId,
    work_order_id: params.workOrderId,
    work_order_line_id: params.workOrderLineId,
    technician_id: params.technicianId,
    created_by: params.actorId,
    started_at: params.startedAtIso,
    source: params.source ?? "job_punch",
  };

  const { error } = await params.supabase
    .from("work_order_line_labor_segments")
    .insert(payload);
  return { error };
}

export async function closeActiveLaborSegments(params: {
  supabase: SupabaseClient<DB>;
  workOrderLineId?: string;
  technicianId?: string;
  endedAtIso: string;
  pauseReason?: string | null;
}) {
  let query = params.supabase
    .from("work_order_line_labor_segments")
    .update({
      ended_at: params.endedAtIso,
      ...(params.pauseReason !== undefined
        ? { pause_reason: params.pauseReason }
        : {}),
    })
    .is("ended_at", null);

  if (params.workOrderLineId) {
    query = query.eq("work_order_line_id", params.workOrderLineId);
  }
  if (params.technicianId) {
    query = query.eq("technician_id", params.technicianId);
  }

  const { error } = await query;
  return { error };
}

export async function getActiveLaborSegmentsByTechnician(params: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  technicianId: string;
}) {
  const { data, error } = await params.supabase
    .from("work_order_line_labor_segments")
    .select("id, work_order_line_id, started_at")
    .eq("shop_id", params.shopId)
    .eq("technician_id", params.technicianId)
    .is("ended_at", null)
    .order("started_at", { ascending: true });

  return { data, error };
}

export async function syncLinePunchMirrorFromSegments(params: {
  supabase: SupabaseClient<DB>;
  workOrderLineId: string;
}) {
  const { data: segments, error: segErr } = await params.supabase
    .from("work_order_line_labor_segments")
    .select("started_at, ended_at")
    .eq("work_order_line_id", params.workOrderLineId)
    .order("started_at", { ascending: true });

  if (segErr) return { error: segErr };

  const rows = (segments ?? []) as Pick<
    LaborSegmentRow,
    "started_at" | "ended_at"
  >[];
  if (rows.length === 0) {
    const { error } = await params.supabase
      .from("work_order_lines")
      .update({ punched_in_at: null, punched_out_at: null })
      .eq("id", params.workOrderLineId);
    return { error };
  }

  const earliestStartedAt = rows[0]?.started_at ?? null;
  const hasOpenSegment = rows.some((segment) => !segment.ended_at);

  let latestEndedAt: string | null = null;
  for (const segment of rows) {
    if (!segment.ended_at) continue;
    if (
      !latestEndedAt ||
      new Date(segment.ended_at).getTime() > new Date(latestEndedAt).getTime()
    ) {
      latestEndedAt = segment.ended_at;
    }
  }

  const { error } = await params.supabase
    .from("work_order_lines")
    .update({
      punched_in_at: earliestStartedAt,
      punched_out_at: hasOpenSegment ? null : latestEndedAt,
    })
    .eq("id", params.workOrderLineId);

  return { error };
}
