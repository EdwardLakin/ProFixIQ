import type { Database } from "@shared/types/types/supabase";
import type { CanonicalWorkOrderLineContext } from "@/features/work-orders/lib/data/loadCanonicalWorkOrderLineContext";

type DB = Database;

export type MobileWorkOrderSnapshot = {
  workOrder: DB["public"]["Tables"]["work_orders"]["Row"];
  lines: DB["public"]["Tables"]["work_order_lines"]["Row"][];
  quoteLines: DB["public"]["Tables"]["work_order_quote_lines"]["Row"][];
  vehicle: DB["public"]["Tables"]["vehicles"]["Row"] | null;
  customer: DB["public"]["Tables"]["customers"]["Row"] | null;
  techNamesById: Record<string, string>;
  lineContext?: CanonicalWorkOrderLineContext;
  shopLaborRate?: number | null;
};

const LINE_CONTEXT_KEYS = [
  "allocationsByLine",
  "canonicalPartsByLine",
  "technicianIdsByLine",
  "activeTechnicianIdsByLine",
  "partRequestsByLine",
  "partRequestsByQuoteLine",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasArrayValues(value: unknown): value is Record<string, unknown[]> {
  return (
    isRecord(value) && Object.values(value).every((item) => Array.isArray(item))
  );
}

function invalidSnapshot(message: string): never {
  throw new Error(`Invalid mobile work-order detail response: ${message}`);
}

/**
 * Validates the server snapshot before any database-shaped values reach the
 * mobile renderer. Optional vehicle, customer, assignment, inspection, parts,
 * and labor-rate data remain valid null/empty states.
 */
export function parseMobileWorkOrderSnapshot(
  value: unknown,
): MobileWorkOrderSnapshot {
  if (!isRecord(value)) invalidSnapshot("response is not an object");

  const workOrder = value.workOrder;
  if (!isRecord(workOrder)) invalidSnapshot("workOrder is missing");
  if (!isNonEmptyString(workOrder.id)) invalidSnapshot("workOrder.id is missing");
  if (!isNonEmptyString(workOrder.shop_id)) {
    invalidSnapshot("workOrder.shop_id is missing");
  }

  if (!Array.isArray(value.lines)) invalidSnapshot("lines is not an array");
  if (!Array.isArray(value.quoteLines)) {
    invalidSnapshot("quoteLines is not an array");
  }

  const workOrderId = workOrder.id;
  const shopId = workOrder.shop_id;
  for (const line of value.lines) {
    if (!isRecord(line) || !isNonEmptyString(line.id)) {
      invalidSnapshot("a line is missing its id");
    }
    if (line.work_order_id !== workOrderId) {
      invalidSnapshot("a line belongs to a different work order");
    }
    if (line.shop_id != null && line.shop_id !== shopId) {
      invalidSnapshot("a line belongs to a different shop");
    }
  }

  for (const quoteLine of value.quoteLines) {
    if (!isRecord(quoteLine) || !isNonEmptyString(quoteLine.id)) {
      invalidSnapshot("a quote line is missing its id");
    }
    if (quoteLine.work_order_id !== workOrderId) {
      invalidSnapshot("a quote line belongs to a different work order");
    }
    if (quoteLine.shop_id != null && quoteLine.shop_id !== shopId) {
      invalidSnapshot("a quote line belongs to a different shop");
    }
  }

  for (const [key, expectedId] of [
    ["vehicle", workOrder.vehicle_id],
    ["customer", workOrder.customer_id],
  ] as const) {
    const related = value[key];
    if (related === null) continue;
    if (!isRecord(related) || !isNonEmptyString(related.id)) {
      invalidSnapshot(`${key} is neither a record nor null`);
    }
    if (expectedId && related.id !== expectedId) {
      invalidSnapshot(`${key} does not belong to this work order`);
    }
    if (related.shop_id != null && related.shop_id !== shopId) {
      invalidSnapshot(`${key} belongs to a different shop`);
    }
  }

  if (
    !isRecord(value.techNamesById) ||
    !Object.values(value.techNamesById).every(
      (name) => typeof name === "string",
    )
  ) {
    invalidSnapshot("techNamesById is invalid");
  }

  if (!isRecord(value.lineContext)) {
    invalidSnapshot("lineContext is missing");
  }
  for (const key of LINE_CONTEXT_KEYS) {
    if (!hasArrayValues(value.lineContext[key])) {
      invalidSnapshot(`lineContext.${key} is invalid`);
    }
  }

  if (
    value.shopLaborRate !== null &&
    (typeof value.shopLaborRate !== "number" ||
      !Number.isFinite(value.shopLaborRate))
  ) {
    invalidSnapshot("shopLaborRate is invalid");
  }

  return value as unknown as MobileWorkOrderSnapshot;
}
