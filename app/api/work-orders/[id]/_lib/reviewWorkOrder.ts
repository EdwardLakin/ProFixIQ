import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { recordWorkOrderTraining } from "@/features/integrations/ai";
import { seedWorkOrderIntelligenceFromReview } from "@/features/ai/server/workOrderIntelligence";

type DB = Database;

export type ReviewIssue = { kind: string; lineId?: string; message: string };

export type ReviewKind = "ai_review" | "invoice_review";

type Args = {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
  kind: ReviewKind;
};

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

  const { data: lines, error: lnErr } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("work_order_id", wo.id)
    .eq("shop_id", shopId);

  if (lnErr) throw lnErr;

  const issues: ReviewIssue[] = [];

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
    const laborRequired = !noCharge && !laborNA && !hasBillableParts;
    if (laborRequired && !(typeof ln.labor_time === "number" && ln.labor_time > 0)) {
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
