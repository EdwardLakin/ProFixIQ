import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/features/shared/types/types/supabase";

type DB = Database;
type AdminSupabase = SupabaseClient<DB>;

type WorkOrderHistorySource = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  | "id"
  | "shop_id"
  | "customer_id"
  | "vehicle_id"
  | "custom_id"
  | "created_at"
  | "updated_at"
  | "status"
  | "notes"
  | "invoice_total"
  | "labor_total"
>;

type WorkOrderLineHistorySource = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  | "id"
  | "description"
  | "complaint"
  | "cause"
  | "correction"
  | "status"
  | "line_type"
  | "labor_time"
  | "price_estimate"
>;

type HistoryInsert = DB["public"]["Tables"]["history"]["Insert"];

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function stableUuidFromParts(parts: Array<string | number | null | undefined>): string {
  const seed = parts.map((part) => String(part ?? "")).join("|");
  const hex = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function lineSummary(line: WorkOrderLineHistorySource): string | null {
  const main = compact([
    cleanText(line.description),
    cleanText(line.complaint),
    cleanText(line.cause),
    cleanText(line.correction),
  ]).join(" / ");

  if (!main) return null;

  const meta = compact([
    cleanText(line.line_type) ? `type=${line.line_type}` : null,
    cleanText(line.status) ? `status=${line.status}` : null,
    line.labor_time != null ? `labor=${line.labor_time}` : null,
    line.price_estimate != null ? `price=${line.price_estimate}` : null,
  ]).join(", ");

  return meta ? `${main} (${meta})` : main;
}

export async function syncWorkOrderToHistory(
  supabase: AdminSupabase,
  workOrderId: string,
): Promise<{ ok: true; historyId: string | null; skippedReason?: string }> {
  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .select(
      "id, shop_id, customer_id, vehicle_id, custom_id, created_at, updated_at, status, notes, invoice_total, labor_total",
    )
    .eq("id", workOrderId)
    .maybeSingle<WorkOrderHistorySource>();

  if (woError) throw new Error(woError.message);
  if (!wo?.id) return { ok: true, historyId: null, skippedReason: "work_order_not_found" };
  if (!wo.customer_id) return { ok: true, historyId: null, skippedReason: "missing_customer_id" };

  const { data: lines, error: linesError } = await supabase
    .from("work_order_lines")
    .select("id, description, complaint, cause, correction, status, line_type, labor_time, price_estimate")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: true })
    .returns<WorkOrderLineHistorySource[]>();

  if (linesError) throw new Error(linesError.message);

  const lineDescriptions = (lines ?? [])
    .map(lineSummary)
    .filter((value): value is string => Boolean(value));

  const description =
    lineDescriptions.slice(0, 8).join("\n") ||
    cleanText(wo.notes) ||
    `Completed work order${wo.custom_id ? ` ${wo.custom_id}` : ""}`;

  const notes = compact([
    wo.custom_id ? `Work order: ${wo.custom_id}` : `Work order ID: ${wo.id}`,
    wo.status ? `Status: ${wo.status}` : null,
    wo.invoice_total != null ? `Invoice total: ${wo.invoice_total}` : null,
    wo.labor_total != null ? `Labor total: ${wo.labor_total}` : null,
    cleanText(wo.notes) ? `Notes: ${wo.notes}` : null,
    `Live work order ID: ${wo.id}`,
  ]).join("\n");

  const historyId = stableUuidFromParts([
    wo.shop_id ?? "unknown-shop",
    "live-work-order-history",
    wo.id,
  ]);

  const payload: HistoryInsert = {
    id: historyId,
    customer_id: wo.customer_id,
    vehicle_id: wo.vehicle_id ?? null,
    work_order_id: wo.id,
    service_date: wo.updated_at ?? wo.created_at ?? new Date().toISOString(),
    description,
    notes,
  };

  const { error: upsertError } = await supabase
    .from("history")
    .upsert(payload, { onConflict: "id" });

  if (upsertError) throw new Error(upsertError.message);

  return { ok: true, historyId };
}
