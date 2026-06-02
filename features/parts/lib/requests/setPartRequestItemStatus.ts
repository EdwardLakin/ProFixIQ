// features/parts/lib/requests/setPartRequestItemStatus.ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";

type DB = Database;

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
  const supabase = createServerActionClient<DB>({ cookies });

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