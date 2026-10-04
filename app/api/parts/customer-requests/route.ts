import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { PARTS_REQUEST_QUEUE_ROLES } from "@/features/parts/server/loadPartsRequestQueue";
import type { CustomerPartsRequestRow } from "@/features/parts/lib/requests/customer-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" } as const;

function customerName(row: {
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
} | null | undefined): string | null {
  if (!row) return null;
  const person = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return row.business_name?.trim() || person || null;
}

export async function GET() {
  const access = await requireShopScopedApiAccess({ allowRoles: PARTS_REQUEST_QUEUE_ROLES });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  const { supabase } = access;

  const { data: rows, error } = await supabase
    .from("portal_parts_quote_requests")
    .select(
      "id, status, description, notes, qty, part_request_id, customer_id, vehicle_id, total, currency, approval_choice, paid_at, created_at, sent_at, approved_at",
    )
    .eq("shop_id", shopId)
    .in("status", ["requested", "quoted", "sent", "approved"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[parts/customer-requests] load failed", { shopId, message: error.message });
    return NextResponse.json(
      { ok: false, error: "Customer requests could not be loaded." },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }

  const customerIds = [...new Set((rows ?? []).map((row) => row.customer_id))];
  const vehicleIds = [
    ...new Set((rows ?? []).map((row) => row.vehicle_id).filter((id): id is string => Boolean(id))),
  ];

  const [customersResult, vehiclesResult] = await Promise.all([
    customerIds.length
      ? supabase
          .from("customers")
          .select("id, business_name, first_name, last_name")
          .eq("shop_id", shopId)
          .in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    vehicleIds.length
      ? supabase
          .from("vehicles")
          .select("id, year, make, model, license_plate")
          .eq("shop_id", shopId)
          .in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const customers = new Map((customersResult.data ?? []).map((row) => [row.id, row]));
  const vehicles = new Map((vehiclesResult.data ?? []).map((row) => [row.id, row]));

  const requests: CustomerPartsRequestRow[] = (rows ?? []).map((row) => {
    const vehicle = row.vehicle_id ? vehicles.get(row.vehicle_id) : null;
    const vehicleName = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ").trim()
      : "";
    const plate = vehicle?.license_plate?.trim();
    return {
      id: row.id,
      status: row.status,
      description: row.description,
      notes: row.notes,
      qty: Number(row.qty),
      partRequestId: row.part_request_id,
      customerName: customerName(customers.get(row.customer_id)),
      vehicleLabel: [vehicleName, plate].filter(Boolean).join(" • ") || null,
      total: row.total == null ? null : Number(row.total),
      currency: row.currency,
      approvalChoice: row.approval_choice,
      paid: Boolean(row.paid_at),
      createdAt: row.created_at,
      sentAt: row.sent_at,
      approvedAt: row.approved_at,
    };
  });

  return NextResponse.json({ ok: true, requests }, { headers: RESPONSE_HEADERS });
}
