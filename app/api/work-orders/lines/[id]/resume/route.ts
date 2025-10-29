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

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("work_order_lines")
    .update({
      status: "in_progress",
      // back “on the clock”
      punched_out_at: null,
    })
    .eq("id", id)
    .select("id, status, punched_in_at, punched_out_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_logs").insert({
    entity_type: "work_order_line",
    entity_id: id,
    action: "resume",
    actor_id: auth.user.id,
    created_at: now,
  });

  return NextResponse.json({ success: true, line: data });
}