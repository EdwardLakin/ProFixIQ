import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderQuoteLine = DB["public"]["Tables"]["work_order_quote_lines"]["Row"];
type WorkOrderPart = DB["public"]["Tables"]["work_order_parts"]["Row"];
type WorkOrderPartAllocation = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function normalizeLaborHoursInput(
  value: unknown,
  fallbackToOne: boolean,
): number | null {
  const parsed = toNum(value);
  if (parsed != null) return parsed;
  return fallbackToOne ? 1 : null;
}

export function resolveWorkOrderLinePricing(args: {
  line: Pick<WorkOrderLine, "labor_time"> & { id?: string; price_estimate?: number | null; labor_total?: number | null; labor_rate?: number | null };
  quote?: Partial<WorkOrderQuoteLine> | null;
  shopLaborRate: number | null;
  stagedParts?: Array<Pick<WorkOrderPart, "quantity" | "unit_price" | "total_price">>;
  allocatedParts?: Array<
    Pick<WorkOrderPartAllocation, "qty" | "unit_cost"> & {
      quantity?: number | null;
      unit_price?: number | null;
      total_price?: number | null;
    }
  >;
  defaultLaborHoursWhenMissing?: boolean;
}): {
  laborHours: number;
  laborRate: number;
  laborTotal: number;
  partsCount: number;
  partsTotal: number;
  lineTotal: number;
} {
  // NOTE:
  // - Creation/insert paths may normalize missing labor_time to 1 hour before persisting.
  // - Read/display/invoice paths should generally keep this runtime fallback disabled so
  //   historical rows with null labor_time remain unchanged unless a caller explicitly opts in.
  const {
    line,
    quote,
    shopLaborRate,
    stagedParts = [],
    allocatedParts = [],
    defaultLaborHoursWhenMissing = false,
  } = args;

  const lineHoursRaw = toNum(line.labor_time);
  const lineHours = lineHoursRaw ?? (defaultLaborHoursWhenMissing ? 1 : 0);
  const quotedHours = toNum(quote?.est_labor_hours) ?? toNum(quote?.labor_hours);
  const laborHours = quotedHours ?? lineHours;

  const explicitLineLaborTotal = toNum(line.labor_total);
  const explicitLineLaborRate = toNum(line.labor_rate);
  const laborRate = explicitLineLaborRate != null && explicitLineLaborRate > 0 ? explicitLineLaborRate : toNum(shopLaborRate) ?? 0;
  const quotedLaborTotal = toNum(quote?.labor_total);

  const stagedPartsTotal = stagedParts.reduce((sum, part) => {
    const total = toNum(part.total_price);
    if (total != null) return sum + total;
    return sum + (toNum(part.quantity) ?? 0) * (toNum(part.unit_price) ?? 0);
  }, 0);

  const allocPartsTotal = allocatedParts.reduce((sum, part) => {
    const total = toNum(part.total_price);
    if (total != null) return sum + total;
    return sum + (toNum(part.quantity ?? part.qty) ?? 0) * ((toNum(part.unit_price) ?? toNum(part.unit_cost)) ?? 0);
  }, 0);

  const hasQuotePartsTotal = toNum(quote?.parts_total) != null;
  const partsTotal = hasQuotePartsTotal ? (toNum(quote?.parts_total) ?? 0) : stagedPartsTotal + allocPartsTotal;
  const partsCount = stagedParts.length + allocatedParts.length;
  const lineTotal = toNum(quote?.grand_total) ?? toNum(quote?.subtotal) ?? toNum(line.price_estimate) ?? (laborHours * laborRate) + partsTotal;
  const computedLaborTotal = laborHours * laborRate;
  const inferredLaborFromLineTotal = Math.max(0, lineTotal - partsTotal);
  const explicitLineLaborTotalIsUsable = explicitLineLaborTotal != null && explicitLineLaborTotal > 0;
  const quotedLaborTotalIsUsable = quotedLaborTotal != null && quotedLaborTotal > 0;
  const computedLaborTotalIsUsable = computedLaborTotal > 0;
  const laborTotal = explicitLineLaborTotalIsUsable
    ? explicitLineLaborTotal
    : quotedLaborTotalIsUsable
      ? quotedLaborTotal
      : computedLaborTotalIsUsable
        ? computedLaborTotal
        : inferredLaborFromLineTotal;

  return { laborHours, laborRate, laborTotal, partsCount, partsTotal, lineTotal };
}
