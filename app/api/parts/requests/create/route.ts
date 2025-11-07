// app/api/parts/requests/create/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// admin client (bypasses RLS)
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
  // this client sees the user from cookies
  const userClient = createRouteHandlerClient<Database>({ cookies });

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
      { status: 400 },
    );
  }

  const { workOrderId, jobId, items, notes } = body;

  // real user (for requested_by)
  const {
    data: { user },
  } = await userClient.auth.getUser();

  // load WO with admin
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

  // insert header with admin
  const { data: pr, error: prErr } = await admin
    .from("part_requests")
    .insert({
      work_order_id: workOrderId,
      shop_id: wo.shop_id,
      requested_by: user?.id ?? null,
      status: "requested",
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (prErr || !pr?.id) {
    return NextResponse.json(
      { error: prErr?.message ?? "Failed to create part request" },
      { status: 500 },
    );
  }

  // insert items with admin
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
    await admin.from("part_requests").delete().eq("id", pr.id);
    return NextResponse.json(
      { error: itemsErr.message ?? "Failed to insert items" },
      { status: 500 },
    );
  }

  // optionally put the line on hold
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