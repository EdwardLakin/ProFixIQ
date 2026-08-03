import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActiveInvoiceVersion } from "@/features/invoices/server/financialLifecycle";
import { getInvoiceSnapshotForWorkOrder } from "@/features/invoices/server/getInvoiceSnapshot";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";

type DB = Database;
type MoneyMap = Record<string, number>;
type Body = {
  workOrderId?: string;
  lineLaborTotals?: unknown;
  partUnitPrices?: unknown;
  shopSuppliesAmount?: unknown;
};

type OverrideClient = {
  from(table: string): {
    upsert(
      value: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

const admin = createClient<DB>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parseMoneyMap(value: unknown, label: string): MoneyMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 500) throw new Error(`Too many ${label} overrides.`);
  return Object.fromEntries(
    entries.map(([id, raw]) => {
      const amount = Number(raw);
      if (!id || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
        throw new Error(`Invalid ${label} override.`);
      }
      return [id, Math.round(amount * 100) / 100];
    }),
  );
}

export async function POST(request: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapabilities: ["canManageWorkOrders", "canAuthorizeQuotes"],
      allowRoles: ["owner", "admin", "manager", "advisor", "service"],
    });
    if (!access.ok) return access.response;

    const body = (await request.json().catch(() => null)) as Body | null;
    const workOrderId = body?.workOrderId?.trim() ?? "";
    if (!workOrderId) {
      return NextResponse.json(
        { error: "Missing work order ID." },
        { status: 400 },
      );
    }

    const { data: workOrder, error: workOrderError } = await admin
      .from("work_orders")
      .select("id,shop_id")
      .eq("id", workOrderId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<{ id: string; shop_id: string }>();
    if (workOrderError) throw new Error(workOrderError.message);
    if (!workOrder) {
      return NextResponse.json(
        { error: "Work order not found." },
        { status: 404 },
      );
    }

    const activeVersion = await getActiveInvoiceVersion({
      supabase: admin,
      workOrderId,
      shopId: workOrder.shop_id,
    });
    if (activeVersion) {
      return NextResponse.json(
        {
          error:
            "Issued invoice pricing is locked. Void or credit the invoice before changing it.",
        },
        { status: 409 },
      );
    }

    const snapshot = await getInvoiceSnapshotForWorkOrder({
      supabase: admin,
      workOrderId,
    });
    const lineLaborTotals = parseMoneyMap(body?.lineLaborTotals, "labor");
    const partUnitPrices = parseMoneyMap(body?.partUnitPrices, "part");
    const validLineIds = new Set(snapshot.lines.map((line) => line.id));
    const validPartIds = new Set(
      snapshot.parts.flatMap(
        (part) => [part.id, part.pricingSourceId].filter(Boolean) as string[],
      ),
    );
    if (Object.keys(lineLaborTotals).some((id) => !validLineIds.has(id))) {
      return NextResponse.json(
        { error: "A labor line no longer belongs to this invoice." },
        { status: 409 },
      );
    }
    if (Object.keys(partUnitPrices).some((id) => !validPartIds.has(id))) {
      return NextResponse.json(
        { error: "A part no longer belongs to this invoice." },
        { status: 409 },
      );
    }

    const supplies = body?.shopSuppliesAmount;
    const shopSuppliesAmount =
      supplies == null || supplies === "" ? null : Number(supplies);
    if (
      shopSuppliesAmount != null &&
      (!Number.isFinite(shopSuppliesAmount) ||
        shopSuppliesAmount < 0 ||
        shopSuppliesAmount > 1_000_000)
    ) {
      return NextResponse.json(
        { error: "Invalid shop supplies amount." },
        { status: 400 },
      );
    }

    const overrideClient = admin as unknown as OverrideClient;
    const { error } = await overrideClient
      .from("invoice_pricing_overrides")
      .upsert(
        {
          work_order_id: workOrderId,
          shop_id: workOrder.shop_id,
          line_labor_totals: lineLaborTotals,
          part_unit_prices: partUnitPrices,
          shop_supplies_amount:
            shopSuppliesAmount == null
              ? null
              : Math.round(shopSuppliesAmount * 100) / 100,
          updated_by: access.profile.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "work_order_id" },
      );
    if (error) throw new Error(error.message);

    await logOperationalEvent({
      supabase: admin,
      event: "invoice_pricing_overridden",
      entityType: "work_order",
      entityId: workOrderId,
      details: {
        labor_line_count: Object.keys(lineLaborTotals).length,
        part_count: Object.keys(partUnitPrices).length,
        shop_supplies_amount: shopSuppliesAmount,
      },
    });

    const updatedSnapshot = await getInvoiceSnapshotForWorkOrder({
      supabase: admin,
      workOrderId,
    });
    return NextResponse.json({ ok: true, snapshot: updatedSnapshot });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save invoice pricing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
