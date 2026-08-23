import "server-only";

import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { createServerSupabaseRSC } from "@shared/lib/supabase/server";
import {
  getWorkOrderLineStatusDbFilter,
  type WorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";

type NextLine = {
  id: string;
  work_order_id: string | null;
  created_at: string;
  updated_at: string | null;
  status: "ready" | "in_progress" | "on_hold" | "completed" | "awaiting";
  priority?: number | null;
};

type AssignmentRpcClient = {
  rpc: (
    name: "assign_work_order_line_technician_atomic",
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export async function getNextAvailableLine(
  technicianId: string,
): Promise<NextLine | null> {
  const supabase = await createServerSupabaseRSC();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== technicianId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", technicianId)
    .single();
  const shopId = profile?.shop_id;
  if (!shopId) return null;

  const resumableStatuses: WorkOrderLineStatus[] = [
    "in_progress",
    "on_hold",
    "awaiting",
  ];
  const { data: bridgeRows, error: bridgeError } = await supabase
    .from("work_order_line_technicians")
    .select("work_order_line_id")
    .eq("technician_id", technicianId);
  if (bridgeError) return null;

  const assignedLineIds = (bridgeRows ?? []).map(
    (assignment) => assignment.work_order_line_id,
  );
  let resumeQuery = supabase
    .from("work_order_lines")
    .select("id, work_order_id, created_at, updated_at, status, priority")
    .eq("shop_id", shopId)
    .in("status", getWorkOrderLineStatusDbFilter(resumableStatuses))
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1);
  resumeQuery =
    assignedLineIds.length > 0
      ? resumeQuery.or(
          `assigned_tech_id.eq.${technicianId},id.in.(${assignedLineIds.join(",")})`,
        )
      : resumeQuery.eq("assigned_tech_id", technicianId);
  const { data: resume } = await resumeQuery;
  if (resume?.[0]) return resume[0] as NextLine;

  // Load several candidates so a legacy/canonical supporting assignment on the
  // first row cannot make the self-claim logic choose someone else's job.
  const { data: candidates, error: candidateError } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id, created_at, updated_at, status, priority")
    .eq("shop_id", shopId)
    .in("status", getWorkOrderLineStatusDbFilter(["in_progress"]))
    .is("assigned_tech_id", null)
    .is("assigned_to", null)
    .order("priority", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(25);
  if (candidateError || !candidates?.length) return null;

  const candidateIds = candidates.map((candidate) => candidate.id);
  const admin = await createAdminSupabase();
  const { data: existingAssignments, error: assignmentError } = await admin
    .from("work_order_line_technicians")
    .select("work_order_line_id")
    .in("work_order_line_id", candidateIds);
  if (assignmentError) return null;
  const alreadyAssigned = new Set(
    (existingAssignments ?? []).map(
      (assignment) => assignment.work_order_line_id,
    ),
  );
  const candidate = candidates.find((line) => !alreadyAssigned.has(line.id));
  if (!candidate) return null;

  const assignmentAdmin = admin as unknown as AssignmentRpcClient;
  const operationKey = `self-claim:${technicianId}:${candidate.id}:${crypto.randomUUID()}`;
  const { error: claimError } = await assignmentAdmin.rpc(
    "assign_work_order_line_technician_atomic",
    {
      p_shop_id: shopId,
      p_work_order_line_id: candidate.id,
      p_technician_id: technicianId,
      p_actor_user_id: technicianId,
      p_action: "set_primary",
      p_operation_key: operationKey,
      p_expected_updated_at: candidate.updated_at,
    },
  );
  if (claimError) return null;

  const { data: claimed, error: statusError } = await supabase
    .from("work_order_lines")
    .update({ status: "awaiting" })
    .eq("id", candidate.id)
    .eq("shop_id", shopId)
    .select("id, work_order_id, created_at, updated_at, status, priority")
    .single();
  if (statusError || !claimed) return null;
  return claimed as NextLine;
}
