// app/api/work-orders/lines/[id]/finish/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Body = { cause?: string; correction?: string };

function extractLineId(req: NextRequest) {
  // matches /api/work-orders/lines/<id>/finish
  const m = req.nextUrl.pathname.match(/\/api\/work-orders\/lines\/([^/]+)\/finish$/);
  return m?.[1] ?? null;
}

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function POST(req: NextRequest) {
  const id = extractLineId(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowIso = new Date().toISOString();
  const body = (await req.json().catch(() => ({}))) as Body;

  const cause = clean(body.cause);
  const correction = clean(body.correction);

  // Always set completed + punched_out_at. Only set cause/correction when provided.
  const updatePayload: Database["public"]["Tables"]["work_order_lines"]["Update"] = {
    status: "completed",
    punched_out_at: nowIso,
    ...(cause !== null ? { cause } : {}),
    ...(correction !== null ? { correction } : {}),
  };

  const { data, error } = await supabase
    .from("work_order_lines")
    .update(updatePayload)
    .eq("id", id)
    .select("id, status, punched_in_at, punched_out_at, cause, correction")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Best-effort activity log — never fail the finish if logging fails
  try {
    await supabase.from("activity_logs").insert({
      entity_type: "work_order_line",
      entity_id: id,
      action: "finish",
      actor_id: auth.user.id,
      created_at: nowIso,
    });
  } catch (e) {
    // ignore logging errors (RLS / table missing / etc.)
    console.warn("activity_logs insert failed", e);
  }

  return NextResponse.json({ success: true, line: data });
}