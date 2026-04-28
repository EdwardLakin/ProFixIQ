import type { SupabaseClient } from "@supabase/supabase-js";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import { fetchAllPaginatedRows } from "@/features/onboarding-agent/server/fetchAllPaginatedRows";
import { upsertOnboardingReviewItems } from "@/features/onboarding-agent/server/upsertOnboardingReviewItems";
import type { Database } from "@/features/shared/types/types/supabase";

type OnboardingEntityRow = Database["public"]["Tables"]["onboarding_entities"]["Row"];
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
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type ResolveLiveIdResult = { id: string | null; ambiguous: boolean };

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

function resolveStagedLinkEntityId(params: {
  historyEntityId: string;
  linkType: string;
  targetEntityType: "customer" | "vehicle";
  linkRows: Array<Pick<OnboardingEntityLinkRow, "from_entity_id" | "to_entity_id" | "link_type">>;
  entityById: Map<string, Pick<OnboardingEntityRow, "id" | "entity_type">>;
}): { id: string | null; ambiguous: boolean } {
  const matches = params.linkRows.filter((row) => row.link_type === params.linkType && (row.from_entity_id === params.historyEntityId || row.to_entity_id === params.historyEntityId));
  const candidateEntityIds = new Set<string>();
  for (const row of matches) {
    const candidateId = row.from_entity_id === params.historyEntityId ? row.to_entity_id : row.from_entity_id;
    const candidate = params.entityById.get(candidateId);
    if (candidate?.entity_type === params.targetEntityType) candidateEntityIds.add(candidateId);
  }
  if (candidateEntityIds.size === 1) return { id: [...candidateEntityIds][0] ?? null, ambiguous: false };
  if (candidateEntityIds.size > 1) return { id: null, ambiguous: true };
  return { id: null, ambiguous: false };
}

function resolveLiveCustomerIdFromStagedEntity(stagedEntity: Pick<OnboardingEntityRow, "source_external_id" | "display_name" | "normalized"> | null, customerRows: CustomerRow[]): ResolveLiveIdResult {
  if (!stagedEntity) return { id: null, ambiguous: false };
  const normalized = (stagedEntity.normalized ?? {}) as Record<string, unknown>;
  const sourceCustomerId = normalizeText(stagedEntity.source_external_id ?? normalized.sourceCustomerId) || null;
  const customerEmail = normalizeEmail(normalized.email);
  const customerName = normalizeText(normalized.businessName ?? normalized.name ?? stagedEntity.display_name) || null;
  const matches = customerRows.filter((row) =>
    (sourceCustomerId && normalizeLookup(row.external_id) === normalizeLookup(sourceCustomerId))
    || (customerEmail && normalizeLookup(row.email) === normalizeLookup(customerEmail))
    || (customerName && normalizeLookup(row.business_name || row.name || `${row.first_name ?? ""} ${row.last_name ?? ""}`) === normalizeLookup(customerName)));
  if (matches.length === 1) return { id: matches[0]!.id, ambiguous: false };
  return { id: null, ambiguous: matches.length > 1 };
}

function resolveLiveVehicleIdFromStagedEntity(stagedEntity: Pick<OnboardingEntityRow, "source_external_id" | "normalized"> | null, vehicleRows: VehicleRow[]): ResolveLiveIdResult {
  if (!stagedEntity) return { id: null, ambiguous: false };
  const normalized = (stagedEntity.normalized ?? {}) as Record<string, unknown>;
  const sourceVehicleId = normalizeText(stagedEntity.source_external_id ?? normalized.sourceVehicleId) || null;
  const vehicleVin = normalizeVin(normalized.vin);
  const vehiclePlate = normalizePlate(normalized.plate);
  const matches = vehicleRows.filter((row) =>
    (sourceVehicleId && normalizeLookup(row.external_id) === normalizeLookup(sourceVehicleId))
    || (vehicleVin && normalizeVin(row.vin) === vehicleVin)
    || (vehiclePlate && normalizePlate(row.license_plate) === vehiclePlate));
  if (matches.length === 1) return { id: matches[0]!.id, ambiguous: false };
  return { id: null, ambiguous: matches.length > 1 };
}

