export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";

function getId(req: NextRequest) {
  const m = req.nextUrl.pathname.match(/\/api\/work-orders\/lines\/([^/]+)\/resume$/);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const id = getId(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: line, error: lineErr } = await supabase
    .from("work_order_lines")
    .select("id, status, approval_state, punchable")
    .eq("id", id)
    .maybeSingle();

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 400 });
  if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });

  const status = normalizeWorkOrderLineStatus(line.status);
  const approvalState = String(line.approval_state ?? "").toLowerCase();
  const punchable = Boolean(line.punchable);

  if (status === "completed" || status === "invoiced") {
    return NextResponse.json(
      { error: "Cannot resume a closed line." },
      { status: 409 },
    );
  }

  if (status === "awaiting_approval" && approvalState !== "approved" && !punchable) {
    return NextResponse.json(
      { error: "Line is awaiting approval and cannot be resumed yet." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("work_order_lines")
    .update({
      status: "active",
      hold_reason: null,
      // punched_out_at stays null until finish
    } as Database["public"]["Tables"]["work_order_lines"]["Update"])
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_logs").insert({
    entity_type: "work_order_line",
    entity_id: id,
    action: "resume",
    actor_id: auth.user.id,
    created_at: now,
  });

  return NextResponse.json({ ok: true });
}
