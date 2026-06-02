import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { syncQuoteLinePartsStatus } from "@/features/parts/server/syncQuoteLinePartsStatus";

type DB = Database;
type QuoteInsert = DB["public"]["Tables"]["work_order_quote_lines"]["Insert"];
type PartRequestInsert = DB["public"]["Tables"]["part_requests"]["Insert"];
type PartRequestItemInsert = DB["public"]["Tables"]["part_request_items"]["Insert"];

export type CanonicalQuotePart = {
  description?: string;
  name?: string;
  partNumber?: string | null;
  part_number?: string | null;
  sku?: string | null;
  qty?: number;
  cost?: number | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  notes?: string | null;
};

export type CanonicalQuoteItem = {
  id?: string | null;
  description: string;
  title?: string | null;
  jobType?: "diagnosis" | "repair" | "maintenance" | "inspection" | "inspection-fail" | "tech-suggested";
  estLaborHours?: number | null;
  laborHours?: number | null;
  laborRate?: number | null;
  partsTotal?: number | null;
  laborTotal?: number | null;
  subtotal?: number | null;
  taxTotal?: number | null;
  grandTotal?: number | null;
  notes?: string | null;
  complaint?: string | null;
  aiComplaint?: string | null;
  aiCause?: string | null;
  aiCorrection?: string | null;
  status?: string | null;
  stage?: string | null;
  source?: "inspection" | string | null;
  sourceInspectionId?: string | null;
  sourceWorkOrderLineId?: string | null;
  sourceSectionKey?: string | null;
  sourceSectionTitle?: string | null;
  sourceItemKey?: string | null;
  sourceFindingTitle?: string | null;
  normalizedFindingTitle?: string | null;
  findingIdentity?: string | null;
  photoUrls?: string[];
  parts?: CanonicalQuotePart[];
  metadata?: Record<string, Json | undefined> | null;
};

export type CreateCanonicalQuoteLinesInput = {
  supabase: SupabaseClient<DB>;
  shopId: string;
  workOrderId: string;
  vehicleId?: string | null;
  suggestedBy?: string | null;
  items: CanonicalQuoteItem[];
};

export type CanonicalQuoteLineItemResult = {
  requestedId: string | null;
  id: string;
  created: boolean;
  findingIdentity: string | null;
};

export type CreateCanonicalQuoteLinesResult = {
  ok: true;
  ids: string[];
  items: CanonicalQuoteLineItemResult[];
  createdCount: number;
  skippedDuplicateCount: number;
  createdPartRequestIds: string[];
  partRequestIds: string[];
  createdPartRequestItemCount: number;
  skippedPartRequestItemCount: number;
} | { ok: false; error: string };

export function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTitle(value: unknown): string {
  return safeTrim(value).toLowerCase().replace(/\s+/g, " ");
}

export function cleanParts(parts: CanonicalQuotePart[] | undefined): Array<{
  description: string;
  partNumber: string | null;
  qty: number;
  unitCost: number | null;
  unitPrice: number | null;
  notes: string | null;
}> {
  return (parts ?? [])
    .map((part) => {
      const description = safeTrim(part.description) || safeTrim(part.name);
      const qty = Math.max(1, Number(part.qty) || 1);
      return {
        description,
        partNumber:
          safeTrim(part.partNumber) || safeTrim(part.part_number) || safeTrim(part.sku) || null,
        qty,
        unitCost: finiteNumber(part.unitCost) ?? finiteNumber(part.cost),
        unitPrice: finiteNumber(part.unitPrice),
        notes: safeTrim(part.notes) || null,
      };
    })
    .filter((part) => part.description.length > 0);
}

