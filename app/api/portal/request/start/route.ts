// app/api/portal/request/start/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type Body = {
  vehicleId?: string | null;
  visitType: "waiter" | "drop_off";
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

    const visitType = body?.visitType;
    if (visitType !== "waiter" && visitType !== "drop_off") {
      return bad("visitType must be 'waiter' or 'drop_off'");
    }

    // Portal customer by auth user
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, shop_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (custErr) return bad(custErr.message, 500);
    if (!customer?.id) return bad("Customer profile not found", 404);
    if (!customer.shop_id) return bad("Customer is not linked to a shop", 400);

    const insertWo: DB["public"]["Tables"]["work_orders"]["Insert"] = {
      shop_id: customer.shop_id,
      customer_id: customer.id,
      vehicle_id: body.vehicleId ?? null,
      status: "awaiting_approval",
      approval_state: "pending",
      is_waiter: visitType === "waiter",
      notes: (body.notes ?? "").trim() || null,
    };

    const { data: created, error: insErr } = await supabase
      .from("work_orders")
      .insert(insertWo)
      .select(
        "id, shop_id, customer_id, vehicle_id, status, approval_state, is_waiter, created_at",
      )
      .single();

    if (insErr || !created) return bad("Failed to create work order", 500);

    return NextResponse.json({ workOrder: created }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("portal request start error:", msg);
    return bad("Unexpected error", 500);
  }
}
