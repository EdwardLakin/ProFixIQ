import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PartRequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];

type PartRelinkConflict = {
  table: "part_requests" | "part_request_items";
  id: string;
  currentWorkOrderLineId: string;
  targetWorkOrderLineId: string;
};

export type RelinkQuoteLinePartsResult = {
  partRequestsRelinked: number;
  partRequestItemsRelinked: number;
  partRequestsAlreadyLinked: number;
  partRequestItemsAlreadyLinked: number;
  conflicts: PartRelinkConflict[];
};

export async function relinkQuoteLinePartsToWorkOrderLine(params: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  quoteLineId: string;
  workOrderLineId: string;
}): Promise<{ result: RelinkQuoteLinePartsResult; error: Error | null }> {
  const { supabase, shopId, workOrderId, quoteLineId, workOrderLineId } =
    params;

  const { data: requestRows, error: requestsLoadErr } = await supabase
    .from("part_requests")
    .select("id, job_id")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .eq("quote_line_id", quoteLineId);

  if (requestsLoadErr) {
    return { result: emptyResult(), error: new Error(requestsLoadErr.message) };
  }

  const { data: itemRows, error: itemsLoadErr } = await supabase
    .from("part_request_items")
    .select("id, work_order_line_id")
    .eq("shop_id", shopId)
    .eq("work_order_id", workOrderId)
    .eq("quote_line_id", quoteLineId);

  if (itemsLoadErr) {
    return { result: emptyResult(), error: new Error(itemsLoadErr.message) };
  }

  const result: RelinkQuoteLinePartsResult = emptyResult();
  const requestIdsToRelink: string[] = [];
  const itemIdsToRelink: string[] = [];

  for (const row of (requestRows ?? []) as Pick<
    PartRequestRow,
    "id" | "job_id"
  >[]) {
    if (row.job_id === workOrderLineId) {
      result.partRequestsAlreadyLinked += 1;
    } else if (!row.job_id) {
      requestIdsToRelink.push(row.id);
    } else {
      result.conflicts.push({
        table: "part_requests",
        id: row.id,
        currentWorkOrderLineId: row.job_id,
        targetWorkOrderLineId: workOrderLineId,
      });
    }
  }

  for (const row of (itemRows ?? []) as Pick<
    PartRequestItemRow,
    "id" | "work_order_line_id"
  >[]) {
    if (row.work_order_line_id === workOrderLineId) {
      result.partRequestItemsAlreadyLinked += 1;
    } else if (!row.work_order_line_id) {
      itemIdsToRelink.push(row.id);
    } else {
      result.conflicts.push({
        table: "part_request_items",
        id: row.id,
        currentWorkOrderLineId: row.work_order_line_id,
        targetWorkOrderLineId: workOrderLineId,
      });
    }
  }

  if (requestIdsToRelink.length > 0) {
    const { data: updatedRequests, error: requestsUpdateErr } = await supabase
      .from("part_requests")
      .update({ job_id: workOrderLineId })
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId)
      .eq("quote_line_id", quoteLineId)
      .in("id", requestIdsToRelink)
      .select("id");

    if (requestsUpdateErr) {
      return { result, error: new Error(requestsUpdateErr.message) };
    }

    result.partRequestsRelinked = updatedRequests?.length ?? 0;
  }

  if (itemIdsToRelink.length > 0) {
    const { data: updatedItems, error: itemsUpdateErr } = await supabase
      .from("part_request_items")
      .update({ work_order_line_id: workOrderLineId })
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId)
      .eq("quote_line_id", quoteLineId)
      .in("id", itemIdsToRelink)
      .select("id");

    if (itemsUpdateErr) {
      return { result, error: new Error(itemsUpdateErr.message) };
    }

    result.partRequestItemsRelinked = updatedItems?.length ?? 0;
  }

  return { result, error: null };
}

function emptyResult(): RelinkQuoteLinePartsResult {
  return {
    partRequestsRelinked: 0,
    partRequestItemsRelinked: 0,
    partRequestsAlreadyLinked: 0,
    partRequestItemsAlreadyLinked: 0,
    conflicts: [],
  };
}
