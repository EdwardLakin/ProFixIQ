// app/api/work-orders/quotes/[id]/authorize/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, TablesInsert } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

export const runtime = "nodejs";

type DB = Database;
type WorkOrderLineInsert = TablesInsert<"work_order_lines">;

const NON_CONVERTIBLE_STATUSES = new Set(["declined", "deferred", "rejected", "cancelled"]);

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

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
      return NextResponse.json({ error: "Unable to resolve actor profile" }, { status: 403 });
    }

    const actor = getActorCapabilities({ role: profile.role });
    if (!actor.isKnownRole || !actor.canAuthorizeQuotes) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Extract `[id]` from the pathname .../quotes/<id>/authorize
    const segments = req.nextUrl.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 2]; // the segment before "authorize"

    if (!id) {
      return NextResponse.json({ error: "Missing quote line id" }, { status: 400 });
    }

    // 1) Load the quote line we’re authorizing
    const { data: q, error: qErr } = await supabase
      .from("work_order_quote_lines")
      .select(
        "id, shop_id, work_order_id, work_order_line_id, status, vehicle_id, description, job_type, est_labor_hours, ai_complaint, ai_cause, ai_correction",
      )
      .eq("id", id)
      .single();

    if (qErr || !q) {
      return NextResponse.json({ error: "Quote line not found" }, { status: 404 });
    }

    if (!q.shop_id) {
      return NextResponse.json({ error: "Quote line is missing shop_id" }, { status: 400 });
    }
    if (q.shop_id !== profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if ((q.status && NON_CONVERTIBLE_STATUSES.has(q.status)) ?? false) {
      return NextResponse.json(
        { error: `Quote line cannot be authorized from status '${q.status}'` },
        { status: 409 },
      );
    }

    if (q.status === "converted" || q.work_order_line_id) {
      return NextResponse.json({
        ok: true,
        alreadyConverted: true,
        workOrderLineId: q.work_order_line_id ?? null,
      });
    }

    const { data: workOrder, error: workOrderErr } = await supabase
      .from("work_orders")
      .select("id, shop_id")
      .eq("id", q.work_order_id)
      .maybeSingle();

    if (workOrderErr) {
      return NextResponse.json({ error: workOrderErr.message }, { status: 500 });
    }

    if (!workOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    if (workOrder.shop_id !== profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2) Turn it into a punchable job line
    const newLine: WorkOrderLineInsert = {
      shop_id: q.shop_id,
      work_order_id: q.work_order_id,
      vehicle_id: q.vehicle_id,
      description: q.description,
      job_type: q.job_type ?? "repair",
      status: "awaiting",
      labor_time: q.est_labor_hours ?? null,
      complaint: q.ai_complaint ?? q.description,
      cause: q.ai_cause ?? null,
      correction: q.ai_correction ?? null,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("work_order_lines")
      .insert(newLine)
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // 3) Mark quote line as converted and point to created work order line
    const { error: updErr } = await supabase
      .from("work_order_quote_lines")
      .update({
        status: "converted",
        work_order_line_id: inserted?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updErr) {
      console.error("Failed to update quote line after authorize insert", {
        quoteLineId: id,
        insertedWorkOrderLineId: inserted?.id ?? null,
        error: updErr.message,
      });
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, workOrderLineId: inserted?.id ?? null });
  } catch {
    return NextResponse.json({ error: "Failed to authorize" }, { status: 500 });
  }
}
