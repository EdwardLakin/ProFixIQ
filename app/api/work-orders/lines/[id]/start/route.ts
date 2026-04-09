export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  canTransitionWorkOrderLineStatus,
  getWorkOrderLineTransitionError,
  normalizeWorkOrderLineStatus,
} from "@/features/work-orders/lib/line-status";

function getId(req: NextRequest) {
  const m = req.nextUrl.pathname.match(/\/api\/work-orders\/lines\/([^/]+)\/start$/);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const id = getId(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { allowConcurrentJobPunches?: boolean }
    | null;
  const allowConcurrentJobPunches = body?.allowConcurrentJobPunches === true;

  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, status, approval_state, punchable, assigned_tech_id, shop_id")
    .eq("id", id)
    .maybeSingle();

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 400 });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const status = normalizeWorkOrderLineStatus(line.status);
  const approvalState = String(line.approval_state ?? "").toLowerCase();
  const punchable = Boolean(line.punchable);

  if (status === "completed" || status === "invoiced") {
    return NextResponse.json(
      { error: "Cannot start a closed line." },
      { status: 409 },
    );
  }

  if (!canTransitionWorkOrderLineStatus(status, "in_progress")) {
    return NextResponse.json(
      { error: getWorkOrderLineTransitionError(status, "in_progress") },
      { status: 409 },
    );
  }

  if (status === "awaiting_approval" && approvalState !== "approved" && !punchable) {
    return NextResponse.json(
      { error: "Line is awaiting approval and cannot be started yet." },
      { status: 409 },
    );
  }

  const techId = line.assigned_tech_id ?? auth.user.id;

  let openShiftQ = supabase
    .from("tech_shifts")
    .select("id")
    .eq("user_id", techId)
    .eq("status", "open")
    .order("start_time", { ascending: false })
    .limit(1);
  if (line.shop_id) {
    openShiftQ = openShiftQ.eq("shop_id", line.shop_id);
  }
  const { data: openShift, error: openShiftErr } = await openShiftQ.maybeSingle();

  if (openShiftErr) {
    return NextResponse.json({ error: openShiftErr.message }, { status: 400 });
  }

  if (!openShift) {
    return NextResponse.json(
      { error: "Cannot start job without an active daily punch. Clock in first." },
      { status: 409 },
    );
  }

  const { data: driftedRows, error: driftErr } = await supabase
    .from("work_order_lines")
    .select("id")
    .eq("assigned_tech_id", techId)
    .not("punched_in_at", "is", null)
    .is("punched_out_at", null)
    .in("status", ["on_hold", "completed", "invoiced"]);

  if (driftErr) {
    return NextResponse.json({ error: driftErr.message }, { status: 400 });
  }

  if ((driftedRows?.length ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "Detected stale active labor punches on on-hold/completed jobs. Resolve those punches before starting a new job.",
      },
      { status: 409 },
    );
  }

  if (!allowConcurrentJobPunches) {
    const { data: activeJobRows, error: activeJobsErr } = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("assigned_tech_id", techId)
      .not("punched_in_at", "is", null)
      .is("punched_out_at", null)
      .neq("id", id);

    if (activeJobsErr) {
      return NextResponse.json({ error: activeJobsErr.message }, { status: 400 });
    }

    if ((activeJobRows?.length ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Technician already has an active job punch. Complete/pause it first or retry with allowConcurrentJobPunches=true.",
        },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("work_order_lines")
    .update({
      status: "in_progress",
      hold_reason: null,
      punched_in_at: now,
      punched_out_at: null,
    })
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_logs").insert({
    entity_type: "work_order_line",
    entity_id: id,
    action: "start",
    actor_id: auth.user.id,
    created_at: now,
  });

  return NextResponse.json({ ok: true });
}
