import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const id = params.id;
  const now = new Date().toISOString();

  // fetch current row (for safety; not strictly required)
  const { data: row, error: readErr } = await supabase
    .from("work_order_lines")
    .select("punched_in_at, punched_out_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ success: false, error: readErr.message }, { status: 400 });
  }

  // Build update payload without using `any`
  const payload = {
    status: "in_progress" as const,
    punched_in_at: row?.punched_in_at ?? now,
    // if it had an out time, clear it on (re)start
    punched_out_at: row?.punched_out_at ? null : undefined,
  };

  const { error: updErr } = await supabase
    .from("work_order_lines")
    .update(payload)
    .eq("id", id);

  if (updErr) {
    return NextResponse.json({ success: false, error: updErr.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}