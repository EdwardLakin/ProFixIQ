import { NextResponse } from "next/server";

import { listFieldInvoiceHistory } from "@/features/mobile/service/server/fieldInvoiceHistory";
import { requireMobileServiceOperatorApiAccess } from "@/features/mobile/service/server/access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export async function GET() {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;
  if (!access.actor.canManageWorkOrders) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await listFieldInvoiceHistory({
      supabase: createAdminSupabase(),
      shopId: access.profile.shop_id,
    });

    return NextResponse.json(
      { ok: true, rows },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[field-invoices] read failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Invoice history is unavailable." },
      { status: 500 },
    );
  }
}
