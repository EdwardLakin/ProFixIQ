import type { SupabaseClient } from "@supabase/supabase-js";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";
import type { Database } from "@/features/shared/types/types/supabase";

type OnboardingEntityRow = Database["public"]["Tables"]["onboarding_entities"]["Row"];
type OnboardingEntityLinkRow = Database["public"]["Tables"]["onboarding_entity_links"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
type WorkOrderRow = Database["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderInsert = Database["public"]["Tables"]["work_orders"]["Insert"];
type WorkOrderLineInsert = Database["public"]["Tables"]["work_order_lines"]["Insert"];
type OnboardingReviewItemInsert = Database["public"]["Tables"]["onboarding_review_items"]["Insert"];

type HistoryActivationResult = {
  ok: true;
  stagedHistoryRows: number;
  historicalWorkOrdersCreated: number;
  existingMatched: number;
  linesCreated: number;
  customerLinksResolved: number;
  vehicleLinksResolved: number;
  skipped: number;
  needsReview: number;
  reviewItemsCreated: number;
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

  const [{ data: entities }, { data: links }, { data: customers }, { data: vehicles }, { data: workOrders }] = await Promise.all([
    sb
      .from("onboarding_entities")
      .select("id, normalized")
      .eq("shop_id", params.shopId)
      .eq("session_id", params.sessionId)
      .eq("entity_type", "historical_work_order")
      .eq("status", "ready")
      .order("id", { ascending: true }),
    sb.from("onboarding_entity_links").select("id, from_entity_id, to_entity_id, link_type").eq("shop_id", params.shopId).eq("session_id", params.sessionId),
    sb.from("customers").select("id, external_id, email, name, business_name").eq("shop_id", params.shopId),
    sb.from("vehicles").select("id, external_id, vin, license_plate").eq("shop_id", params.shopId),
    sb.from("work_orders").select("*").eq("shop_id", params.shopId),
  ]);

  const historyRows = (entities ?? []) as Array<Pick<OnboardingEntityRow, "id" | "normalized">>;
  const linkRows = (links ?? []) as Array<Pick<OnboardingEntityLinkRow, "id" | "from_entity_id" | "to_entity_id" | "link_type">>;
  const customerRows = (customers ?? []) as CustomerRow[];
  const vehicleRows = (vehicles ?? []) as VehicleRow[];
  const woRows = [...((workOrders ?? []) as WorkOrderRow[])];

  const reviewItems: OnboardingReviewItemInsert[] = [];
  const warnings: string[] = [];

  let historicalWorkOrdersCreated = 0;
  let existingMatched = 0;
  let linesCreated = 0;
  let customerLinksResolved = 0;
  let vehicleLinksResolved = 0;
  let skipped = 0;
  let needsReview = 0;

  for (const entity of historyRows) {
    const history = toNormalizedHistory(entity);
    if (!history.sourceWorkOrderId && !history.invoiceNumber && !history.openedDate) {
      skipped += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "missing_required_history_identifier", summary: "Historical row skipped: missing identifier.", severity: "high" }));
      continue;
    }
    if (!history.openedDate) {
      skipped += 1;
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_history_date", summary: "Historical row skipped: invalid opened date." }));
      continue;
    }
    if (history.total !== null && history.total < 0) {
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "invalid_history_total", summary: "Historical row has invalid total.", details: { total: history.total } }));
      needsReview += 1;
    }

    const link = linkRows.find((row) => row.link_type === "customer_vehicle" && (row.from_entity_id === entity.id || row.to_entity_id === entity.id));
    if (!link) {
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "unresolved_customer_vehicle_link_for_history", summary: "Historical work order missing staged customer/vehicle link." }));
      needsReview += 1;
    }

    const customerMatches = customerRows.filter((row) =>
      (history.sourceCustomerId && normalizeLookup(row.external_id) === normalizeLookup(history.sourceCustomerId))
      || (history.customerEmail && normalizeLookup(row.email) === normalizeLookup(history.customerEmail))
      || (history.customerName && normalizeLookup(row.business_name || row.name) === normalizeLookup(history.customerName)),
    );
    const vehicleMatches = vehicleRows.filter((row) =>
      (history.sourceVehicleId && normalizeLookup(row.external_id) === normalizeLookup(history.sourceVehicleId))
      || (history.vehicleVin && normalizeLookup(row.vin) === normalizeLookup(history.vehicleVin))
      || (history.vehiclePlate && normalizeLookup(row.license_plate) === normalizeLookup(history.vehiclePlate)),
    );

    let customerId: string | null = null;
    let vehicleId: string | null = null;

    if (customerMatches.length === 1) {
      customerId = customerMatches[0]!.id;
      customerLinksResolved += 1;
    } else if (customerMatches.length > 1) {
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "ambiguous_customer_match_for_history", summary: "Historical work order has ambiguous customer match." }));
    } else {
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "missing_customer_for_history", summary: "Historical work order customer could not be matched." }));
    }

    if (vehicleMatches.length === 1) {
      vehicleId = vehicleMatches[0]!.id;
      vehicleLinksResolved += 1;
    } else if (vehicleMatches.length > 1) {
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "ambiguous_vehicle_match_for_history", summary: "Historical work order has ambiguous vehicle match." }));
    } else {
      needsReview += 1;
      reviewItems.push(reviewItem({ shopId: params.shopId, sessionId: params.sessionId, entityId: entity.id, issueType: "missing_vehicle_for_history", summary: "Historical work order vehicle could not be matched." }));
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
      status: "completed",
      type: "historical_import",
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

  if (reviewItems.length > 0) {
    const { error } = await sb.from("onboarding_review_items").upsert(reviewItems, { onConflict: "id" });
    if (error) throw new Error(error.message);
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
    needsReview,
    reviewItemsCreated: reviewItems.length,
    warnings,
  };
}
