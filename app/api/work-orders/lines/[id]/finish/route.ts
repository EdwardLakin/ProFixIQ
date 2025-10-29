export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type Body = {
  cause?: string;
  correction?: string;
};

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });

  // --- Auth ---
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr)
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // --- Parse request ---
  const now = new Date().toISOString();
  const { cause, correction } = (await req.json().catch(() => ({}))) as Body;

  // --- Update work order line ---
  const updatePayload: Database["public"]["Tables"]["work_order_lines"]["Update"] = {
    status: "completed",
    punched_out_at: now,
    ...(cause !== undefined ? { cause } : {}),
    ...(correction !== undefined ? { correction } : {}),
  };

  const { data, error } = await supabase
    .from("work_order_lines")
    .update(updatePayload)
    .eq("id", id)
    .select("id, status, punched_in_at, punched_out_at, cause, correction")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // --- Log activity ---
  await supabase.from("activity_logs").insert({
    entity_type: "work_order_line",
    entity_id: id,
    action: "finish",
    actor_id: auth.user.id,
    created_at: now,
  });

  // --- Respond ---
  return NextResponse.json({ success: true, line: data });
}