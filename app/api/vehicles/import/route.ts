import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { cleanVehicleImportText, isUuid, normalizeImportLookupValue, normalizeImportPlate, normalizeImportVin, type VehicleImportRow } from "@/features/vehicles/lib/importCsv";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

type DB = Database;
type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = DB["public"]["Tables"]["vehicles"]["Update"];
type VehicleRow = Pick<DB["public"]["Tables"]["vehicles"]["Row"], "id" | "customer_id" | "vin" | "unit_number" | "license_plate" | "external_id" | "year" | "make" | "model" | "submodel" | "color" | "engine" | "engine_type" | "engine_family" | "transmission" | "fuel_type" | "drivetrain" | "engine_hours" | "mileage" | "import_notes" | "source_row_id">;
type CustomerRow = Pick<DB["public"]["Tables"]["customers"]["Row"], "id" | "external_id" | "business_name" | "name" | "first_name" | "last_name" | "email" | "phone" | "phone_number">;

type ImportBody = { rows?: unknown; shop_id?: unknown };

type NormalizedVehicleImportRow = VehicleImportRow & {
  sourceRowNumber: number;
};

type ImportWarning = { row: number; message: string };
type ImportError = { row: number; message: string };
type VehicleWriteItem = { row: NormalizedVehicleImportRow; payload: VehicleInsert };
type VehicleMatchKind = "vin" | "external_id" | "unit_number" | "license_plate";
type VehicleDiagnostic = {
  row: number;
  external_id: string | null;
  vin: string | null;
  unit_number: string | null;
  plate: string | null;
  customer_external_id: string | null;
  code: string | null;
  status: number | null;
  message: string;
  details: string | null;
  hint: string | null;
  payloadKeys: string[];
  containsUserId: boolean;
};

type VehicleIndexes = {
  byVin: Map<string, VehicleRow>;
  byExternalId: Map<string, VehicleRow>;
  byUnitNumber: Map<string, VehicleRow>;
  byLicensePlate: Map<string, VehicleRow>;
};

type CustomerIndexes = {
  byId: Map<string, CustomerRow>;
  byExternalId: Map<string, CustomerRow[]>;
};

const PAGE_SIZE = 1000;
const VEHICLE_INSERT_BATCH_SIZE = 100;
const SAMPLE_LIMIT = 25;

const VEHICLE_SELECT = "id,customer_id,vin,unit_number,license_plate,external_id,year,make,model,submodel,color,engine,engine_type,engine_family,transmission,fuel_type,drivetrain,engine_hours,mileage,import_notes,source_row_id";
const CUSTOMER_SELECT = "id,external_id,business_name,name,first_name,last_name,email,phone,phone_number";

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanVehicleImportText(value);
  if (!text) return undefined;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCustomerReference(row: Record<string, unknown>): Pick<NormalizedVehicleImportRow, "customer_id" | "customer_external_id"> {
  const explicitExternalId = cleanVehicleImportText(row.customer_external_id)
    ?? cleanVehicleImportText(row.customerExternalId)
    ?? cleanVehicleImportText(row.external_customer_id)
    ?? cleanVehicleImportText(row.externalCustomerId);
  const customerId = cleanVehicleImportText(row.customer_id) ?? cleanVehicleImportText(row.customerid) ?? cleanVehicleImportText(row.customerId);

  if (explicitExternalId) {
    return {
      customer_external_id: explicitExternalId,
      customer_id: customerId && isUuid(customerId) ? customerId.trim() : undefined,
    };
  }

  if (!customerId) return {};
  if (isUuid(customerId)) return { customer_id: customerId.trim() };
  return { customer_external_id: customerId.trim() };
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
      ...normalizeCustomerReference(row),
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
  } satisfies VehicleInsert;
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

function addUniqueIndexValue(index: Map<string, VehicleRow>, key: string | null | undefined, row: VehicleRow) {
  const normalized = normalizeImportLookupValue(key);
  if (normalized && !index.has(normalized)) index.set(normalized, row);
}

function indexVehicles(vehicles: VehicleRow[]): VehicleIndexes {
  const indexes: VehicleIndexes = { byVin: new Map(), byExternalId: new Map(), byUnitNumber: new Map(), byLicensePlate: new Map() };
  for (const vehicle of vehicles) {
    addUniqueIndexValue(indexes.byVin, vehicle.vin, vehicle);
    addUniqueIndexValue(indexes.byExternalId, vehicle.external_id, vehicle);
    addUniqueIndexValue(indexes.byUnitNumber, vehicle.unit_number, vehicle);
    addUniqueIndexValue(indexes.byLicensePlate, vehicle.license_plate, vehicle);
  }
  return indexes;
}

