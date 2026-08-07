import type { Database } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";

type DB = Database;
type PartRequestInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PartRequestItemInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];
type QuotePricingSyncResult = Awaited<ReturnType<typeof syncQuoteLinePartsStatus>>;

export type ReusePartPersistenceInput = {
  description: string;
  partNumber: string | null;
  supplierPartNumber: string | null;
  qty: number;
  unitCost: number | null;
  unitPrice: number | null;
  availability: string | null;
  leadTime: string | null;
  notes: string | null;
  source: "pricing_snapshot" | "menu_repair_item";
  sourcePricingPartId?: string | null;
  sourceMenuRepairItemPartId?: string | null;
};

export function customerVisibleReuseParts(
  parts: ReusePartPersistenceInput[],
  includeExplicitSell: boolean,
) {
  return parts.map((part) => ({
    description: part.description,
    partNumber: part.partNumber,
    supplierPartNumber: part.supplierPartNumber,
    qty: part.qty,
    unitPrice: includeExplicitSell ? part.unitPrice : null,
    availability: part.availability,
    leadTime: part.leadTime,
    notes: part.notes,
    source: part.source,
    sourcePricingPartId: part.sourcePricingPartId ?? null,
    sourceMenuRepairItemPartId: part.sourceMenuRepairItemPartId ?? null,
  }));
}

export function buildReusePartRequestItems(input: {
  requestId: string;
  shopId: string;
  workOrderId: string;
  quoteLineId: string;
  parts: ReusePartPersistenceInput[];
  includeExplicitSell: boolean;
}): PartRequestItemInsert[] {
  return input.parts.map((part) => ({
    request_id: input.requestId,
    shop_id: input.shopId,
    work_order_id: input.workOrderId,
    quote_line_id: input.quoteLineId,
    work_order_line_id: null,
    source_row_id:
      part.sourcePricingPartId ?? part.sourceMenuRepairItemPartId ?? null,
    // menuRepairItemPartId belongs to menu_repair_item_parts, while this
    // column references menu_item_parts. Keep the reusable-pricing identity in
    // source_row_id and do not cross those foreign-key domains.
    source_menu_item_part_id: null,
    description: part.description,
    qty: part.qty,
    qty_requested: part.qty,
    unit_cost: part.unitCost,
    unit_price: input.includeExplicitSell ? part.unitPrice : null,
    quoted_price: null,
    status: "requested",
  }));
}

export async function persistReusePartRequest(
  supabase: SupabaseClient<DB>,
  input: {
    shopId: string;
    workOrderId: string;
    quoteLineId: string;
    requestedBy: string;
    notes: string | null;
    parts: ReusePartPersistenceInput[];
    includeExplicitSell: boolean;
  },
  syncPricing: typeof syncQuoteLinePartsStatus = syncQuoteLinePartsStatus,
): Promise<{
  created: boolean;
  requestId?: string;
  sync?: QuotePricingSyncResult;
  error?: string;
}> {
  if (input.parts.length === 0) return { created: false };

  const requestPayload: PartRequestInsert = {
    shop_id: input.shopId,
    work_order_id: input.workOrderId,
    quote_line_id: input.quoteLineId,
    job_id: null,
    requested_by: input.requestedBy,
    notes: input.notes,
    status: "requested",
  };

  const { data: request, error: requestError } = await supabase
    .from("part_requests")
    .insert(requestPayload)
    .select("id")
    .single();

  if (requestError || !request?.id) {
    return { created: false, error: requestError?.message ?? "Failed to create part request" };
  }

  const itemRows = buildReusePartRequestItems({
    requestId: request.id,
    shopId: input.shopId,
    workOrderId: input.workOrderId,
    quoteLineId: input.quoteLineId,
    parts: input.parts,
    includeExplicitSell: input.includeExplicitSell,
  });
  const { error: itemsError } = await supabase.from("part_request_items").insert(itemRows);

  if (itemsError) {
    const { error: cleanupError } = await supabase
      .from("part_requests")
      .delete()
      .eq("id", request.id)
      .eq("shop_id", input.shopId);
    return {
      created: false,
      requestId: request.id,
      error: cleanupError
        ? `${itemsError.message}; request cleanup failed: ${cleanupError.message}`
        : itemsError.message,
    };
  }

  const sync = await syncPricing(supabase, {
    shopId: input.shopId,
    quoteLineId: input.quoteLineId,
  });

  if (!sync.ok) {
    const { error: cleanupError } = await supabase
      .from("part_requests")
      .delete()
      .eq("id", request.id)
      .eq("shop_id", input.shopId);
    const syncError = sync.error ?? "Failed to sync quote-line parts status";
    return {
      created: false,
      requestId: request.id,
      sync,
      error: cleanupError
        ? `${syncError}; request cleanup failed: ${cleanupError.message}`
        : syncError,
    };
  }

  return { created: true, requestId: request.id, sync };
}
