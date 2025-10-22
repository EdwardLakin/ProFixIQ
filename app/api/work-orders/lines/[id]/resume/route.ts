export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase"; // <-- adjust if needed

export async function POST(req: NextRequest, context: { params: { id: string } }) {
  const { id } = context.params;
  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let reason: string | undefined;
  if (req.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = await req.json();
      if (typeof body?.reason === "string") reason = body.reason.slice(0, 500);
    } catch { /* ignore empty/invalid body */ }
  }

  const { error: updErr } = await supabase
    .from("work_order_lines")
    .update({
      status: "paused", // enum must include this value
      paused_at: new Date().toISOString(),
    })
    .eq("id", id)
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  await supabase.from("activity_logs").insert({
    entity_type: "work_order_line",
    entity_id: id,
    action: "pause",
    note: reason,
    actor_id: auth.user.id,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
