export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { resolveWorkOrderFinancialAccess } from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";
import type {
  AppointmentPreparationListItem,
  AppointmentPreparationsResponse,
  DeferredWorkItem,
} from "@/features/operations/types/appointmentPreparations";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type AppointmentPreparationRow =
  DB["public"]["Tables"]["appointment_preparations"]["Row"];

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "lead_hand",
  "foreman",
] as const;

function redactDeferredItemPricing(
  items: DeferredWorkItem[],
  canViewPricing: boolean,
): DeferredWorkItem[] {
  if (canViewPricing) return items;
  return items.map((item) => ({
    ...item,
    laborTotal: null,
    partsTotal: null,
    taxTotal: null,
    grandTotal: null,
  }));
}

function toListItem(
  row: AppointmentPreparationRow,
  canViewPricing: boolean,
): AppointmentPreparationListItem {
  const deferredItems = redactDeferredItemPricing(
    (row.deferred_items ?? []) as unknown as DeferredWorkItem[],
    canViewPricing,
  );
  const matchedMenuItems = (
    (row.matched_menu_items ?? []) as unknown as AppointmentPreparationListItem["matchedMenuItems"]
  ).map((item) => ({
    ...item,
    priceEstimate: canViewPricing ? item.priceEstimate : null,
  }));

  return {
    bookingId: row.booking_id,
    startsAt: row.starts_at,
    vehicleId: row.vehicle_id,
    customerId: row.customer_id,
    vehicleSnapshot:
      (row.vehicle_snapshot as unknown as AppointmentPreparationListItem["vehicleSnapshot"]) ??
      null,
    customerSnapshot:
      (row.customer_snapshot as unknown as AppointmentPreparationListItem["customerSnapshot"]) ??
      null,
    deferredItems,
    matchedMenuItems,
    missingInfo: (row.missing_info ?? []) as unknown as AppointmentPreparationListItem["missingInfo"],
    generatedAt: row.generated_at,
  };
}

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: ALLOWED_ROLES });
  if (!access.ok) return access.response;

  const financial = await resolveWorkOrderFinancialAccess({
    supabase: access.supabase,
    profileId: access.profile.id,
    shopId: access.profile.shop_id,
  });
  if (financial.error) {
    return NextResponse.json<AppointmentPreparationsResponse>(
      { ok: false, error: "Workspace authorization could not be resolved." },
      { status: 500 },
    );
  }

  const canViewPricing = financial.access.canViewSellPricing;

  const { data, error } = await access.supabase
    .from("appointment_preparations")
    .select("*")
    .eq("shop_id", access.profile.shop_id)
    .eq("status", "active")
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json<AppointmentPreparationsResponse>(
      { ok: false, error: "Could not load upcoming appointment preparation." },
      { status: 500 },
    );
  }

  const items = (data ?? []).map((row) => toListItem(row, canViewPricing));

  return NextResponse.json<AppointmentPreparationsResponse>(
    { ok: true, canViewPricing, items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
