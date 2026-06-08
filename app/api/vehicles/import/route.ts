import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = DB["public"]["Tables"]["vehicles"]["Update"];
type VehicleMatch = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id">;

type VehicleImportRow = {

  vehicle_id?: unknown;

  customer_id?: unknown;

  plate?: unknown;

  trim?: unknown;

  color?: unknown;

  odometer?: unknown;

  odometer_unit?: unknown;

  engine?: unknown;

  fuel_type?: unknown;

  drive_type?: unknown;

  body_type?: unknown;

  asset_type?: unknown;

  status?: unknown;

  purchase_date?: unknown;

  in_service_date?: unknown;

  last_service_date?: unknown;

  tags?: unknown;

  notes?: unknown;
  unit_number?: unknown;
  vin?: unknown;
  license_plate?: unknown;
  year?: unknown;
  make?: unknown;
  model?: unknown;
};

function cleanString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function cleanVin(value: unknown): string | null {
  return cleanString(value)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;
}

function cleanPlate(value: unknown): string | null {
  return cleanString(value)?.toUpperCase() ?? null;
}

function cleanYear(value: unknown): number | null {
  const text = cleanString(value);
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1900 || parsed > 2100) return null;
  return Math.trunc(parsed);
}

function buildVehicleImportNotes(row: VehicleImportRow): string | null {

  const notes: string[] = [];

  const pairs: Array<[string, unknown]> = [

    ["csv_customer_id", row.customer_id],

    ["body_type", row.body_type],

    ["asset_type", row.asset_type],

    ["status", row.status],

    ["purchase_date", row.purchase_date],

    ["in_service_date", row.in_service_date],

    ["last_service_date", row.last_service_date],

    ["tags", row.tags],

    ["notes", row.notes],

  ];

  for (const [label, value] of pairs) {

    const text = cleanString(value);

    if (text) notes.push(`${label}: ${text}`);

  }

  return notes.length ? notes.join("\n") : null;

}

async function findCustomerIdByExternalId(

  supabase: SupabaseClient<DB>,

  shopId: string,

  externalId: string | null,

): Promise<string | null> {

  if (!externalId) return null;

  const { data, error } = await supabase

    .from("customers")

    .select("id")

    .eq("shop_id", shopId)

    .eq("external_id", externalId)

    .maybeSingle();

  if (error) throw error;

  return data?.id ?? null;

}

async function normalizeRow(

  supabase: SupabaseClient<DB>,

  row: VehicleImportRow,

  shopId: string,

): Promise<VehicleInsert | null> {
  const unitNumber = cleanString(row.unit_number);
  const vin = cleanVin(row.vin);
  const plate = cleanPlate(row.license_plate ?? row.plate);
  const year = cleanYear(row.year);
  const make = cleanString(row.make);
  const model = cleanString(row.model);

  const odometer = cleanString(row.odometer);

  const odometerUnit = cleanString(row.odometer_unit);

  const mileage = [odometer, odometerUnit].filter(Boolean).join(" ") || null;

  const customerId = await findCustomerIdByExternalId(supabase, shopId, cleanString(row.customer_id));

  const importNotes = buildVehicleImportNotes(row);

  if (!vin && !unitNumber && !plate && !(year && make && model)) return null;

  return {
    shop_id: shopId,
    unit_number: unitNumber,
    vin,
    license_plate: plate,
    year,
    make,
    model,
    customer_id: customerId,
    external_id: cleanString(row.vehicle_id),
    submodel: cleanString(row.trim),
    color: cleanString(row.color),
    mileage,
    engine: cleanString(row.engine),
    fuel_type: cleanString(row.fuel_type),
    drivetrain: cleanString(row.drive_type),
    import_notes: importNotes,
  };
}

async function findExistingVehicle(
  supabase: SupabaseClient<DB>,
  shopId: string,
  normalized: VehicleInsert,
): Promise<VehicleMatch | null> {
  if (normalized.vin) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", shopId)
      .eq("vin", normalized.vin)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.unit_number) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", shopId)
      .eq("unit_number", normalized.unit_number)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (normalized.license_plate) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("shop_id", shopId)
      .eq("license_plate", normalized.license_plate)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      allowRoles: ["owner", "admin", "manager", "advisor"],
    });

    if (!access.ok) {
      return access.response;
    }

    const body = await req.json().catch(() => null);
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "No vehicle rows provided." }, { status: 400 });
    }

    const { supabase, profile } = access;
    const shopId = profile.shop_id;

    if (!shopId) {
      return NextResponse.json({ error: "No active shop is selected." }, { status: 400 });
    }

    const counts = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    for (const raw of rows) {
      const normalized = await normalizeRow(supabase, raw as VehicleImportRow, shopId);

      if (!normalized) {
        counts.skipped += 1;
        continue;
      }

      try {
        const existing = await findExistingVehicle(supabase, shopId, normalized);

        if (existing) {
          const updatePayload: VehicleUpdate = {
            unit_number: normalized.unit_number,
            vin: normalized.vin,
            license_plate: normalized.license_plate,
            year: normalized.year,
            make: normalized.make,
            model: normalized.model,

            customer_id: normalized.customer_id,

            external_id: normalized.external_id,

            submodel: normalized.submodel,

            color: normalized.color,

            mileage: normalized.mileage,

            engine: normalized.engine,

            fuel_type: normalized.fuel_type,

            drivetrain: normalized.drivetrain,

            import_notes: normalized.import_notes,
          };

          const { error } = await supabase
            .from("vehicles")
            .update(updatePayload)
            .eq("id", existing.id)
            .eq("shop_id", shopId);

          if (error) throw error;
          counts.updated += 1;
          continue;
        }

        const { error } = await supabase.from("vehicles").insert(normalized);

        if (error) throw error;
        counts.created += 1;
      } catch {
        counts.failed += 1;
      }
    }

    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import vehicles." },
      { status: 500 },
    );
  }
}
