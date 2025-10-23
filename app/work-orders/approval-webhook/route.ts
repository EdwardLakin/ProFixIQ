// app/work-orders/approval-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Json = Record<string, unknown>;

type Body = {
  workOrderId?: string;
  approvedLineIds?: string[];
  declinedLineIds?: string[];
  declineUnchecked?: boolean;
  approverId?: string | null;    // reserved for later use
  signatureUrl?: string | null;
};

const isString = (v: unknown): v is string => typeof v === "string";
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter(isString) : [];

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // --- read & validate body ---
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" } satisfies Json,
      { status: 400 }
    );
  }

  const workOrderId = isString(body.workOrderId) ? body.workOrderId : "";
  const approvedLineIds = strArray(body.approvedLineIds);
  const declinedLineIds = strArray(body.declinedLineIds);
  const declineUnchecked = body.declineUnchecked ?? true;
  const signatureUrl = isString(body.signatureUrl) ? body.signatureUrl : null;

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
    //    Also reflect the decision at the WO level so Quote Review hides it
    const { error: woErr } = await supabase
      .from("work_orders")
      .update({
        customer_approval_at: new Date().toISOString(),
        customer_approval_signature_path: signatureUrl,
        // ensure this WO drops out of quote-review and shows in normal flow
        approval_state: "approved",
        status: "queued",
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