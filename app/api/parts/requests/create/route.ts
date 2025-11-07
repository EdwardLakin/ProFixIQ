// app/api/parts/requests/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

// make sure these env vars exist in Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

type BodyItem = {
  description: string;
  qty: number;
};

type Body = {
  workOrderId: string;
  jobId?: string | null;
  items: BodyItem[];
  notes?: string | null;
};

export async function POST(req: Request) {
  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body ||
    typeof body.workOrderId !== "string" ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json(
      { error: "Invalid body. Expect { workOrderId, items[] }." },
      { status: 400 }
    );
  }

  const { workOrderId, jobId, items, notes } = body;

  // 1) get WO to grab shop_id
  const { data: wo, error: woErr } = await admin
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", workOrderId)
    .maybeSingle();

  if (woErr) {
    return NextResponse.json({ error: woErr.message }, { status: 400 });
  }
  if (!wo?.id || !wo.shop_id) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  // 2) we still want to know who requested it, so try to read the real user
  // but if cookie auth fails, we can fall back to 'system'
  let requestedBy: string | null = null;
  try {
    // if you want, you can also forward the user id from the client in the body
    // but we can leave it null here and RLS won't matter because we're service-role
    requestedBy = null;
  } catch {
    requestedBy = null;
  }

  // 3) insert header (service role skips RLS)
  const { data: pr, error: prErr } = await admin
    .from("part_requests")
    .insert({
      work_order_id: workOrderId,
      shop_id: wo.shop_id,
      requested_by: requestedBy,
      status: "requested",
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (prErr || !pr?.id) {
    return NextResponse.json(
      { error: prErr?.message ?? "Failed to create part request" },
      { status: 500 }
    );
  }

  // 4) insert items
  const itemRows = items.map((it) => ({
    request_id: pr.id,
    description: it.description.trim(),
    qty: Number(it.qty),
    approved: false,
    part_id: null,
    quoted_price: null,
    vendor: null,
  }));

  const { error: itemsErr } = await admin
    .from("part_request_items")
    .insert(itemRows);

  if (itemsErr) {
    // best effort cleanup
    await admin.from("part_requests").delete().eq("id", pr.id);
    return NextResponse.json(
      { error: itemsErr.message ?? "Failed to insert items" },
      { status: 500 }
    );
  }

  // 5) optionally put the line on hold
  if (jobId) {
    await admin
      .from("work_order_lines")
      .update({
        status: "on_hold",
        approval_state: "pending",
      })
      .eq("id", jobId);
  }

  return NextResponse.json({ requestId: pr.id });
}