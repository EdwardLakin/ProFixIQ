import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  getInvoiceSnapshotForWorkOrder,
  type InvoiceSnapshot,
  type InvoiceSnapshotPart,
} from "@/features/invoices/server/getInvoiceSnapshot";
import { calculateInvoiceTotals, roundMoney } from "@/features/invoices/lib/invoiceTotals";

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

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeParts(value: unknown): NetIssuedPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): NetIssuedPart[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const id = optionalText(row.id) ?? "";
    const name = optionalText(row.name) ?? "";
    const qty = finite(row.qty);
    const unitPrice = finite(row.unitPrice);
    if (!id || !name || qty <= 0 || unitPrice < 0) return [];

    const lineId = optionalText(row.lineId);
    const sku = optionalText(row.sku);
    const partNumber = optionalText(row.partNumber);
    const vendor = optionalText(row.vendor);
    const manufacturer = optionalText(row.manufacturer);
    const supplier = optionalText(row.supplier);

    return [
      {
        id,
        name,
        qty,
        unitPrice,
        totalPrice: roundMoney(finite(row.totalPrice) || qty * unitPrice),
        unitCost: finite(row.unitCost),
        source: "work_order_part",
        ...(lineId ? { lineId } : {}),
        ...(sku ? { sku } : {}),
        ...(partNumber ? { partNumber } : {}),
        ...(vendor ? { vendor } : {}),
        ...(manufacturer ? { manufacturer } : {}),
        ...(supplier ? { supplier } : {}),
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
