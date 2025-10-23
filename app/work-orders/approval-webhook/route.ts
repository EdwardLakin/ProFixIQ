import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Json = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // --- read & validate body ---
  let body: {
    workOrderId?: string;
    approvedLineIds?: string[];
    declinedLineIds?: string[];
    declineUnchecked?: boolean;
    approverId?: string | null;
    signatureUrl?: string | null;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" } satisfies Json,
      { status: 400 }
    );
  }

  const {
    workOrderId,
    approvedLineIds = [],
    declinedLineIds = [],
    declineUnchecked = true,
    signatureUrl = null,
  } = body;

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Missing workOrderId" } satisfies Json,
      { status: 400 }
    );
  }

  try {
    // 1) Mark approved items
    if (approvedLineIds.length > 0) {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ approval_state: "approved" })
        .in("id", approvedLineIds)
        .eq("work_order_id", workOrderId);
      if (error) throw new Error(error.message);
    }

    // 2) Mark declined items (only if asked to decline unchecked)
    if (declineUnchecked && declinedLineIds.length > 0) {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ approval_state: "declined" })
        .in("id", declinedLineIds)
        .eq("work_order_id", workOrderId);
      if (error) throw new Error(error.message);
    }

    // 3) Store signature + approval timestamp on the WO
    const { error: woErr } = await supabase
      .from("work_orders")
      .update({
        customer_approval_at: new Date().toISOString(),
        customer_approval_signature_path: signatureUrl,
        // NOTE: do NOT change work_orders.status here unless your enum includes the target value
      })
      .eq("id", workOrderId);
    if (woErr) throw new Error(woErr.message);

    return NextResponse.json(
      {
        success: true,
        workOrderId,
        approvedLineIds,
        declinedLineIds,
      } satisfies Json,
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg } satisfies Json, { status: 500 });
  }
}