export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import type { Database } from "@shared/types/types/supabase";
import type { AdvisorOfflineBundle } from "@/features/work-orders/mobile/advisorOfflineTypes";

type DB = Database;
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type BookingJoined = Pick<
  DB["public"]["Tables"]["bookings"]["Row"],
  | "id"
  | "starts_at"
  | "ends_at"
  | "customer_id"
  | "vehicle_id"
  | "work_order_id"
  | "notes"
  | "status"
> & {
  customers:
    | Pick<Customer, "first_name" | "last_name" | "email" | "phone">
    | Array<Pick<Customer, "first_name" | "last_name" | "email" | "phone">>
    | null;
};
const PAGE_SIZE = 500;
const MAX_ROWS = 5000;

function validDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

export async function GET(request: NextRequest) {
  const day = request.nextUrl.searchParams.get("day")?.trim() ?? "";
  if (!validDay(day)) {
    return NextResponse.json(
      { error: "A valid day is required." },
      { status: 400 },
    );
  }
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .maybeSingle<{ shop_id: string | null; role: string | null }>();
  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });
  }
  const capabilities = getActorCapabilities({ role: profile.role });
  if (!capabilities.canManageScheduling && !capabilities.canManageWorkOrders) {
    return NextResponse.json(
      { error: "Advisor offline access is unavailable for this role." },
      { status: 403 },
    );
  }
  const { error: contextError } = await supabase.rpc("set_current_shop_id", {
    p_shop_id: profile.shop_id,
  });
  if (contextError) {
    return NextResponse.json(
      { error: "Shop security context could not be initialized." },
      { status: 500 },
    );
  }
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id,name,slug")
    .eq("id", profile.shop_id)
    .single();
  if (shopError || !shop?.slug) {
    return NextResponse.json(
      { error: "Shop could not be loaded." },
      { status: 500 },
    );
  }

  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const { data: bookingRows, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id,starts_at,ends_at,customer_id,vehicle_id,work_order_id,notes,status,customers:customer_id(first_name,last_name,email,phone)",
    )
    .eq("shop_id", profile.shop_id)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at");
  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 });
  }

  const customers: Customer[] = [];
  const vehicles: Vehicle[] = [];
  let customersTruncated = false;
  let vehiclesTruncated = false;
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("shop_id", profile.shop_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    customers.push(...((data ?? []) as Customer[]));
    if ((data ?? []).length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= MAX_ROWS) customersTruncated = true;
  }
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("shop_id", profile.shop_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    vehicles.push(...((data ?? []) as Vehicle[]));
    if ((data ?? []).length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= MAX_ROWS) vehiclesTruncated = true;
  }

  const bookings = ((bookingRows ?? []) as unknown as BookingJoined[]).map(
    (row) => {
      const customer = Array.isArray(row.customers)
        ? row.customers[0]
        : row.customers;
      return {
        id: row.id,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        customer_id: row.customer_id,
        vehicle_id: row.vehicle_id,
        work_order_id: row.work_order_id,
        notes: row.notes,
        status: row.status,
        shop_slug: shop.slug,
        customer_name:
          [customer?.first_name, customer?.last_name]
            .filter(Boolean)
            .join(" ") || null,
        customer_email: customer?.email ?? null,
        customer_phone: customer?.phone ?? null,
      };
    },
  );
  const bundle: AdvisorOfflineBundle = {
    scope: { userId: user.id, shopId: profile.shop_id },
    downloadedAt: new Date().toISOString(),
    day,
    shop,
    bookings,
    customers,
    vehicles,
    truncated: { customers: customersTruncated, vehicles: vehiclesTruncated },
  };
  return NextResponse.json(bundle, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
