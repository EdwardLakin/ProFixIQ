export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requireQuickBooksShopAccess } from "@/features/integrations/quickbooks/server/auth";

export async function POST() {
  try {
    const supabase = createServerSupabaseRoute();

    const auth = await requireQuickBooksShopAccess(supabase);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { shop } = auth.data;

    const { error } = await supabase
      .from("quickbooks_connections")
      .delete()
      .eq("shop_id", shop.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disconnect QuickBooks.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}