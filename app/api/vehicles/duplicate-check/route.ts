import { NextResponse } from "next/server";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

type Body = {
  vin?: string | null;
  licensePlate?: string | null;
  license_plate?: string | null;
  unitNumber?: string | null;
  unit_number?: string | null;
  customerId?: string | null;
  customer_id?: string | null;
  vehicleId?: string | null;
  vehicle_id?: string | null;
};

type VehicleDuplicateMatch = {
  id: string;
  customer_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  unit_number: string | null;
  customer_display_name: string | null;
  same_customer: boolean | null;
  match_type: "vin" | "license_plate" | "unit_number";
};

type VehicleQueryRow = Omit<VehicleDuplicateMatch, "customer_display_name" | "same_customer" | "match_type"> & {
  customers?:
    | {
        business_name?: string | null;
        name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
        phone_number?: string | null;
      }
    | null;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlate(value: unknown): string | null {
  return cleanText(value)?.toUpperCase() ?? null;
}

function customerName(customer: VehicleQueryRow["customers"]): string | null {
  if (!customer) return null;
  const business = customer.business_name?.trim();
  if (business) return business;
  const name = customer.name?.trim();
  if (name) return name;
  const person = [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ").trim();
  if (person) return person;
  return customer.email ?? customer.phone ?? customer.phone_number ?? null;
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseRSC();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const byUserId = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const byId = byUserId.data?.shop_id
    ? null
    : await supabase.from("profiles").select("shop_id").eq("id", user.id).maybeSingle();

  const portalCustomer = byUserId.data?.shop_id || byId?.data?.shop_id
    ? null
    : await supabase
        .from("customers")
        .select("id, shop_id")
        .eq("user_id", user.id)
        .maybeSingle();

  const shopId = byUserId.data?.shop_id ?? byId?.data?.shop_id ?? portalCustomer?.data?.shop_id ?? null;

  if (!shopId) {
    return NextResponse.json({ error: "Your profile isn’t linked to a shop yet." }, { status: 403 });
  }

  const requestedCustomerId = cleanText(body.customerId ?? body.customer_id);
  const customerId = portalCustomer?.data?.id ?? requestedCustomerId;
  const vehicleId = cleanText(body.vehicleId ?? body.vehicle_id);
  const vinInput = cleanText(body.vin);
  const vin = vinInput ? normalizeVinInput(vinInput).vin || vinInput.toUpperCase() : null;
  const licensePlate = normalizePlate(body.licensePlate ?? body.license_plate);
  const unitNumber = cleanText(body.unitNumber ?? body.unit_number);

  if (!vin && !licensePlate && !unitNumber) {
    return NextResponse.json({ matches: [], hasVinMatch: false, hasSameCustomerMatch: false, hasDifferentCustomerMatch: false });
  }

  async function findMatches(matchType: "vin" | "license_plate" | "unit_number", value: string) {
    let query = supabase
      .from("vehicles")
      .select(
        "id, customer_id, year, make, model, vin, license_plate, unit_number, customers(business_name, name, first_name, last_name, email, phone, phone_number)",
      )
      .eq("shop_id", shopId);

    if (vehicleId) query = query.neq("id", vehicleId);

    if (matchType === "vin") {
      query = query.eq("vin", value);
    } else if (matchType === "license_plate") {
      query = query.ilike("license_plate", value);
    } else {
      query = query.ilike("unit_number", value);
    }

    const { data, error } = await query.limit(20);
    if (error) throw error;

    return ((data ?? []) as VehicleQueryRow[]).map((row): VehicleDuplicateMatch => ({
      id: row.id,
      customer_id: row.customer_id,
      year: row.year,
      make: row.make,
      model: row.model,
      vin: row.vin,
      license_plate: row.license_plate,
      unit_number: row.unit_number,
      customer_display_name: customerName(row.customers),
      same_customer: customerId ? row.customer_id === customerId : null,
      match_type: matchType,
    }));
  }

  try {
    const matchesById = new Map<string, VehicleDuplicateMatch>();
    const ordered: VehicleDuplicateMatch[] = [];

    for (const [matchType, value] of [
      ["vin", vin],
      ["license_plate", licensePlate],
      ["unit_number", unitNumber],
    ] as const) {
      if (!value) continue;
      const rows = await findMatches(matchType, value);
      for (const row of rows) {
        if (!matchesById.has(row.id)) {
          matchesById.set(row.id, row);
          ordered.push(row);
        }
      }
    }

    return NextResponse.json({
      matches: ordered,
      hasVinMatch: ordered.some((row) => row.match_type === "vin"),
      hasSameCustomerMatch: ordered.some((row) => row.same_customer === true),
      hasDifferentCustomerMatch: ordered.some((row) => row.same_customer === false),
    });
  } catch (err) {
    console.error("[vehicles.duplicate-check]", err);
    return NextResponse.json({ error: "Failed to check duplicate vehicles." }, { status: 500 });
  }
}