export function identityFor(item: CanonicalQuoteItem): string | null {
  const explicit = safeTrim(item.findingIdentity);
  if (explicit) return explicit;

  const inspectionId = safeTrim(item.sourceInspectionId);
  const sourceLineId = safeTrim(item.sourceWorkOrderLineId);
  const sectionKey = safeTrim(item.sourceSectionKey);
  const itemKey = safeTrim(item.sourceItemKey);
  const normalizedTitle =
    normalizeTitle(item.normalizedFindingTitle) ||
    normalizeTitle(item.sourceFindingTitle) ||
    normalizeTitle(item.title) ||
    normalizeTitle(item.description);

  const parts = [inspectionId, sourceLineId, sectionKey, itemKey, normalizedTitle].filter(Boolean);
  return parts.length > 0 ? parts.join(":") : null;
}

function normalizePartRequestItemIdentity(input: {
  description?: string | null;
  partNumber?: string | null;
}): string {
  const normalizedDescription = normalizeTitle(input.description);
  const normalizedPartNumber = safeTrim(input.partNumber).toUpperCase().replace(/\s+/g, "");
  return [normalizedPartNumber, normalizedDescription].filter(Boolean).join("|");
}

async function getOrCreatePartRequestForQuoteLine(
  supabase: SupabaseClient<DB>,
  input: {
    shopId: string;
    workOrderId: string;
    quoteLineId: string;
    requestedBy: string | null;
    notes: string | null;
  },
): Promise<{ id: string; created: boolean; error?: string }> {
  const { data: existing, error: existingError } = await supabase
    .from("part_requests")
    .select("id")
    .eq("shop_id", input.shopId)
    .eq("work_order_id", input.workOrderId)
    .eq("quote_line_id", input.quoteLineId)
    .limit(1);

  if (existingError) {
    return { id: "", created: false, error: existingError.message };
  }

  const reusable = existing?.[0];
  if (reusable?.id) {
    return { id: reusable.id, created: false };
  }

  const requestPayload: PartRequestInsert = {
    shop_id: input.shopId,
    work_order_id: input.workOrderId,
    quote_line_id: input.quoteLineId,
    job_id: null,
    requested_by: input.requestedBy,
    notes: input.notes,
    status: "requested",
  };

  const { data: partRequest, error: requestError } = await supabase
    .from("part_requests")
    .insert(requestPayload)
    .select("id")
    .single();

  if (requestError || !partRequest) {
    return {
      id: "",
      created: false,
      error: requestError?.message ?? "Failed to create part request",
    };
  }

  return { id: partRequest.id, created: true };
}

