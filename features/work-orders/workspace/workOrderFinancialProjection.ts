import type { Database } from "@shared/types/types/supabase";
import type { CanonicalWorkOrderLineContext } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";
import type { WorkOrderFinancialAccess } from "@/features/work-orders/workspace/workOrderFinancialAccess";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type QuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];

export type WorkOrderInvoiceReviewSummary = {
  ok: boolean;
  issues: unknown;
  created_at: string;
};

export type RoleShapedWorkOrderDetail = {
  workOrder: WorkOrder;
  lines: WorkOrderLine[];
  quoteLines: QuoteLine[];
  vehicle: DB["public"]["Tables"]["vehicles"]["Row"] | null;
  customer: DB["public"]["Tables"]["customers"]["Row"] | null;
  techNamesById: Record<string, string>;
  lineContext: CanonicalWorkOrderLineContext;
  shopLaborRate: number | null;
  financialAccess: WorkOrderFinancialAccess;
  latestInvoiceReview: WorkOrderInvoiceReviewSummary | null;
};

export function projectWorkOrderFinancialFields(
  row: WorkOrder,
  access: WorkOrderFinancialAccess,
): WorkOrder {
  const projected = { ...row };

  if (!access.canViewSellPricing) {
    projected.customer_pricing_fee_total = null;
    projected.labor_total = null;
    projected.parts_total = null;
    projected.quote = null;
    projected.quote_url = null;
    projected.shop_supplies_amount_override = null;
    projected.shop_supplies_enabled_override = null;
  }

  if (!access.canViewInvoice) {
    projected.invoice_last_sent_to = null;
    projected.invoice_pdf_url = null;
    projected.invoice_sent_at = null;
    projected.invoice_total = null;
    projected.invoice_url = null;
    projected.outstanding_balance = 0;
    projected.paid_at = null;
    projected.payment_status = "restricted";
  }

  return projected;
}

export function projectWorkOrderLineFinancialFields(
  row: WorkOrderLine,
  access: WorkOrderFinancialAccess,
): WorkOrderLine {
  return access.canViewSellPricing ? row : { ...row, price_estimate: null };
}

export function projectQuoteLineFinancialFields(
  row: QuoteLine,
  access: WorkOrderFinancialAccess,
): QuoteLine {
  if (access.canViewSellPricing) return row;
  return {
    ...row,
    customer_pricing_snapshot_id: null,
    discount_total: 0,
    grand_total: null,
    labor_rate: null,
    labor_total: null,
    metadata: null,
    parts_total: null,
    subtotal: null,
    tax_total: null,
  };
}

export function projectCanonicalLineContextFinancialFields(
  context: CanonicalWorkOrderLineContext,
  access: WorkOrderFinancialAccess,
): CanonicalWorkOrderLineContext {
  return {
    ...context,
    allocationsByLine: Object.fromEntries(
      Object.entries(context.allocationsByLine).map(([lineId, allocations]) => [
        lineId,
        allocations.map((allocation) =>
          access.canViewPartsCost
            ? allocation
            : { ...allocation, unit_cost: 0 },
        ),
      ]),
    ),
    canonicalPartsByLine: Object.fromEntries(
      Object.entries(context.canonicalPartsByLine).map(([lineId, parts]) => [
        lineId,
        parts.map((part) => ({
          ...part,
          total_price: access.canViewPartsSellPricing ? part.total_price : null,
          unit_price: access.canViewPartsSellPricing ? part.unit_price : null,
          unit_sell_price_snapshot: access.canViewPartsSellPricing
            ? part.unit_sell_price_snapshot
            : null,
          unit_cost_snapshot: access.canViewPartsCost
            ? part.unit_cost_snapshot
            : null,
        })),
      ]),
    ),
  };
}

export function projectRoleShapedWorkOrderDetail(input: {
  workOrder: WorkOrder;
  lines: WorkOrderLine[];
  quoteLines: QuoteLine[];
  vehicle: RoleShapedWorkOrderDetail["vehicle"];
  customer: RoleShapedWorkOrderDetail["customer"];
  techNamesById: Record<string, string>;
  lineContext: CanonicalWorkOrderLineContext;
  shopLaborRate: number | null;
  financialAccess: WorkOrderFinancialAccess;
  latestInvoiceReview?: WorkOrderInvoiceReviewSummary | null;
}): RoleShapedWorkOrderDetail {
  return {
    ...input,
    workOrder: projectWorkOrderFinancialFields(
      input.workOrder,
      input.financialAccess,
    ),
    lines: input.lines.map((line) =>
      projectWorkOrderLineFinancialFields(line, input.financialAccess),
    ),
    quoteLines: input.quoteLines.map((line) =>
      projectQuoteLineFinancialFields(line, input.financialAccess),
    ),
    lineContext: projectCanonicalLineContextFinancialFields(
      input.lineContext,
      input.financialAccess,
    ),
    shopLaborRate: input.financialAccess.canViewSellPricing
      ? input.shopLaborRate
      : null,
    latestInvoiceReview: input.financialAccess.canViewInvoice
      ? (input.latestInvoiceReview ?? null)
      : null,
  };
}
