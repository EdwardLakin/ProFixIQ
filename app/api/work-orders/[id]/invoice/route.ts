// app/api/work-orders/[id]/invoice/route.ts
// ✅ FULL FILE REPLACEMENT — Next.js 15 params fix

export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { reviewWorkOrder } from "../_lib/reviewWorkOrder";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";


function isError(x: unknown): x is Error {
  return typeof x === "object" && x !== null && "message" in x;
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = createServerSupabaseRoute();

  const params = await ctx.params;
  const woId = typeof params?.id === "string" ? params.id : "";

  if (!woId) {
    return NextResponse.json(
      {
        ok: false,
        issues: [{ kind: "bad_request", message: "Missing work order id" }],
      },
      { status: 400 },
    );
  }

  try {
    const { data: scopedWorkOrder, error: scopedWorkOrderError } = await supabase
      .from("work_orders")
      .select("shop_id")
      .eq("id", woId)
      .maybeSingle<{ shop_id: string | null }>();

    if (scopedWorkOrderError) throw scopedWorkOrderError;
    if (!scopedWorkOrder?.shop_id) {
      return NextResponse.json(
        { ok: false, issues: [{ kind: "missing_wo", message: "WO not found" }] },
        { status: 404 },
      );
    }

    const result = await reviewWorkOrder({
      supabase,
      workOrderId: woId,
      shopId: scopedWorkOrder.shop_id,
      kind: "invoice_review",
    });

    if (!result.ok && result.issues.some((i) => i.kind === "missing_wo")) {
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "Invoice review failed";
    return NextResponse.json(
      { ok: false, issues: [{ kind: "error", message: msg }] },
      { status: 500 },
    );
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = createServerSupabaseRoute();
  const params = await ctx.params;
  const woId = typeof params?.id === "string" ? params.id : "";
  if (!woId) return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  try {
    const { data: scopedWorkOrder, error: scopedWorkOrderError } = await supabase
      .from("work_orders")
      .select("shop_id")
      .eq("id", woId)
      .maybeSingle<{ shop_id: string | null }>();
    if (scopedWorkOrderError) throw scopedWorkOrderError;
    if (!scopedWorkOrder?.shop_id) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const activeInvoiceVersion = await getActiveInvoiceVersion({
      supabase,
      workOrderId: woId,
      shopId: scopedWorkOrder.shop_id,
    });
    const snapshot =
      activeInvoiceVersion?.snapshot ??
      (await getInvoiceSnapshotForWorkOrder({ supabase, workOrderId: woId }));
    return NextResponse.json(
      { snapshot, activeInvoiceVersion },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e: unknown) {
    const msg = isError(e) ? e.message : "Snapshot failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
