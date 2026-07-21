import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  getInvoiceSnapshotForWorkOrder,
  type InvoiceSnapshot,
} from "@/features/invoices/server/getInvoiceSnapshot";
import { calculateInvoiceTotals, roundMoney } from "@/features/invoices/lib/invoiceTotals";

type DB = Database;

function finite(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getIssuableInvoiceSnapshot(input: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  shopId: string;
}): Promise<InvoiceSnapshot> {
  const base = await getInvoiceSnapshotForWorkOrder({
    supabase: input.supabase,
    workOrderId: input.workOrderId,
  });

  // getInvoiceSnapshotForWorkOrder has already resolved each completed line's
  // attached parts through the deployed-schema-compatible precedence chain:
  // work_order_parts, backed allocations, then linked request items. Do not
  // filter that canonical result by its diagnostic source label; legacy rows
  // can legitimately resolve through a fallback while remaining attached to
  // the same approved work-order line.
  const parts = [...base.parts];
  const partsCost = roundMoney(
    parts.reduce((sum, part) => sum + finite(part.totalPrice), 0),
  );
  const laborCost = roundMoney(finite(base.laborCost));
  const calculated = calculateInvoiceTotals({
    laborCost,
    partsCost,
    shopSuppliesTotal: base.shopSuppliesTotal,
    discountTotal: base.discountTotal,
    taxRatePercent: base.taxRate,
  });
  const lines = base.lines.map((line) => {
    const linePartsTotal = roundMoney(
      parts
        .filter((part) => part.lineId === line.id)
        .reduce((sum, part) => sum + finite(part.totalPrice), 0),
    );
    return {
      ...line,
      resolvedPartsTotal: linePartsTotal,
      resolvedLineTotal: roundMoney(line.resolvedLaborTotal + linePartsTotal),
    };
  });

  return {
    ...base,
    lines,
    parts,
    partsCost,
    subtotal: calculated.subtotal,
    discountTotal: calculated.discountTotal || null,
    taxTotal: calculated.taxTotal || null,
    total: calculated.total,
  };
}