function indexCustomers(customers: CustomerRow[]): CustomerIndexes {
  const indexes: CustomerIndexes = { byId: new Map(), byExternalId: new Map() };
  for (const customer of customers) {
    indexes.byId.set(customer.id, customer);
    const externalId = normalizeImportLookupValue(customer.external_id);
    if (externalId) indexes.byExternalId.set(externalId, [...(indexes.byExternalId.get(externalId) ?? []), customer]);
  }
  return indexes;
}

function findExistingVehicleFromIndexes(row: NormalizedVehicleImportRow, indexes: VehicleIndexes, options: { skipUnitNumberMatch?: boolean } = {}): { vehicle: VehicleRow | null; matchKind?: VehicleMatchKind; warning?: string } {
  const vin = normalizeImportLookupValue(row.vin);
  if (vin && indexes.byVin.has(vin)) return { vehicle: indexes.byVin.get(vin) ?? null, matchKind: "vin" };
  const externalId = normalizeImportLookupValue(row.external_id);
  if (externalId && indexes.byExternalId.has(externalId)) return { vehicle: indexes.byExternalId.get(externalId) ?? null, matchKind: "external_id" };
  const unitNumber = normalizeImportLookupValue(row.unit_number);
  if (unitNumber && !options.skipUnitNumberMatch && indexes.byUnitNumber.has(unitNumber)) return { vehicle: indexes.byUnitNumber.get(unitNumber) ?? null, matchKind: "unit_number" };
  const plate = normalizeImportLookupValue(row.license_plate);
  if (plate && indexes.byLicensePlate.has(plate)) return { vehicle: indexes.byLicensePlate.get(plate) ?? null, matchKind: "license_plate", warning: "Duplicate plate matched an existing vehicle; existing vehicle selected." };
  return { vehicle: null };
}

async function fetchSameShopCustomers(supabase: SupabaseClient<DB>, shopId: string): Promise<{ customers: CustomerRow[]; error?: string }> {
  const customers: CustomerRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from("customers").select(CUSTOMER_SELECT).eq("shop_id", shopId).range(from, to);
    if (error) return { customers: [], error: error.message };
    const page = (data ?? []) as CustomerRow[];
    customers.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { customers };
}

async function fetchSameShopVehicles(supabase: SupabaseClient<DB>, shopId: string): Promise<{ vehicles: VehicleRow[]; error?: string }> {
  const vehicles: VehicleRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from("vehicles").select(VEHICLE_SELECT).eq("shop_id", shopId).range(from, to);
    if (error) return { vehicles: [], error: error.message };
    const page = (data ?? []) as VehicleRow[];
    vehicles.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { vehicles };
}

function resolveCustomerId(row: NormalizedVehicleImportRow, customers: CustomerIndexes): { customerId: string | null; warning?: string } {
  const customerExternalId = normalizeImportLookupValue(row.customer_external_id);
  if (customerExternalId) {
    const matches = customers.byExternalId.get(customerExternalId) ?? [];
    if (matches.length === 1) return { customerId: matches[0].id };
    if (matches.length > 1) return { customerId: null, warning: "Ambiguous customer external ID match; vehicle imported without a customer link." };
    return { customerId: null, warning: "No matching customer found by external ID; this vehicle will import without a customer link." };
  }

  if (row.customer_id && isUuid(row.customer_id)) {
    if (customers.byId.has(row.customer_id.trim())) return { customerId: row.customer_id.trim() };
    return { customerId: null, warning: "No matching customer found by ID; this vehicle will import without a customer link." };
  }

  if (!row.customer_name && !row.customer_email && !row.customer_phone) return { customerId: null };

  const matches = Array.from(customers.byId.values()).filter((customer) => customerMatches(row, customer));
  if (matches.length === 1) return { customerId: matches[0].id };
  if (matches.length > 1) return { customerId: null, warning: "Ambiguous customer match; vehicle imported without a customer link." };
  return { customerId: null, warning: "No matching customer found; this vehicle will import without a customer link." };
}

