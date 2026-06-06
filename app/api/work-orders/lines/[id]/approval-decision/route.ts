import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { applyAndPropagateWorkOrderLineApprovalDecision } from "@/features/work-orders/server/workOrderLineApproval";

type RouteContext = { params: Promise<{ id: string }> };
type Decision = "approve" | "decline" | "defer";
type Body = {
  decision: Decision;
  workOrderId?: string | null;
  resetPunchClock?: boolean;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const supabase = createServerSupabaseRoute();
  const { id } = await ctx.params;
  const lineId = safeString(id);

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const decision = body?.decision;
  const workOrderId = safeString(body?.workOrderId);

  if (!lineId || (decision !== "approve" && decision !== "decline" && decision !== "defer")) {
    return NextResponse.json({ ok: false, error: "Missing lineId or decision" }, { status: 400 });
  }

  const { error } = await applyAndPropagateWorkOrderLineApprovalDecision({
    supabase,
    decision,
    lineIds: [lineId],
    workOrderId: workOrderId || undefined,
    extraPatch: body?.resetPunchClock
      ? {
          punched_in_at: null,
          punched_out_at: null,
        }
      : undefined,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  const { data: row, error: rowErr } = await supabase
    .from("work_order_lines")
    .select("id, work_order_id")
    .eq("id", lineId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ ok: false, error: rowErr.message }, { status: 400 });
  }

  if (!row?.id) {
    return NextResponse.json({ ok: false, error: "Line item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, lineId: row.id, workOrderId: row.work_order_id });
}
