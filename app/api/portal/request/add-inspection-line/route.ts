// app/api/portal/request/add-inspection-line/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

type Body = {
  workOrderId: string;
  templateId: string;
};

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

    const workOrderId = (body.workOrderId ?? "").trim();
    const templateId = (body.templateId ?? "").trim();

    if (!workOrderId || !templateId) {
      return bad("Missing workOrderId or templateId");
    }

    // Resolve portal customer (customer owns this auth user)
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);

    // Load WO + ensure customer owns it
    const { data: wo, error: woErr } = await supabase
      .from("work_orders")
      .select("id, shop_id, customer_id, vehicle_id")
      .eq("id", workOrderId)
      .maybeSingle();

    if (woErr) return bad("Failed to load work order", 500);
    if (!wo) return bad("Work order not found", 404);
    if (wo.customer_id !== customer.id) return bad("Not allowed", 403);

    // Load template + ensure same shop + active
    const { data: tpl, error: tErr } = await supabase
      .from("inspection_templates")
      .select("id, shop_id, name, title, description, is_active")
      .eq("id", templateId)
      .maybeSingle();

    if (tErr) return bad("Failed to load inspection template", 500);
    if (!tpl) return bad("Inspection template not found", 404);
    if (tpl.shop_id !== wo.shop_id) return bad("Not allowed", 403);
    if (tpl.is_active === false) return bad("Inspection template is inactive", 409);

    const title = String(tpl.name ?? tpl.title ?? tpl.description ?? "Inspection");

    // Create inspection line (uses only real columns)
    const insert: DB["public"]["Tables"]["work_order_lines"]["Insert"] = {
      work_order_id: wo.id,
      shop_id: wo.shop_id,
      vehicle_id: wo.vehicle_id ?? null,

      job_type: "inspection",
      description: title,

      // launch-safe defaults
      status: "awaiting",
      line_status: "pending",

      // real column in your schema list
      inspection_template_id: tpl.id,
    };

    const { data: line, error: insErr } = await supabase
      .from("work_order_lines")
      .insert(insert)
      .select("*")
      .single();

    if (insErr || !line) {
      return bad(insErr?.message ?? "Failed to add inspection line", 500);
    }

    return NextResponse.json({ ok: true, line }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("add-inspection-line error:", msg);
    return bad("Unexpected error", 500);
  }
}