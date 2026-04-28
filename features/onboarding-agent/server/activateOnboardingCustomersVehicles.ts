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
const PAGE_SIZE = 1000;

export type CustomerVehicleActivationResult = {
  ok: true;
  stagedCustomersFound: number;
  customerActivationCandidates: number;
  stagedVehiclesFound: number;
  stagedCustomerVehicleLinksFound: number;
  customersInserted: number;
  customersUpdated: number;
  customersMatchedExisting: number;
  customersSkippedDuplicateStaged: number;
  customersSkippedAmbiguous: number;
  customersRecoveredFromUniqueConflict: number;
  customersSkipped: number;
  vehiclesInserted: number;
  vehiclesUpdated: number;
  vehiclesMatchedExisting: number;
  vehiclesSkipped: number;
  vehicleCustomerLinksCreated: number;
  vehicleCustomerLinksUpdated: number;
  vehicleCustomerLinksAlreadyCorrect: number;
  vehicleCustomerLinksSkipped: number;
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

type StagedCustomerCandidate = {
  key: string;
  canonicalEntityId: string;
  entityIds: string[];
  normalized: NormalizedCustomer;
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

function getCustomerNameBusinessKey(customer: NormalizedCustomer): string | null {
  return normalizeLookupKey(customer.businessName ?? customer.name) || null;
}

function getRowNameBusinessKey(row: CustomerRow): string | null {
  return normalizeLookupKey(row.business_name || row.name || `${row.first_name ?? ""} ${row.last_name ?? ""}`) || null;
}

function mergeNormalizedCustomers(base: NormalizedCustomer, incoming: NormalizedCustomer): NormalizedCustomer {
  return {
    externalId: base.externalId ?? incoming.externalId,
    name: base.name ?? incoming.name,
    firstName: base.firstName ?? incoming.firstName,
    lastName: base.lastName ?? incoming.lastName,
    businessName: base.businessName ?? incoming.businessName,
    email: base.email ?? incoming.email,
    phone: base.phone ?? incoming.phone,
  };
}

function stagedIdentityKey(customer: NormalizedCustomer): string {
  if (customer.email) return `email:${customer.email}`;
  if (customer.externalId) return `external:${normalizeLookupKey(customer.externalId)}`;
  if (customer.phone) return `phone:${customer.phone}`;
  const nameKey = getCustomerNameBusinessKey(customer);
  if (nameKey) return `name:${nameKey}`;
  return "fallback:unknown";
}

function buildCustomerCandidates(customerEntities: Array<Pick<OnboardingEntityRow, "id" | "normalized" | "display_name" | "source_external_id">>) {
  const byKey = new Map<string, StagedCustomerCandidate>();
  let customersSkippedDuplicateStaged = 0;

  for (const entity of customerEntities) {
    const normalized = toNormalizedCustomer(entity);
    const key = stagedIdentityKey(normalized);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        key,
        canonicalEntityId: entity.id,
        entityIds: [entity.id],
        normalized,
      });
      continue;
    }

    existing.entityIds.push(entity.id);
    existing.normalized = mergeNormalizedCustomers(existing.normalized, normalized);
    customersSkippedDuplicateStaged += 1;
  }

  return {
    candidates: [...byKey.values()],
    customersSkippedDuplicateStaged,
  };
}

function addIndexEntry(index: Map<string, CustomerRow[]>, key: string | null, row: CustomerRow) {
  if (!key) return;
  const next = index.get(key) ?? [];
  next.push(row);
  index.set(key, next);
}

function buildLiveCustomerIndexes(rows: CustomerRow[]) {
  const byExternalId = new Map<string, CustomerRow[]>();
  const byEmail = new Map<string, CustomerRow[]>();
  const byPhone = new Map<string, CustomerRow[]>();
  const byNameBusiness = new Map<string, CustomerRow[]>();

  for (const row of rows) {
    addIndexEntry(byExternalId, normalizeLookupKey(row.external_id), row);
    addIndexEntry(byEmail, normalizeEmail(row.email), row);
    addIndexEntry(byPhone, normalizePhone(row.phone ?? row.phone_number), row);
    addIndexEntry(byNameBusiness, getRowNameBusinessKey(row), row);
  }

  return { byExternalId, byEmail, byPhone, byNameBusiness };
}

function pickLiveCustomerMatch(candidate: NormalizedCustomer, indexes: ReturnType<typeof buildLiveCustomerIndexes>) {
  const matchedRowsById = new Map<string, CustomerRow>();
  const externalMatches = candidate.externalId ? (indexes.byExternalId.get(normalizeLookupKey(candidate.externalId)) ?? []) : [];

  for (const row of externalMatches) matchedRowsById.set(row.id, row);
  if (candidate.email) for (const row of indexes.byEmail.get(candidate.email) ?? []) matchedRowsById.set(row.id, row);
  if (candidate.phone) for (const row of indexes.byPhone.get(candidate.phone) ?? []) matchedRowsById.set(row.id, row);
  const nameKey = getCustomerNameBusinessKey(candidate);
  if (nameKey) {
    const nameMatches = indexes.byNameBusiness.get(nameKey) ?? [];
    if (nameMatches.length === 1) matchedRowsById.set(nameMatches[0]!.id, nameMatches[0]!);
  }

  if (externalMatches.length === 1) {
    return { row: externalMatches[0]!, ambiguous: false, strategy: "external_id" as const };
  }

  if (externalMatches.length > 1) {
    return { row: null, ambiguous: true, strategy: "external_id" as const };
  }

  if (matchedRowsById.size > 1) {
    return { row: null, ambiguous: true, strategy: "multi_key" as const };
  }

  if (candidate.email) {
    const emailMatches = indexes.byEmail.get(candidate.email) ?? [];
    if (emailMatches.length > 1) return { row: null, ambiguous: true, strategy: "email" as const };
  }

  const [single] = [...matchedRowsById.values()];
  return { row: single ?? null, ambiguous: false, strategy: "single_key" as const };
}

