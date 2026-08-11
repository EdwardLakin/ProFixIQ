import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type IntakeRpcArgs =
  Database["public"]["Functions"]["mobile_create_service_call_atomic"]["Args"];

type IntakeBody = {
  customerId?: string | null;
  customerName?: string;
  phone?: string;
  vehicleId?: string | null;
  vehicleYear?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  addressLine1?: string;
  city?: string | null;
  provinceState?: string | null;
  postalCode?: string | null;
  concern?: string;
  startsAt?: string;
  durationMinutes?: number;
  quotedPrice?: number | null;
  operationKey?: string;
};

function safeSearch(value: string): string {
  return value
    .trim()
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const q = safeSearch(new URL(request.url).searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json({ customers: [] });
  const digits = q.replace(/\D/g, "");

  const nameQuery = access.supabase
    .from("customers")
    .select("id,name,phone,phone_number")
    .eq("shop_id", access.profile.shop_id)
    .ilike("name", `%${q}%`)
    .limit(6);
  const phoneQuery =
    digits.length >= 3
      ? access.supabase
          .from("customers")
          .select("id,name,phone,phone_number")
          .eq("shop_id", access.profile.shop_id)
          .or(`phone.ilike.%${digits}%,phone_number.ilike.%${digits}%`)
          .limit(6)
      : Promise.resolve({ data: [], error: null } as const);

  const [byName, byPhone] = await Promise.all([nameQuery, phoneQuery]);
  const error = byName.error || byPhone.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const customerMap = new Map<
    string,
    {
      id: string;
      name: string | null;
      phone: string | null;
      phone_number: string | null;
    }
  >();
  for (const row of [...(byName.data ?? []), ...(byPhone.data ?? [])]) {
    customerMap.set(row.id, row);
  }
  const customers = [...customerMap.values()].slice(0, 8);
  const ids = customers.map((customer) => customer.id);

  const vehiclesResult = ids.length
    ? await access.supabase
        .from("vehicles")
        .select("id,customer_id,year,make,model,license_plate")
        .eq("shop_id", access.profile.shop_id)
        .in("customer_id", ids)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: [], error: null };
  if (vehiclesResult.error) {
    return NextResponse.json(
      { error: vehiclesResult.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone_number || customer.phone,
      vehicles: (vehiclesResult.data ?? []).filter(
        (vehicle) => vehicle.customer_id === customer.id,
      ),
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as IntakeBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "Invalid intake payload." },
      { status: 400 },
    );
  }

  const operationKey =
    body.operationKey?.trim() ||
    request.headers.get("idempotency-key")?.trim() ||
    "";
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (!operationKey) {
    return NextResponse.json(
      { error: "An idempotency key is required." },
      { status: 400 },
    );
  }
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json(
      { error: "A valid arrival time is required." },
      { status: 400 },
    );
  }

  const durationMinutes = Math.trunc(Number(body.durationMinutes ?? 60));
  if (durationMinutes < 5 || durationMinutes > 720) {
    return NextResponse.json(
      { error: "Visit length must be 5–720 minutes." },
      { status: 400 },
    );
  }
  const quotedPrice =
    body.quotedPrice == null ? null : Number(body.quotedPrice);
  if (
    quotedPrice != null &&
    (!Number.isFinite(quotedPrice) || quotedPrice < 0)
  ) {
    return NextResponse.json(
      { error: "Quoted price is invalid." },
      { status: 400 },
    );
  }

  // The RPC keeps p_currency for migration-signature compatibility, but the
  // database derives country and currency from the authorized shop record.
  const rpcArgs = {
    p_shop_id: access.profile.shop_id,
    p_customer_id: body.customerId?.trim() || null,
    p_customer_name: body.customerName?.trim() || null,
    p_phone: body.phone?.trim() || null,
    p_vehicle_id: body.vehicleId?.trim() || null,
    p_vehicle_year:
      body.vehicleYear == null ? null : Math.trunc(Number(body.vehicleYear)),
    p_vehicle_make: body.vehicleMake?.trim() || null,
    p_vehicle_model: body.vehicleModel?.trim() || null,
    p_vehicle_plate: body.vehiclePlate?.trim() || null,
    p_address_line1: body.addressLine1?.trim() || null,
    p_city: body.city?.trim() || null,
    p_province_state: body.provinceState?.trim() || null,
    p_postal_code: body.postalCode?.trim() || null,
    p_concern: body.concern?.trim() || null,
    p_starts_at: startsAt.toISOString(),
    p_duration_minutes: durationMinutes,
    p_quoted_price: quotedPrice,
    p_currency: "",
    p_actor_user_id: access.authUserId,
    p_operation_key: operationKey,
  } as unknown as IntakeRpcArgs;

  const { data, error } = await access.supabase.rpc(
    "mobile_create_service_call_atomic",
    rpcArgs,
  );

  if (error) {
    const conflict =
      error.code === "23P01" ||
      error.code === "40001" ||
      /available|conflict/i.test(error.message);
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : conflict ? 409 : 400 },
    );
  }
  return NextResponse.json(data);
}