export async function createCanonicalQuoteLines(
  input: CreateCanonicalQuoteLinesInput,
): Promise<CreateCanonicalQuoteLinesResult> {
  const { supabase, shopId, workOrderId, vehicleId = null, suggestedBy = null, items } = input;

  const requestedIds = items.map((item) => safeTrim(item.id)).filter(Boolean);
  const identities = items.map(identityFor).filter((value): value is string => Boolean(value));

  const existingById = new Map<string, { id: string }>();
  if (requestedIds.length > 0) {
    const { data, error } = await supabase
      .from("work_order_quote_lines")
      .select("id")
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId)
      .in("id", requestedIds);

    if (error) return { ok: false, error: error.message };
    for (const row of data ?? []) existingById.set(row.id, row);
  }

  const existingByIdentity = new Map<string, { id: string }>();
  for (const identity of identities) {
    const { data, error } = await supabase
      .from("work_order_quote_lines")
      .select("id")
      .eq("shop_id", shopId)
      .eq("work_order_id", workOrderId)
      .contains("metadata", { inspection_finding_identity: identity })
      .limit(1);

    if (error) return { ok: false, error: error.message };

    const existing = data?.[0];
    if (existing) existingByIdentity.set(identity, existing);
  }

  const rows: QuoteInsert[] = [];
  const pendingSources: CanonicalQuoteItem[] = [];
  const sourceItemsById = new Map<string, CanonicalQuoteItem>();
  const itemResults: CanonicalQuoteLineItemResult[] = [];
  const seenNewIdentities = new Set<string>();

  for (const item of items) {
    const description = safeTrim(item.description) || safeTrim(item.title);
    if (!description) continue;

    const requestedId = safeTrim(item.id) || null;
    const findingIdentity = identityFor(item);
    const existing =
      (requestedId ? existingById.get(requestedId) : undefined) ??
      (findingIdentity ? existingByIdentity.get(findingIdentity) : undefined);

    if (existing || (findingIdentity && seenNewIdentities.has(findingIdentity))) {
      const duplicate = existing ?? (findingIdentity ? existingByIdentity.get(findingIdentity) : undefined);
      if (duplicate) {
        sourceItemsById.set(duplicate.id, item);
        itemResults.push({ requestedId, id: duplicate.id, created: false, findingIdentity });
      } else {
        itemResults.push({ requestedId, id: "", created: false, findingIdentity });
      }
      continue;
    }

    if (findingIdentity) seenNewIdentities.add(findingIdentity);

    const parts = cleanParts(item.parts);
    const partsTotal =
      finiteNumber(item.partsTotal) ??
      parts.reduce((sum, part) => sum + (part.unitCost ?? 0) * part.qty, 0);
    const laborHours = finiteNumber(item.laborHours) ?? finiteNumber(item.estLaborHours);
    const laborTotal = finiteNumber(item.laborTotal);
    const subtotal = finiteNumber(item.subtotal) ?? partsTotal + (laborTotal ?? 0);
    const grandTotal = finiteNumber(item.grandTotal) ?? subtotal + (finiteNumber(item.taxTotal) ?? 0);
    const normalizedFindingTitle =
      normalizeTitle(item.normalizedFindingTitle) ||
      normalizeTitle(item.sourceFindingTitle) ||
      normalizeTitle(description);

    const metadata: Record<string, Json | undefined> = {
      ...(item.metadata ?? {}),
      source: item.source ?? "inspection",
      source_inspection_id: safeTrim(item.sourceInspectionId) || undefined,
      source_work_order_line_id: safeTrim(item.sourceWorkOrderLineId) || undefined,
      source_section_key: safeTrim(item.sourceSectionKey) || undefined,
      source_section_title: safeTrim(item.sourceSectionTitle) || undefined,
      source_item_key: safeTrim(item.sourceItemKey) || undefined,
      source_finding_title: safeTrim(item.sourceFindingTitle) || description,
      source_finding_title_normalized: normalizedFindingTitle || undefined,
      inspection_finding_identity: findingIdentity ?? undefined,
      photo_urls: Array.isArray(item.photoUrls) ? item.photoUrls : [],
      parts,
      labor_rate: finiteNumber(item.laborRate) ?? undefined,
    };

    const row: QuoteInsert = {
      ...(requestedId ? { id: requestedId } : {}),
      work_order_id: workOrderId,
      work_order_line_id: null,
      shop_id: shopId,
      vehicle_id: vehicleId,
      suggested_by: suggestedBy,
      description,
      job_type: item.jobType ?? "tech-suggested",
      est_labor_hours: finiteNumber(item.estLaborHours) ?? laborHours,
      notes: safeTrim(item.notes) || safeTrim(item.complaint) || null,
      status: safeTrim(item.status) || "pending_parts",
      ai_complaint: safeTrim(item.aiComplaint) || safeTrim(item.complaint) || null,
      ai_cause: safeTrim(item.aiCause) || null,
      ai_correction: safeTrim(item.aiCorrection) || null,
      stage: safeTrim(item.stage) || "advisor_pending",
      qty: 1,
      labor_hours: laborHours,
      parts_total: partsTotal,
      labor_total: laborTotal,
      subtotal,
      tax_total: finiteNumber(item.taxTotal),
      grand_total: grandTotal,
      metadata: metadata as Json,
      group_id: null,
      sent_to_customer_at: null,
      approved_at: null,
      declined_at: null,
    };

    rows.push(row);
    pendingSources.push(item);
  }

  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("work_order_quote_lines")
      .insert(rows)
      .select("id");

    if (error) return { ok: false, error: error.message };

    (data ?? []).forEach((row, index) => {
      const source = pendingSources.find((item) => safeTrim(item.id) === row.id) ?? pendingSources[index];
      if (source) sourceItemsById.set(row.id, source);
      itemResults.push({
        requestedId: safeTrim(source?.id) || null,
        id: row.id,
        created: true,
        findingIdentity: source ? identityFor(source) : null,
      });
    });
  }

  const createdPartRequestIds: string[] = [];
  const partRequestIds: string[] = [];
  let createdPartRequestItemCount = 0;
  let skippedPartRequestItemCount = 0;

  for (const quoteLineId of itemResults.map((item) => item.id).filter(Boolean)) {
    const source = sourceItemsById.get(quoteLineId);
    const parts = cleanParts(source?.parts);
    if (!source || parts.length === 0) continue;

    const sourceNote = safeTrim(source.notes) || safeTrim(source.complaint);
    const requestNotes = [
      sourceNote,
      `Quote line: ${quoteLineId}`,
      source.sourceInspectionId ? `Inspection: ${source.sourceInspectionId}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const partRequest = await getOrCreatePartRequestForQuoteLine(supabase, {
      shopId,
      workOrderId,
      quoteLineId,
      requestedBy: suggestedBy,
      notes: requestNotes || null,
    });

    if (partRequest.error || !partRequest.id) {
      return { ok: false, error: partRequest.error ?? "Failed to create part request" };
    }

    partRequestIds.push(partRequest.id);
    if (partRequest.created) createdPartRequestIds.push(partRequest.id);

    const { data: existingItems, error: existingItemsError } = await supabase
      .from("part_request_items")
      .select("id, description")
      .eq("request_id", partRequest.id)
      .eq("quote_line_id", quoteLineId);

    if (existingItemsError) return { ok: false, error: existingItemsError.message };

    const existingItemIdentities = new Set(
      (existingItems ?? []).map((item) =>
        normalizePartRequestItemIdentity({ description: item.description }),
      ),
    );

    const partRows: PartRequestItemInsert[] = [];
    for (const part of parts) {
      const itemIdentity = normalizePartRequestItemIdentity({ description: part.description });
      if (itemIdentity && existingItemIdentities.has(itemIdentity)) {
        skippedPartRequestItemCount += 1;
        continue;
      }
      if (itemIdentity) existingItemIdentities.add(itemIdentity);

      partRows.push({
        request_id: partRequest.id,
        shop_id: shopId,
        work_order_id: workOrderId,
        quote_line_id: quoteLineId,
        work_order_line_id: null,
        description: part.description,
        qty: part.qty,
        qty_requested: part.qty,
        unit_cost: part.unitCost,
        unit_price: part.unitPrice,
        status: "requested",
      });
    }

    if (partRows.length > 0) {
      const { error: itemError } = await supabase.from("part_request_items").insert(partRows);
      if (itemError) return { ok: false, error: itemError.message };
      createdPartRequestItemCount += partRows.length;
    }

    const syncResult = await syncQuoteLinePartsStatus(supabase, { shopId, quoteLineId });
    if (!syncResult.ok) {
      return { ok: false, error: syncResult.error ?? "Failed to sync quote line parts status" };
    }
  }

  return {
    ok: true,
    ids: itemResults.map((item) => item.id).filter(Boolean),
    items: itemResults,
    createdCount: itemResults.filter((item) => item.created).length,
    skippedDuplicateCount: itemResults.filter((item) => !item.created).length,
    createdPartRequestIds,
    partRequestIds: [...new Set(partRequestIds)],
    createdPartRequestItemCount,
    skippedPartRequestItemCount,
  };
}
