import type { SupabaseClient } from "@supabase/supabase-js";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import { fetchAllPaginatedRows } from "@/features/onboarding-agent/server/fetchAllPaginatedRows";
import { upsertOnboardingReviewItems } from "@/features/onboarding-agent/server/upsertOnboardingReviewItems";
import type { Database } from "@/features/shared/types/types/supabase";

type OnboardingEntityRow = Database["public"]["Tables"]["onboarding_entities"]["Row"];
type EntityShape = Pick<OnboardingEntityRow, "id" | "entity_type" | "status" | "source_row_id" | "source_external_id" | "normalized" | "display_name">;
type OnboardingEntityLinkRow = Database["public"]["Tables"]["onboarding_entity_links"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderInsert = Database["public"]["Tables"]["work_orders"]["Insert"];
type WorkOrderLineInsert = Database["public"]["Tables"]["work_order_lines"]["Insert"];
type OnboardingReviewItemInsert = Database["public"]["Tables"]["onboarding_review_items"]["Insert"];

const HISTORICAL_WORK_ORDER_STATUS: WorkOrderInsert["status"] = "completed";
const HISTORICAL_WORK_ORDER_TYPE: NonNullable<WorkOrderInsert["type"]> = "historical_import";

type HistoryActivationResult = {
  ok: true;
  stagedHistoryRows: number;
  historicalWorkOrdersCreated: number;
  existingMatched: number;
  linesCreated: number;
  customerLinksResolved: number;
  vehicleLinksResolved: number;
  skipped: number;
  skippedUnresolved: number;
  skippedMissingCustomer: number;
  skippedMissingVehicle: number;
  skippedMissingIdentifier: number;
  skippedInvalidDate: number;
  skippedInvalidTotal: number;
  needsReview: number;
  reviewItemsAttempted: number;
  reviewItemsPersisted: number;
  reviewItemsReused: number;
  reviewItemsCreated: number;
  reviewItemsOpenForDomain: number;
  customerWorkOrderLinks: number;
  vehicleWorkOrderLinks: number;
  resolvedViaCustomerWorkOrderLink: number;
  resolvedViaVehicleWorkOrderLink: number;
  resolvedCustomerLiveIds: number;
  resolvedVehicleLiveIds: number;
  unresolvedDueToMissingCustomerLink: number;
  unresolvedDueToMissingVehicleLink: number;
  unresolvedDueToMissingLiveCustomer: number;
  unresolvedDueToMissingLiveVehicle: number;
  diagnostics: {
    runtime: {
      activationModule: string;
      diagnosticVersion: string;
      executedAt: string;
    };
    stagedHistoryRows: number;
    customerWorkOrderLinks: number;
    vehicleWorkOrderLinks: number;
    historyRowsWithCustomerLink: number;
    historyRowsWithVehicleLink: number;
    linkedCustomerStagedEntitiesFound: number;
    linkedVehicleStagedEntitiesFound: number;
    linkedCustomerLiveResolved: number;
    linkedVehicleLiveResolved: number;
    rowsWithBothLiveCustomerAndVehicle: number;
    rowsMissingLiveCustomer: number;
    rowsMissingLiveVehicle: number;
    rowsMissingBoth: number;
    rowsInvalidDate: number;
    rowsMissingRequiredIdentifier: number;
    workOrdersCreated: number;
    workOrdersMatchedExisting: number;
    linkEndpointEntityTypesByCount: Record<string, number>;
    customerWorkOrderEndpointTypesByCount: Record<string, number>;
    vehicleWorkOrderEndpointTypesByCount: Record<string, number>;
    linksPointingToFetchedHistoryIdsFrom: number;
    linksPointingToFetchedHistoryIdsTo: number;
    linksPointingToDiscoveredHistoryLikeEntities: number;
    discoveredHistoryLikeEntityCount: number;
    discoveredCustomerLikeEntityCount: number;
    discoveredVehicleLikeEntityCount: number;
    historyLinkedViaSparseDuplicateCount: number;
    historyLinkedViaCanonicalEntityCount: number;
    firstFiveLinkEndpointSamples: Array<{
      linkId: string;
      linkType: string;
      fromEntityId: string;
      toEntityId: string;
      fromEntityType: string | null;
      toEntityType: string | null;
      fromStatus: string | null;
      toStatus: string | null;
      fromSourceRowId: string | null;
      toSourceRowId: string | null;
      fromSourceExternalId: string | null;
      toSourceExternalId: string | null;
    }>;
    unresolvedSamples: Array<{
      historyEntityId: string;
      sourceRowId: string | null;
      sourceExternalId: string | null;
      hasCustomerLink: boolean;
      hasVehicleLink: boolean;
      linkedCustomerEntityId: string | null;
      linkedVehicleEntityId: string | null;
      customerResolutionAttemptedKeys: string[];
      vehicleResolutionAttemptedKeys: string[];
      finalSkipReason: string;
    }>;
  };
  warnings: string[];
};

type NormalizedHistory = {
  sourceWorkOrderId: string | null;
  invoiceNumber: string | null;
  openedDate: string | null;
  closedDate: string | null;
  customerName: string | null;
  customerEmail: string | null;
  sourceCustomerId: string | null;
  sourceVehicleId: string | null;
  vehicleVin: string | null;
  vehiclePlate: string | null;
  complaint: string | null;
  correction: string | null;
  laborTotal: number | null;
  total: number | null;
};
type NormalizedCustomer = {
  sourceCustomerId: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
};
type NormalizedVehicle = {
  sourceVehicleId: string | null;
  vin: string | null;
  plate: string | null;
  unitNumber: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
};

function customerIdentityKey(input: NormalizedCustomer): string | null {
  if (input.email) return `email:${normalizeLookup(input.email)}`;
  if (input.sourceCustomerId) return `external:${normalizeLookup(input.sourceCustomerId)}`;
  if (input.phone) return `phone:${input.phone}`;
  if (input.name) return `name:${normalizeLookup(input.name)}`;
  return null;
}

function vehicleIdentityKey(input: NormalizedVehicle): string | null {
  if (input.vin) return `vin:${normalizeVin(input.vin)}`;
  if (input.sourceVehicleId) return `external:${normalizeLookup(input.sourceVehicleId)}`;
  if (input.plate) return `plate:${normalizePlate(input.plate)}`;
  if (input.unitNumber) return `unit:${normalizeLookup(input.unitNumber)}`;
  const descriptor = vehicleDescriptorKey(input);
  return descriptor ? `descriptor:${descriptor}` : null;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLookup(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[\s\-_.]+/g, " ").trim();
}

function parseMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = normalizeText(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const mdY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    const yearRaw = Number(mdY[3]);
    const year = yearRaw < 100 ? yearRaw + 2000 : yearRaw;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type ResolveLiveIdResult = { id: string | null; ambiguous: boolean };

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeText(value).toLowerCase();
  return normalized || null;
}
function normalizePhone(value: unknown): string | null {
  const digits = normalizeText(value).replace(/\D+/g, "");
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
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
  const cleaned = normalizeText(value).replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
function toNormalizedCustomer(entity: Pick<OnboardingEntityRow, "source_external_id" | "display_name" | "normalized"> | null): NormalizedCustomer {
  const normalized = ((entity?.normalized ?? {}) as Record<string, unknown>);
  return {
    sourceCustomerId: normalizeText(entity?.source_external_id ?? normalized.sourceCustomerId) || null,
    email: normalizeEmail(normalized.email),
    phone: normalizePhone(normalized.phone),
    name: normalizeText(normalized.businessName ?? normalized.name ?? entity?.display_name) || null,
  };
}
function toNormalizedVehicle(entity: Pick<OnboardingEntityRow, "source_external_id" | "normalized"> | null): NormalizedVehicle {
  const normalized = ((entity?.normalized ?? {}) as Record<string, unknown>);
  return {
    sourceVehicleId: normalizeText(entity?.source_external_id ?? normalized.sourceVehicleId) || null,
    vin: normalizeVin(normalized.vin),
    plate: normalizePlate(normalized.plate ?? normalized.licensePlate ?? normalized.vehiclePlate),
    unitNumber: normalizeLookup(normalized.unitNumber ?? normalized.vehicleUnitNumber),
    year: normalizeNumber(normalized.year),
    make: normalizeLookup(normalized.make),
    model: normalizeLookup(normalized.model),
  };
}
function vehicleDescriptorKey(input: { year: number | null; make: string | null; model: string | null }): string | null {
  if (!input.year || !input.make || !input.model) return null;
  return `${input.year}|${input.make}|${input.model}`;
}

function pushMapValue(map: Map<string, Set<string>>, key: string | null, value: string) {
  if (!key) return;
  const next = map.get(key) ?? new Set<string>();
  next.add(value);
  map.set(key, next);
}

function mapSingleValue(map: Map<string, Set<string>>, key: string | null): { id: string | null; ambiguous: boolean } {
  if (!key) return { id: null, ambiguous: false };
  const values = map.get(key);
  if (!values || values.size === 0) return { id: null, ambiguous: false };
  if (values.size === 1) return { id: [...values][0] ?? null, ambiguous: false };
  return { id: null, ambiguous: true };
}

function resolveLiveCustomerIdFromStagedEntity(stagedEntity: Pick<OnboardingEntityRow, "source_external_id" | "display_name" | "normalized"> | null, customerRows: CustomerRow[]): ResolveLiveIdResult {
  if (!stagedEntity) return { id: null, ambiguous: false };
  const normalized = toNormalizedCustomer(stagedEntity);
  const matches = customerRows.filter((row) =>
    (normalized.sourceCustomerId && normalizeLookup(row.external_id) === normalizeLookup(normalized.sourceCustomerId))
    || (normalized.email && normalizeLookup(row.email) === normalizeLookup(normalized.email))
    || (normalized.phone && normalizePhone(row.phone ?? row.phone_number) === normalized.phone)
    || (normalized.name && normalizeLookup(row.business_name || row.name || `${row.first_name ?? ""} ${row.last_name ?? ""}`) === normalizeLookup(normalized.name)));
  if (matches.length === 1) return { id: matches[0]!.id, ambiguous: false };
  return { id: null, ambiguous: matches.length > 1 };
}

function resolveLiveVehicleIdFromStagedEntity(stagedEntity: Pick<OnboardingEntityRow, "source_external_id" | "normalized"> | null, vehicleRows: VehicleRow[]): ResolveLiveIdResult {
  if (!stagedEntity) return { id: null, ambiguous: false };
  const normalized = toNormalizedVehicle(stagedEntity);
  const descriptor = vehicleDescriptorKey(normalized);
  const matches = vehicleRows.filter((row) =>
    (normalized.sourceVehicleId && normalizeLookup(row.external_id) === normalizeLookup(normalized.sourceVehicleId))
    || (normalized.vin && normalizeVin(row.vin) === normalized.vin)
    || (normalized.plate && normalizePlate(row.license_plate) === normalized.plate)
    || (normalized.unitNumber && normalizeLookup(row.unit_number) === normalized.unitNumber)
    || (descriptor && vehicleDescriptorKey({ year: row.year, make: normalizeLookup(row.make), model: normalizeLookup(row.model) }) === descriptor));
  if (matches.length === 1) return { id: matches[0]!.id, ambiguous: false };
  return { id: null, ambiguous: matches.length > 1 };
}

function buildGroupedCustomerLiveMap(customerEntities: Array<Pick<OnboardingEntityRow, "id" | "source_external_id" | "display_name" | "normalized">>, customerRows: CustomerRow[]) {
  const grouped = new Map<string, { entityIds: string[]; normalized: NormalizedCustomer }>();
  for (const entity of customerEntities) {
    const normalized = toNormalizedCustomer(entity);
    const key = customerIdentityKey(normalized) ?? `entity:${entity.id}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { entityIds: [entity.id], normalized });
      continue;
    }
    existing.entityIds.push(entity.id);
    existing.normalized = {
      sourceCustomerId: existing.normalized.sourceCustomerId ?? normalized.sourceCustomerId,
      email: existing.normalized.email ?? normalized.email,
      phone: existing.normalized.phone ?? normalized.phone,
      name: existing.normalized.name ?? normalized.name,
    };
  }

  const stagedCustomerEntityIdToLiveCustomerId = new Map<string, string>();
  for (const group of grouped.values()) {
    const matches = customerRows.filter((row) =>
      (group.normalized.sourceCustomerId && normalizeLookup(row.external_id) === normalizeLookup(group.normalized.sourceCustomerId))
      || (group.normalized.email && normalizeLookup(row.email) === normalizeLookup(group.normalized.email))
      || (group.normalized.phone && normalizePhone(row.phone ?? row.phone_number) === group.normalized.phone)
      || (group.normalized.name && normalizeLookup(row.business_name || row.name || `${row.first_name ?? ""} ${row.last_name ?? ""}`) === normalizeLookup(group.normalized.name)));
    if (matches.length !== 1) continue;
    const id = matches[0]!.id;
    for (const entityId of group.entityIds) stagedCustomerEntityIdToLiveCustomerId.set(entityId, id);
  }
  return stagedCustomerEntityIdToLiveCustomerId;
}

function buildGroupedVehicleLiveMap(vehicleEntities: Array<Pick<OnboardingEntityRow, "id" | "source_external_id" | "normalized">>, vehicleRows: VehicleRow[]) {
  const grouped = new Map<string, { entityIds: string[]; normalized: NormalizedVehicle }>();
  for (const entity of vehicleEntities) {
    const normalized = toNormalizedVehicle(entity);
    const key = vehicleIdentityKey(normalized) ?? `entity:${entity.id}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { entityIds: [entity.id], normalized });
      continue;
    }
    existing.entityIds.push(entity.id);
    existing.normalized = {
      sourceVehicleId: existing.normalized.sourceVehicleId ?? normalized.sourceVehicleId,
      vin: existing.normalized.vin ?? normalized.vin,
      plate: existing.normalized.plate ?? normalized.plate,
      unitNumber: existing.normalized.unitNumber ?? normalized.unitNumber,
      year: existing.normalized.year ?? normalized.year,
      make: existing.normalized.make ?? normalized.make,
      model: existing.normalized.model ?? normalized.model,
    };
  }

  const stagedVehicleEntityIdToLiveVehicleId = new Map<string, string>();
  for (const group of grouped.values()) {
    const descriptor = vehicleDescriptorKey(group.normalized);
    const matches = vehicleRows.filter((row) =>
      (group.normalized.sourceVehicleId && normalizeLookup(row.external_id) === normalizeLookup(group.normalized.sourceVehicleId))
      || (group.normalized.vin && normalizeVin(row.vin) === group.normalized.vin)
      || (group.normalized.plate && normalizePlate(row.license_plate) === group.normalized.plate)
      || (group.normalized.unitNumber && normalizeLookup(row.unit_number) === group.normalized.unitNumber)
      || (descriptor && vehicleDescriptorKey({ year: row.year, make: normalizeLookup(row.make), model: normalizeLookup(row.model) }) === descriptor));
    if (matches.length !== 1) continue;
    const id = matches[0]!.id;
    for (const entityId of group.entityIds) stagedVehicleEntityIdToLiveVehicleId.set(entityId, id);
  }
  return stagedVehicleEntityIdToLiveVehicleId;
}

