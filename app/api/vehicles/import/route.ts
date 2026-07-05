import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = DB["public"]["Tables"]["vehicles"]["Update"];

function omitNullishVehicleUpdate(payload: VehicleUpdate): VehicleUpdate {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null && value !== undefined),
  ) as VehicleUpdate;
}
type VehicleMatch = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id">;
type CustomerResolverRow = Pick<
  DB["public"]["Tables"]["customers"]["Row"],
  | "id"
  | "external_id"
  | "email"
  | "phone"
  | "phone_number"
  | "name"
  | "business_name"
>;
type CustomerResolverIndex = {
  byExternalId: Map<string, string>;
  byEmail: Map<string, string>;
  byPhone: Map<string, string>;
  byName: Map<string, string>;
};
type NormalizedVehicleResult =
  | { ok: true; vehicle: VehicleInsert }
  | { ok: false; reason: string };

type VehicleImportRow = {
  vehicle_id?: unknown;

  customer_id?: unknown;
  customer_email?: unknown;
  email?: unknown;
  customer_phone?: unknown;
  phone?: unknown;
  customer_name?: unknown;
  name?: unknown;

  plate?: unknown;
  state_province?: unknown;

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
  return (
    cleanString(value)
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, "") ?? null
  );
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

function cleanDate(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return text;
}

function buildVehicleImportNotes(row: VehicleImportRow): string | null {
  const notes: string[] = [];

  const pairs: Array<[string, unknown]> = [
    ["csv_customer_id", row.customer_id],

    ["csv_notes", row.notes],
  ];

  for (const [label, value] of pairs) {
    const text = cleanString(value);

    if (text) notes.push(`${label}: ${text}`);
  }

  return notes.length ? notes.join("\n") : null;
}

function normalizeLookupKey(value: unknown): string | null {
  const text = cleanString(value)?.toLowerCase().replace(/\s+/g, " ") ?? null;
  return text || null;
}

function normalizePhone(value: unknown): string | null {
  const text = cleanString(value);
  if (!text) return null;
  return text.replace(/\D/g, "") || text;
}

