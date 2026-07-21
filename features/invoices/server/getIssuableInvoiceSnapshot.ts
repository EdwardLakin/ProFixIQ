import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  getInvoiceSnapshotForWorkOrder,
  type InvoiceSnapshot,
  type InvoiceSnapshotPart,
} from "@/features/invoices/server/getInvoiceSnapshot";
import { calculateInvoiceTotals, roundMoney } from "@/features/invoices/lib/invoiceTotals";
import { selectApprovedAttachedInvoiceParts } from "@/features/invoices/lib/approvedInvoiceParts";

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

  // Customer approval materializes durable work_order_parts with frozen sell
  // prices. Inventory reservation, picking, and issue are operational stock
  // events; they must not add, remove, or reprice an approved customer charge.
  // Allocation/request fallbacks remain useful while building a draft, but an
  // invoice may only use the canonical parts attached to the work-order line.
  const parts: InvoiceSnapshotPart[] = selectApprovedAttachedInvoiceParts(
    base.parts,
  );
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
