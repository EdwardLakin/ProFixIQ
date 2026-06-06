// features/parts/lib/requests/setPartRequestItemStatus.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";


export async function setPartRequestItemStatus(input: {
  partRequestItemId: string;
  status:
    | "requested"
    | "quoted"
    | "approved"
    | "reserved"
    | "ordered"
    | "picking"
    | "picked"
    | "partially_received"
    | "fulfilled"
    | "rejected"
    | "cancelled"
    | "consumed";
  // optional: revalidate targets (work order pages, parts pages)
  revalidate?: { paths?: string[] };
}) {
  const supabase = createServerSupabaseRoute();

  const { data: updatedItem, error } = await supabase
    .from("part_request_items")
    .update({ status: input.status })
    .eq("id", input.partRequestItemId)
    .select("id, shop_id, quote_line_id")
    .maybeSingle();

  if (error) throw error;

  if (updatedItem?.shop_id && updatedItem.quote_line_id) {
    const result = await syncQuoteLinePartsStatus(supabase, {
      shopId: updatedItem.shop_id,
      quoteLineId: updatedItem.quote_line_id,
    });
    if (!result.ok) throw new Error(result.error ?? "Failed to sync quote line parts status");
  }

  const paths = input.revalidate?.paths ?? [];
  for (const p of paths) revalidatePath(p);
}