import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/features/onboarding-agent/lib/fingerprints";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import type { Database } from "@/features/shared/types/types/supabase";

type JsonObject = Record<string, unknown>;
type OnboardingEntityRow = Database["public"]["Tables"]["onboarding_entities"]["Row"];
type OnboardingEntityLinkRow = Database["public"]["Tables"]["onboarding_entity_links"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];
type VehicleUpdate = Database["public"]["Tables"]["vehicles"]["Update"];

export type CustomerVehicleActivationResult = {
  ok: true;
  stagedCustomersFound: number;
  stagedVehiclesFound: number;
  stagedCustomerVehicleLinksFound: number;
  customersInserted: number;
  customersUpdated: number;
  customersSkipped: number;
  vehiclesInserted: number;
  vehiclesUpdated: number;
  vehiclesSkipped: number;
  customerVehicleLinksCreated: number;
  customerVehicleLinksUpdated: number;
  customerVehicleLinksSkipped: number;
  customersBefore: number;
  customersAfter: number;
  vehiclesBefore: number;
  vehiclesAfter: number;
  warnings: string[];
};

type NormalizedCustomer = {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  externalId: string | null;
};

type NormalizedVehicle = {
  vin: string | null;
  plate: string | null;
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  externalId: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function textOrNull(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text : null;
}

function normalizeLookupKey(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeText(value).toLowerCase();
  return normalized || null;
}

function normalizeVin(value: unknown): string | null {
  const normalized = normalizeText(value).toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

function normalizePlate(value: unknown): string | null {
  const normalized = normalizeText(value).toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const numeric = Number(String(value ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function toNormalizedCustomer(entity: Pick<OnboardingEntityRow, "normalized" | "display_name" | "source_external_id">): NormalizedCustomer {
  const normalized = (entity.normalized ?? {}) as JsonObject;
  const name = textOrNull(normalized.name) ?? textOrNull(entity.display_name);

  return {
    externalId: textOrNull(entity.source_external_id) ?? textOrNull(normalized.sourceCustomerId),
    name,
    firstName: textOrNull(normalized.firstName),
    lastName: textOrNull(normalized.lastName),
    businessName: textOrNull(normalized.businessName),
    email: normalizeEmail(normalized.email),
    phone: normalizePhone(textOrNull(normalized.phone)),
  };
}

function toNormalizedVehicle(entity: Pick<OnboardingEntityRow, "normalized" | "source_external_id">): NormalizedVehicle {
  const normalized = (entity.normalized ?? {}) as JsonObject;
  return {
    externalId: textOrNull(entity.source_external_id) ?? textOrNull(normalized.sourceVehicleId),
    vin: normalizeVin(normalized.vin),
    plate: normalizePlate(normalized.plate),
    unitNumber: textOrNull(normalized.unitNumber),
    year: normalizeNumber(normalized.year),
    make: textOrNull(normalized.make),
    model: textOrNull(normalized.model),
  };
}

function buildCustomerUpdate(current: CustomerRow, next: NormalizedCustomer): CustomerUpdate | null {
  const update: CustomerUpdate = {};
  if (isBlank(current.external_id) && next.externalId) update.external_id = next.externalId;
  if (isBlank(current.name) && next.name) update.name = next.name;
  if (isBlank(current.first_name) && next.firstName) update.first_name = next.firstName;
  if (isBlank(current.last_name) && next.lastName) update.last_name = next.lastName;
  if (isBlank(current.business_name) && next.businessName) update.business_name = next.businessName;
  if (isBlank(current.email) && next.email) update.email = next.email;
  if (isBlank(current.phone) && next.phone) update.phone = next.phone;
  if (isBlank(current.phone_number) && next.phone) update.phone_number = next.phone;

  return Object.keys(update).length > 0 ? update : null;
}

function buildVehicleUpdate(current: VehicleRow, next: NormalizedVehicle): VehicleUpdate | null {
  const update: VehicleUpdate = {};
  if (isBlank(current.external_id) && next.externalId) update.external_id = next.externalId;
  if (isBlank(current.vin) && next.vin) update.vin = next.vin;
  if (isBlank(current.license_plate) && next.plate) update.license_plate = next.plate;
  if (isBlank(current.unit_number) && next.unitNumber) update.unit_number = next.unitNumber;
  if (current.year === null && next.year !== null) update.year = next.year;
  if (isBlank(current.make) && next.make) update.make = next.make;
  if (isBlank(current.model) && next.model) update.model = next.model;

  return Object.keys(update).length > 0 ? update : null;
}

function customerMatchesInPriority(customer: NormalizedCustomer, pool: CustomerRow[]) {
  if (customer.externalId) {
    const matches = pool.filter((row) => normalizeLookupKey(row.external_id) === normalizeLookupKey(customer.externalId));
    return { matches, strategy: "external_id" };
  }

  if (customer.email) {
    const matches = pool.filter((row) => normalizeEmail(row.email) === customer.email);
    return { matches, strategy: "email" };
  }

  if (customer.phone) {
    const matches = pool.filter((row) => normalizePhone(row.phone ?? row.phone_number) === customer.phone);
    return { matches, strategy: "phone" };
  }

  const nameKey = normalizeLookupKey(customer.businessName ?? customer.name);
  if (nameKey) {
    const matches = pool.filter((row) => {
      const rowBusiness = normalizeLookupKey(row.business_name);
      const rowName = normalizeLookupKey(row.name || `${row.first_name ?? ""} ${row.last_name ?? ""}`);
      return rowBusiness === nameKey || rowName === nameKey;
    });
    return { matches, strategy: "name" };
  }

  return { matches: [], strategy: "none" };
}

function vehicleMatchesInPriority(args: {
  vehicle: NormalizedVehicle;
  pool: VehicleRow[];
  linkedCustomerId: string | null;
}) {
  const { vehicle, pool, linkedCustomerId } = args;
  if (vehicle.vin) {
    return { matches: pool.filter((row) => normalizeVin(row.vin) === vehicle.vin), strategy: "vin" };
  }

  if (vehicle.plate) {
    return { matches: pool.filter((row) => normalizePlate(row.license_plate) === vehicle.plate), strategy: "license_plate" };
  }

  if (vehicle.externalId) {
    return { matches: pool.filter((row) => normalizeLookupKey(row.external_id) === normalizeLookupKey(vehicle.externalId)), strategy: "external_id" };
  }

  if (linkedCustomerId && vehicle.year !== null && vehicle.make && vehicle.model) {
    const makeKey = normalizeLookupKey(vehicle.make);
    const modelKey = normalizeLookupKey(vehicle.model);
    return {
      matches: pool.filter((row) =>
        row.customer_id === linkedCustomerId
        && row.year === vehicle.year
        && normalizeLookupKey(row.make) === makeKey
        && normalizeLookupKey(row.model) === modelKey),
      strategy: "ymm_customer",
    };
  }

  return { matches: [], strategy: "none" };
}

export async function activateOnboardingCustomersVehicles(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
}): Promise<CustomerVehicleActivationResult> {
  const sb = params.supabase as any;

  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const [
    entitiesResult,
    linksResult,
    customersResult,
    vehiclesResult,
  ] = await Promise.all([
    sb
      .from("onboarding_entities")
      .select("id, shop_id, session_id, entity_type, status, normalized, display_name, source_external_id")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .in("entity_type", ["customer", "vehicle"])
      .eq("status", "ready")
      .order("id", { ascending: true }),
    sb
      .from("onboarding_entity_links")
      .select("id, shop_id, session_id, from_entity_id, to_entity_id, link_type")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .eq("link_type", "customer_vehicle")
      .order("id", { ascending: true }),
    sb
      .from("customers")
      .select("id, shop_id, external_id, email, phone, phone_number, name, first_name, last_name, business_name")
      .eq("shop_id", params.shopId)
      .order("id", { ascending: true }),
    sb
      .from("vehicles")
      .select("id, shop_id, external_id, vin, license_plate, unit_number, year, make, model, customer_id")
      .eq("shop_id", params.shopId)
      .order("id", { ascending: true }),
  ]);

  if (entitiesResult.error) throw new Error(entitiesResult.error.message);
  if (linksResult.error) throw new Error(linksResult.error.message);
  if (customersResult.error) throw new Error(customersResult.error.message);
  if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);

  const entities = (entitiesResult.data ?? []) as Array<Pick<OnboardingEntityRow, "id" | "shop_id" | "session_id" | "entity_type" | "status" | "normalized" | "display_name" | "source_external_id">>;
  const links = (linksResult.data ?? []) as Array<Pick<OnboardingEntityLinkRow, "id" | "shop_id" | "session_id" | "from_entity_id" | "to_entity_id" | "link_type">>;
  const customerPool = (customersResult.data ?? []) as CustomerRow[];
  const vehiclePool = (vehiclesResult.data ?? []) as VehicleRow[];

  const customerEntities = entities.filter((entity) => entity.entity_type === "customer" && entity.status === "ready");
  const vehicleEntities = entities.filter((entity) => entity.entity_type === "vehicle" && entity.status === "ready");
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));

  const warnings: string[] = [];
  const customerEntityToLiveId = new Map<string, string>();
  const vehicleEntityToLiveId = new Map<string, string>();

  let customersInserted = 0;
  let customersUpdated = 0;
  let customersSkipped = 0;
  for (const entity of customerEntities) {
    const normalized = toNormalizedCustomer(entity);
    const { matches, strategy } = customerMatchesInPriority(normalized, customerPool);

    if (matches.length > 1) {
      customersSkipped += 1;
      warnings.push(`Customer entity ${entity.id} skipped: ambiguous ${strategy} match (${matches.length} rows).`);
      continue;
    }

    if (matches.length === 1) {
      const current = matches[0];
      const update = buildCustomerUpdate(current, normalized);
      customerEntityToLiveId.set(entity.id, current.id);
      if (!update) {
        customersSkipped += 1;
        continue;
      }
      const { error } = await sb.from("customers").update(update).eq("shop_id", params.shopId).eq("id", current.id);
      if (error) throw new Error(error.message);
      Object.assign(current, update);
      customersUpdated += 1;
      continue;
    }

    const payload: CustomerInsert = {
      shop_id: params.shopId,
      external_id: normalized.externalId,
      name: normalized.name,
      first_name: normalized.firstName,
      last_name: normalized.lastName,
      business_name: normalized.businessName,
      email: normalized.email,
      phone: normalized.phone,
      phone_number: normalized.phone,
    };

    const { data, error } = await sb.from("customers").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    const newId = String(data?.id);
    customerEntityToLiveId.set(entity.id, newId);
    customerPool.push({
      id: newId,
      shop_id: params.shopId,
      external_id: payload.external_id ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      phone_number: payload.phone_number ?? null,
      name: payload.name ?? null,
      first_name: payload.first_name ?? null,
      last_name: payload.last_name ?? null,
      business_name: payload.business_name ?? null,
    } as CustomerRow);
    customersInserted += 1;
  }

  const customerByExternal = new Map<string, string>();
  for (const entity of customerEntities) {
    const normalized = toNormalizedCustomer(entity);
    if (!normalized.externalId) continue;
    const liveId = customerEntityToLiveId.get(entity.id);
    if (liveId) customerByExternal.set(normalizeLookupKey(normalized.externalId), liveId);
  }

  let vehiclesInserted = 0;
  let vehiclesUpdated = 0;
  let vehiclesSkipped = 0;
  for (const entity of vehicleEntities) {
    const normalized = toNormalizedVehicle(entity);
    const raw = (entity.normalized ?? {}) as JsonObject;
    const linkedCustomerId = customerByExternal.get(normalizeLookupKey(raw.sourceCustomerId));
    const { matches, strategy } = vehicleMatchesInPriority({ vehicle: normalized, pool: vehiclePool, linkedCustomerId: linkedCustomerId ?? null });

    if (matches.length > 1) {
      vehiclesSkipped += 1;
      warnings.push(`Vehicle entity ${entity.id} skipped: ambiguous ${strategy} match (${matches.length} rows).`);
      continue;
    }

    if (matches.length === 1) {
      const current = matches[0];
      const update = buildVehicleUpdate(current, normalized);
      vehicleEntityToLiveId.set(entity.id, current.id);
      if (!update) {
        vehiclesSkipped += 1;
        continue;
      }
      const { error } = await sb.from("vehicles").update(update).eq("shop_id", params.shopId).eq("id", current.id);
      if (error) throw new Error(error.message);
      Object.assign(current, update);
      vehiclesUpdated += 1;
      continue;
    }

    const payload: VehicleInsert = {
      shop_id: params.shopId,
      external_id: normalized.externalId,
      customer_id: linkedCustomerId ?? null,
      vin: normalized.vin,
      license_plate: normalized.plate,
      unit_number: normalized.unitNumber,
      year: normalized.year,
      make: normalized.make,
      model: normalized.model,
    };

    const { data, error } = await sb.from("vehicles").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    const newId = String(data?.id);
    vehicleEntityToLiveId.set(entity.id, newId);
    vehiclePool.push({
      id: newId,
      shop_id: params.shopId,
      external_id: payload.external_id ?? null,
      customer_id: payload.customer_id ?? null,
      vin: payload.vin ?? null,
      license_plate: payload.license_plate ?? null,
      unit_number: payload.unit_number ?? null,
      year: payload.year ?? null,
      make: payload.make ?? null,
      model: payload.model ?? null,
    } as VehicleRow);
    vehiclesInserted += 1;
  }

  let customerVehicleLinksCreated = 0;
  const customerVehicleLinksUpdated = 0;
  let customerVehicleLinksSkipped = 0;

  for (const link of links) {
    const from = entityById.get(link.from_entity_id);
    const to = entityById.get(link.to_entity_id);
    const customerEntityId = from?.entity_type === "customer" ? from.id : to?.entity_type === "customer" ? to.id : null;
    const vehicleEntityId = from?.entity_type === "vehicle" ? from.id : to?.entity_type === "vehicle" ? to.id : null;

    if (!customerEntityId || !vehicleEntityId) {
      customerVehicleLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: does not connect staged customer+vehicle entities.`);
      continue;
    }

    const customerId = customerEntityToLiveId.get(customerEntityId);
    const vehicleId = vehicleEntityToLiveId.get(vehicleEntityId);
    if (!customerId || !vehicleId) {
      customerVehicleLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: customer or vehicle was not materialized.`);
      continue;
    }

    const vehicle = vehiclePool.find((row) => row.id === vehicleId);
    if (!vehicle) {
      customerVehicleLinksSkipped += 1;
      continue;
    }

    if (vehicle.customer_id === customerId) {
      customerVehicleLinksSkipped += 1;
      continue;
    }

    if (vehicle.customer_id) {
      customerVehicleLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: vehicle ${vehicleId} already belongs to another customer.`);
      continue;
    }

    const { error } = await sb.from("vehicles").update({ customer_id: customerId }).eq("shop_id", params.shopId).eq("id", vehicleId);
    if (error) throw new Error(error.message);
    vehicle.customer_id = customerId;
    customerVehicleLinksCreated += 1;
  }

  const [{ count: customersAfter, error: customersAfterError }, { count: vehiclesAfter, error: vehiclesAfterError }] = await Promise.all([
    sb.from("customers").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId),
    sb.from("vehicles").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId),
  ]);

  if (customersAfterError) throw new Error(customersAfterError.message);
  if (vehiclesAfterError) throw new Error(vehiclesAfterError.message);

  return {
    ok: true,
    stagedCustomersFound: customerEntities.length,
    stagedVehiclesFound: vehicleEntities.length,
    stagedCustomerVehicleLinksFound: links.length,
    customersInserted,
    customersUpdated,
    customersSkipped,
    vehiclesInserted,
    vehiclesUpdated,
    vehiclesSkipped,
    customerVehicleLinksCreated,
    customerVehicleLinksUpdated,
    customerVehicleLinksSkipped,
    customersBefore: customerPool.length - customersInserted,
    customersAfter: Number(customersAfter ?? customerPool.length),
    vehiclesBefore: vehiclePool.length - vehiclesInserted,
    vehiclesAfter: Number(vehiclesAfter ?? vehiclePool.length),
    warnings,
  };
}
