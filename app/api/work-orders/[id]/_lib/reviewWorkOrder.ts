import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { recordWorkOrderTraining } from "@/features/integrations/ai";
import { seedWorkOrderIntelligenceFromReview } from "@/features/ai/server/workOrderIntelligence";
import { isReviewableQuoteLine } from "@/features/work-orders/lib/quotes/reviewableQuoteLines";

type DB = Database;

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
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}


function hasMeaningfulJson(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function lineRequiresParts(line: Record<string, unknown>): boolean {
  if (line.no_parts_required === true) return false;
  const jobType = String(line.job_type ?? "").trim().toLowerCase();
  const lineType = String(line.line_type ?? "").trim().toLowerCase();
  if (jobType === "inspection" || jobType === "diagnosis" || lineType === "inspection" || lineType === "diagnostic") {
    return line.parts_required === true || hasMeaningfulJson(line.parts_required) || hasMeaningfulJson(line.parts_needed);
  }
  if (line.parts_required === true) return true;
  if (hasMeaningfulJson(line.parts_required)) return true;
  if (hasMeaningfulJson(line.parts_needed)) return true;
  if (typeof line.parts === "string" && line.parts.trim().length > 0) return true;
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
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  const serviceNeedsParts =
    /\b(oil|filter|air filter|cabin filter|fuel filter|brake|pads?|rotors?|battery|tire|spark plug|belt|hose|coolant|transmission fluid|differential fluid|wiper)\b/.test(
      text,
    );

  if (serviceNeedsParts) return true;

  const status = String(line.status ?? "").trim().toLowerCase();
  return status === "pending_parts" || status === "awaiting_parts";
}

function partRequestItemHasBillablePrice(row: Record<string, unknown>): boolean {
  const quotedPrice = numericValue(row.quoted_price);
  const unitPrice = numericValue(row.unit_price);
  const unitCost = numericValue(row.unit_cost);
  const price = quotedPrice ?? unitPrice ?? unitCost;
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
  const { data: allocRows } = await supabase
    .from("work_order_part_allocations")
    .select("work_order_line_id, qty, unit_cost")
    .eq("work_order_id", workOrderId)
    .eq("shop_id", shopId);
  const hasBillablePartsByLine = new Map<string, boolean>();
  for (const row of allocRows ?? []) {
    const lineId = typeof row.work_order_line_id === "string" ? row.work_order_line_id : "";
    const qty = Number(row.qty ?? 0);
    const unitCostRaw = (row as Record<string, unknown>).unit_cost;
    const unitCost =
      typeof unitCostRaw === "number"
        ? unitCostRaw
        : typeof unitCostRaw === "string"
          ? Number(unitCostRaw)
          : null;
    // Fallback behavior: if unit_cost is unavailable/non-numeric in this row,
    // preserve existing qty-only billable detection to avoid false negatives.
    const billableByQtyAndUnitCost =
      qty > 0 && unitCost !== null && Number.isFinite(unitCost) && unitCost > 0;
    const billableByQtyFallback = qty > 0 && unitCost === null;
    if (lineId && (billableByQtyAndUnitCost || billableByQtyFallback)) {
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
    const qty = numericValue(record.quantity) ?? 0;
    const unitPrice = numericValue(record.unit_price);
    const totalPrice = numericValue(record.total_price);
    if (lineId && qty > 0 && ((unitPrice != null && unitPrice > 0) || (totalPrice != null && totalPrice > 0))) {
      hasBillablePartsByLine.set(lineId, true);
    }
  }

  const { data: linkedPartRequestRows } = await supabase
    .from("part_request_items")
    .select("work_order_line_id, quote_line_id, status, approved, qty, qty_requested, qty_approved, quoted_price, unit_price, unit_cost")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .not("work_order_line_id", "is", null);

  for (const row of linkedPartRequestRows ?? []) {
    const record = row as Record<string, unknown>;
    const lineId = typeof row.work_order_line_id === "string" ? row.work_order_line_id : "";
    const quoteLineId = typeof row.quote_line_id === "string" ? row.quote_line_id : "";
    const status = String(row.status ?? "").trim().toLowerCase();
    const statusIsBillable = BILLABLE_PART_REQUEST_ITEM_STATUSES.has(status);
    const approved = row.approved === true;

    if (
      lineId &&
      quoteLineId &&
      (statusIsBillable || approved) &&
      partRequestItemQuantity(record) > 0 &&
      partRequestItemHasBillablePrice(record)
    ) {
      hasBillablePartsByLine.set(lineId, true);
    }
  }
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", workOrderId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (woErr) throw woErr;

  if (!wo) {
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

  const { data: lines, error: lnErr } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("work_order_id", wo.id)
    .eq("shop_id", shopId);

  if (lnErr) throw lnErr;

  const issues: ReviewIssue[] = [];

  const { data: quoteLines, error: quoteErr } = await supabase
    .from("work_order_quote_lines")
    .select("id,status,stage,approved_at,declined_at,work_order_line_id")
    .eq("work_order_id", wo.id)
    .eq("shop_id", shopId);
  if (quoteErr) throw quoteErr;

  const activePendingQuoteCount = (quoteLines ?? []).filter((line) => isReviewableQuoteLine(line)).length;
  if (activePendingQuoteCount > 0) {
    issues.push({
      kind: "pending_quote_lines",
      message: `${activePendingQuoteCount} pending quote line(s) must be resolved before invoicing.`,
    });
  }

  if (!lines || lines.length === 0) {
    issues.push({ kind: "no_lines", message: "Work order has no lines" });
  }

  for (const ln of lines ?? []) {
    const st = String(ln.status ?? "awaiting").toLowerCase();

    // invoice: allow completed-like statuses
    // ai-review: keep stricter if you want (right now they match)
    const completedLike =
      st === "completed" || st === "ready_to_invoice" || st === "invoiced";

    if (!completedLike) {
      issues.push({
        kind: "line_not_completed",
        lineId: ln.id,
        message: `Line not completed: ${ln.description ?? ln.complaint ?? "job"}`,
      });
    }

    // Optional “marked N/A” booleans if you add them later
    const causeNA = (ln as Record<string, unknown>)["cause_marked_na"] === true;
    const correctionNA =
      (ln as Record<string, unknown>)["correction_marked_na"] === true;

    if (!ln.cause && !causeNA) {
      issues.push({
        kind: "missing_cause",
        lineId: ln.id,
        message: `Missing cause: ${ln.description ?? "job"}`,
      });
    }

    if (!ln.correction && !correctionNA) {
      issues.push({
        kind: "missing_correction",
        lineId: ln.id,
        message: `Missing correction: ${ln.description ?? "job"}`,
      });
    }

    const noCharge = (ln as Record<string, unknown>)["no_charge"] === true;
    const laborNA = (ln as Record<string, unknown>)["labor_marked_na"] === true;
    const hasBillableParts = hasBillablePartsByLine.get(String(ln.id)) === true;
    if (lineRequiresParts(ln as Record<string, unknown>) && !hasBillableParts) {
      issues.push({
        kind: "missing_required_parts",
        lineId: ln.id,
        message: `Required parts are missing from line: ${ln.description ?? ln.complaint ?? "job"}`,
      });
    }

    const laborHours = numericValue(ln.labor_time) ?? 0;
    const lineLaborRate = numericValue((ln as Record<string, unknown>)["labor_rate"]);
    const effectiveLaborRate = lineLaborRate && lineLaborRate > 0 ? lineLaborRate : shopLaborRate ?? 0;
    const explicitLaborTotal = numericValue((ln as Record<string, unknown>)["labor_total"]);
    const priceEstimate = numericValue((ln as Record<string, unknown>)["price_estimate"]);
    const laborTotal =
      explicitLaborTotal != null && explicitLaborTotal > 0
        ? explicitLaborTotal
        : priceEstimate != null && priceEstimate > 0
          ? priceEstimate
          : laborHours * effectiveLaborRate;

    if (!noCharge && !laborNA && laborHours > 0 && !(laborTotal > 0) && !hasBillableParts) {
      issues.push({
        kind: "invalid_labor_total",
        lineId: ln.id,
        message: `Labor pricing is missing or invalid for line: ${ln.description ?? ln.complaint ?? "job"}`,
      });
    } else if (!noCharge && !laborNA && laborHours >= 1 && laborTotal > 0 && laborTotal <= laborHours + 0.01 && effectiveLaborRate <= 1) {
      issues.push({
        kind: "suspicious_labor_total",
        lineId: ln.id,
        message: `Labor total looks like hours were used as dollars for line: ${ln.description ?? ln.complaint ?? "job"}`,
      });
    }

    const laborRequired = !noCharge && !laborNA && !hasBillableParts;
    if (laborRequired && !(laborHours > 0)) {
      issues.push({
        kind: "no_labor_time",
        lineId: ln.id,
        message: `No labor time set: ${ln.description ?? "job"}`,
      });
    }
  }

  if (!wo.customer_id) {
    issues.push({ kind: "missing_customer", message: "Missing customer on WO" });
  } else {
    const { data: cust, error: cErr } = await supabase
      .from("customers")
      .select("email")
      .eq("id", wo.customer_id)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (cErr) throw cErr;

    if (!cust?.email) {
      issues.push({ kind: "missing_email", message: "Customer has no email" });
    }
  }

  const ok = issues.length === 0;

  if (ok) {
    try {
      let vehicle = null;
      if (wo.vehicle_id) {
        const { data: vehicleRow } = await supabase
          .from("vehicles")
          .select("id, year, make, model")
          .eq("id", wo.vehicle_id)
          .eq("shop_id", shopId)
          .maybeSingle();
        vehicle = vehicleRow ?? null;
      }

      await seedWorkOrderIntelligenceFromReview({
        supabase,
        workOrder: wo,
        lines,
        vehicle,
        source: kind,
      });
    } catch (intelligenceErr) {
      console.warn("[reviewWorkOrder] intelligence seed failed:", intelligenceErr);
    }
  }

  // Training hook (never block)
  if (wo.shop_id) {
    try {
      await recordWorkOrderTraining({
        shopId: wo.shop_id,
        workOrderId: wo.id,
        vehicleYmm: null,
        payload: {
          kind,
          ok,
          issue_count: issues.length,
          issues,
        },
      });
    } catch (trainErr) {
      console.warn(`AI training (${kind}) failed:`, trainErr);
    }
  }

  return { ok, issues };
}
