import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { cleanVehicleImportText, normalizeImportPlate, normalizeImportVin, type VehicleImportRow } from "@/features/vehicles/lib/importCsv";

type DB = Database;
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = DB["public"]["Tables"]["vehicles"]["Update"];
type VehicleRow = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id" | "customer_id" | "vin" | "unit_number" | "license_plate" | "external_id" | "year" | "make" | "model" | "submodel" | "color" | "engine" | "engine_type" | "engine_family" | "transmission" | "fuel_type" | "drivetrain" | "engine_hours" | "mileage" | "import_notes" | "source_row_id">;
type CustomerRow = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "external_id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number">;

type ImportBody = { rows?: unknown; shop_id?: unknown };

type NormalizedVehicleImportRow = VehicleImportRow & {
  sourceRowNumber: number;
};

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanVehicleImportText(value);
  if (!text) return undefined;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeRows(input: unknown): NormalizedVehicleImportRow[] {
  if (!Array.isArray(input)) return [];
  return input.map((raw, index) => {
    const row = raw as Record<string, unknown>;
    return {
      sourceRowNumber: numberValue(row.sourceRowNumber) ?? index + 1,
      sourceFilename: cleanVehicleImportText(row.sourceFilename),
      external_id: cleanVehicleImportText(row.external_id) ?? cleanVehicleImportText(row.vehicle_id) ?? cleanVehicleImportText(row.vehicleid),
      unit_number: cleanVehicleImportText(row.unit_number) ?? cleanVehicleImportText(row.unit) ?? cleanVehicleImportText(row.fleet_number),
      vin: normalizeImportVin(row.vin),
      license_plate: normalizeImportPlate(row.license_plate) ?? normalizeImportPlate(row.plate),
      year: numberValue(row.year),
      make: cleanVehicleImportText(row.make),
      model: cleanVehicleImportText(row.model),
      submodel: cleanVehicleImportText(row.submodel) ?? cleanVehicleImportText(row.trim),
      color: cleanVehicleImportText(row.color),
      engine: cleanVehicleImportText(row.engine),
      engine_type: cleanVehicleImportText(row.engine_type),
      engine_family: cleanVehicleImportText(row.engine_family),
      transmission: cleanVehicleImportText(row.transmission),
      fuel_type: cleanVehicleImportText(row.fuel_type),
      drivetrain: cleanVehicleImportText(row.drivetrain),
      engine_hours: numberValue(row.engine_hours),
      odometer: cleanVehicleImportText(row.odometer) ?? cleanVehicleImportText(row.mileage),
      notes: cleanVehicleImportText(row.notes),
      status: cleanVehicleImportText(row.status),
      customer_id: cleanVehicleImportText(row.customer_id),
      customer_external_id: cleanVehicleImportText(row.customer_external_id),
      customer_name: cleanVehicleImportText(row.customer_name),
      customer_email: cleanVehicleImportText(row.customer_email)?.toLowerCase(),
      customer_phone: cleanVehicleImportText(row.customer_phone),
    };
  });
}

function hasIdentity(row: NormalizedVehicleImportRow): boolean {
  return Boolean(row.vin || row.external_id || row.unit_number || row.license_plate || (row.year && row.make && row.model));
}

function buildImportNotes(row: NormalizedVehicleImportRow): string | null {
  const notes = [
    row.notes ?? null,
    `Vehicle CSV import row ${row.sourceRowNumber}`,
    row.sourceFilename ? `source file: ${row.sourceFilename}` : null,
  ].filter(Boolean).join("; ");
  return notes || null;
}

