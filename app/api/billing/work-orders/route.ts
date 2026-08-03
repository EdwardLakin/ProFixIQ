import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getIssuableInvoiceSnapshot } from "@/features/invoices/server/getIssuableInvoiceSnapshot";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

const BILLING_STATUSES = ["completed", "ready_to_invoice", "invoiced"];

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: [...ROLE_GROUPS.billingOperators],
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
        const snapshot = await getIssuableInvoiceSnapshot({
          supabase: access.supabase,
          workOrderId: row.id,
          shopId,
        });

        return {
          ...row,
          resolved_labor_total: snapshot.laborCost ?? 0,
          resolved_parts_total: snapshot.partsCost ?? 0,
          resolved_shop_supplies_total: snapshot.shopSuppliesTotal ?? 0,
          resolved_tax_total: snapshot.taxTotal ?? 0,
          resolved_invoice_total: snapshot.total ?? 0,
          pricing_error: null,
        };
      } catch (error: unknown) {
        return {
          ...row,
          resolved_labor_total: null,
          resolved_parts_total: null,
          resolved_shop_supplies_total: null,
          resolved_tax_total: null,
          resolved_invoice_total: null,
          pricing_error:
            error instanceof Error
              ? error.message
              : "Invoice pricing is unavailable.",
        };
      }
    }),
  );

  return NextResponse.json(
    { ok: true, rows },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
