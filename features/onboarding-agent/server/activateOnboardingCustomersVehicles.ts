import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/features/onboarding-agent/lib/fingerprints";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
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
type OnboardingReviewItemRow = Database["public"]["Tables"]["onboarding_review_items"]["Row"];
type OnboardingReviewItemInsert = Database["public"]["Tables"]["onboarding_review_items"]["Insert"];
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
  customersWithEmail: number;
  customersWithPhone: number;
  customersWithAddress: number;
  customersNameOnly: number;
  customerNameOnlySamples: Array<{ entityId: string; normalizedKeys: string[] }>;
  vehiclesInserted: number;
  vehiclesUpdated: number;
  vehiclesMatchedExisting: number;
  vehiclesSkipped: number;
  vehicleCustomerLinksCreated: number;
  vehicleCustomerLinksUpdated: number;
  vehicleCustomerLinksAlreadyCorrect: number;
  vehicleCustomerLinksAttempted: number;
  vehicleCustomerLinksMaterialized: number;
  vehicleCustomerLinksSkipped: number;
  vehicleCustomerLinksUnresolved: number;
  customersBefore: number;
  customersAfter: number;
  vehiclesBefore: number;
  vehiclesAfter: number;
  liveVehicleCustomerLinksAfter: number;
  customerVehicleLinkIssues: CustomerVehicleLinkIssue[];
  warnings: string[];
};

export type CustomerVehicleLinkIssue = {
  linkId: string;
  fromEntityId: string | null;
  toEntityId: string | null;
  reason:
    | "missing_staged_customer"
    | "missing_staged_vehicle"
    | "customer_not_materialized"
    | "vehicle_not_materialized"
    | "vehicle_linked_to_different_customer"
    | "ambiguous_customer_match"
    | "ambiguous_vehicle_match"
    | "unsupported_link_direction"
    | "unknown";
  stagedCustomerSummary?: {
    entityId: string;
    sourceExternalId?: string | null;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
    businessName?: string | null;
  };
  stagedVehicleSummary?: {
    entityId: string;
    sourceExternalId?: string | null;
    vin?: string | null;
    licensePlate?: string | null;
    unitNumber?: string | null;
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
  };
  liveCustomerId?: string | null;
  liveVehicleId?: string | null;
  currentVehicleCustomerId?: string | null;
  candidateLiveCustomers?: Array<{
    id: string;
    name: string | null;
    businessName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  }>;
  candidateLiveVehicles?: Array<{
    id: string;
    externalId: string | null;
    vin: string | null;
    licensePlate: string | null;
    unitNumber: string | null;
    year: number | null;
    make: string | null;
    model: string | null;
    customerId: string | null;
  }>;
};