function buildVehiclePayload(row: NormalizedVehicleImportRow, args: { shopId: string; customerId: string | null }): VehicleInsert {
  const notes = buildImportNotes(row);
  return {
    shop_id: args.shopId,
    customer_id: args.customerId,
    external_id: row.external_id ?? null,
    unit_number: row.unit_number ?? null,
    vin: row.vin ?? null,
    license_plate: row.license_plate ?? null,
    year: row.year ?? null,
    make: row.make ?? null,
    model: row.model ?? null,
    submodel: row.submodel ?? null,
    color: row.color ?? null,
    engine: row.engine ?? null,
    engine_type: row.engine_type ?? null,
    engine_family: row.engine_family ?? null,
    transmission: row.transmission ?? null,
    fuel_type: row.fuel_type ?? null,
    drivetrain: row.drivetrain ?? null,
    engine_hours: row.engine_hours ?? null,
    mileage: row.odometer ?? null,
    import_notes: notes,
    source_row_id: String(row.sourceRowNumber),
  };
}

function setMeaningfulString(patch: VehicleUpdate, key: keyof VehicleUpdate, value: string | undefined) {
  if (value && value.trim()) (patch as Record<string, unknown>)[key] = value;
}

function setMeaningfulNumber(patch: VehicleUpdate, key: keyof VehicleUpdate, value: number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) (patch as Record<string, unknown>)[key] = value;
}

function buildVehiclePatch(row: NormalizedVehicleImportRow, existing: VehicleRow, customerId: string | null): VehicleUpdate {
  const patch: VehicleUpdate = {};
  if (!existing.customer_id && customerId) patch.customer_id = customerId;
  setMeaningfulString(patch, "external_id", row.external_id);
  setMeaningfulString(patch, "unit_number", row.unit_number);
  setMeaningfulString(patch, "vin", row.vin);
  setMeaningfulString(patch, "license_plate", row.license_plate);
  setMeaningfulNumber(patch, "year", row.year);
  setMeaningfulString(patch, "make", row.make);
  setMeaningfulString(patch, "model", row.model);
  setMeaningfulString(patch, "submodel", row.submodel);
  setMeaningfulString(patch, "color", row.color);
  setMeaningfulString(patch, "engine", row.engine);
  setMeaningfulString(patch, "engine_type", row.engine_type);
  setMeaningfulString(patch, "engine_family", row.engine_family);
  setMeaningfulString(patch, "transmission", row.transmission);
  setMeaningfulString(patch, "fuel_type", row.fuel_type);
  setMeaningfulString(patch, "drivetrain", row.drivetrain);
  setMeaningfulNumber(patch, "engine_hours", row.engine_hours);
  setMeaningfulString(patch, "mileage", row.odometer);
  setMeaningfulString(patch, "import_notes", buildImportNotes(row) ?? undefined);
  patch.source_row_id = String(row.sourceRowNumber);
  return patch;
}

function customerMatches(row: NormalizedVehicleImportRow, customer: CustomerRow): boolean {
  if (row.customer_email && customer.email?.trim().toLowerCase() === row.customer_email) return true;
  const phone = row.customer_phone?.replace(/\D/g, "");
  if (phone && [customer.phone, customer.phone_number].some((value) => value?.replace(/\D/g, "") === phone)) return true;
  const wantedName = row.customer_name?.trim().toLowerCase();
  const names = [customer.business_name, customer.name, [customer.first_name, customer.last_name].filter(Boolean).join(" ")].map((value) => value?.trim().toLowerCase());
  return Boolean(wantedName && names.some((value) => value === wantedName));
}