async function loadCustomerResolverIndex(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<CustomerResolverIndex> {
  const { data, error } = await supabase
    .from("customers")
    .select("id, external_id, email, phone, phone_number, name, business_name")
    .eq("shop_id", shopId);

  if (error) throw error;

  const index: CustomerResolverIndex = {
    byExternalId: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    byName: new Map(),
  };

  for (const customer of (data ?? []) as CustomerResolverRow[]) {
    const externalId = normalizeLookupKey(customer.external_id);
    if (externalId && !index.byExternalId.has(externalId)) {
      index.byExternalId.set(externalId, customer.id);
    }

    const email = normalizeLookupKey(customer.email);
    if (email && !index.byEmail.has(email))
      index.byEmail.set(email, customer.id);

    for (const phoneValue of [customer.phone, customer.phone_number]) {
      const phone = normalizePhone(phoneValue);
      if (phone && !index.byPhone.has(phone))
        index.byPhone.set(phone, customer.id);
    }

    for (const nameValue of [customer.name, customer.business_name]) {
      const name = normalizeLookupKey(nameValue);
      if (name && !index.byName.has(name)) index.byName.set(name, customer.id);
    }
  }

  return index;
}

function resolveCustomerId(
  row: VehicleImportRow,
  customers: CustomerResolverIndex,
): string | null {
  const externalCustomerId = normalizeLookupKey(row.customer_id);
  if (externalCustomerId)
    return customers.byExternalId.get(externalCustomerId) ?? null;

  const email = normalizeLookupKey(row.customer_email ?? row.email);
  if (email) {
    const match = customers.byEmail.get(email);
    if (match) return match;
  }

  const phone = normalizePhone(row.customer_phone ?? row.phone);
  if (phone) {
    const match = customers.byPhone.get(phone);
    if (match) return match;
  }

  const name = normalizeLookupKey(row.customer_name ?? row.name);
  if (name) {
    const match = customers.byName.get(name);
    if (match) return match;
  }

  return null;
}

function normalizeRow(
  row: VehicleImportRow,

  shopId: string,

  customers: CustomerResolverIndex,
): NormalizedVehicleResult {
  const unitNumber = cleanString(row.unit_number);
  const vin = cleanVin(row.vin);
  const plate = cleanPlate(row.license_plate ?? row.plate);
  const year = cleanYear(row.year);
  const make = cleanString(row.make);
  const model = cleanString(row.model);

  const odometer = cleanString(row.odometer);

  const odometerUnit = cleanString(row.odometer_unit);

  const mileage = odometer ?? null;

  const rawCustomerId = cleanString(row.customer_id);
  const hasCustomerReference = Boolean(
    rawCustomerId ||
      cleanString(row.customer_email ?? row.email) ||
      cleanString(row.customer_phone ?? row.phone) ||
      cleanString(row.customer_name ?? row.name),
  );
  const customerId = resolveCustomerId(row, customers);

  const importNotes = buildVehicleImportNotes(row);

  if (!vin && !unitNumber && !plate && !(year && make && model)) {
    return { ok: false, reason: "Missing vehicle identity." };
  }

  if (hasCustomerReference && !customerId) {
    if (rawCustomerId) {
      return {
        ok: false,
        reason: "Customer not found for external customer_id.",
      };
    }

    return {
      ok: false,
      reason: "Customer reference could not be resolved.",
    };
  }

  return {
    ok: true,
    vehicle: {
      shop_id: shopId,
      unit_number: unitNumber,
      vin,
      license_plate: plate,
      state_province: cleanString(row.state_province),
      year,
      make,
      model,
      customer_id: customerId,
      external_id: cleanString(row.vehicle_id),
      submodel: cleanString(row.trim),
      color: cleanString(row.color),
      mileage,
      odometer_unit: odometerUnit,
      engine: cleanString(row.engine),
      fuel_type: cleanString(row.fuel_type),
      drivetrain: cleanString(row.drive_type),
      body_type: cleanString(row.body_type),
      asset_type: cleanString(row.asset_type),
      status: cleanString(row.status),
      purchase_date: cleanDate(row.purchase_date),
      in_service_date: cleanDate(row.in_service_date),
      last_service_date: cleanDate(row.last_service_date),
      tags: cleanString(row.tags),
      notes: cleanString(row.notes),
      import_notes: importNotes,
    },
  };
}

async function findVehicleByField(
  supabase: SupabaseClient<DB>,
  shopId: string,
  field: "external_id" | "vin" | "unit_number" | "license_plate",
  value: string | null | undefined,
): Promise<VehicleMatch | null> {
  if (!value) return null;

  const { data, error } = await supabase
    .from("vehicles")
    .select("id")
    .eq("shop_id", shopId)
    .eq(field, value)
    .limit(1);

  if (error) throw error;
  return ((data ?? [])[0] as VehicleMatch | undefined) ?? null;
}

async function findExistingVehicle(
  supabase: SupabaseClient<DB>,
  shopId: string,
  normalized: VehicleInsert,
): Promise<VehicleMatch | null> {
  return (
    (await findVehicleByField(
      supabase,
      shopId,
      "external_id",
      normalized.external_id,
    )) ??
    (await findVehicleByField(supabase, shopId, "vin", normalized.vin)) ??
    (await findVehicleByField(
      supabase,
      shopId,
      "unit_number",
      normalized.unit_number,
    )) ??
    (await findVehicleByField(
      supabase,
      shopId,
      "license_plate",
      normalized.license_plate,
    ))
  );
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
      return NextResponse.json(
        { error: "No vehicle rows provided." },
        { status: 400 },
      );
    }

    const { supabase, profile } = access;
    const shopId = profile.shop_id;

    if (!shopId) {
      return NextResponse.json(
        { error: "No active shop is selected." },
        { status: 400 },
      );
    }

    const counts = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
    const customers = await loadCustomerResolverIndex(supabase, shopId);
    const skippedRows: Array<{ row: number; reason: string }> = [];
    const failedRows: Array<{ row: number; error: string }> = [];

    for (const [index, raw] of rows.entries()) {
      const normalizedResult = normalizeRow(
        raw as VehicleImportRow,
        shopId,
        customers,
      );

      if (!normalizedResult.ok) {
        counts.skipped += 1;
        skippedRows.push({ row: index + 1, reason: normalizedResult.reason });
        continue;
      }

      const normalized = normalizedResult.vehicle;

      try {
        const existing = await findExistingVehicle(
          supabase,
          shopId,
          normalized,
        );

        if (existing) {
          const updatePayload: VehicleUpdate = omitNullishVehicleUpdate({
            unit_number: normalized.unit_number,
            vin: normalized.vin,
            license_plate: normalized.license_plate,
            state_province: normalized.state_province,
            year: normalized.year,
            make: normalized.make,
            model: normalized.model,

            customer_id: normalized.customer_id,

            external_id: normalized.external_id,

            submodel: normalized.submodel,

            color: normalized.color,

            mileage: normalized.mileage,

            odometer_unit: normalized.odometer_unit,

            engine: normalized.engine,

            fuel_type: normalized.fuel_type,

            drivetrain: normalized.drivetrain,

            body_type: normalized.body_type,

            asset_type: normalized.asset_type,

            status: normalized.status,

            purchase_date: normalized.purchase_date,

            in_service_date: normalized.in_service_date,

            last_service_date: normalized.last_service_date,

            tags: normalized.tags,

            notes: normalized.notes,

            import_notes: normalized.import_notes,
          });

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
      } catch (error) {
        counts.failed += 1;
        const message = error instanceof Error ? error.message : "Vehicle row failed to import.";
        failedRows.push({ row: index + 1, error: message });
        console.warn("Vehicle import row failed", { row: index + 1, error: message });
      }
    }

    const explanation = `Vehicle import complete: created ${counts.created}, updated ${counts.updated}, skipped ${counts.skipped}, failed ${counts.failed}.`;

    return NextResponse.json({
      ok: true,
      counts,
      explanation,
      skippedRows,
      failedRows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to import vehicles.",
      },
      { status: 500 },
    );
  }
}