function toNormalizedHistory(entity: Pick<OnboardingEntityRow, "normalized">): NormalizedHistory {
  const normalized = (entity.normalized ?? {}) as Record<string, unknown>;
  return {
    sourceWorkOrderId: normalizeText(normalized.sourceWorkOrderId) || null,
    invoiceNumber: normalizeText(normalized.invoiceNumber ?? normalized.invoiceId) || null,
    openedDate: parseDate(normalized.openedDate),
    closedDate: parseDate(normalized.closedDate),
    customerName: normalizeText(normalized.customerName) || null,
    customerEmail: normalizeText(normalized.customerEmail).toLowerCase() || null,
    sourceCustomerId: normalizeText(normalized.sourceCustomerId) || null,
    sourceVehicleId: normalizeText(normalized.sourceVehicleId) || null,
    vehicleVin: normalizeText(normalized.vehicleVin).toUpperCase() || null,
    vehiclePlate: normalizeText(normalized.vehiclePlate).toUpperCase() || null,
    complaint: normalizeText(normalized.complaint) || null,
    correction: normalizeText(normalized.correction) || null,
    laborTotal: parseMoney(normalized.laborTotal ?? normalized.laborRaw),
    total: parseMoney(normalized.total ?? normalized.totalRaw),
  };
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
  const sb = params.supabase as any;
  await assertOnboardingSessionOwnership({ supabase: params.supabase, shopId: params.shopId, sessionId: params.sessionId });

  const [historyRows, entityRows, linkRows, customerRows, vehicleRows, workOrders] = await Promise.all([
    fetchAllPaginatedRows<Pick<OnboardingEntityRow, "id" | "normalized" | "entity_type">>((from, to) =>
      sb
        .from("onboarding_entities")
        .select("id, normalized, entity_type")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .eq("entity_type", "historical_work_order")
        .eq("status", "ready")
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<Pick<OnboardingEntityRow, "id" | "normalized" | "entity_type" | "source_external_id" | "display_name">>((from, to) =>
      sb
        .from("onboarding_entities")
        .select("id, normalized, entity_type, source_external_id, display_name")
        .eq("shop_id", params.shopId)
        .eq("session_id", params.sessionId)
        .in("entity_type", ["customer", "vehicle"])
        .eq("status", "ready")
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
    fetchAllPaginatedRows<CustomerRow>((from, to) =>
      sb
        .from("customers")
        .select("id, external_id, email, name, business_name, first_name, last_name")
        .eq("shop_id", params.shopId)
        .order("id", { ascending: true })
        .range(from, to)),
    fetchAllPaginatedRows<VehicleRow>((from, to) =>
      sb
        .from("vehicles")
        .select("id, external_id, vin, license_plate")
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
  const entityById = new Map<string, Pick<OnboardingEntityRow, "id" | "entity_type">>([
    ...historyRows.map((row) => [row.id, { id: row.id, entity_type: row.entity_type }] as const),
    ...entityRows.map((row) => [row.id, { id: row.id, entity_type: row.entity_type }] as const),
  ]);
  const customerEntityById = new Map(entityRows.filter((row) => row.entity_type === "customer").map((row) => [row.id, row]));
  const vehicleEntityById = new Map(entityRows.filter((row) => row.entity_type === "vehicle").map((row) => [row.id, row]));

  for (const entity of historyRows) {
    const history = toNormalizedHistory(entity);
    if (!history.sourceWorkOrderId && !history.invoiceNumber && !history.openedDate) {
      skipped += 1;
      skippedMissingIdentifier += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "missing_required_history_identifier", summary: "Historical row skipped: missing identifier.", severity: "high" }));
      continue;
    }
    if (!history.openedDate) {
      skipped += 1;
      skippedInvalidDate += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_history_date", summary: "Historical row skipped: invalid opened date." }));
      continue;
    }
    if (history.total !== null && history.total < 0) {
      skippedInvalidTotal += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_history_total", summary: "Historical row has invalid total.", details: { total: history.total } }));
      needsReview += 1;
    }

    const stagedCustomerLink = resolveStagedLinkEntityId({ historyEntityId: entity.id, linkType: "customer_work_order", targetEntityType: "customer", linkRows, entityById });
    const stagedVehicleLink = resolveStagedLinkEntityId({ historyEntityId: entity.id, linkType: "vehicle_work_order", targetEntityType: "vehicle", linkRows, entityById });
    const linkedStagedCustomer = stagedCustomerLink.id ? customerEntityById.get(stagedCustomerLink.id) ?? null : null;
    const linkedStagedVehicle = stagedVehicleLink.id ? vehicleEntityById.get(stagedVehicleLink.id) ?? null : null;

    const customerResolvedByLink = resolveLiveCustomerIdFromStagedEntity(linkedStagedCustomer, customerRows);
    const vehicleResolvedByLink = resolveLiveVehicleIdFromStagedEntity(linkedStagedVehicle, vehicleRows);

    let customerId = customerResolvedByLink.id;
    let vehicleId = vehicleResolvedByLink.id;

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
      if (fallbackVehicleMatches.length === 1) vehicleId = fallbackVehicleMatches[0]!.id;
      else if (fallbackVehicleMatches.length > 1 && !vehicleResolvedByLink.ambiguous) vehicleResolvedByLink.ambiguous = true;
    }

    if (customerId) customerLinksResolved += 1;
    if (vehicleId) vehicleLinksResolved += 1;

    if (!customerId || !vehicleId) {
      skipped += 1;
      skippedUnresolved += 1;
      if (!customerId) {
        skippedMissingCustomer += 1;
        needsReview += 1;
        reviewItems.push(reviewItem({
          shopId: params.shopId,
          sessionId: params.sessionId,
          entityId: entity.id,
          issueType: customerResolvedByLink.ambiguous || stagedCustomerLink.ambiguous ? "ambiguous_customer_match_for_history" : "missing_customer_for_history",
          summary: customerResolvedByLink.ambiguous || stagedCustomerLink.ambiguous
            ? "Historical work order has ambiguous customer mapping."
            : "Historical work order customer could not be matched.",
          details: {
            stagedCustomerEntityId: stagedCustomerLink.id,
            hasCustomerWorkOrderLink: Boolean(stagedCustomerLink.id),
          },
        }));
      }
      if (!vehicleId) {
        skippedMissingVehicle += 1;
        needsReview += 1;
        reviewItems.push(reviewItem({
          shopId: params.shopId,
          sessionId: params.sessionId,
          entityId: entity.id,
          issueType: vehicleResolvedByLink.ambiguous || stagedVehicleLink.ambiguous ? "ambiguous_vehicle_match_for_history" : "missing_vehicle_for_history",
          summary: vehicleResolvedByLink.ambiguous || stagedVehicleLink.ambiguous
            ? "Historical work order has ambiguous vehicle mapping."
            : "Historical work order vehicle could not be matched.",
          details: {
            stagedVehicleEntityId: stagedVehicleLink.id,
            hasVehicleWorkOrderLink: Boolean(stagedVehicleLink.id),
          },
        }));
      }
      continue;
    }

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
        reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "unsupported_history_line_format", summary: "Historical line could not be created safely." }));
        needsReview += 1;
      } else {
        linesCreated += 1;
      }
    }
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

  return {
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
    warnings,
  };
}
