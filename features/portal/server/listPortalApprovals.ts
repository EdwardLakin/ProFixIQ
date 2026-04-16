import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import type { PortalCustomer } from "@/features/portal/server/portalAuth";

type DB = Database;

type PartRequestHeaderPick = Pick<
  DB["public"]["Tables"]["part_requests"]["Row"],
  "id" | "status" | "created_at"
>;

type PortalApprovalItem = {
  id: string;
  request_id: string | null;
  description: string | null;
  qty: number | null;
  quoted_price: number | null;
  vendor: string | null;
  approved: boolean | null;
  work_order_line_id: string | null;
};

export type PortalApprovalLine = {
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
  };
  part_request_items: PortalApprovalItem[];
};

export type PortalApprovalsPayload = {
  lines: PortalApprovalLine[];
  partRequestHeaders: PartRequestHeaderPick[];
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
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function pickWorkOrder(v: unknown): PortalApprovalLine["work_orders"] | null {
  const wo = Array.isArray(v) ? v[0] : v;
  if (!isRecord(wo)) return null;

  const id = asString(wo.id);
  if (!id) return null;

  return {
    id,
    custom_id: asString(wo.custom_id),
    created_at: asString(wo.created_at),
  };
}

function pickItems(v: unknown): PortalApprovalItem[] {
  const arr = asArray(v);
  const out: PortalApprovalItem[] = [];

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
      work_order_line_id: asString(it.work_order_line_id),
    });
  }

  return out;
}

function normalizeLines(rowsUnknown: unknown): PortalApprovalLine[] {
  const rows = asArray(rowsUnknown);
  const out: PortalApprovalLine[] = [];

  for (const r of rows) {
    if (!isRecord(r)) continue;

    const id = asString(r.id);
    const workOrderId = asString(r.work_order_id);
    if (!id || !workOrderId) continue;

    const workOrders = pickWorkOrder(r.work_orders);
    if (!workOrders?.id) continue;

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

export async function listPortalApprovalsForCustomer({
  supabase,
  customer,
}: {
  supabase: SupabaseClient<DB>;
  customer: Pick<PortalCustomer, "id">;
}): Promise<{ ok: true; data: PortalApprovalsPayload } | { ok: false; error: string; status: number }> {
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
        created_at
      ),
      part_request_items (
        id,
        request_id,
        description,
        qty,
        quoted_price,
        vendor,
        approved,
        work_order_line_id
      )
    `,
    )
    .eq("work_orders.customer_id", customer.id)
    .eq("approval_state", "pending")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message, status: 400 };

  const lines = normalizeLines(rows as unknown);
  const requestIds = uniqStrings(lines.flatMap((ln) => ln.part_request_items.map((it) => it.request_id)));

  let partRequestHeaders: PartRequestHeaderPick[] = [];
  if (requestIds.length) {
    const h = await supabase.from("part_requests").select("id, status, created_at").in("id", requestIds);

    if (h.error) return { ok: false, error: h.error.message, status: 400 };
    partRequestHeaders = Array.isArray(h.data) ? (h.data as PartRequestHeaderPick[]) : [];
  }

  return {
    ok: true,
    data: {
      lines,
      partRequestHeaders,
    },
  };
}
