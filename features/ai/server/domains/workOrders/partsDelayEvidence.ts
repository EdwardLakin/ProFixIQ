import type { Database, Json } from "@shared/types/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAiEvidenceSnapshot, type AiActorContext, type AiEvidenceSnapshotRecord } from "@/features/ai/server";
import type { WorkOrderPartsDelayEvidence } from "./types";

const PARTS_DELAY_RULE_VERSION = "wo_parts_delay_v1";
const PARTS_REQUEST_STALE_HOURS = 48;

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"];
type WorkOrderPartAllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartsRequestRow = DB["public"]["Tables"]["parts_requests"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PartStockSummaryRow = DB["public"]["Views"]["part_stock_summary"]["Row"];

type BuildInput = {
  supabase: SupabaseClient<DB>;
  actor: AiActorContext;
  workOrderId: string;
};

function toHoursAgo(now: number, iso: string | null): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (now - ts) / 3_600_000);
}

function clampConfidence(score: number): number {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function normalizeStatus(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasLinePartSignal(line: WorkOrderLineRow): boolean {
  const partsText = String(line.parts ?? "").trim();
  const partsNeeded = line.parts_needed;
  const partsRequired = line.parts_required;

  const hasPartsNeeded = Array.isArray(partsNeeded)
    ? partsNeeded.length > 0
    : !!(partsNeeded && typeof partsNeeded === "object" && Object.keys(partsNeeded as Record<string, unknown>).length > 0);

  const hasPartsRequired = Array.isArray(partsRequired)
    ? partsRequired.length > 0
    : !!(partsRequired && typeof partsRequired === "object" && Object.keys(partsRequired as Record<string, unknown>).length > 0);

  return partsText.length > 0 || hasPartsNeeded || hasPartsRequired || normalizeStatus(line.hold_reason).includes("part");
}

function computePartsDelayConfidence(missingData: string[]): number {
  const penalties: Record<string, number> = {
    missing_parts_linkage_data: 0.14,
    missing_availability_data: 0.2,
    unsupported_eta_signal: 0.08,
    unsupported_backorder_signal: 0.08,
    unsupported_vendor_reliability_signal: 0.08,
    unsupported_po_linkage_for_requests: 0.1,
    no_parts_linkage_with_line_part_signals: 0.1,
  };

  let score = 1;
  for (const marker of missingData) {
    score -= penalties[marker] ?? 0.03;
  }

  return clampConfidence(score);
}

export async function buildWorkOrderPartsDelayEvidence(input: BuildInput): Promise<WorkOrderPartsDelayEvidence> {
  const { supabase, actor, workOrderId } = input;
  const nowIso = new Date().toISOString();
  const nowTs = Date.parse(nowIso);

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", workOrderId)
    .eq("shop_id", actor.shopId)
    .maybeSingle<Pick<WorkOrderRow, "id" | "shop_id">>();

  if (workOrderError) throw new Error(workOrderError.message);
  if (!workOrder) throw new Error("work order not found");

  const [
    workOrderPartsRes,
    allocationsRes,
    partsRequestsRes,
    partRequestItemsRes,
    workOrderLinesRes,
  ] = await Promise.all([
    supabase.from("work_order_parts").select("*").eq("work_order_id", workOrderId),
    supabase.from("work_order_part_allocations").select("*").eq("work_order_id", workOrderId).eq("shop_id", actor.shopId),
    supabase.from("parts_requests").select("*").eq("work_order_id", workOrderId),
    supabase.from("part_request_items").select("*").eq("work_order_id", workOrderId),
    supabase.from("work_order_lines").select("*").eq("work_order_id", workOrderId).eq("shop_id", actor.shopId),
  ]);

  if (workOrderPartsRes.error) throw new Error(workOrderPartsRes.error.message);
  if (allocationsRes.error) throw new Error(allocationsRes.error.message);
  if (partsRequestsRes.error) throw new Error(partsRequestsRes.error.message);
  if (partRequestItemsRes.error) throw new Error(partRequestItemsRes.error.message);
  if (workOrderLinesRes.error) throw new Error(workOrderLinesRes.error.message);

  const workOrderParts = (workOrderPartsRes.data ?? []) as WorkOrderPartRow[];
  const allocations = (allocationsRes.data ?? []) as WorkOrderPartAllocationRow[];
  const partsRequests = (partsRequestsRes.data ?? []) as PartsRequestRow[];
  const partRequestItems = (partRequestItemsRes.data ?? []) as PartRequestItemRow[];
  const workOrderLines = (workOrderLinesRes.data ?? []) as WorkOrderLineRow[];

  const sourceRefs: Array<Record<string, string | null>> = [
    { table: "work_orders", id: workOrderId },
    { table: "work_order_parts", id: workOrderId },
    { table: "part_request_items", id: workOrderId },
    { table: "parts_requests", id: workOrderId },
    { table: "work_order_part_allocations", id: workOrderId },
  ];

  const missingData = new Set<string>(["unsupported_backorder_signal", "unsupported_vendor_reliability_signal"]);

  const linkedPartIds = Array.from(
    new Set(
      [...workOrderParts.map((row) => row.part_id), ...partRequestItems.map((row) => row.part_id), ...allocations.map((row) => row.part_id)]
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const { data: stockRows, error: stockError } = linkedPartIds.length > 0
    ? await supabase
      .from("part_stock_summary")
      .select("part_id, on_hand, shop_id")
      .eq("shop_id", actor.shopId)
      .in("part_id", linkedPartIds)
    : { data: [], error: null };

  if (stockError) throw new Error(stockError.message);
  const partStockRows = (stockRows ?? []) as PartStockSummaryRow[];

  const stockByPart = new Map<string, number>();
  for (const row of partStockRows) {
    if (!row.part_id) continue;
    const current = stockByPart.get(row.part_id) ?? 0;
    stockByPart.set(row.part_id, current + Number(row.on_hand ?? 0));
  }

  if (linkedPartIds.length > 0 && partStockRows.length === 0) {
    missingData.add("missing_availability_data");
  }

  const unresolvedItemStatuses = new Set([
    "requested",
    "quoted",
    "awaiting_customer_approval",
    "approved",
    "reserved",
    "picking",
    "picked",
    "ordered",
    "partially_received",
  ]);

  const unresolvedRequestItems = partRequestItems.filter((row) => unresolvedItemStatuses.has(normalizeStatus(row.status)));
  const waitingPartsCount = unresolvedRequestItems.length + partsRequests.filter((row) => !row.fulfilled_at).length;
  const partSignalsOnLines = workOrderLines.some((line) => hasLinePartSignal(line));

  const unresolvedRequiredRows = workOrderParts.filter((row) => Number(row.quantity ?? 0) > 0);

  const requestedPartsCount =
    workOrderParts.length > 0
      ? workOrderParts.length
      : partRequestItems.length > 0
        ? partRequestItems.length
        : partsRequests.length;

  const allocatedPartsCount = allocations.length;

  const receivedFromRequestItems = partRequestItems.filter(
    (row) => Number(row.qty_received ?? 0) > 0 || ["received", "consumed"].includes(normalizeStatus(row.status)),
  ).length;

  const receivedPartsCount = Math.max(receivedFromRequestItems, partRequestItems.filter((row) => normalizeStatus(row.status) === "received").length);

  const unavailablePartRowCount = unresolvedRequiredRows.filter((row) => {
    if (!row.part_id) return false;
    const onHand = stockByPart.get(row.part_id);
    return typeof onHand === "number" ? onHand <= 0 : false;
  }).length;

  const unknownAvailabilityCount = unresolvedRequiredRows.filter((row) => {
    if (!row.part_id) return true;
    return !stockByPart.has(row.part_id);
  }).length;

  if (requestedPartsCount === 0 && allocatedPartsCount === 0 && partRequestItems.length === 0 && partsRequests.length === 0) {
    missingData.add("missing_parts_linkage_data");
  }

  if (partSignalsOnLines && requestedPartsCount === 0) {
    missingData.add("no_parts_linkage_with_line_part_signals");
  }

  const poIds = Array.from(new Set(partRequestItems.map((row) => row.po_id).filter((id): id is string => typeof id === "string" && id.length > 0)));

  const { data: purchaseOrdersData, error: purchaseOrdersError } = poIds.length > 0
    ? await supabase.from("purchase_orders").select("*").in("id", poIds).eq("shop_id", actor.shopId)
    : { data: [], error: null };

  if (purchaseOrdersError) throw new Error(purchaseOrdersError.message);

  const purchaseOrders = (purchaseOrdersData ?? []) as PurchaseOrderRow[];

  if (poIds.length > 0 && purchaseOrders.length === 0) {
    missingData.add("unsupported_po_linkage_for_requests");
  }

  const openStatuses = new Set(["draft", "open", "sent", "ordered", "partially_received"]);
  const openPurchaseOrders = purchaseOrders.filter((po) => {
    const status = normalizeStatus(po.status);
    return !po.received_at && (openStatuses.has(status) || status.length === 0);
  });

  const today = new Date(nowIso);
  const openPurchaseOrderCount = openPurchaseOrders.length;
  const overduePurchaseOrderCount = openPurchaseOrders.filter((po) => {
    if (!po.expected_at) return false;
    return Date.parse(po.expected_at) < Date.parse(today.toISOString().slice(0, 10));
  }).length;

  const etaMissingCount = openPurchaseOrders.filter((po) => !po.expected_at).length;
  if (openPurchaseOrderCount === 0) {
    missingData.add("unsupported_eta_signal");
  }

  const staleFromRequests = partsRequests.filter((row) => {
    if (row.fulfilled_at) return false;
    const age = toHoursAgo(nowTs, row.created_at);
    return (age ?? 0) >= PARTS_REQUEST_STALE_HOURS;
  }).length;

  const staleFromRequestItems = unresolvedRequestItems.filter((row) => {
    const age = toHoursAgo(nowTs, row.updated_at ?? row.created_at);
    return (age ?? 0) >= PARTS_REQUEST_STALE_HOURS;
  }).length;

  const stalePartsRequestCount = staleFromRequests + staleFromRequestItems;

  const evidence: WorkOrderPartsDelayEvidence = {
    workOrderId,
    shopId: actor.shopId,
    generatedAt: nowIso,
    partsLinked: requestedPartsCount > 0 || allocatedPartsCount > 0 || partRequestItems.length > 0,
    requestedPartsCount,
    allocatedPartsCount,
    receivedPartsCount,
    unavailablePartsCount: unavailablePartRowCount,
    waitingPartsCount,
    backorderedPartsCount: null,
    unknownAvailabilityCount,
    openPurchaseOrderCount,
    overduePurchaseOrderCount,
    etaMissingCount,
    stalePartsRequestCount,
    vendorReliabilityAvailable: false,
    linePartSignalsDetected: partSignalsOnLines,
    missingData: Array.from(missingData),
    sourceRefs,
    confidence: computePartsDelayConfidence(Array.from(missingData)),
  };

  return evidence;
}

export async function createWorkOrderPartsDelayEvidenceSnapshot(input: BuildInput): Promise<{
  evidence: AiEvidenceSnapshotRecord;
  snapshot: WorkOrderPartsDelayEvidence;
}> {
  const { supabase, actor } = input;
  const snapshot = await buildWorkOrderPartsDelayEvidence(input);

  const evidence = await createAiEvidenceSnapshot(supabase, actor, {
    domain: "work_orders",
    subjectType: "work_order",
    subjectId: snapshot.workOrderId,
    evidenceKind: "work_order_parts_delay_state",
    snapshot: snapshot as unknown as Json,
    sourceRefs: snapshot.sourceRefs as unknown as Json,
    missingData: snapshot.missingData as unknown as Json,
    freshnessAt: snapshot.generatedAt,
    confidence: snapshot.confidence,
    metadata: {
      rules_version: PARTS_DELAY_RULE_VERSION,
    },
  });

  return { evidence, snapshot };
}
