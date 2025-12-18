// app/api/portal/request/add-custom-line/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  workOrderId: string;
  description: string; // customer complaint / request
  notes?: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return bad("Not authenticated", 401);

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return bad("Invalid JSON body");
    }

    const workOrderId = (body?.workOrderId ?? "").trim();
    const description = (body?.description ?? "").trim();
    const notes = (body?.notes ?? "").trim();

    if (!workOrderId || !description) return bad("Missing workOrderId or description");

    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);

    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, customer_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) return bad("Failed to load work order", 500);
    if (!wo) return bad("Work order not found", 404);
    if (wo.customer_id !== customer.id) return bad("Not allowed", 403);

    const insertLine: DB["public"]["Tables"]["work_order_lines"]["Insert"] = {
      work_order_id: wo.id,
      shop_id: wo.shop_id,
      vehicle_id: wo.vehicle_id ?? null,
      complaint: description,
      notes: notes || null,
      status: "awaiting_approval",
      approval_state: "pending",
      // labor_time intentionally null — customer can't set it
      labor_time: null,
      price_estimate: null,
    };

    const { data: created, error: insErr } = await supabase
      .from("work_order_lines")
      .insert(insertLine)
      .select("*")
      .single();

    if (insErr || !created) return bad("Failed to add custom line", 500);

    return NextResponse.json({ line: created }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("add-custom-line error:", msg);
    return bad("Unexpected error", 500);
  }
}