function isCustomerEmailUniqueViolation(error: { message?: string; code?: string; details?: string } | null): boolean {
  if (!error) return false;
  const haystack = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return haystack.includes("customers_shop_email_uq") || haystack.includes("duplicate key value") || haystack.includes("23505");
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
  async function fetchAllRows<T>(buildQuery: (from: number, to: number) => any): Promise<T[]> {
    const rows: T[] = [];
    let from = 0;
    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await buildQuery(from, to);
      if (error) throw new Error(error.message);
      const batch = (data ?? []) as T[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return rows;
  }

  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const [entities, links, customerPool, vehiclePool] = await Promise.all([
    fetchAllRows<Pick<OnboardingEntityRow, "id" | "shop_id" | "session_id" | "entity_type" | "status" | "normalized" | "display_name" | "source_external_id">>((from, to) =>
      sb
        .from("onboarding_entities")
        .select("id, shop_id, session_id, entity_type, status, normalized, display_name, source_external_id")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .in("entity_type", ["customer", "vehicle"])
        .eq("status", "ready")
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllRows<Pick<OnboardingEntityLinkRow, "id" | "shop_id" | "session_id" | "from_entity_id" | "to_entity_id" | "link_type">>((from, to) =>
      sb
        .from("onboarding_entity_links")
        .select("id, shop_id, session_id, from_entity_id, to_entity_id, link_type")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .eq("link_type", "customer_vehicle")
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllRows<CustomerRow>((from, to) =>
      sb
        .from("customers")
        .select("id, shop_id, external_id, email, phone, phone_number, name, first_name, last_name, business_name")
        .eq("shop_id", params.shopId)
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllRows<VehicleRow>((from, to) =>
      sb
        .from("vehicles")
        .select("id, shop_id, external_id, vin, license_plate, unit_number, year, make, model, customer_id")
        .eq("shop_id", params.shopId)
        .order("id", { ascending: true })
        .range(from, to)),
  ]);

  const customersBefore = customerPool.length;
  const vehiclesBefore = vehiclePool.length;

  const customerEntities = entities.filter((entity) => entity.entity_type === "customer" && entity.status === "ready");
  const vehicleEntities = entities.filter((entity) => entity.entity_type === "vehicle" && entity.status === "ready");
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));

  const warnings: string[] = [];
  const customerEntityToLiveId = new Map<string, string>();
  const vehicleEntityToLiveId = new Map<string, string>();

  const { candidates: customerCandidates, customersSkippedDuplicateStaged } = buildCustomerCandidates(customerEntities);
  const indexes = buildLiveCustomerIndexes(customerPool);

  let customersInserted = 0;
  let customersUpdated = 0;
  let customersSkippedAmbiguous = 0;
  let customersMatchedExisting = 0;
  let customersRecoveredFromUniqueConflict = 0;
  for (const candidate of customerCandidates) {
    const normalized = candidate.normalized;
    const match = pickLiveCustomerMatch(normalized, indexes);

    if (match.ambiguous) {
      customersSkippedAmbiguous += 1;
      warnings.push(`Customer candidate ${candidate.canonicalEntityId} skipped: ambiguous ${match.strategy} live match.`);
      continue;
    }

    if (match.row) {
      const update = buildCustomerUpdate(match.row, normalized);
      for (const entityId of candidate.entityIds) customerEntityToLiveId.set(entityId, match.row.id);
      if (!update) {
        customersMatchedExisting += 1;
        continue;
      }
      const { error } = await sb.from("customers").update(update).eq("shop_id", params.shopId).eq("id", match.row.id);
      if (error) throw new Error(error.message);
      Object.assign(match.row, update);
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
    if (error) {
      if (!normalized.email || !isCustomerEmailUniqueViolation(error)) throw new Error(error.message);
      const recovered = (await fetchAllRows<CustomerRow>((from, to) =>
        sb
          .from("customers")
          .select("id, shop_id, external_id, email, phone, phone_number, name, first_name, last_name, business_name")
          .eq("shop_id", params.shopId)
          .eq("email", normalized.email)
          .order("id", { ascending: true })
          .range(from, to)))
        .filter((row) => normalizeEmail(row.email) === normalized.email);

      if (recovered.length === 1) {
        const recoveredRow = recovered[0]!;
        const update = buildCustomerUpdate(recoveredRow, normalized);
        if (update) {
          const updateResult = await sb.from("customers").update(update).eq("shop_id", params.shopId).eq("id", recoveredRow.id);
          if (updateResult.error) throw new Error(updateResult.error.message);
          Object.assign(recoveredRow, update);
          customersUpdated += 1;
        } else {
          customersMatchedExisting += 1;
        }
        for (const entityId of candidate.entityIds) customerEntityToLiveId.set(entityId, recoveredRow.id);
        customersRecoveredFromUniqueConflict += 1;
        continue;
      }

      warnings.push(`Customer candidate ${candidate.canonicalEntityId} skipped: unique conflict recovery failed for email ${normalized.email}.`);
      customersSkippedAmbiguous += 1;
      continue;
    }

    const newId = String(data?.id);
    for (const entityId of candidate.entityIds) customerEntityToLiveId.set(entityId, newId);
    const newRow = {
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
    } as CustomerRow;
    customerPool.push(newRow);
    addIndexEntry(indexes.byExternalId, normalizeLookupKey(newRow.external_id), newRow);
    addIndexEntry(indexes.byEmail, normalizeEmail(newRow.email), newRow);
    addIndexEntry(indexes.byPhone, normalizePhone(newRow.phone ?? newRow.phone_number), newRow);
    addIndexEntry(indexes.byNameBusiness, getRowNameBusinessKey(newRow), newRow);
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
  let vehiclesMatchedExisting = 0;
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
      const current = matches[0]!;
      const update = buildVehicleUpdate(current, normalized);
      vehicleEntityToLiveId.set(entity.id, current.id);
      if (!update) {
        vehiclesMatchedExisting += 1;
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

  let vehicleCustomerLinksCreated = 0;
  let vehicleCustomerLinksUpdated = 0;
  let vehicleCustomerLinksAlreadyCorrect = 0;
  let vehicleCustomerLinksSkipped = 0;
  const vehicleById = new Map(vehiclePool.map((row) => [row.id, row]));

  for (const link of links) {
    const from = entityById.get(link.from_entity_id);
    const to = entityById.get(link.to_entity_id);
    const customerEntityId = from?.entity_type === "customer" ? from.id : to?.entity_type === "customer" ? to.id : null;
    const vehicleEntityId = from?.entity_type === "vehicle" ? from.id : to?.entity_type === "vehicle" ? to.id : null;

    if (!customerEntityId || !vehicleEntityId) {
      vehicleCustomerLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: does not connect staged customer+vehicle entities.`);
      continue;
    }

    const customerId = customerEntityToLiveId.get(customerEntityId);
    const vehicleId = vehicleEntityToLiveId.get(vehicleEntityId);
    if (!customerId || !vehicleId) {
      vehicleCustomerLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: customer or vehicle was not materialized.`);
      continue;
    }

    const vehicle = vehicleById.get(vehicleId);
    if (!vehicle) {
      vehicleCustomerLinksSkipped += 1;
      continue;
    }

    if (vehicle.customer_id === customerId) {
      vehicleCustomerLinksAlreadyCorrect += 1;
      continue;
    }

    if (vehicle.customer_id) {
      vehicleCustomerLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: vehicle ${vehicleId} already belongs to another customer.`);
      continue;
    }

    const { error } = await sb.from("vehicles").update({ customer_id: customerId }).eq("shop_id", params.shopId).eq("id", vehicleId);
    if (error) throw new Error(error.message);
    if (vehicle.customer_id === null) {
      vehicleCustomerLinksCreated += 1;
    } else {
      vehicleCustomerLinksUpdated += 1;
    }
    vehicle.customer_id = customerId;
  }

  const [{ count: customersAfter, error: customersAfterError }, { count: vehiclesAfter, error: vehiclesAfterError }] = await Promise.all([
    sb.from("customers").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId),
    sb.from("vehicles").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId),
  ]);

  if (customersAfterError) throw new Error(customersAfterError.message);
  if (vehiclesAfterError) throw new Error(vehiclesAfterError.message);

  const customersSkipped = customersSkippedDuplicateStaged + customersSkippedAmbiguous;

  return {
    ok: true,
    stagedCustomersFound: customerEntities.length,
    customerActivationCandidates: customerCandidates.length,
    stagedVehiclesFound: vehicleEntities.length,
    stagedCustomerVehicleLinksFound: links.length,
    customersInserted,
    customersUpdated,
    customersMatchedExisting,
    customersSkippedDuplicateStaged,
    customersSkippedAmbiguous,
    customersRecoveredFromUniqueConflict,
    customersSkipped,
    vehiclesInserted,
    vehiclesUpdated,
    vehiclesMatchedExisting,
    vehiclesSkipped,
    vehicleCustomerLinksCreated,
    vehicleCustomerLinksUpdated,
    vehicleCustomerLinksAlreadyCorrect,
    vehicleCustomerLinksSkipped,
    customersBefore,
    customersAfter: Number(customersAfter ?? customerPool.length),
    vehiclesBefore,
    vehiclesAfter: Number(vehiclesAfter ?? vehiclePool.length),
    warnings,
  };
}
