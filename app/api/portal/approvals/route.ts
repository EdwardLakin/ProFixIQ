// app/api/portal/approvals/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type CustomerPick = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "shop_id">;

type PartRequestHeaderPick = Pick<
  DB["public"]["Tables"]["part_requests"]["Row"],
  "id" | "status" | "notes" | "created_at"
>;

type ApprovalLine = {
  id: string;
  description: string | null;
  complaint: string | null;
  approval_state: string | null;
  status: string | null;
  hold_reason: string | null;
  work_order_id: string;
  created_at: string | null;
  work_orders: {
    id: string;
    custom_id: string | null;
    created_at: string | null;
    customer_id: string | null;
  };
  part_request_items: Array<{
    id: string;
    request_id: string | null;
    description: string | null;
    qty: number | null;
    quoted_price: number | null;
    vendor: string | null;
    approved: boolean | null;
    markup_pct: number | null;
    work_order_line_id: string | null;
  }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function uniqStrings(values: Array<string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pickWorkOrder(v: unknown): ApprovalLine["work_orders"] {
  // Supabase relation might come back as object OR array. We accept both.
  const wo = Array.isArray(v) ? v[0] : v;
  if (!isRecord(wo)) {
    return { id: "", custom_id: null, created_at: null, customer_id: null };
  }
  return {
    id: asString(wo.id) ?? "",
    custom_id: asString(wo.custom_id),
    created_at: asString(wo.created_at),
    customer_id: asString(wo.customer_id),
  };
}

function pickItems(v: unknown): ApprovalLine["part_request_items"] {
  const arr = asArray(v);
  const out: ApprovalLine["part_request_items"] = [];

  for (const it of arr) {
    if (!isRecord(it)) continue;

    const id = asString(it.id);
    if (!id) continue;

    out.push({
      id,
      request_id: asString(it.request_id),
      description: asString(it.description),
      qty: asNumber(it.qty),
      quoted_price: asNumber(it.quoted_price),
      vendor: asString(it.vendor),
      approved: asBoolean(it.approved),
      markup_pct: asNumber(it.markup_pct),
      work_order_line_id: asString(it.work_order_line_id),
    });
  }

  return out;
}

function normalizeLines(rowsUnknown: unknown): ApprovalLine[] {
  const rows = asArray(rowsUnknown);
  const out: ApprovalLine[] = [];

  for (const r of rows) {
    if (!isRecord(r)) continue;

    const id = asString(r.id);
    const workOrderId = asString(r.work_order_id);
    if (!id || !workOrderId) continue;

    const workOrders = pickWorkOrder(r.work_orders);
    if (!workOrders.id) continue; // inner join should guarantee this, but keep it safe

    out.push({
      id,
      description: asString(r.description),
      complaint: asString(r.complaint),
      approval_state: asString(r.approval_state),
      status: asString(r.status),
      hold_reason: asString(r.hold_reason),
      work_order_id: workOrderId,
      created_at: asString(r.created_at),
      work_orders: workOrders,
      part_request_items: pickItems(r.part_request_items),
    });
  }

  return out;
}

export async function GET() {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, shop_id")
    .eq("user_id", user.id)
    .maybeSingle<CustomerPick>();

  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 400 });
  if (!customer?.id) {
    return NextResponse.json(
      { error: "No customer record linked to this account." },
      { status: 404 },
    );
  }

  const { data: rows, error } = await supabase
    .from("work_order_lines")
    .select(
      `
      id,
      description,
      complaint,
      approval_state,
      status,
      hold_reason,
      work_order_id,
      created_at,
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
    `,
    )
    .eq("work_orders.customer_id", customer.id)
    .eq("approval_state", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Critical: treat as unknown, then normalize (no type predicates / no any)
  const lines = normalizeLines(rows as unknown);

  const requestIds = uniqStrings(
    lines.flatMap((ln) => ln.part_request_items.map((it) => it.request_id)),
  );

  let partRequestHeaders: PartRequestHeaderPick[] = [];
  if (requestIds.length) {
    const h = await supabase
      .from("part_requests")
      .select("id, status, notes, created_at")
      .in("id", requestIds);

    partRequestHeaders = Array.isArray(h.data) ? (h.data as PartRequestHeaderPick[]) : [];
  }

  return NextResponse.json({ lines, partRequestHeaders });
}