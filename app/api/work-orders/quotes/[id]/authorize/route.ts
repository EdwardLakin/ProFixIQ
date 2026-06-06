// app/api/work-orders/quotes/[id]/authorize/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { applyWorkOrderQuoteLineDecision } from "@/features/work-orders/server/workOrderQuoteLineApproval";

export const runtime = "nodejs";


export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id, role")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.shop_id) {
      return NextResponse.json(
        { error: "Unable to resolve actor profile" },
        { status: 403 },
      );
    }

    const actor = getActorCapabilities({ role: profile.role });
    if (!actor.isKnownRole || !actor.canAuthorizeQuotes) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Extract `[id]` from the pathname .../quotes/<id>/authorize
    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 2];

    if (!id) {
      return NextResponse.json(
        { error: "Missing quote line id" },
        { status: 400 },
      );
    }

    const { data: q, error: qErr } = await supabase
      .from("work_order_quote_lines")
      .select("id, shop_id, work_order_id, work_order_line_id")
      .eq("id", id)
      .single();

    if (qErr || !q) {
      return NextResponse.json(
        { error: "Quote line not found" },
        { status: 404 },
      );
    }

    if (!q.shop_id) {
      return NextResponse.json(
        { error: "Quote line is missing shop_id" },
        { status: 400 },
      );
    }
    if (q.shop_id !== profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await applyWorkOrderQuoteLineDecision({
      supabase,
      quoteLineIds: [q.id],
      workOrderId: q.work_order_id,
      shopId: q.shop_id,
      customerId: null,
      actorUserId: user.id,
      decision: "approve",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to authorize quote line" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      workOrderLineId:
        result.workOrderLineIds[0] ?? q.work_order_line_id ?? null,
      workOrderLineIds: result.workOrderLineIds,
      approvalState: result.approvalState,
      partRelink: result.partRelink,
    });
  } catch {
    return NextResponse.json({ error: "Failed to authorize" }, { status: 500 });
  }
}
