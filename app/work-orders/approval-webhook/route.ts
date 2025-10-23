// app/work-orders/approval-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { cookies } from "next/headers";

type DB = Database;
type Json = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

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
    signatureUrl,
  } = body;

  if (!workOrderId) {
    return NextResponse.json(
      { error: "Missing workOrderId" } satisfies Json,
      { status: 400 }
    );
  }

  try {
    console.log("Approval webhook received:", body);

    //
    // ✅ 1️⃣ Update approved lines
    //
    if (approvedLineIds.length > 0) {
      const { error: apprErr } = await supabase
        .from("work_order_lines")
        .update({ status: "approved" })
        .in("id", approvedLineIds)
        .eq("work_order_id", workOrderId);

      if (apprErr) throw new Error(apprErr.message);
    }

    //
    // ✅ 2️⃣ Decline non-checked items
    //
    if (declineUnchecked && declinedLineIds.length > 0) {
      const { error: decErr } = await supabase
        .from("work_order_lines")
        .update({ status: "declined" })
        .in("id", declinedLineIds)
        .eq("work_order_id", workOrderId);

      if (decErr) throw new Error(decErr.message);
    }

    //
    // ✅ 3️⃣ Set work order as approved + attach signature
    //
    const { error: woErr } = await supabase
      .from("work_orders")
      .update({
        status: "approved",
        customer_approval_at: new Date().toISOString(),
        customer_approval_signature_path: signatureUrl ?? null,
      })
      .eq("id", workOrderId);

    if (woErr) throw new Error(woErr.message);

    console.log("✅ Approval complete:", workOrderId);

    return NextResponse.json(
      {
        success: true,
        workOrderId,
        approvedLineIds,
        declinedLineIds,
      } satisfies Json,
      { status: 200 }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("❌ Approval webhook failed:", msg);
    return NextResponse.json({ error: msg } satisfies Json, { status: 500 });
  }
}