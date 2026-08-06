import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@shared/types/types/supabase";
import type { InvoiceSnapshot } from "@/features/invoices/server/getInvoiceSnapshot";

type DB = Database;

export type CanonicalDocumentIdentity = {
  workOrderNumber: string | null;
  invoiceNumber: string | null;
};

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export async function getCanonicalDocumentIdentity(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  invoiceId?: string | null;
}): Promise<CanonicalDocumentIdentity> {
  const workOrderPromise = args.supabase
    .from("work_orders")
    .select("custom_id")
    .eq("id", args.workOrderId)
    .eq("shop_id", args.shopId)
    .maybeSingle<{ custom_id: string | null }>();

  let invoiceQuery = args.supabase
    .from("invoices")
    .select("invoice_number")
    .eq("work_order_id", args.workOrderId)
    .eq("shop_id", args.shopId);
  if (args.invoiceId) invoiceQuery = invoiceQuery.eq("id", args.invoiceId);

  const [workOrderResult, invoiceResult] = await Promise.all([
    workOrderPromise,
    invoiceQuery
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ invoice_number: string | null }>(),
  ]);

  if (workOrderResult.error) throw new Error(workOrderResult.error.message);
  if (invoiceResult.error) throw new Error(invoiceResult.error.message);

  return {
    workOrderNumber: clean(workOrderResult.data?.custom_id),
    invoiceNumber: clean(invoiceResult.data?.invoice_number),
  };
}

export function overlayCanonicalDocumentIdentity(
  snapshot: InvoiceSnapshot,
  identity: CanonicalDocumentIdentity,
): InvoiceSnapshot {
  return {
    ...snapshot,
    workOrder: {
      ...snapshot.workOrder,
      custom_id:
        identity.workOrderNumber ?? clean(snapshot.workOrder.custom_id),
    },
    invoice: snapshot.invoice
      ? {
          ...snapshot.invoice,
          invoice_number:
            identity.invoiceNumber ?? clean(snapshot.invoice.invoice_number),
        }
      : snapshot.invoice,
  };
}