type NormalizedCustomer = {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  street: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  externalId: string | null;
  sourceRowId: string | null;
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

type LinkSideIssueReason =
  | "customer_not_materialized"
  | "ambiguous_customer_match"
  | "vehicle_not_materialized"
  | "ambiguous_vehicle_match";

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

function pickAlias(normalized: JsonObject, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = textOrNull(normalized[key]);
    if (value) return value;
  }
  return null;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function collectPayloadLayers(normalized: JsonObject): JsonObject[] {
  const details = asObject(normalized.details);
  const payload = asObject(normalized.payload);
  const nestedDetails = details ? asObject(details.details) : null;
  const nestedPayload = details ? asObject(details.payload) : null;
  return [normalized, details, payload, nestedDetails, nestedPayload].filter(Boolean) as JsonObject[];
}

function pickFromLayers(layers: JsonObject[], ...keys: string[]): string | null {
  for (const layer of layers) {
    const value = pickAlias(layer, ...keys);
    if (value) return value;
  }
  return null;
}

function buildCustomerDisplayName(parts: { businessName: string | null; contactName: string | null; fullName: string | null; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; externalId: string | null; sourceRowId: string | null; }): string | null {
  if (parts.businessName) return parts.businessName;
  if (parts.fullName) return parts.fullName;
  if (parts.contactName) return parts.contactName;
  const person = textOrNull(`${parts.firstName ?? ""} ${parts.lastName ?? ""}`);
  if (person) return person;
  return parts.email ?? parts.phone ?? parts.externalId ?? parts.sourceRowId ?? null;
}

function toNormalizedCustomer(entity: Pick<OnboardingEntityRow, "normalized" | "display_name" | "source_external_id" | "source_row_id">): NormalizedCustomer {
  const normalized = (entity.normalized ?? {}) as JsonObject;
  const layers = collectPayloadLayers(normalized);
  const businessName = pickFromLayers(layers, "businessName", "company_name", "business_name", "company", "companyName", "Company", "Company Name", "Business Name");
  const firstName = pickFromLayers(layers, "firstName", "first_name", "First Name");
  const lastName = pickFromLayers(layers, "lastName", "last_name", "Last Name");
  const contactName = pickFromLayers(layers, "contactName", "contact_name", "contact", "Contact", "Contact Name");
  const fullName = pickFromLayers(layers, "name", "displayName", "display_name", "fullName", "full_name", "Name", "Customer", "Customer Name", "Full Name") ?? textOrNull(entity.display_name);
  const email = normalizeEmail(pickFromLayers(layers, "email", "Email", "email_address", "Email Address", "customer_email", "contact_email"));
  const phone = normalizePhone(pickFromLayers(layers, "phone", "Phone", "phone_number", "Phone Number", "telephone", "Telephone", "work_phone", "contact_phone"));
  const mobilePhone = normalizePhone(pickFromLayers(layers, "mobile", "Mobile", "cell", "Cell", "mobile_phone"));
  return {
    externalId: textOrNull(entity.source_external_id) ?? pickFromLayers(layers, "source_external_id", "sourceExternalId", "sourceCustomerId", "source_customer_id", "customerExternalId"),
    sourceRowId: textOrNull(entity.source_row_id) ?? pickFromLayers(layers, "source_row_id", "sourceRowId"),
    name: buildCustomerDisplayName({ businessName, contactName, fullName, firstName, lastName, email, phone: phone ?? mobilePhone, externalId: textOrNull(entity.source_external_id), sourceRowId: textOrNull(entity.source_row_id) }),
    firstName,
    lastName,
    businessName,
    contactName,
    email,
    phone: phone ?? mobilePhone,
    mobilePhone,
    street: pickFromLayers(layers, "street", "address_line1", "address1", "address_1", "Address1", "address", "Address", "Address 1", "Street", "Street Address"),
    address: pickFromLayers(layers, "address", "address_line2", "address2", "address_2", "billing_address", "billingAddress"),
    city: pickFromLayers(layers, "city", "City"),
    province: pickFromLayers(layers, "province", "state", "State", "Province", "region"),
    postalCode: pickFromLayers(layers, "postalCode", "postal_code", "zip", "zipCode", "ZIP", "Zip Code", "Postal", "Postal Code"),
    country: pickFromLayers(layers, "country", "Country"),
    notes: pickFromLayers(layers, "notes", "Notes", "memo", "Memo", "comment", "comments"),
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

function toStagedCustomerSummary(entity: Pick<OnboardingEntityRow, "id" | "normalized" | "display_name" | "source_external_id" | "source_row_id">) {
  const normalized = toNormalizedCustomer(entity);
  return {
    entityId: entity.id,
    sourceExternalId: normalized.externalId,
    email: normalized.email,
    phone: normalized.phone,
    name: normalized.name ?? null,
    businessName: normalized.businessName,
  };
}

function toStagedVehicleSummary(entity: Pick<OnboardingEntityRow, "id" | "normalized" | "source_external_id">) {
  const normalized = toNormalizedVehicle(entity);
  return {
    entityId: entity.id,
    sourceExternalId: normalized.externalId,
    vin: normalized.vin,
    licensePlate: normalized.plate,
    unitNumber: normalized.unitNumber,
    year: normalized.year,
    make: normalized.make,
    model: normalized.model,
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
  if (isBlank(current.phone_number) && (next.mobilePhone ?? next.phone)) update.phone_number = next.mobilePhone ?? next.phone;
  if (isBlank(current.street) && next.street) update.street = next.street;
  if (isBlank(current.address) && next.address) update.address = next.address;
  if (isBlank(current.city) && next.city) update.city = next.city;
  if (isBlank(current.province) && next.province) update.province = next.province;
  if (isBlank(current.postal_code) && next.postalCode) update.postal_code = next.postalCode;
  if (isBlank(current.notes) && next.notes) update.notes = next.notes;
  if (isBlank(current.source_row_id) && next.sourceRowId) update.source_row_id = next.sourceRowId;

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
    contactName: base.contactName ?? incoming.contactName,
    email: base.email ?? incoming.email,
    phone: base.phone ?? incoming.phone,
    mobilePhone: base.mobilePhone ?? incoming.mobilePhone,
    street: base.street ?? incoming.street,
    address: base.address ?? incoming.address,
    city: base.city ?? incoming.city,
    province: base.province ?? incoming.province,
    postalCode: base.postalCode ?? incoming.postalCode,
    country: base.country ?? incoming.country,
    notes: base.notes ?? incoming.notes,
    sourceRowId: base.sourceRowId ?? incoming.sourceRowId,
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

function buildCustomerCandidates(customerEntities: Array<Pick<OnboardingEntityRow, "id" | "normalized" | "display_name" | "source_external_id" | "source_row_id">>) {
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

function customerLabel(candidate?: {
  businessName?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
} | null) {
  if (!candidate) return "Unknown customer";
  const business = textOrNull(candidate.businessName);
  if (business) return business;
  const fullName = textOrNull(`${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`);
  if (fullName) return fullName;
  const name = textOrNull(candidate.name);
  if (name) return name;
  return textOrNull(candidate.email) ?? textOrNull(candidate.phone) ?? "Unknown customer";
}

function vehicleLabel(candidate?: {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
  unitNumber?: string | null;
} | null) {
  if (!candidate) return "Unknown vehicle";
  const ymm = [candidate.year, candidate.make, candidate.model].filter(Boolean).join(" ").trim();
  if (candidate.vin) return ymm ? `${ymm} — VIN ${candidate.vin}` : `VIN ${candidate.vin}`;
  if (candidate.licensePlate) return ymm ? `${ymm} — Plate ${candidate.licensePlate}` : `Plate ${candidate.licensePlate}`;
  if (candidate.unitNumber) return ymm ? `${ymm} — Unit ${candidate.unitNumber}` : `Unit ${candidate.unitNumber}`;
  return ymm || "Unknown vehicle";
}

function issueReasonLabel(reason: CustomerVehicleLinkIssue["reason"]): string {
  const labels: Record<CustomerVehicleLinkIssue["reason"], string> = {
    missing_staged_customer: "Staged customer entity was missing",
    missing_staged_vehicle: "Staged vehicle entity was missing",
    customer_not_materialized: "Customer was not materialized",
    vehicle_not_materialized: "Vehicle was not materialized",
    vehicle_linked_to_different_customer: "Vehicle already linked to a different customer",
    ambiguous_customer_match: "Customer match was ambiguous",
    ambiguous_vehicle_match: "Vehicle match was ambiguous",
    unsupported_link_direction: "Link direction is unsupported",
    unknown: "Unknown materialization issue",
  };
  return labels[reason] ?? labels.unknown;
}

async function persistUnresolvedLinkReviewItems(args: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  issues: CustomerVehicleLinkIssue[];
}) {
  const sb = args.supabase as any;
  const issueType = "unresolved_customer_vehicle_link";
  const unresolved = args.issues.filter((issue) => issue.reason !== "unknown");
  const unresolvedLinkIds = new Set(unresolved.map((issue) => issue.linkId));

  const { data: existingRows, error: existingError } = await sb
    .from("onboarding_review_items")
    .select("id, link_id, status")
    .eq("shop_id", args.shopId)
    .eq("session_id", args.sessionId)
    .eq("issue_type", issueType);
  if (existingError) throw new Error(existingError.message);

  const existingById = new Map<string, Pick<OnboardingReviewItemRow, "id" | "status" | "link_id">>(
    ((existingRows ?? []) as Array<Pick<OnboardingReviewItemRow, "id" | "status" | "link_id">>).map((row) => [row.id, row]),
  );

  const upserts: OnboardingReviewItemInsert[] = unresolved.map((issue) => {
    const reviewItemId = stableUuidFromParts(["onboarding_review", args.shopId, args.sessionId, issueType, issue.linkId]);
    const existing = existingById.get(reviewItemId);
    const status = existing?.status === "skipped" ? "skipped" : "pending";
    return {
      id: reviewItemId,
      shop_id: args.shopId,
      session_id: args.sessionId,
      link_id: issue.linkId,
      entity_id: issue.stagedVehicleSummary?.entityId ?? issue.stagedCustomerSummary?.entityId ?? null,
      domain: "vehicles",
      issue_type: issueType,
      severity: "medium",
      status,
      summary: `${customerLabel(issue.stagedCustomerSummary)} ↔ ${vehicleLabel(issue.stagedVehicleSummary)}: ${issueReasonLabel(issue.reason)}.`,
      details: {
        stagedLinkId: issue.linkId,
        stagedCustomerEntityId: issue.stagedCustomerSummary?.entityId ?? null,
        stagedVehicleEntityId: issue.stagedVehicleSummary?.entityId ?? null,
        proposedCustomerLabel: customerLabel(issue.stagedCustomerSummary),
        proposedVehicleLabel: vehicleLabel(issue.stagedVehicleSummary),
        reasonCode: issue.reason,
        reasonLabel: issueReasonLabel(issue.reason),
        stagedCustomerSummary: issue.stagedCustomerSummary ?? null,
        stagedVehicleSummary: issue.stagedVehicleSummary ?? null,
        liveCustomerId: issue.liveCustomerId ?? null,
        liveVehicleId: issue.liveVehicleId ?? null,
        currentVehicleCustomerId: issue.currentVehicleCustomerId ?? null,
        candidateLiveCustomers: issue.candidateLiveCustomers ?? [],
        candidateLiveVehicles: issue.candidateLiveVehicles ?? [],
      },
    };
  });

  if (upserts.length > 0) {
    const { error: upsertError } = await sb.from("onboarding_review_items").upsert(upserts, { onConflict: "id" });
    if (upsertError) throw new Error(upsertError.message);
  }

  const stalePendingIds = ((existingRows ?? []) as Array<Pick<OnboardingReviewItemRow, "id" | "status" | "link_id">>)
    .filter((row) => row.status === "pending" && !unresolvedLinkIds.has(String(row.link_id ?? "")))
    .map((row) => row.id);

  for (const id of stalePendingIds) {
    const { error } = await sb
      .from("onboarding_review_items")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        summary: "Unresolved customer/vehicle link no longer requires manual review.",
      })
      .eq("shop_id", args.shopId)
      .eq("session_id", args.sessionId)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
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
    fetchAllRows<Pick<OnboardingEntityRow, "id" | "shop_id" | "session_id" | "entity_type" | "status" | "normalized" | "display_name" | "source_external_id" | "source_row_id">>((from, to) =>
      sb
        .from("onboarding_entities")
        .select("id, shop_id, session_id, entity_type, status, normalized, display_name, source_external_id, source_row_id")
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
        .select("id, shop_id, external_id, email, phone, phone_number, name, first_name, last_name, business_name, street, address, city, province, postal_code, notes, source_row_id")
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
  const customerEntitySkippedReason = new Map<string, LinkSideIssueReason>();
  const vehicleEntityToLiveId = new Map<string, string>();
  const vehicleEntitySkippedReason = new Map<string, LinkSideIssueReason>();
  const customerVehicleLinkIssues: CustomerVehicleLinkIssue[] = [];

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
      customerEntitySkippedReason.set(candidate.canonicalEntityId, "ambiguous_customer_match");
      for (const duplicateEntityId of candidate.entityIds) {
        customerEntitySkippedReason.set(duplicateEntityId, "ambiguous_customer_match");
      }
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
      phone_number: normalized.mobilePhone ?? normalized.phone,
      street: normalized.street,
      address: normalized.address,
      city: normalized.city,
      province: normalized.province,
      postal_code: normalized.postalCode,
      notes: normalized.notes,
      source_row_id: normalized.sourceRowId,
    };

    const { data, error } = await sb.from("customers").insert(payload).select("id").single();
    if (error) {
      if (!normalized.email || !isCustomerEmailUniqueViolation(error)) throw new Error(error.message);
      const recovered = (await fetchAllRows<CustomerRow>((from, to) =>
        sb
          .from("customers")
          .select("id, shop_id, external_id, email, phone, phone_number, name, first_name, last_name, business_name, street, address, city, province, postal_code, notes, source_row_id")
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
      for (const duplicateEntityId of candidate.entityIds) {
        customerEntitySkippedReason.set(duplicateEntityId, "ambiguous_customer_match");
      }
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
      street: payload.street ?? null,
      address: payload.address ?? null,
      city: payload.city ?? null,
      province: payload.province ?? null,
      postal_code: payload.postal_code ?? null,
      notes: payload.notes ?? null,
      source_row_id: payload.source_row_id ?? null,
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
      vehicleEntitySkippedReason.set(entity.id, "ambiguous_vehicle_match");
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
  let vehicleCustomerLinksAttempted = 0;
  const vehicleById = new Map(vehiclePool.map((row) => [row.id, row]));

  for (const link of links) {
    vehicleCustomerLinksAttempted += 1;
    const from = entityById.get(link.from_entity_id);
    const to = entityById.get(link.to_entity_id);
    const customerEntity = from?.entity_type === "customer" ? from : to?.entity_type === "customer" ? to : null;
    const vehicleEntity = from?.entity_type === "vehicle" ? from : to?.entity_type === "vehicle" ? to : null;
    const customerEntityId = customerEntity?.id ?? null;
    const vehicleEntityId = vehicleEntity?.id ?? null;

    if (!customerEntityId || !vehicleEntityId) {
      vehicleCustomerLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: does not connect staged customer+vehicle entities.`);
      customerVehicleLinkIssues.push({
        linkId: link.id,
        fromEntityId: link.from_entity_id,
        toEntityId: link.to_entity_id,
        reason: !customerEntityId && !vehicleEntityId ? "unsupported_link_direction" : !customerEntityId ? "missing_staged_customer" : "missing_staged_vehicle",
        stagedCustomerSummary: customerEntity ? toStagedCustomerSummary(customerEntity) : undefined,
        stagedVehicleSummary: vehicleEntity ? toStagedVehicleSummary(vehicleEntity) : undefined,
      });
      continue;
    }

    const customerId = customerEntityToLiveId.get(customerEntityId);
    const vehicleId = vehicleEntityToLiveId.get(vehicleEntityId);
    const customerEntityRow = customerEntity!;
    const vehicleEntityRow = vehicleEntity!;
    if (!customerId || !vehicleId) {
      vehicleCustomerLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: customer or vehicle was not materialized.`);
      const reason = !customerId
        ? (customerEntitySkippedReason.get(customerEntityId) ?? "customer_not_materialized")
        : (vehicleEntitySkippedReason.get(vehicleEntityId) ?? "vehicle_not_materialized");
      customerVehicleLinkIssues.push({
        linkId: link.id,
        fromEntityId: link.from_entity_id,
        toEntityId: link.to_entity_id,
        reason,
        stagedCustomerSummary: toStagedCustomerSummary(customerEntityRow),
        stagedVehicleSummary: toStagedVehicleSummary(vehicleEntityRow),
        liveCustomerId: customerId ?? null,
        liveVehicleId: vehicleId ?? null,
        candidateLiveCustomers: customerEntitySkippedReason.get(customerEntityId) === "ambiguous_customer_match"
          ? customerPool
            .filter((row) => {
              const normalized = toNormalizedCustomer(customerEntityRow);
              return (
                (normalized.email && normalizeEmail(row.email) === normalized.email)
                || (normalized.phone && normalizePhone(row.phone ?? row.phone_number) === normalized.phone)
                || (normalized.externalId && normalizeLookupKey(row.external_id) === normalizeLookupKey(normalized.externalId))
              );
            })
            .slice(0, 10)
            .map((row) => ({
              id: row.id,
              name: row.name,
              businessName: row.business_name,
              firstName: row.first_name,
              lastName: row.last_name,
              email: row.email,
              phone: row.phone ?? row.phone_number,
            }))
          : [],
        candidateLiveVehicles: vehicleEntitySkippedReason.get(vehicleEntityId) === "ambiguous_vehicle_match"
          ? vehiclePool
            .filter((row) => {
              const normalizedVehicle = toNormalizedVehicle(vehicleEntityRow);
              return (
                (normalizedVehicle.vin && normalizeVin(row.vin) === normalizedVehicle.vin)
                || (normalizedVehicle.plate && normalizePlate(row.license_plate) === normalizedVehicle.plate)
                || (normalizedVehicle.externalId && normalizeLookupKey(row.external_id) === normalizeLookupKey(normalizedVehicle.externalId))
              );
            })
            .slice(0, 10)
            .map((row) => ({
              id: row.id,
              externalId: row.external_id,
              vin: row.vin,
              licensePlate: row.license_plate,
              unitNumber: row.unit_number,
              year: row.year,
              make: row.make,
              model: row.model,
              customerId: row.customer_id,
            }))
          : [],
      });
      continue;
    }

    const vehicle = vehicleById.get(vehicleId);
    if (!vehicle) {
      vehicleCustomerLinksSkipped += 1;
      customerVehicleLinkIssues.push({
        linkId: link.id,
        fromEntityId: link.from_entity_id,
        toEntityId: link.to_entity_id,
        reason: "unknown",
        stagedCustomerSummary: customerEntity ? toStagedCustomerSummary(customerEntity) : undefined,
        stagedVehicleSummary: vehicleEntity ? toStagedVehicleSummary(vehicleEntity) : undefined,
        liveCustomerId: customerId,
        liveVehicleId: vehicleId,
      });
      continue;
    }

    if (vehicle.customer_id === customerId) {
      vehicleCustomerLinksAlreadyCorrect += 1;
      continue;
    }

    if (vehicle.customer_id) {
      vehicleCustomerLinksSkipped += 1;
      warnings.push(`Link ${link.id} skipped: vehicle ${vehicleId} already belongs to another customer.`);
      customerVehicleLinkIssues.push({
        linkId: link.id,
        fromEntityId: link.from_entity_id,
        toEntityId: link.to_entity_id,
        reason: "vehicle_linked_to_different_customer",
        stagedCustomerSummary: customerEntity ? toStagedCustomerSummary(customerEntity) : undefined,
        stagedVehicleSummary: vehicleEntity ? toStagedVehicleSummary(vehicleEntity) : undefined,
        liveCustomerId: customerId,
        liveVehicleId: vehicleId,
        currentVehicleCustomerId: vehicle.customer_id,
      });
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

  await persistUnresolvedLinkReviewItems({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
    issues: customerVehicleLinkIssues,
  });

  const [{ count: customersAfter, error: customersAfterError }, { count: vehiclesAfter, error: vehiclesAfterError }, { count: liveVehicleCustomerLinksAfter, error: liveVehicleCustomerLinksAfterError }] = await Promise.all([
    sb.from("customers").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId),
    sb.from("vehicles").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId),
    sb.from("vehicles").select("id", { head: true, count: "exact" }).eq("shop_id", params.shopId).not("customer_id", "is", null),
  ]);

  if (customersAfterError) throw new Error(customersAfterError.message);
  if (vehiclesAfterError) throw new Error(vehiclesAfterError.message);
  if (liveVehicleCustomerLinksAfterError) throw new Error(liveVehicleCustomerLinksAfterError.message);

  const customerExtraction = customerCandidates.map((candidate) => ({
    entityId: candidate.canonicalEntityId,
    normalizedKeys: Object.keys(((customerEntities.find((e) => e.id === candidate.canonicalEntityId)?.normalized ?? {}) as JsonObject)).sort(),
    normalized: candidate.normalized,
  }));
  const customersWithEmail = customerExtraction.filter((row) => row.normalized.email).length;
  const customersWithPhone = customerExtraction.filter((row) => row.normalized.phone || row.normalized.mobilePhone).length;
  const customersWithAddress = customerExtraction.filter((row) => row.normalized.street || row.normalized.city || row.normalized.province || row.normalized.postalCode).length;
  const nameOnlyRows = customerExtraction.filter((row) => row.normalized.name && !row.normalized.email && !row.normalized.phone && !row.normalized.mobilePhone && !row.normalized.street && !row.normalized.city && !row.normalized.province && !row.normalized.postalCode);
  const customerNameOnlySamples = nameOnlyRows.slice(0, 5).map((row) => ({ entityId: row.entityId, normalizedKeys: row.normalizedKeys }));
  const customersSkipped = customersSkippedDuplicateStaged + customersSkippedAmbiguous;
  const vehicleCustomerLinksMaterialized = vehicleCustomerLinksCreated + vehicleCustomerLinksUpdated + vehicleCustomerLinksAlreadyCorrect;
  const vehicleCustomerLinksUnresolved = links.length - vehicleCustomerLinksMaterialized;

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
    customersWithEmail,
    customersWithPhone,
    customersWithAddress,
    customersNameOnly: nameOnlyRows.length,
    customerNameOnlySamples,
    vehiclesInserted,
    vehiclesUpdated,
    vehiclesMatchedExisting,
    vehiclesSkipped,
    vehicleCustomerLinksCreated,
    vehicleCustomerLinksUpdated,
    vehicleCustomerLinksAlreadyCorrect,
    vehicleCustomerLinksAttempted,
    vehicleCustomerLinksMaterialized,
    vehicleCustomerLinksSkipped,
    vehicleCustomerLinksUnresolved,
    customersBefore,
    customersAfter: Number(customersAfter ?? customerPool.length),
    vehiclesBefore,
    vehiclesAfter: Number(vehiclesAfter ?? vehiclePool.length),
    liveVehicleCustomerLinksAfter: Number(liveVehicleCustomerLinksAfter ?? vehiclePool.filter((row) => row.customer_id !== null).length),
    customerVehicleLinkIssues,
    warnings,
  };
}