function toNormalizedHistory(entity: Pick<OnboardingEntityRow, "normalized">): NormalizedHistory {
  const normalized = (entity.normalized ?? {}) as Record<string, unknown>;
  const firstText = (...keys: string[]) => {
    for (const key of keys) {
      const value = normalizeText(normalized[key]);
      if (value) return value;
    }
    return null;
  };
  const firstDate = (...keys: string[]) => {
    for (const key of keys) {
      const value = parseDate(normalized[key]);
      if (value) return value;
    }
    return null;
  };
  return {
    sourceWorkOrderId: firstText("sourceWorkOrderId", "workOrderNumber", "roNumber", "repairOrderNumber", "sourceExternalId", "sourceRowId"),
    invoiceNumber: firstText("invoiceNumber", "invoiceId", "sourceInvoiceId"),
    openedDate: firstDate("openedDate", "openedAt", "opened_date", "dateOpened", "serviceDate", "createdAt", "date", "completedAt", "closedAt", "invoiceDate"),
    closedDate: firstDate("closedDate", "closedAt", "completedAt", "invoiceDate"),
    customerName: firstText("customerName", "name", "businessName"),
    customerEmail: firstText("customerEmail", "email")?.toLowerCase() ?? null,
    sourceCustomerId: firstText("sourceCustomerId", "customerId", "customerExternalId"),
    sourceVehicleId: firstText("sourceVehicleId", "vehicleId", "vehicleExternalId"),
    vehicleVin: firstText("vehicleVin", "vin")?.toUpperCase() ?? null,
    vehiclePlate: firstText("vehiclePlate", "plate", "licensePlate")?.toUpperCase() ?? null,
    complaint: normalizeText(normalized.complaint) || null,
    correction: normalizeText(normalized.correction) || null,
    laborTotal: parseMoney(normalized.laborTotal ?? normalized.laborRaw),
    total: parseMoney(normalized.total ?? normalized.totalRaw),
  };
}

