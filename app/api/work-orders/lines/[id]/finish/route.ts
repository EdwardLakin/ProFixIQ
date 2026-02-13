// app/api/work-orders/lines/[id]/finish/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Body = { cause?: string; correction?: string };

function extractLineId(req: NextRequest): string | null {
  // matches /api/work-orders/lines/<id>/finish
  const m = req.nextUrl.pathname.match(
    /\/api\/work-orders\/lines\/([^/]+)\/finish$/,
  );
  return m?.[1] ?? null;
}

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: NextRequest) {
  const id = extractLineId(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const body = (await req.json().catch(() => ({}))) as Body;

  const cause = clean(body.cause);
  const correction = clean(body.correction);

  // 1) Update the WO line as completed
  const updatePayload: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
    status: "completed",
    punched_out_at: nowIso,
    ...(cause !== null ? { cause } : {}),
    ...(correction !== null ? { correction } : {}),
  };

  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .update(updatePayload)
    .eq("id", id)
    .select("id, status, punched_in_at, punched_out_at, cause, correction")
    .single();

  if (lineErr) {
    return NextResponse.json({ error: lineErr.message }, { status: 400 });
  }

  // 2) Finalize the inspection row tied to THIS line (if it exists)
  //    (This assumes you added inspections.work_order_line_id + unique index as discussed.)
  const inspectionUpdate: DB["public"]["Tables"]["inspections"]["Update"] = {
    completed: true,
    is_draft: false,
    locked: true,
    status: "completed",
    finalized_at: nowIso,
    finalized_by: user.id,
    updated_at: nowIso,
  };

  const { error: inspErr } = await supabase
    .from("inspections")
    .update(inspectionUpdate)
    .eq("work_order_line_id", id);

  // If there's no matching inspection yet, don't fail finishing the job
  if (inspErr) {
    // eslint-disable-next-line no-console
    console.warn("[finish] inspections finalize failed:", inspErr.message);
  }

  // 3) Best-effort activity log — never fail the finish if logging fails
  try {
    await supabase.from("activity_logs").insert({
      entity_type: "work_order_line",
      entity_id: id,
      action: "finish",
      actor_id: user.id,
      created_at: nowIso,
    });
  } catch (e) {
    // ignore logging errors (RLS / table missing / etc.)
    // eslint-disable-next-line no-console
    console.warn("activity_logs insert failed", e);
  }

  return NextResponse.json({ success: true, line });
}