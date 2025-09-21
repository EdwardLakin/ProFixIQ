import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { workOrderId, lineIds } = await req.json();

  if (!workOrderId || !Array.isArray(lineIds) || lineIds.length === 0) {
    return NextResponse.json({ error: "workOrderId and lineIds[] required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("send_for_approval", {
    _wo: workOrderId,
    _line_ids: lineIds,
    _set_wo_status: true
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}