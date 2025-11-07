// app/api/parts/requests/create/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PRInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PRIInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];
type WORow = DB["public"]["Tables"]["work_orders"]["Row"];
type WOLUpdate = DB["public"]["Tables"]["work_order_lines"]["Update"];

const DEFAULT_MARKUP = 30; // %

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

// extend the generated insert type with the columns you just added in Supabase
type PartRequestItemInsertWithExtras = PRIInsert & {
  markup_pct: number;
  work_order_line_id: string | null;
};

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) parse + validate
  const body = (await req.json().catch(() => null)) as Body | null;
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

  // 3) load WO for shop_id
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

  // 4) insert header
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
      { status: 500 },
    );
  }

  // 5) insert item rows — now with markup_pct + work_order_line_id
  const itemRows: PartRequestItemInsertWithExtras[] = items.map((it) => ({
    request_id: pr.id,
    description: it.description.trim(),
    qty: Number(it.qty),
    approved: false,
    part_id: null,
    quoted_price: null,
    vendor: null,
    markup_pct: DEFAULT_MARKUP,
    work_order_line_id: jobId ?? null,
  }));

  const { error: itemsErr } = await supabase
    .from("part_request_items")
    .insert(itemRows);

  if (itemsErr) {
    // best-effort rollback if items fail
    await supabase.from("part_requests").delete().eq("id", pr.id);
    return NextResponse.json(
      { error: itemsErr.message ?? "Failed to insert request items" },
      { status: 500 },
    );
  }

  // 6) optionally put the line on hold / approval pending
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