async function resolveCustomerId(supabase: ReturnType<typeof createRouteHandlerClient<DB>>, shopId: string, row: NormalizedVehicleImportRow): Promise<{ customerId: string | null; warning?: string; error?: string }> {
  if (row.customer_id) {
    const { data: customer, error } = await supabase.from("customers").select("id").eq("shop_id", shopId).eq("id", row.customer_id).maybeSingle();
    if (error) return { customerId: null, error: error.message };
    if (!customer?.id) return { customerId: null, error: "Customer ID does not belong to this shop." };
    return { customerId: String(customer.id) };
  }

  if (row.customer_external_id) {
    const { data: customers, error } = await supabase.from("customers").select("id,external_id").eq("shop_id", shopId).limit(500);
    if (error) return { customerId: null, error: error.message };
    const matches = ((customers ?? []) as CustomerRow[]).filter((customer) => customer.external_id?.trim().toLowerCase() === row.customer_external_id?.trim().toLowerCase());
    if (matches.length === 1) return { customerId: matches[0].id };
    if (matches.length > 1) return { customerId: null, warning: "Ambiguous customer external ID match; vehicle imported without a customer link." };
  }

  if (!row.customer_name && !row.customer_email && !row.customer_phone) return { customerId: null, warning: row.customer_external_id ? "No matching customer found; this vehicle will import without a customer link." : undefined };

  const { data: customers, error } = await supabase.from("customers").select("id,external_id,business_name,name,first_name,last_name,email,phone,phone_number").eq("shop_id", shopId).limit(200);
  if (error) return { customerId: null, error: error.message };
  const matches = ((customers ?? []) as CustomerRow[]).filter((customer) => customerMatches(row, customer));
  if (matches.length === 1) return { customerId: matches[0].id };
  if (matches.length > 1) return { customerId: null, warning: "Ambiguous customer match; vehicle imported without a customer link." };
  return { customerId: null, warning: "No matching customer found; this vehicle will import without a customer link." };
}

