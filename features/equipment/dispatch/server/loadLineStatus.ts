import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import type { LineSegmentInput } from "@/features/equipment/dispatch/lib/lineStatus";

type DB = Database;

export type EquipmentLineStatus = {
  line: {
    id: string;
    workOrderId: string | null;
    title: string;
    status: string | null;
    approvalState: string | null;
    holdReason: string | null;
    cause: string | null;
    correction: string | null;
  };
  segments: LineSegmentInput[];
  names: Record<string, string>;
  /** The viewer is assigned to this line (primary or supporting). */
  viewerAssigned: boolean;
};

/**
 * Loads one line for the Equipment line screen, scoped to the viewer's shop.
 * Returns null when the line is not in the shop, or when the viewer is neither
 * dispatch staff nor assigned to it, so the page cannot reveal other shops'
 * or other technicians' work.
 */
export async function loadEquipmentLineStatus(input: {
  admin: SupabaseClient<DB>;
  shopId: string;
  lineId: string;
  viewerProfileId: string;
  viewerCanManage: boolean;
}): Promise<EquipmentLineStatus | null> {
  const { admin, shopId, lineId } = input;

  const { data: line, error: lineError } = await admin
    .from("work_order_lines")
    .select(
      "id,work_order_id,description,complaint,status,approval_state,hold_reason,cause,correction,assigned_tech_id",
    )
    .eq("id", lineId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (lineError) throw new Error("Unable to load the line.");
  if (!line) return null;

  const { data: assignment, error: assignmentError } = await admin
    .from("work_order_line_technicians")
    .select("technician_id")
    .eq("work_order_line_id", lineId)
    .eq("technician_id", input.viewerProfileId)
    .limit(1);
  if (assignmentError) throw new Error("Unable to load the line.");
  const viewerAssigned =
    line.assigned_tech_id === input.viewerProfileId || (assignment ?? []).length > 0;

  if (!input.viewerCanManage && !viewerAssigned) return null;

  const { data: segments, error: segmentError } = await admin
    .from("work_order_line_labor_segments")
    .select("technician_id,started_at,ended_at,pause_reason")
    .eq("shop_id", shopId)
    .eq("work_order_line_id", lineId)
    .order("started_at", { ascending: true })
    .limit(500);
  if (segmentError) throw new Error("Unable to load the line.");

  const technicianIds = [...new Set((segments ?? []).map((segment) => segment.technician_id))];
  const names: Record<string, string> = {};
  if (technicianIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id,full_name")
      .eq("shop_id", shopId)
      .in("id", technicianIds);
    if (profileError) throw new Error("Unable to load the line.");
    for (const profile of profiles ?? []) names[profile.id] = profile.full_name?.trim() || "Technician";
  }

  return {
    line: {
      id: line.id,
      workOrderId: line.work_order_id,
      title: line.description?.trim() || line.complaint?.trim() || "Job line",
      status: line.status,
      approvalState: line.approval_state,
      holdReason: line.hold_reason,
      cause: line.cause,
      correction: line.correction,
    },
    segments: (segments ?? []).map((segment) => ({
      technicianId: segment.technician_id,
      startedAt: segment.started_at,
      endedAt: segment.ended_at,
      pauseReason: segment.pause_reason,
    })),
    names,
    viewerAssigned,
  };
}
