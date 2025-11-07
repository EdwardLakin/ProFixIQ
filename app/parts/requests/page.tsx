import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PRInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PRIInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];
type WORow = DB["public"]["Tables"]["work_orders"]["Row"];
type WOLUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

type BodyItem = {
  description: string;
  qty: number;
  notes?: string | null; // will go to header only, since item table doesn’t have it
};

type Body = {
  workOrderId: string;
  jobId?: string | null; // so we can put the line on hold
  items: BodyItem[];
  notes?: string | null;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse
  const parsed = (await req.json().catch(() => null)) as Body | null;
  if (!parsed) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { workOrderId, jobId, items, notes } = parsed;
  if (!workOrderId) {
    return NextResponse.json({ error: "workOrderId is required" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  // 2) auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 3) load WO to get shop_id
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", workOrderId)
    .maybeSingle<WORow>();

  if (woErr) {
    return NextResponse.json({ error: woErr.message }, { status: 400 });
  }
  if (!wo?.id || !wo.shop_id) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // 4) insert part_requests header
  const header: PRInsert = {
    work_order_id: workOrderId,
    shop_id: wo.shop_id,
    requested_by: user.id,
    status: "requested",
    notes: notes ?? null,
  };

  const { data: pr, error: prErr } = await supabase
    .from("part_requests")
    .insert(header)
    .select("id")
    .single();

  if (prErr || !pr?.id) {
    return NextResponse.json(
      { error: prErr?.message ?? "Failed to create part request" },
      { status: 500 }
    );
  }

  // 5) insert part_request_items
  const itemRows: PRIInsert[] = items.map((it) => ({
    request_id: pr.id,
    description: it.description.trim(),
    qty: Number(it.qty),          // table is numeric, so number is fine
    approved: false,              // REQUIRED: table says NOT NULL
    part_id: null,                // we don’t have a specific part yet
    quoted_price: null,
    vendor: null,
  }));

  const { error: itemsErr } = await supabase
    .from("part_request_items")
    .insert(itemRows);

  if (itemsErr) {
    // cleanup header if items fail
    await supabase.from("part_requests").delete().eq("id", pr.id);
    return NextResponse.json(
      { error: itemsErr.message ?? "Failed to insert items" },
      { status: 500 }
    );
  }

  // 6) optional: put that line on hold so tech sees it
  if (jobId) {
    const updatePayload: WOLUpdate = {
      status: "on_hold",
      approval_state: "pending",
    };
    await supabase
      .from("work_order_lines")
      .update(updatePayload)
      .eq("id", jobId);
  }

  return NextResponse.json({ requestId: pr.id });

}