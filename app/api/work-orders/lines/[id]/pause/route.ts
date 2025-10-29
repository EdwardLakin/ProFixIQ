export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

function getId(req: NextRequest) {
  const m = req.nextUrl.pathname.match(/\/api\/work-orders\/lines\/([^/]+)\/pause$/);
  return m?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const id = getId(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("work_order_lines")
    .update({
      status: "paused",
      // keep punched_in_at as-is; do NOT set punched_out_at on pause
    } as Database["public"]["Tables"]["work_order_lines"]["Update"])
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_logs").insert({
    entity_type: "work_order_line",
    entity_id: id,
    action: "pause",
    actor_id: auth.user.id,
    created_at: now,
  });

  return NextResponse.json({ ok: true });
}