function samplePush<T>(items: T[], item: T) {
  if (items.length < SAMPLE_LIMIT) items.push(item);
}

function buildImportResponseBody(args: {
  ok?: boolean;
  error?: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  warnings: ImportWarning[];
  errors: ImportError[];
  diagnostics: VehicleDiagnostic[];
}) {
  return {
    ...(typeof args.ok === "boolean" ? { ok: args.ok } : {}),
    ...(args.error ? { error: args.error } : {}),
    created: args.created,
    updated: args.updated,
    skipped: args.skipped,
    failed: args.failed,
    counts: { created: args.created, updated: args.updated, skipped: args.skipped, failed: args.failed, warnings: args.warnings.length },
    warnings: args.warnings,
    errors: args.errors,
    diagnostics: args.diagnostics,
  };
}

function errorField(error: unknown, field: "code" | "message" | "details" | "hint"): string | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" && value ? value : null;
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>).status;
  return typeof value === "number" ? value : null;
}

function isDuplicateConflict(error: unknown): boolean {
  return errorField(error, "code") === "23505" || /duplicate key/i.test(errorField(error, "message") ?? "");
}

function isBadPayloadError(error: unknown): boolean {
  const status = errorStatus(error);
  const code = errorField(error, "code") ?? "";
  const message = errorField(error, "message") ?? "";
  return status === 400 || code.startsWith("PGRST") || /column .* does not exist|schema cache|invalid input syntax|violates check constraint/i.test(message);
}

function buildDiagnostic(row: NormalizedVehicleImportRow, payload: VehicleInsert | VehicleUpdate, error: unknown): VehicleDiagnostic {
  const payloadKeys = Object.keys(payload).sort();
  return {
    row: row.sourceRowNumber,
    external_id: row.external_id ?? null,
    vin: row.vin ?? null,
    unit_number: row.unit_number ?? null,
    plate: row.license_plate ?? null,
    customer_external_id: row.customer_external_id ?? null,
    code: errorField(error, "code"),
    status: errorStatus(error),
    message: errorField(error, "message") ?? (error instanceof Error ? error.message : "Vehicle write failed"),
    details: errorField(error, "details"),
    hint: errorField(error, "hint"),
    payloadKeys,
    containsUserId: payloadKeys.includes("user_id"),
  };
}

async function updateExistingVehicle(supabase: SupabaseClient<DB>, shopId: string, row: NormalizedVehicleImportRow, existing: VehicleRow, customerId: string | null): Promise<{ ok: true } | { ok: false; error: unknown; diagnostic: VehicleDiagnostic }> {
  const patch = buildVehiclePatch(row, existing, existing.customer_id ?? customerId);
  const { error } = await supabase.from("vehicles").update(patch).eq("shop_id", shopId).eq("id", existing.id);
  if (error) return { ok: false, error, diagnostic: buildDiagnostic(row, patch, error) };
  return { ok: true };
}

async function findExistingVehicleOnce(supabase: SupabaseClient<DB>, shopId: string, row: NormalizedVehicleImportRow): Promise<{ vehicle: VehicleRow | null; error?: unknown }> {
  const identities: Array<{ column: "vin" | "external_id" | "unit_number" | "license_plate"; value: string | undefined }> = [
    { column: "vin", value: row.vin },
    { column: "external_id", value: row.external_id },
    { column: "unit_number", value: row.unit_number },
    { column: "license_plate", value: row.license_plate },
  ];

  for (const identity of identities) {
    if (!identity.value) continue;
    const query = supabase.from("vehicles").select(VEHICLE_SELECT).eq("shop_id", shopId).limit(1);
    const { data, error } = identity.column === "unit_number"
      ? await query.ilike("unit_number", identity.value).maybeSingle()
      : await query.eq(identity.column, identity.value).maybeSingle();
    if (error) return { vehicle: null, error };
    if (data?.id) return { vehicle: data as VehicleRow };
  }

  return { vehicle: null };
}

function addVehicleToIndexes(indexes: VehicleIndexes, vehicle: VehicleRow) {
  addUniqueIndexValue(indexes.byVin, vehicle.vin, vehicle);
  addUniqueIndexValue(indexes.byExternalId, vehicle.external_id, vehicle);
  addUniqueIndexValue(indexes.byUnitNumber, vehicle.unit_number, vehicle);
  addUniqueIndexValue(indexes.byLicensePlate, vehicle.license_plate, vehicle);
}

