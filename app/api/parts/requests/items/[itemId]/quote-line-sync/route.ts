import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";

type DB = Database;

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ itemId: string }> },
) {
  const { itemId: rawItemId } = await ctx.params;
  const itemId = typeof rawItemId === "string" ? rawItemId.trim() : "";

  if (!itemId || !isUuid(itemId)) {
    return NextResponse.json({ ok: false, error: "Invalid itemId" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient<DB>({ cookies });
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) return NextResponse.json({ ok: false, error: userErr.message }, { status: 401 });
  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { data: item, error: itemError } = await supabase
    .from("part_request_items")
    .select("id, shop_id, quote_line_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError) {
    return NextResponse.json({ ok: false, error: itemError.message }, { status: 500 });
  }

  if (!item?.shop_id || !item.quote_line_id) {
    return NextResponse.json({ ok: true, skipped: "item_not_linked_to_quote_line" });
  }

  const result = await syncQuoteLinePartsStatus(supabase, {
    shopId: item.shop_id,
    quoteLineId: item.quote_line_id,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
