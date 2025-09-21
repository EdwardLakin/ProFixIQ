import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { workOrderId, approvedLineIds, declinedLineIds, declineUnchecked = true, approverId = null } = await req.json();

  if (!workOrderId || !Array.isArray(approvedLineIds)) {
    return NextResponse.json({ error: "workOrderId and approvedLineIds[] required" }, { status: 400 });
    }

  const { error } = await supabase.rpc("approve_lines", {
    _wo: workOrderId,
    _approved_ids: approvedLineIds,
    _declined_ids: declinedLineIds ?? null,
    _decline_unchecked: declineUnchecked,
    _approver: approverId
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}