async function handleDuplicateConflict(args: {
  supabase: SupabaseClient<DB>;
  shopId: string;
  item: VehicleWriteItem;
  vehicleIndexes: VehicleIndexes;
  warnings: ImportWarning[];
  errors: ImportError[];
  diagnostics: VehicleDiagnostic[];
}): Promise<"updated" | "skipped" | "failed"> {
  const { supabase, shopId, item, vehicleIndexes, warnings, errors, diagnostics } = args;
  const lookup = await findExistingVehicleOnce(supabase, shopId, item.row);
  if (lookup.error) {
    samplePush(errors, { row: item.row.sourceRowNumber, message: errorField(lookup.error, "message") ?? "Duplicate recovery lookup failed." });
    return "failed";
  }
  if (!lookup.vehicle?.id) {
    samplePush(warnings, { row: item.row.sourceRowNumber, message: "Duplicate conflict detected, but no deterministic same-shop vehicle match was found; row skipped." });
    return "skipped";
  }
  if (lookup.vehicle.customer_id && item.payload.customer_id && lookup.vehicle.customer_id !== item.payload.customer_id) {
    samplePush(warnings, { row: item.row.sourceRowNumber, message: "Duplicate conflict matched a vehicle linked to another customer; skipped to avoid silent reassignment." });
    return "skipped";
  }
  if (item.row.vin && lookup.vehicle.vin && lookup.vehicle.vin !== item.row.vin) {
    samplePush(warnings, { row: item.row.sourceRowNumber, message: "Duplicate conflict matched a vehicle with a conflicting VIN; skipped." });
    return "skipped";
  }
  const result = await updateExistingVehicle(supabase, shopId, item.row, lookup.vehicle, item.payload.customer_id ?? null);
  if (!result.ok) {
    samplePush(errors, { row: item.row.sourceRowNumber, message: result.diagnostic.message });
    samplePush(diagnostics, result.diagnostic);
    return "failed";
  }
  addVehicleToIndexes(vehicleIndexes, lookup.vehicle);
  samplePush(warnings, { row: item.row.sourceRowNumber, message: "Duplicate conflict recovered by updating a deterministic same-shop vehicle match." });
  return "updated";
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
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

    const warnings: ImportWarning[] = [];
    const errors: ImportError[] = [];
    const diagnostics: VehicleDiagnostic[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const [{ customers, error: customersError }, { vehicles, error: vehiclesError }] = await Promise.all([
      fetchSameShopCustomers(supabase, shopId),
      fetchSameShopVehicles(supabase, shopId),
    ]);
    if (customersError) return NextResponse.json({ error: customersError }, { status: 500 });
    if (vehiclesError) return NextResponse.json({ error: vehiclesError }, { status: 500 });

    const customerIndexes = indexCustomers(customers);
    const vehicleIndexes = indexVehicles(vehicles);
    const seenVins = new Set<string>();
    const seenExternalIds = new Set<string>();
    const seenUnits = new Set<string>();
    const seenPlates = new Set<string>();
    const inserts: VehicleWriteItem[] = [];

    for (const row of rows) {
      const vinKey = normalizeImportLookupValue(row.vin);
      const externalIdKey = normalizeImportLookupValue(row.external_id);
      const unitKey = normalizeImportLookupValue(row.unit_number);
      const plateKey = normalizeImportLookupValue(row.license_plate);

      if (vinKey && seenVins.has(vinKey)) {
        skipped += 1;
        samplePush(warnings, { row: row.sourceRowNumber, message: "Duplicate VIN in submitted import; skipped duplicate row." });
        continue;
      }
      if (externalIdKey && seenExternalIds.has(externalIdKey)) {
        skipped += 1;
        samplePush(warnings, { row: row.sourceRowNumber, message: "Duplicate external vehicle ID in submitted import; skipped duplicate row." });
        continue;
      }
      const duplicateUnitNumberInImport = Boolean(unitKey && seenUnits.has(unitKey));
      if (duplicateUnitNumberInImport && !vinKey && !externalIdKey) {
        skipped += 1;
        samplePush(warnings, { row: row.sourceRowNumber, message: "Duplicate unit number in submitted import and no unique VIN or external vehicle ID was provided; skipped duplicate row." });
        continue;
      }
      if (duplicateUnitNumberInImport) samplePush(warnings, { row: row.sourceRowNumber, message: "Duplicate unit number in submitted import; continuing because VIN or external vehicle ID can identify this vehicle." });
      if (plateKey && seenPlates.has(plateKey)) {
        skipped += 1;
        samplePush(warnings, { row: row.sourceRowNumber, message: "Duplicate license plate in submitted import; skipped duplicate row." });
        continue;
      }

      if (vinKey) seenVins.add(vinKey);
      if (externalIdKey) seenExternalIds.add(externalIdKey);
      if (unitKey) seenUnits.add(unitKey);
      if (plateKey) seenPlates.add(plateKey);

      const customer = resolveCustomerId(row, customerIndexes);
      if (customer.warning) samplePush(warnings, { row: row.sourceRowNumber, message: customer.warning });

      const existing = findExistingVehicleFromIndexes(row, vehicleIndexes, { skipUnitNumberMatch: duplicateUnitNumberInImport && Boolean(vinKey || externalIdKey) });
      if (existing.warning) samplePush(warnings, { row: row.sourceRowNumber, message: existing.warning });

      if (existing.vehicle?.id) {
        if (existing.vehicle.customer_id && customer.customerId && existing.vehicle.customer_id !== customer.customerId) {
          skipped += 1;
          samplePush(warnings, { row: row.sourceRowNumber, message: "Existing vehicle is linked to another customer; skipped to avoid silent reassignment." });
          continue;
        }
        if (row.vin && existing.vehicle.vin && existing.vehicle.vin !== row.vin) {
          skipped += 1;
          samplePush(warnings, { row: row.sourceRowNumber, message: "Matched an existing vehicle by a weaker identity, but the imported VIN conflicts; skipped to avoid overwriting vehicle identity." });
          continue;
        }
        const result = await updateExistingVehicle(supabase, shopId, row, existing.vehicle, customer.customerId);
        if (!result.ok) {
          failed += 1;
          samplePush(errors, { row: row.sourceRowNumber, message: result.diagnostic.message });
          samplePush(diagnostics, result.diagnostic);
          if (isBadPayloadError(result.error)) {
            return NextResponse.json(buildImportResponseBody({ error: "Vehicle update payload rejected by database schema.", created, updated, skipped, failed, warnings, errors, diagnostics }), { status: 400 });
          }
          continue;
        }
        updated += 1;
      } else {
        inserts.push({ row, payload: buildVehiclePayload(row, { shopId, customerId: customer.customerId }) });
      }
    }

    for (let index = 0; index < inserts.length; index += VEHICLE_INSERT_BATCH_SIZE) {
      const chunk = inserts.slice(index, index + VEHICLE_INSERT_BATCH_SIZE);
      const payloads = chunk.map((item) => item.payload);
      const { error } = await supabase.from("vehicles").insert(payloads);
      if (!error) {
        created += chunk.length;
        for (const item of chunk) {
          addVehicleToIndexes(vehicleIndexes, { id: `imported:${item.row.sourceRowNumber}`, ...item.payload } as VehicleRow);
        }
        continue;
      }

      if (isDuplicateConflict(error)) {
        for (const item of chunk) {
          const result = await handleDuplicateConflict({ supabase, shopId, item, vehicleIndexes, warnings, errors, diagnostics });
          if (result === "updated") updated += 1;
          else if (result === "skipped") skipped += 1;
          else failed += 1;
        }
        continue;
      }

      const diagnostic = buildDiagnostic(chunk[0].row, chunk[0].payload, error);
      samplePush(diagnostics, diagnostic);
      failed += 1;
      samplePush(errors, { row: chunk[0].row.sourceRowNumber, message: diagnostic.message });
      if (isBadPayloadError(error)) {
        return NextResponse.json(buildImportResponseBody({ error: "Vehicle insert payload rejected by database schema.", created, updated, skipped, failed, warnings, errors, diagnostics }), { status: 400 });
      }
      skipped += chunk.length;
      samplePush(warnings, { row: chunk[0].row.sourceRowNumber, message: "Vehicle insert batch failed and was skipped to prevent repeated retries." });
    }

    if (created + updated === 0) return NextResponse.json(buildImportResponseBody({ error: "No rows were imported", created, updated, skipped, failed, warnings, errors, diagnostics }), { status: 400 });

    return NextResponse.json(buildImportResponseBody({ ok: true, created, updated, skipped, failed, warnings, errors, diagnostics }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
