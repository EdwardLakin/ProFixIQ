export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function POST(
  _req: Request,
  { params }: { params: { lineId: string } }
) {
  const id = params?.lineId;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional: preserve original punched_in_at if already set
  const { data: existing, error: readErr } = await supabase
    .from("work_order_lines")
    .select("id, punched_in_at")
    .eq("id", id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 400 });

  const now = new Date().toISOString();

  const updatePayload: Database["public"]["Tables"]["work_order_lines"]["Update"] = {
    status: "in_progress",
    punched_in_at: existing?.punched_in_at ?? now,
    punched_out_at: null,
  };

  const { data, error } = await supabase
    .from("work_order_lines")
    .update(updatePayload)
    .eq("id", id)
    .select("id, status, punched_in_at, punched_out_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_logs").insert({
    entity_type: "work_order_line",
    entity_id: id,
    action: "start",
    actor_id: auth.user.id,
    created_at: now,
  });

  return NextResponse.json({ success: true, line: data });
}