async function findExistingVehicle(supabase: ReturnType<typeof createRouteHandlerClient<DB>>, shopId: string, row: NormalizedVehicleImportRow): Promise<{ vehicle: VehicleRow | null; matchKind?: "vin" | "external_id" | "unit_number" | "license_plate"; warning?: string; error?: string }> {
  if (row.vin) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,vin,unit_number,license_plate,external_id,year,make,model,submodel,color,engine,engine_type,engine_family,transmission,fuel_type,drivetrain,engine_hours,mileage,import_notes,source_row_id").eq("shop_id", shopId).eq("vin", row.vin).limit(1).maybeSingle();
    if (error) return { vehicle: null, error: error.message };
    if (data?.id) return { vehicle: data as VehicleRow, matchKind: "vin" };
  }
  if (row.external_id) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,vin,unit_number,license_plate,external_id,year,make,model,submodel,color,engine,engine_type,engine_family,transmission,fuel_type,drivetrain,engine_hours,mileage,import_notes,source_row_id").eq("shop_id", shopId).eq("external_id", row.external_id).limit(1).maybeSingle();
    if (error) return { vehicle: null, error: error.message };
    if (data?.id) return { vehicle: data as VehicleRow, matchKind: "external_id" };
  }
  if (row.unit_number) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,vin,unit_number,license_plate,external_id,year,make,model,submodel,color,engine,engine_type,engine_family,transmission,fuel_type,drivetrain,engine_hours,mileage,import_notes,source_row_id").eq("shop_id", shopId).ilike("unit_number", row.unit_number).limit(1).maybeSingle();
    if (error) return { vehicle: null, error: error.message };
    if (data?.id) return { vehicle: data as VehicleRow, matchKind: "unit_number" };
  }
  if (row.license_plate) {
    const { data, error } = await supabase.from("vehicles").select("id,customer_id,vin,unit_number,license_plate,external_id,year,make,model,submodel,color,engine,engine_type,engine_family,transmission,fuel_type,drivetrain,engine_hours,mileage,import_notes,source_row_id").eq("shop_id", shopId).eq("license_plate", row.license_plate).limit(1).maybeSingle();
    if (error) return { vehicle: null, error: error.message };
    if (data?.id) return { vehicle: data as VehicleRow, matchKind: "license_plate", warning: "Duplicate plate matched an existing vehicle; existing vehicle selected." };
  }
  return { vehicle: null };
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: profile, error: profileError } = await supabase.from("profiles").select("shop_id").eq("user_id", user.id).maybeSingle();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    const shopId = typeof profile?.shop_id === "string" ? profile.shop_id : "";
    if (!shopId) return NextResponse.json({ error: "No shop is associated with this user" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as ImportBody | null;
    const rows = normalizeRows(body?.rows).filter(hasIdentity);
    if (rows.length === 0) return NextResponse.json({ error: "No valid vehicle rows to import" }, { status: 400 });

    const seenVins = new Set<string>();
    const seenExternalIds = new Set<string>();
    const seenUnits = new Set<string>();
    const seenPlates = new Set<string>();
    const warnings: Array<{ row: number; message: string }> = [];
    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        if (row.vin && seenVins.has(row.vin)) {
          skipped += 1;
          warnings.push({ row: row.sourceRowNumber, message: "Duplicate VIN in submitted import; skipped duplicate row." });
          continue;
        }
        if (row.external_id && seenExternalIds.has(row.external_id.trim().toLowerCase())) {
          skipped += 1;
          warnings.push({ row: row.sourceRowNumber, message: "Duplicate external vehicle ID in submitted import; skipped duplicate row." });
          continue;
        }
        if (row.unit_number && seenUnits.has(row.unit_number.trim().toLowerCase())) {
          skipped += 1;
          warnings.push({ row: row.sourceRowNumber, message: "Duplicate unit number in submitted import; skipped duplicate row." });
          continue;
        }
        if (row.license_plate && seenPlates.has(row.license_plate.trim().toLowerCase())) {
          skipped += 1;
          warnings.push({ row: row.sourceRowNumber, message: "Duplicate license plate in submitted import; skipped duplicate row." });
          continue;
        }
        if (row.vin) seenVins.add(row.vin);
        if (row.external_id) seenExternalIds.add(row.external_id.trim().toLowerCase());
        if (row.unit_number) seenUnits.add(row.unit_number.trim().toLowerCase());
        if (row.license_plate) seenPlates.add(row.license_plate.trim().toLowerCase());

        const customer = await resolveCustomerId(supabase, shopId, row);
        if (customer.error) {
          errors.push({ row: row.sourceRowNumber, message: customer.error });
          continue;
        }
        if (customer.warning) warnings.push({ row: row.sourceRowNumber, message: customer.warning });

        const existing = await findExistingVehicle(supabase, shopId, row);
        if (existing.error) throw new Error(existing.error);
        if (existing.warning) warnings.push({ row: row.sourceRowNumber, message: existing.warning });

        if (existing.vehicle?.id) {
          if (existing.vehicle.customer_id && customer.customerId && existing.vehicle.customer_id !== customer.customerId) {
            skipped += 1;
            warnings.push({ row: row.sourceRowNumber, message: "Existing vehicle is linked to another customer; skipped to avoid silent reassignment." });
            continue;
          }
          if (row.vin && existing.vehicle.vin && existing.vehicle.vin !== row.vin) {
            skipped += 1;
            warnings.push({ row: row.sourceRowNumber, message: "Matched an existing vehicle by a weaker identity, but the imported VIN conflicts; skipped to avoid overwriting vehicle identity." });
            continue;
          }
          const patch = buildVehiclePatch(row, existing.vehicle, existing.vehicle.customer_id ?? customer.customerId);
          const { error } = await supabase.from("vehicles").update(patch).eq("shop_id", shopId).eq("id", existing.vehicle.id);
          if (error) throw new Error(error.message);
          updated += 1;
        } else {
          const insert = buildVehiclePayload(row, { shopId, customerId: customer.customerId });
          const { error } = await supabase.from("vehicles").insert(insert);
          if (error) throw new Error(error.message);
          created += 1;
        }
      } catch (err) {
        errors.push({ row: row.sourceRowNumber, message: err instanceof Error ? err.message : "Import failed for this row" });
      }
    }

    const failed = errors.length;
    if (created + updated === 0) return NextResponse.json({ error: "No rows were imported", counts: { created, updated, skipped, failed, warnings: warnings.length }, warnings, errors }, { status: 400 });

    return NextResponse.json({ ok: true, counts: { created, updated, skipped, failed, warnings: warnings.length }, warnings, errors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
