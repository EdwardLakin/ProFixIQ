// app/api/portal/approvals/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export async function GET() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  if (!auth?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Find the customer mapped to this portal user
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, shop_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 400 });
  if (!customer?.id) {
    return NextResponse.json({ error: "No customer record linked to this account." }, { status: 404 });
  }

  // Pull pending lines (via WO.customer_id)
  const { data: rows, error } = await supabase
    .from("work_order_lines")
    .select(`
      id,
      description,
      complaint,
      approval_state,
      status,
      hold_reason,
      work_order_id,
      work_orders!inner (
        id,
        custom_id,
        created_at,
        customer_id
      ),
      part_request_items (
        id,
        request_id,
        description,
        qty,
        quoted_price,
        vendor,
        approved,
        markup_pct,
        work_order_line_id
      )
    `)
    .eq("work_orders.customer_id", customer.id)
    .eq("approval_state", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Optional: fetch headers for the requests referenced by the items
  const requestIds = Array.from(
    new Set((rows ?? []).flatMap((ln: any) => (ln.part_request_items ?? []).map((x: any) => x.request_id)).filter(Boolean))
  );

  let headers: any[] = [];
  if (requestIds.length) {
    const h = await supabase
      .from("part_requests")
      .select("id, status, notes, created_at")
      .in("id", requestIds);

    headers = h.data ?? [];
  }

  return NextResponse.json({ lines: rows ?? [], partRequestHeaders: headers });
}