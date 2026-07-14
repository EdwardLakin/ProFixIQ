import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  getInvoiceSnapshotForWorkOrder,
  type InvoiceSnapshot,
  type InvoiceSnapshotPart,
} from "@/features/invoices/server/getInvoiceSnapshot";

type DB = Database;
type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type NetIssuedPart = InvoiceSnapshotPart & {
  manufacturer?: string;
  supplier?: string;
  unitCost?: number;
};

function finite(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeParts(value: unknown): NetIssuedPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): NetIssuedPart[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const qty = finite(row.qty);
    const unitPrice = finite(row.unitPrice);
    if (!id || !name || qty <= 0 || unitPrice < 0) return [];

    return [
      {
        id,
        lineId: typeof row.lineId === "string" ? row.lineId : undefined,
        name,
        qty,
        unitPrice,
        totalPrice: money(finite(row.totalPrice) || qty * unitPrice),
        sku: typeof row.sku === "string" && row.sku.trim() ? row.sku.trim() : undefined,
        partNumber:
          typeof row.partNumber === "string" && row.partNumber.trim()
            ? row.partNumber.trim()
            : undefined,
        vendor:
          typeof row.vendor === "string" && row.vendor.trim() ? row.vendor.trim() : undefined,
        manufacturer:
          typeof row.manufacturer === "string" && row.manufacturer.trim()
            ? row.manufacturer.trim()
            : undefined,
        supplier:
          typeof row.supplier === "string" && row.supplier.trim()
            ? row.supplier.trim()
            : undefined,
        unitCost: finite(row.unitCost),
        source: "work_order_part",
      },
    ];
  });
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

  const rpc = input.supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("get_invoice_net_issued_parts", {
    p_shop_id: input.shopId,
    p_work_order_id: input.workOrderId,
  });
  if (error) {
    throw new Error([error.message, error.details, error.hint].filter(Boolean).join(" — "));
  }

  const parts = normalizeParts(data);
  const partsCost = money(parts.reduce((sum, part) => sum + finite(part.totalPrice), 0));
  const laborCost = money(finite(base.laborCost));
  const supplies = money(finite(base.shopSuppliesTotal));
  const discount = money(finite(base.discountTotal));

  // Preserve the canonical tax treatment chosen by the existing snapshot builder by
  // inferring its effective rate, then apply that rate to the corrected taxable base.
  const previousSubtotal = finite(base.subtotal);
  const previousTaxableBase = Math.max(previousSubtotal - discount, 0);
  const effectiveTaxRate = previousTaxableBase > 0 ? finite(base.taxTotal) / previousTaxableBase : 0;

  const subtotal = money(laborCost + partsCost + supplies);
  const taxableBase = Math.max(subtotal - discount, 0);
  const taxTotal = money(taxableBase * effectiveTaxRate);
  const total = money(taxableBase + taxTotal);

  return {
    ...base,
    parts,
    partsCost,
    subtotal,
    taxTotal,
    total,
  };
}