type GroupedReviewBucket = {
  issueType: string;
  summary: string;
  severity?: "low" | "medium" | "high" | "blocking";
  count: number;
  sampleEntityIds: string[];
};

function trackGroupedReview(grouped: Map<string, GroupedReviewBucket>, input: {
  issueType: string;
  summary: string;
  entityId: string;
  severity?: "low" | "medium" | "high" | "blocking";
}) {
  const existing = grouped.get(input.issueType) ?? {
    issueType: input.issueType,
    summary: input.summary,
    severity: input.severity,
    count: 0,
    sampleEntityIds: [],
  };
  existing.count += 1;
  if (existing.sampleEntityIds.length < 5) existing.sampleEntityIds.push(input.entityId);
  grouped.set(input.issueType, existing);
}

function endpointKind(entity: EntityShape | undefined): "history" | "customer" | "vehicle" | "unknown" {
  if (!entity) return "unknown";
  const type = normalizeLookup(entity.entity_type);
  const normalized = (entity.normalized ?? {}) as Record<string, unknown>;
  if (type.includes("customer")) return "customer";
  if (type.includes("vehicle")) return "vehicle";
  if (type.includes("history") || type.includes("historical")) return "history";
  if (normalizeLookup(entity.display_name).includes("history")) return "history";
  if (normalized.sourceWorkOrderId || normalized.roNumber || normalized.invoiceNumber || normalized.openedDate || normalized.serviceDate) return "history";
  return "unknown";
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

function reviewItem(params: {
  shopId: string;
  sessionId: string;
  entityId: string;
  issueType: string;
  summary: string;
  details?: Record<string, unknown>;
  severity?: "low" | "medium" | "high" | "blocking";
}): OnboardingReviewItemInsert {
  return {
    id: stableUuidFromParts(["onboarding-review", params.shopId, params.sessionId, "history", params.issueType, params.entityId]),
    shop_id: params.shopId,
    session_id: params.sessionId,
    entity_id: params.entityId,
    issue_type: params.issueType,
    summary: params.summary,
    severity: params.severity ?? "medium",
    status: "pending",
    domain: "history",
    details: (params.details ?? {}) as any,
  };
}

export async function activateOnboardingHistory(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  actorId: string;
}): Promise<HistoryActivationResult> {
  const runtimeDiagnostics = {
    activationModule: "features/onboarding-agent/server/activateOnboardingHistory.ts",
    diagnosticVersion: "history-endpoint-first-v3",
    executedAt: new Date().toISOString(),
  };
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId });

  const [historyRows, entityRows, linkRows, endpointEntities, customerRows, vehicleRows, workOrders] = await Promise.all([
    fetchAllPaginatedRows<Pick<OnboardingEntityRow, "id" | "normalized" | "entity_type" | "source_row_id" | "source_external_id">>((from, to) =>
      sb
        .from("onboarding_entities")
        .select("id, normalized, entity_type, source_row_id, source_external_id")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .in("entity_type", ["historical_work_order", "history"])
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<Pick<OnboardingEntityRow, "id" | "normalized" | "entity_type" | "source_external_id" | "display_name" | "source_row_id" | "status">>((from, to) =>
      sb
        .from("onboarding_entities")
        .select("id, normalized, entity_type, source_external_id, display_name, source_row_id, status")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .in("entity_type", ["customer", "vehicle"])
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<Pick<OnboardingEntityLinkRow, "id" | "from_entity_id" | "to_entity_id" | "link_type">>((from, to) =>
      sb
        .from("onboarding_entity_links")
        .select("id, from_entity_id, to_entity_id, link_type")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<EntityShape>((from, to) =>
      sb
        .from("onboarding_entities")
        .select("id, entity_type, status, source_row_id, source_external_id, normalized, display_name")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<CustomerRow>((from, to) =>
      sb
        .from("customers")
        .select("id, external_id, email, phone, phone_number, name, business_name, first_name, last_name")
        .eq("shop_id", params.shopId)
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<VehicleRow>((from, to) =>
      sb
        .from("vehicles")
        .select("id, external_id, vin, license_plate, unit_number, year, make, model")
        .eq("shop_id", params.shopId)
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<WorkOrderRow>((from, to) =>
      sb
        .from("work_orders")
        .select("*")
        .eq("shop_id", params.shopId)
        .order("id", { ascending: true })
        .range(from, to)),
  ]);

  const woRows = [...workOrders];

  const reviewItems: OnboardingReviewItemInsert[] = [];
  const warnings: string[] = [];

  let historicalWorkOrdersCreated = 0;
  let existingMatched = 0;
  let linesCreated = 0;
  let customerLinksResolved = 0;
  let vehicleLinksResolved = 0;
  let skipped = 0;
  let skippedUnresolved = 0;
  let skippedMissingCustomer = 0;
  let skippedMissingVehicle = 0;
  let skippedMissingIdentifier = 0;
  let skippedInvalidDate = 0;
  let skippedInvalidTotal = 0;
  let needsReview = 0;
  let resolvedViaCustomerWorkOrderLink = 0;
  let resolvedViaVehicleWorkOrderLink = 0;
  let unresolvedDueToMissingCustomerLink = 0;
  let unresolvedDueToMissingVehicleLink = 0;
  let unresolvedDueToMissingLiveCustomer = 0;
  let unresolvedDueToMissingLiveVehicle = 0;
  let historyRowsWithCustomerLink = 0;
  let historyRowsWithVehicleLink = 0;
  let linkedCustomerStagedEntitiesFound = 0;
  let linkedVehicleStagedEntitiesFound = 0;
  let linkedCustomerLiveResolved = 0;
  let linkedVehicleLiveResolved = 0;
  let rowsWithBothLiveCustomerAndVehicle = 0;
  let rowsMissingLiveCustomer = 0;
  let rowsMissingLiveVehicle = 0;
  let rowsMissingBoth = 0;
  const unresolvedSamples: HistoryActivationResult["diagnostics"]["unresolvedSamples"] = [];

  const customerWorkOrderLinks = linkRows.filter((row) => row.link_type === "customer_work_order").length;
  const vehicleWorkOrderLinks = linkRows.filter((row) => row.link_type === "vehicle_work_order").length;

  const groupedReviewItems = new Map<string, GroupedReviewBucket>();
  const historyEntityIdSet = new Set(historyRows.map((row) => row.id));
  const entityById = new Map<string, EntityShape>(endpointEntities.map((row) => [row.id, row]));
  const customerEntityById = new Map(entityRows.filter((row) => row.entity_type === "customer").map((row) => [row.id, row]));
  const vehicleEntityById = new Map(entityRows.filter((row) => row.entity_type === "vehicle").map((row) => [row.id, row]));
  const historyToCustomerEntityIds = new Map<string, Set<string>>();
  const historyToVehicleEntityIds = new Map<string, Set<string>>();
  const linkEndpointEntityTypesByCount: Record<string, number> = {};
  const customerWorkOrderEndpointTypesByCount: Record<string, number> = {};
  const vehicleWorkOrderEndpointTypesByCount: Record<string, number> = {};
  let linksPointingToFetchedHistoryIdsFrom = 0;
  let linksPointingToFetchedHistoryIdsTo = 0;
  let linksPointingToDiscoveredHistoryLikeEntities = 0;
  let historyLinkedViaSparseDuplicateCount = 0;
  let historyLinkedViaCanonicalEntityCount = 0;
  const discoveredHistoryLikeEntityIds = new Set<string>();
  const discoveredCustomerLikeEntityIds = new Set<string>();
  const discoveredVehicleLikeEntityIds = new Set<string>();
  const firstFiveLinkEndpointSamples: HistoryActivationResult["diagnostics"]["firstFiveLinkEndpointSamples"] = [];

  for (const link of linkRows) {
    if (link.link_type !== "customer_work_order" && link.link_type !== "vehicle_work_order") continue;
    const from = entityById.get(link.from_entity_id);
    const to = entityById.get(link.to_entity_id);
    if (firstFiveLinkEndpointSamples.length < 5) {
      firstFiveLinkEndpointSamples.push({ linkId: link.id, linkType: link.link_type, fromEntityId: link.from_entity_id, toEntityId: link.to_entity_id, fromEntityType: from?.entity_type ?? null, toEntityType: to?.entity_type ?? null, fromStatus: from?.status ?? null, toStatus: to?.status ?? null, fromSourceRowId: from?.source_row_id ?? null, toSourceRowId: to?.source_row_id ?? null, fromSourceExternalId: from?.source_external_id ?? null, toSourceExternalId: to?.source_external_id ?? null });
    }
    const fromType = from?.entity_type ?? "missing";
    const toType = to?.entity_type ?? "missing";
    bump(linkEndpointEntityTypesByCount, fromType);
    bump(linkEndpointEntityTypesByCount, toType);
    if (link.link_type === "customer_work_order") { bump(customerWorkOrderEndpointTypesByCount, fromType); bump(customerWorkOrderEndpointTypesByCount, toType); }
    if (link.link_type === "vehicle_work_order") { bump(vehicleWorkOrderEndpointTypesByCount, fromType); bump(vehicleWorkOrderEndpointTypesByCount, toType); }
    if (historyEntityIdSet.has(link.from_entity_id)) linksPointingToFetchedHistoryIdsFrom += 1;
    if (historyEntityIdSet.has(link.to_entity_id)) linksPointingToFetchedHistoryIdsTo += 1;
    if (!from || !to) continue;
    const fromKind = endpointKind(from);
    const toKind = endpointKind(to);
    if (fromKind === "history" || toKind === "history") linksPointingToDiscoveredHistoryLikeEntities += 1;
    if (fromKind === "history") discoveredHistoryLikeEntityIds.add(from.id);
    if (toKind === "history") discoveredHistoryLikeEntityIds.add(to.id);
    if (fromKind === "customer") discoveredCustomerLikeEntityIds.add(from.id);
    if (toKind === "customer") discoveredCustomerLikeEntityIds.add(to.id);
    if (fromKind === "vehicle") discoveredVehicleLikeEntityIds.add(from.id);
    if (toKind === "vehicle") discoveredVehicleLikeEntityIds.add(to.id);

    if (link.link_type === "customer_work_order") {
      if (fromKind === "history" && toKind === "customer") pushMapValue(historyToCustomerEntityIds, from.id, to.id);
      if (toKind === "history" && fromKind === "customer") pushMapValue(historyToCustomerEntityIds, to.id, from.id);
    }
    if (link.link_type === "vehicle_work_order") {
      if (fromKind === "history" && toKind === "vehicle") pushMapValue(historyToVehicleEntityIds, from.id, to.id);
      if (toKind === "history" && fromKind === "vehicle") pushMapValue(historyToVehicleEntityIds, to.id, from.id);
    }
  }
  for (const id of historyToCustomerEntityIds.keys()) {
    if (historyEntityIdSet.has(id)) historyLinkedViaCanonicalEntityCount += 1;
    else historyLinkedViaSparseDuplicateCount += 1;
  }

  const stagedCustomerEntityIdToLiveCustomerId = buildGroupedCustomerLiveMap([...customerEntityById.values()], customerRows);
  const stagedCustomerSourceRowIdToLiveCustomerId = new Map<string, string>();
  const stagedCustomerExternalIdToLiveCustomerId = new Map<string, string>();
  for (const entity of customerEntityById.values()) {
    const resolvedId = stagedCustomerEntityIdToLiveCustomerId.get(entity.id);
    if (!resolvedId) continue;
    const sourceRowKey = normalizeText(entity.source_row_id);
    if (sourceRowKey) stagedCustomerSourceRowIdToLiveCustomerId.set(sourceRowKey, resolvedId);
    const externalKey = normalizeLookup(entity.source_external_id);
    if (externalKey) stagedCustomerExternalIdToLiveCustomerId.set(externalKey, resolvedId);
  }

  const stagedVehicleEntityIdToLiveVehicleId = buildGroupedVehicleLiveMap([...vehicleEntityById.values()], vehicleRows);
  const stagedVehicleSourceRowIdToLiveVehicleId = new Map<string, string>();
  const stagedVehicleExternalIdToLiveVehicleId = new Map<string, string>();
  const stagedVehicleVinToLiveVehicleId = new Map<string, string>();
  for (const entity of vehicleEntityById.values()) {
    const resolvedId = stagedVehicleEntityIdToLiveVehicleId.get(entity.id);
    if (!resolvedId) continue;
    const sourceRowKey = normalizeText(entity.source_row_id);
    if (sourceRowKey) stagedVehicleSourceRowIdToLiveVehicleId.set(sourceRowKey, resolvedId);
    const externalKey = normalizeLookup(entity.source_external_id);
    if (externalKey) stagedVehicleExternalIdToLiveVehicleId.set(externalKey, resolvedId);
    const vinKey = normalizeVin((entity.normalized ?? ({} as any)).vin);
    if (vinKey) stagedVehicleVinToLiveVehicleId.set(vinKey, resolvedId);
  }

  const combinedHistoryRows = new Map<string, Pick<OnboardingEntityRow, "id" | "normalized" | "entity_type" | "source_row_id" | "source_external_id">>();
  for (const row of historyRows) combinedHistoryRows.set(row.id, row);
  for (const discoveredId of discoveredHistoryLikeEntityIds) {
    if (combinedHistoryRows.has(discoveredId)) continue;
    const endpoint = entityById.get(discoveredId);
    if (!endpoint) continue;
    combinedHistoryRows.set(discoveredId, {
      id: endpoint.id,
      normalized: endpoint.normalized,
      entity_type: endpoint.entity_type,
      source_row_id: endpoint.source_row_id,
      source_external_id: endpoint.source_external_id,
    });
  }

  for (const entity of combinedHistoryRows.values()) {
    const history = toNormalizedHistory(entity);
    if (!history.sourceWorkOrderId && !history.invoiceNumber && !history.openedDate) {
      skipped += 1;
      skippedMissingIdentifier += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "missing_required_history_identifier", summary: "Historical row skipped: missing identifier.", severity: "high" }));
      if (unresolvedSamples.length < 5) {
        unresolvedSamples.push({
          historyEntityId: entity.id,
          sourceRowId: normalizeText(entity.source_row_id) || null,
          sourceExternalId: normalizeText(entity.source_external_id) || null,
          hasCustomerLink: false,
          hasVehicleLink: false,
          linkedCustomerEntityId: null,
          linkedVehicleEntityId: null,
          customerResolutionAttemptedKeys: [],
          vehicleResolutionAttemptedKeys: [],
          finalSkipReason: "missing_required_history_identifier",
        });
      }
      continue;
    }
    if (!history.openedDate) {
      skipped += 1;
      skippedInvalidDate += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_history_date", summary: "Historical row skipped: invalid opened date." }));
      if (unresolvedSamples.length < 5) {
        unresolvedSamples.push({
          historyEntityId: entity.id,
          sourceRowId: normalizeText(entity.source_row_id) || null,
          sourceExternalId: normalizeText(entity.source_external_id) || null,
          hasCustomerLink: false,
          hasVehicleLink: false,
          linkedCustomerEntityId: null,
          linkedVehicleEntityId: null,
          customerResolutionAttemptedKeys: [],
          vehicleResolutionAttemptedKeys: [],
          finalSkipReason: "invalid_history_date",
        });
      }
      continue;
    }
    if (history.total !== null && history.total < 0) {
      skippedInvalidTotal += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_history_total", summary: "Historical row has invalid total.", details: { total: history.total } }));
      needsReview += 1;
    }

    const stagedCustomerLink = mapSingleValue(historyToCustomerEntityIds, entity.id);
    const stagedVehicleLink = mapSingleValue(historyToVehicleEntityIds, entity.id);
    if (stagedCustomerLink.id) historyRowsWithCustomerLink += 1;
    if (stagedVehicleLink.id) historyRowsWithVehicleLink += 1;
    const linkedStagedCustomer = stagedCustomerLink.id ? customerEntityById.get(stagedCustomerLink.id) ?? null : null;
    const linkedStagedVehicle = stagedVehicleLink.id ? vehicleEntityById.get(stagedVehicleLink.id) ?? null : null;
    if (linkedStagedCustomer) linkedCustomerStagedEntitiesFound += 1;
    if (linkedStagedVehicle) linkedVehicleStagedEntitiesFound += 1;

    const customerResolvedByLink = resolveLiveCustomerIdFromStagedEntity(linkedStagedCustomer, customerRows);
    const vehicleResolvedByLink = resolveLiveVehicleIdFromStagedEntity(linkedStagedVehicle, vehicleRows);

    let customerId = customerResolvedByLink.id
      ?? (stagedCustomerLink.id ? stagedCustomerEntityIdToLiveCustomerId.get(stagedCustomerLink.id) ?? null : null)
      ?? (stagedCustomerLink.id ? stagedCustomerSourceRowIdToLiveCustomerId.get(normalizeText(customerEntityById.get(stagedCustomerLink.id)?.source_row_id)) ?? null : null)
      ?? (stagedCustomerLink.id ? stagedCustomerExternalIdToLiveCustomerId.get(normalizeLookup(customerEntityById.get(stagedCustomerLink.id)?.source_external_id)) ?? null : null);
    let vehicleId = vehicleResolvedByLink.id
      ?? (stagedVehicleLink.id ? stagedVehicleEntityIdToLiveVehicleId.get(stagedVehicleLink.id) ?? null : null)
      ?? (stagedVehicleLink.id ? stagedVehicleSourceRowIdToLiveVehicleId.get(normalizeText(vehicleEntityById.get(stagedVehicleLink.id)?.source_row_id)) ?? null : null)
      ?? (stagedVehicleLink.id ? stagedVehicleExternalIdToLiveVehicleId.get(normalizeLookup(vehicleEntityById.get(stagedVehicleLink.id)?.source_external_id)) ?? null : null);

    if (customerId && stagedCustomerLink.id) resolvedViaCustomerWorkOrderLink += 1;
    if (vehicleId && stagedVehicleLink.id) resolvedViaVehicleWorkOrderLink += 1;

    if (!customerId) {
      const fallbackCustomerMatches = customerRows.filter((row) =>
        (history.sourceCustomerId && normalizeLookup(row.external_id) === normalizeLookup(history.sourceCustomerId))
        || (history.customerEmail && normalizeLookup(row.email) === normalizeLookup(history.customerEmail))
        || (history.customerName && normalizeLookup(row.business_name || row.name || `${row.first_name ?? ""} ${row.last_name ?? ""}`) === normalizeLookup(history.customerName)));
      if (fallbackCustomerMatches.length === 1) customerId = fallbackCustomerMatches[0]!.id;
      else if (fallbackCustomerMatches.length > 1 && !customerResolvedByLink.ambiguous) customerResolvedByLink.ambiguous = true;
    }
    if (!vehicleId) {
      const fallbackVehicleMatches = vehicleRows.filter((row) =>
        (history.sourceVehicleId && normalizeLookup(row.external_id) === normalizeLookup(history.sourceVehicleId))
        || (history.vehicleVin && normalizeVin(row.vin) === normalizeVin(history.vehicleVin))
        || (history.vehiclePlate && normalizePlate(row.license_plate) === normalizePlate(history.vehiclePlate)));
      if (!vehicleId && history.vehicleVin) {
        const byStagedVin = stagedVehicleVinToLiveVehicleId.get(normalizeVin(history.vehicleVin) ?? "");
        if (byStagedVin) vehicleId = byStagedVin;
      }
      if (fallbackVehicleMatches.length === 1) vehicleId = fallbackVehicleMatches[0]!.id;
      else if (fallbackVehicleMatches.length > 1 && !vehicleResolvedByLink.ambiguous) vehicleResolvedByLink.ambiguous = true;
    }

    if (customerId) customerLinksResolved += 1;
    if (vehicleId) vehicleLinksResolved += 1;
    if (customerId) linkedCustomerLiveResolved += 1;
    if (vehicleId) linkedVehicleLiveResolved += 1;

    if (!customerId || !vehicleId) {
      if (!customerId) rowsMissingLiveCustomer += 1;
      if (!vehicleId) rowsMissingLiveVehicle += 1;
      if (!customerId && !vehicleId) rowsMissingBoth += 1;
      skipped += 1;
      skippedUnresolved += 1;
      let finalSkipReason = "unresolved_live_customer";
      if (!customerId) {
        skippedMissingCustomer += 1;
        if (!stagedCustomerLink.id) unresolvedDueToMissingCustomerLink += 1;
        else unresolvedDueToMissingLiveCustomer += 1;
        needsReview += 1;
        trackGroupedReview(groupedReviewItems, {
          entityId: entity.id,
          issueType: customerResolvedByLink.ambiguous || stagedCustomerLink.ambiguous ? "ambiguous_customer_match_for_history" : "missing_customer_for_history",
          summary: customerResolvedByLink.ambiguous || stagedCustomerLink.ambiguous
            ? "Historical work orders have ambiguous customer mapping."
            : !stagedCustomerLink.id
              ? "Historical work orders are missing customer_work_order links."
              : "Historical work orders have customer links but no resolvable live customer mapping.",
        });
        if (!stagedCustomerLink.id) finalSkipReason = "missing_customer_link";
        else finalSkipReason = "unresolved_live_customer";
      }
      if (!vehicleId) {
        skippedMissingVehicle += 1;
        if (!stagedVehicleLink.id) unresolvedDueToMissingVehicleLink += 1;
        else unresolvedDueToMissingLiveVehicle += 1;
        needsReview += 1;
        trackGroupedReview(groupedReviewItems, {
          entityId: entity.id,
          issueType: vehicleResolvedByLink.ambiguous || stagedVehicleLink.ambiguous ? "ambiguous_vehicle_match_for_history" : "missing_vehicle_for_history",
          summary: vehicleResolvedByLink.ambiguous || stagedVehicleLink.ambiguous
            ? "Historical work orders have ambiguous vehicle mapping."
            : !stagedVehicleLink.id
              ? "Historical work orders are missing vehicle_work_order links."
              : "Historical work orders have vehicle links but no resolvable live vehicle mapping.",
        });
        if (!stagedVehicleLink.id) finalSkipReason = "missing_vehicle_link";
        else if (customerId) finalSkipReason = "unresolved_live_vehicle";
      }
      if (unresolvedSamples.length < 5) {
        unresolvedSamples.push({
          historyEntityId: entity.id,
          sourceRowId: normalizeText(entity.source_row_id) || null,
          sourceExternalId: normalizeText(entity.source_external_id) || null,
          hasCustomerLink: Boolean(stagedCustomerLink.id),
          hasVehicleLink: Boolean(stagedVehicleLink.id),
          linkedCustomerEntityId: stagedCustomerLink.id ?? null,
          linkedVehicleEntityId: stagedVehicleLink.id ?? null,
          customerResolutionAttemptedKeys: [
            `sourceCustomerId:${history.sourceCustomerId ?? ""}`,
            `customerEmail:${history.customerEmail ?? ""}`,
            `customerName:${history.customerName ?? ""}`,
          ].filter((value) => value.split(":")[1]),
          vehicleResolutionAttemptedKeys: [
            `sourceVehicleId:${history.sourceVehicleId ?? ""}`,
            `vehicleVin:${history.vehicleVin ?? ""}`,
            `vehiclePlate:${history.vehiclePlate ?? ""}`,
          ].filter((value) => value.split(":")[1]),
          finalSkipReason,
        });
      }
      continue;
    }
    rowsWithBothLiveCustomerAndVehicle += 1;

    const sourceRowKey = stableUuidFromParts([params.shopId, params.sessionId, "history", entity.id]);
    const existing = woRows.find((row) => row.source_row_id === sourceRowKey || (history.sourceWorkOrderId && normalizeLookup(row.custom_id) === normalizeLookup(history.sourceWorkOrderId)));
    if (existing) {
      existingMatched += 1;
      continue;
    }

    const payload: WorkOrderInsert = {
      shop_id: params.shopId,
      created_by: params.actorId,
      created_at: history.openedDate,
      updated_at: history.closedDate ?? history.openedDate,
      custom_id: history.sourceWorkOrderId ?? history.invoiceNumber,
      customer_id: customerId,
      vehicle_id: vehicleId,
      customer_name: history.customerName,
      vehicle_vin: history.vehicleVin,
      vehicle_license_plate: history.vehiclePlate,
      status: HISTORICAL_WORK_ORDER_STATUS,
      type: HISTORICAL_WORK_ORDER_TYPE,
      source_intake_id: params.sessionId,
      source_row_id: sourceRowKey,
      invoice_total: history.total,
      labor_total: history.laborTotal,
      notes: history.complaint ?? history.correction,
      is_waiter: false,
    };

    const { data: created, error } = await sb.from("work_orders").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    historicalWorkOrdersCreated += 1;

    if (history.complaint || history.correction) {
      const linePayload: WorkOrderLineInsert = {
        shop_id: params.shopId,
        work_order_id: created?.id,
        status: "completed",
        line_type: "labor",
        line_status: "closed",
        description: history.complaint ?? history.correction,
        complaint: history.complaint,
        correction: history.correction,
        labor_time: null,
        price_estimate: history.total,
        source_intake_id: params.sessionId,
        source_row_id: sourceRowKey,
      };
      const { error: lineError } = await sb.from("work_order_lines").insert(linePayload);
      if (lineError) {
        warnings.push(`Unable to create history line for ${entity.id}`);
        trackGroupedReview(groupedReviewItems, {
          entityId: entity.id,
          issueType: "unsupported_history_line_format",
          summary: "Historical lines could not be created safely for some rows.",
        });
        needsReview += 1;
      } else {
        linesCreated += 1;
      }
    }
  }

  for (const grouped of groupedReviewItems.values()) {
    reviewItems.push(reviewItem({
      shopId: params.shopId,
      sessionId: params.sessionId,
      entityId: `history-group:${grouped.issueType}`,
      issueType: grouped.issueType,
      summary: grouped.summary,
      severity: grouped.severity,
      details: {
        grouped: true,
        affectedRows: grouped.count,
        sampleEntityIds: grouped.sampleEntityIds,
      },
    }));
  }

  let reviewItemsPersisted = 0;
  let reviewItemsReused = 0;
  if (reviewItems.length > 0) {
    const writeResult = await upsertOnboardingReviewItems({
      supabase: params.supabase,
      phase: "history",
      shopId: params.shopId,
      sessionId: params.sessionId,
      reviewItems,
    });
    reviewItemsPersisted = writeResult.persisted;
    reviewItemsReused = writeResult.reused;
  }
  const { count: reviewItemsOpenCount, error: reviewItemsOpenError } = await sb
    .from("onboarding_review_items")
    .select("id", { head: true, count: "exact" })
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId)
    .eq("domain", "history")
    .eq("status", "pending");
  if (reviewItemsOpenError) throw new Error(reviewItemsOpenError.message);
  if (skippedUnresolved > 0) {
    warnings.push("Most skipped history rows were unresolved because no live customer/vehicle mapping could be resolved from staged links.");
  }

  const result: HistoryActivationResult = {
    ok: true,
    stagedHistoryRows: historyRows.length,
    historicalWorkOrdersCreated,
    existingMatched,
    linesCreated,
    customerLinksResolved,
    vehicleLinksResolved,
    skipped,
    skippedUnresolved,
    skippedMissingCustomer,
    skippedMissingVehicle,
    skippedMissingIdentifier,
    skippedInvalidDate,
    skippedInvalidTotal,
    needsReview,
    reviewItemsAttempted: reviewItems.length,
    reviewItemsPersisted,
    reviewItemsReused,
    reviewItemsCreated: Math.max(0, reviewItemsPersisted - reviewItemsReused),
    reviewItemsOpenForDomain: Number(reviewItemsOpenCount ?? 0),
    customerWorkOrderLinks,
    vehicleWorkOrderLinks,
    resolvedViaCustomerWorkOrderLink,
    resolvedViaVehicleWorkOrderLink,
    resolvedCustomerLiveIds: customerLinksResolved,
    resolvedVehicleLiveIds: vehicleLinksResolved,
    unresolvedDueToMissingCustomerLink,
    unresolvedDueToMissingVehicleLink,
    unresolvedDueToMissingLiveCustomer,
    unresolvedDueToMissingLiveVehicle,
    diagnostics: {
      runtime: runtimeDiagnostics,
      stagedHistoryRows: historyRows.length,
      customerWorkOrderLinks,
      vehicleWorkOrderLinks,
      historyRowsWithCustomerLink,
      historyRowsWithVehicleLink,
      linkedCustomerStagedEntitiesFound,
      linkedVehicleStagedEntitiesFound,
      linkedCustomerLiveResolved,
      linkedVehicleLiveResolved,
      rowsWithBothLiveCustomerAndVehicle,
      rowsMissingLiveCustomer,
      rowsMissingLiveVehicle,
      rowsMissingBoth,
      rowsInvalidDate: skippedInvalidDate,
      rowsMissingRequiredIdentifier: skippedMissingIdentifier,
      workOrdersCreated: historicalWorkOrdersCreated,
      workOrdersMatchedExisting: existingMatched,
      linkEndpointEntityTypesByCount,
      customerWorkOrderEndpointTypesByCount,
      vehicleWorkOrderEndpointTypesByCount,
      linksPointingToFetchedHistoryIdsFrom,
      linksPointingToFetchedHistoryIdsTo,
      linksPointingToDiscoveredHistoryLikeEntities,
      discoveredHistoryLikeEntityCount: discoveredHistoryLikeEntityIds.size,
      discoveredCustomerLikeEntityCount: discoveredCustomerLikeEntityIds.size,
      discoveredVehicleLikeEntityCount: discoveredVehicleLikeEntityIds.size,
      historyLinkedViaSparseDuplicateCount,
      historyLinkedViaCanonicalEntityCount,
      firstFiveLinkEndpointSamples,
      unresolvedSamples,
    },
    warnings,
  };
  console.info("[onboarding.history.activation]", {
    diagnosticVersion: runtimeDiagnostics.diagnosticVersion,
    runtimeModule: runtimeDiagnostics.activationModule,
    executedAt: runtimeDiagnostics.executedAt,
    shopSessionScope: `${params.shopId.slice(0, 8)}:${params.sessionId.slice(0, 8)}`,
    stagedHistoryRows: result.stagedHistoryRows,
    customerWorkOrderLinks: result.customerWorkOrderLinks,
    vehicleWorkOrderLinks: result.vehicleWorkOrderLinks,
    historyRowsWithCustomerLink: result.diagnostics.historyRowsWithCustomerLink,
    historyRowsWithVehicleLink: result.diagnostics.historyRowsWithVehicleLink,
    discoveredHistoryLikeEndpointCount: result.diagnostics.discoveredHistoryLikeEntityCount,
    linkedCustomerStagedEntitiesFound: result.diagnostics.linkedCustomerStagedEntitiesFound,
    linkedVehicleStagedEntitiesFound: result.diagnostics.linkedVehicleStagedEntitiesFound,
    linkedCustomerLiveResolved: result.diagnostics.linkedCustomerLiveResolved,
    linkedVehicleLiveResolved: result.diagnostics.linkedVehicleLiveResolved,
    rowsWithBothLiveCustomerAndVehicle: result.diagnostics.rowsWithBothLiveCustomerAndVehicle,
    workOrdersCreated: result.diagnostics.workOrdersCreated,
    workOrdersMatchedExisting: result.diagnostics.workOrdersMatchedExisting,
    skippedUnresolved: result.skippedUnresolved,
  });
  return result;
}
