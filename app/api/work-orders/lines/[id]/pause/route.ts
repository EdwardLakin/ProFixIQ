export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function POST(_req: Request, context: any) {
  const id = context?.params?.id as string;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = createRouteHandlerClient<Database>({ cookies });

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // optional reason
  let reason: string | undefined;
  try {
    if (_req.headers.get("content-type")?.includes("application/json")) {
      const body = await _req.json();
      if (typeof body?.reason === "string") reason = body.reason.slice(0, 500);
    }
  } catch {}

  const { error: updErr } = await supabase
    .from("work_order_lines")
    .update({ status: "paused", paused_at: new Date().toISOString() })
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
