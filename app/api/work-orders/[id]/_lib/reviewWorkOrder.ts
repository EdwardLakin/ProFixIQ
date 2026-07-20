import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { recordWorkOrderTraining } from "@/features/integrations/ai";
import { seedWorkOrderIntelligenceFromReview } from "@/features/ai/server/workOrderIntelligence";
import { isReviewableQuoteLine } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";

type DB = Database;
type PartsRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string; details?: string | null; hint?: string | null } | null;
  }>;
};

export type ReviewIssue = { kind: string; lineId?: string; message: string };
export type ReviewKind = "ai_review" | "invoice_review";

type Args = {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
  kind: ReviewKind;
};

const BILLABLE_PART_REQUEST_ITEM_STATUSES = new Set([
  "quoted",
  "approved",
  "reserved",
  "picking",
  "picked",
  "ordered",
  "partially_received",
  "received",
  "fulfilled",
  "consumed",
]);

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function hasMeaningfulJson(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function isInfoLine(line: Record<string, unknown>): boolean {
  const lineType = String(line.line_type ?? "").trim().toLowerCase();
  const jobType = String(line.job_type ?? "").trim().toLowerCase();
  return lineType === "info" || lineType === "note" || jobType === "info";
}

function lineRequiresParts(line: Record<string, unknown>): boolean {
  if (line.no_parts_required === true || isInfoLine(line)) return false;
  const jobType = String(line.job_type ?? "").trim().toLowerCase();
  const lineType = String(line.line_type ?? "").trim().toLowerCase();
  if (
    jobType === "inspection" ||
    jobType === "diagnosis" ||
    lineType === "inspection" ||
    lineType === "diagnostic"
  ) {
    return (
      line.parts_required === true ||
      hasMeaningfulJson(line.parts_required) ||
      hasMeaningfulJson(line.parts_needed)
    );
  }
  if (line.parts_required === true) return true;
  if (hasMeaningfulJson(line.parts_required)) return true;
  if (hasMeaningfulJson(line.parts_needed)) return true;
  if (typeof line.parts === "string" && line.parts.trim()) return true;
  if (line.parts_verification_required === true) return true;

  const text = [
    line.description,
    line.complaint,
    line.cause,
    line.correction,
    line.notes,
    line.job_type,
    line.service_code,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  if (
    /\b(oil|filter|air filter|cabin filter|fuel filter|brake|pads?|rotors?|battery|tire|spark plug|belt|hose|coolant|transmission fluid|differential fluid|wiper)\b/.test(
      text,
    )
  ) {
    return true;
  }

  const status = String(line.status ?? "").trim().toLowerCase();
  return status === "pending_parts" || status === "awaiting_parts";
}

function partRequestItemHasBillablePrice(row: Record<string, unknown>): boolean {
  const price =
    numericValue(row.quoted_price) ??
    numericValue(row.unit_price) ??
    numericValue(row.unit_cost);
  return price != null && price > 0;
}

function partRequestItemQuantity(row: Record<string, unknown>): number {
  return (
    numericValue(row.qty) ??
    numericValue(row.qty_requested) ??
    numericValue(row.qty_approved) ??
    0
  );
}

export async function reviewWorkOrder({
  supabase,
  workOrderId,
  shopId,
  kind,
}: Args): Promise<{ ok: boolean; issues: ReviewIssue[] }> {
  const hasBillablePartsByLine = new Map<string, boolean>();
  const invoicePartIssues: ReviewIssue[] = [];

  const { data: allocationRows } = await supabase
    .from("work_order_part_allocations")
    .select("work_order_line_id, qty, unit_cost")
    .eq("work_order_id", workOrderId)
    .eq("shop_id", shopId);
  for (const row of allocationRows ?? []) {
    const lineId = typeof row.work_order_line_id === "string" ? row.work_order_line_id : "";
    const qty = numericValue(row.qty) ?? 0;
    const unitCost = numericValue(
      (row as Record<string, unknown>).unit_cost,
    );
    if (lineId && qty > 0 && (unitCost == null || unitCost > 0)) {
      hasBillablePartsByLine.set(lineId, true);
    }
  }

  const { data: stagedPartRows } = await supabase
    .from("work_order_parts")
    .select("work_order_line_id, quantity, unit_price, total_price")
    .eq("work_order_id", workOrderId)
    .eq("shop_id", shopId);
  for (const row of stagedPartRows ?? []) {
    const record = row as Record<string, unknown>;
    const lineId = typeof row.work_order_line_id === "string" ? row.work_order_line_id : "";
    const quantity = numericValue(record.quantity) ?? 0;
    const unitPrice = numericValue(record.unit_price);
    const totalPrice = numericValue(record.total_price);
    if (
      lineId &&
      quantity > 0 &&
      ((unitPrice != null && unitPrice > 0) ||
        (totalPrice != null && totalPrice > 0))
    ) {
      hasBillablePartsByLine.set(lineId, true);
    }
  }

  const { data: requestItemRows } = await supabase
    .from("part_request_items")
    .select(
      "work_order_line_id, quote_line_id, status, approved, qty, qty_requested, qty_approved, quoted_price, unit_price, unit_cost",
    )
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .not("work_order_line_id", "is", null);
  for (const row of requestItemRows ?? []) {
    const record = row as Record<string, unknown>;
    const lineId = typeof row.work_order_line_id === "string" ? row.work_order_line_id : "";
    const quoteLineId = typeof row.quote_line_id === "string" ? row.quote_line_id : "";
    const status = String(row.status ?? "").trim().toLowerCase();
    if (
      lineId &&
      quoteLineId &&
      (BILLABLE_PART_REQUEST_ITEM_STATUSES.has(status) || row.approved === true) &&
      partRequestItemQuantity(record) > 0 &&
      partRequestItemHasBillablePrice(record)
    ) {
      hasBillablePartsByLine.set(lineId, true);
    }
  }

  if (kind === "invoice_review") {
    const { data: netIssuedParts, error: netIssuedPartsError } = await (
      supabase as unknown as PartsRpcClient
    ).rpc(
      "get_invoice_net_issued_parts",
      {
        p_shop_id: shopId,
        p_work_order_id: workOrderId,
      },
    );
    if (netIssuedPartsError) throw netIssuedPartsError;

    hasBillablePartsByLine.clear();
    for (const raw of Array.isArray(netIssuedParts) ? netIssuedParts : []) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const part = raw as Record<string, unknown>;
      const lineId = typeof part.lineId === "string" ? part.lineId : "";
      const quantity = numericValue(part.qty) ?? 0;
      const unitPrice = numericValue(part.unitPrice) ?? 0;
      if (!lineId || quantity <= 0) continue;
      if (unitPrice > 0) {
        hasBillablePartsByLine.set(lineId, true);
      } else {
        invoicePartIssues.push({
          kind: "missing_part_sell_price",
          lineId,
          message: `Issued part has no customer sell price: ${String(part.name ?? "Part")}`,
        });
      }
    }
  }

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", workOrderId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (workOrderError) throw workOrderError;
  if (!workOrder) {
    return {
      ok: false,
      issues: [{ kind: "missing_wo", message: "WO not found" }],
    };
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("labor_rate")
    .eq("id", shopId)
    .maybeSingle<{ labor_rate: number | null }>();
  const shopLaborRate = numericValue(shop?.labor_rate);

  const { data: lines, error: lineError } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("work_order_id", workOrder.id)
    .eq("shop_id", shopId);
  if (lineError) throw lineError;

  const issues: ReviewIssue[] = [...invoicePartIssues];
  const { data: quoteLines, error: quoteError } = await supabase
    .from("work_order_quote_lines")
    .select("id,status,stage,approved_at,declined_at,work_order_line_id")
    .eq("work_order_id", workOrder.id)
    .eq("shop_id", shopId);
  if (quoteError) throw quoteError;

  const pendingQuoteCount = (quoteLines ?? []).filter((line) =>
    isReviewableQuoteLine(line),
  ).length;
  if (pendingQuoteCount > 0) {
    issues.push({
      kind: "pending_quote_lines",
      message: `${pendingQuoteCount} pending quote line(s) must be resolved before invoicing.`,
    });
  }

  if (!lines || lines.length === 0) {
    issues.push({ kind: "no_lines", message: "Work order has no lines" });
  }

  const actionableLines = (lines ?? []).filter(
    (line) => !isInfoLine(line as Record<string, unknown>),
  );
  if ((lines?.length ?? 0) > 0 && actionableLines.length === 0) {
    issues.push({
      kind: "no_billable_lines",
      message: "Work order has no billable or actionable lines.",
    });
  }

  for (const line of actionableLines) {
    const record = line as Record<string, unknown>;
    const status = String(line.status ?? "awaiting").toLowerCase();
    const completedLike =
      status === "completed" ||
      status === "ready_to_invoice" ||
      status === "invoiced";
    if (!completedLike) {
      issues.push({
        kind: "line_not_completed",
        lineId: line.id,
        message: `Line not completed: ${line.description ?? line.complaint ?? "job"}`,
      });
    }

    const causeNA = record.cause_marked_na === true;
    const correctionNA = record.correction_marked_na === true;
    if (!line.cause && !causeNA) {
      issues.push({
        kind: "missing_cause",
        lineId: line.id,
        message: `Missing cause: ${line.description ?? "job"}`,
      });
    }
    if (!line.correction && !correctionNA) {
      issues.push({
        kind: "missing_correction",
        lineId: line.id,
        message: `Missing correction: ${line.description ?? "job"}`,
      });
    }

    const noCharge = record.no_charge === true;
    const laborNA = record.labor_marked_na === true;
    const hasBillableParts = hasBillablePartsByLine.get(String(line.id)) === true;
    if (lineRequiresParts(record) && !hasBillableParts) {
      issues.push({
        kind: "missing_required_parts",
        lineId: line.id,
        message: `Required parts are missing from line: ${line.description ?? line.complaint ?? "job"}`,
      });
    }

    const laborHours = numericValue(line.labor_time) ?? 0;
    const lineLaborRate = numericValue(record.labor_rate);
    const effectiveLaborRate =
      lineLaborRate && lineLaborRate > 0 ? lineLaborRate : shopLaborRate ?? 0;
    const explicitLaborTotal = numericValue(record.labor_total);
    const priceEstimate = numericValue(record.price_estimate);
    const laborTotal =
      explicitLaborTotal != null && explicitLaborTotal > 0
        ? explicitLaborTotal
        : priceEstimate != null && priceEstimate > 0
          ? priceEstimate
          : laborHours * effectiveLaborRate;

    if (
      !noCharge &&
      !laborNA &&
      laborHours > 0 &&
      !(laborTotal > 0) &&
      !hasBillableParts
    ) {
      issues.push({
        kind: "invalid_labor_total",
        lineId: line.id,
        message: `Labor pricing is missing or invalid for line: ${line.description ?? line.complaint ?? "job"}`,
      });
    } else if (
      !noCharge &&
      !laborNA &&
      laborHours >= 1 &&
      laborTotal > 0 &&
      laborTotal <= laborHours + 0.01 &&
      effectiveLaborRate <= 1
    ) {
      issues.push({
        kind: "suspicious_labor_total",
        lineId: line.id,
        message: `Labor total looks like hours were used as dollars for line: ${line.description ?? line.complaint ?? "job"}`,
      });
    }

    const laborRequired = !noCharge && !laborNA && !hasBillableParts;
    if (laborRequired && !(laborHours > 0)) {
      issues.push({
        kind: "no_labor_time",
        lineId: line.id,
        message: `No labor time set: ${line.description ?? "job"}`,
      });
    }
  }

  if (!workOrder.customer_id) {
    issues.push({ kind: "missing_customer", message: "Missing customer on WO" });
  } else {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("email")
      .eq("id", workOrder.customer_id)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (customerError) throw customerError;
    if (!customer?.email) {
      issues.push({ kind: "missing_email", message: "Customer has no email" });
    }
  }

  const ok = issues.length === 0;
  if (ok) {
    try {
      let vehicle = null;
      if (workOrder.vehicle_id) {
        const { data: vehicleRow } = await supabase
          .from("vehicles")
          .select("id, year, make, model")
          .eq("id", workOrder.vehicle_id)
          .eq("shop_id", shopId)
          .maybeSingle();
        vehicle = vehicleRow ?? null;
      }
      await seedWorkOrderIntelligenceFromReview({
        supabase,
        workOrder,
        lines,
        vehicle,
        source: kind,
      });
    } catch (error) {
      console.warn("[reviewWorkOrder] intelligence seed failed:", error);
    }
  }

  if (workOrder.shop_id) {
    try {
      await recordWorkOrderTraining({
        shopId: workOrder.shop_id,
        workOrderId: workOrder.id,
        vehicleYmm: null,
        payload: { kind, ok, issue_count: issues.length, issues },
      });
    } catch (error) {
      console.warn(`AI training (${kind}) failed:`, error);
    }
  }

  return { ok, issues };
}
