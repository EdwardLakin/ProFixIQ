import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";

const BILLING_STATUSES = ["completed", "ready_to_invoice", "invoiced"];

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor", "lead_hand", "foreman"],
  });

  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) {
    return NextResponse.json({ ok: false, error: "Shop not found" }, { status: 403 });
  }

  const { data, error } = await access.supabase
    .from("work_orders")
    .select("*, customers:customers(first_name,last_name,email), vehicles:vehicles(year,make,model,license_plate)")
    .eq("shop_id", shopId)
    .in("status", BILLING_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      try {
        const snapshot = await getInvoiceSnapshotForWorkOrder({
          supabase: access.supabase,
          workOrderId: row.id,
        });

        return {
          ...row,
          resolved_labor_total: snapshot.laborCost ?? 0,
          resolved_parts_total: snapshot.partsCost ?? 0,
          resolved_invoice_total: snapshot.total ?? 0,
        };
      } catch {
        return {
          ...row,
          resolved_labor_total: 0,
          resolved_parts_total: 0,
          resolved_invoice_total: 0,
        };
      }
    }),
  );

  return NextResponse.json({ ok: true, rows });
}
