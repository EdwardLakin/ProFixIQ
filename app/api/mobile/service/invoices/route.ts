import { NextResponse } from "next/server";

import { listFieldInvoiceHistory } from "@/features/mobile/service/server/fieldInvoiceHistory";
import {
  listFieldOperatorAssignedWorkOrderIds,
  requireMobileServiceOperatorApiAccess,
} from "@/features/mobile/service/server/access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

function invoiceHistoryResponse(
  rows: Awaited<ReturnType<typeof listFieldInvoiceHistory>>,
) {
  return NextResponse.json(
    { ok: true, rows },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET() {
  const access = await requireMobileServiceOperatorApiAccess();
  if (!access.ok) return access.response;
  if (!access.actor.canManageWorkOrders) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const scope = access.managementRole
      ? ({ kind: "shop" } as const)
      : ({
          kind: "work_orders",
          ids: await listFieldOperatorAssignedWorkOrderIds(access),
        } as const);
    if (scope.kind === "work_orders" && scope.ids.length === 0) {
      return invoiceHistoryResponse([]);
    }

    const rows = await listFieldInvoiceHistory({
      supabase: createAdminSupabase(),
      shopId: access.profile.shop_id,
      scope,
    });

    return invoiceHistoryResponse(rows);
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
