import "server-only";

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { estimateLabor } from "@ai/lib/ai/estimateLabor";
import { normalizeLaborHoursInput } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import {
  classifyEligibleInspectionFinding,
  isExplicitInspectionRecommendation,
} from "@/features/work-orders/lib/work-orders/inspectionFindingEligibility";
import type {
  CanonicalQuoteItem,
  CanonicalQuotePart,
} from "@/features/work-orders/lib/work-orders/canonicalQuoteLines";

type DB = Database;
type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];

type InspectionItem = {
  item?: string;
  name?: string;
  label?: string;
  title?: string;
  description?: string;
  value?: string | number | null;
  unit?: string | null;
  notes?: string | null;
  note?: string | null;
  status?: string | null;
  recommend?: boolean | string[] | null;
  parts?: Array<{
    description?: string;
    name?: string;
    qty?: number;
    quantity?: number;
    cost?: number | null;
    unitCost?: number | null;
    unitPrice?: number | null;
    notes?: string | null;
  }>;
  laborHours?: number | null;
  labor_hours?: number | null;
  photoUrls?: string[];
  photo_urls?: string[];
  severity?: string | null;
  recommendation?: string | null;
  recommendationType?: string | null;
  priority?: string | number | null;
};

type InspectionResult = {
  sections: Array<{
    key?: string;
    id?: string;
    title?: string;
    name?: string;
    items: InspectionItem[];
  }>;
};

type RpcError = { message: string; details?: string | null; hint?: string | null };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type AtomicImportResult = {
  ok?: boolean;
  ids?: string[];
  items?: Array<{
    requestedId?: string | null;
    id?: string;
    created?: boolean;
    findingIdentity?: string | null;
  }>;
  createdCount?: number;
  skippedDuplicateCount?: number;
  createdPartRequestIds?: string[];
  partRequestIds?: string[];
  createdPartRequestItemCount?: number;
  skippedPartRequestItemCount?: number;
  idempotent?: boolean;
};

export type ImportFromInspectionArgs = {
  supabase: SupabaseClient<DB>;
  inspectionId: string;
  workOrderId: string;
  vehicleId?: string | null;
  userId: string;
  autoGenerateParts?: boolean;
  operationKey?: string;
};

export type ImportFromInspectionResult =
  | {
      ok: true;
      insertedCount: number;
      quoteLineIds: string[];
      createdQuoteLines: Array<{ id: string; findingIdentity: string | null }>;
      skippedDuplicates: number;
      skippedCount: number;
      partsRequestsCount: number;
      createdPartRequestIds: string[];
      skippedPartsRequestsCount: number;
      message: string;
      insertedJobIds: null;
      workOrderLineIds: null;
      idempotent?: boolean;
    }
  | { ok: false; error: string };

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: unknown): string {
  return safeString(value).toLowerCase().replace(/\s+/g, " ");
}

function itemTitle(item: InspectionItem): string {
  return (
    safeString(item.item) ||
    safeString(item.name) ||
    safeString(item.label) ||
    safeString(item.title) ||
    safeString(item.description)
  );
}

function itemNotes(item: InspectionItem): string {
  return safeString(item.notes) || safeString(item.note);
}

function itemPhotoUrls(item: InspectionItem): string[] {
  const raw = Array.isArray(item.photoUrls) ? item.photoUrls : item.photo_urls;
  return Array.isArray(raw)
    ? raw.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0,
      )
    : [];
}

function itemParts(item: InspectionItem): CanonicalQuotePart[] {
  return (Array.isArray(item.parts) ? item.parts : [])
    .map((part) => ({
      description: safeString(part.description) || safeString(part.name),
      qty: Math.max(1, Number(part.qty ?? part.quantity) || 1),
      cost: finiteNumber(part.cost),
      unitCost: finiteNumber(part.unitCost),
      unitPrice: finiteNumber(part.unitPrice),
      notes: safeString(part.notes) || null,
    }))
    .filter((part) => Boolean(part.description));
}

function sourceKey(input: {
  inspectionId: string;
  sectionIndex: number;
  itemIndex: number;
  sectionKey: string;
  sectionTitle: string;
  title: string;
  unit?: string | null;
}): string {
  const raw = [
    input.inspectionId,
    input.sectionIndex,
    input.itemIndex,
    normalize(input.sectionKey),
    normalize(input.sectionTitle),
    normalize(input.title),
    normalize(input.unit),
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function findingIdentity(input: {
  inspectionId: string;
  sectionKey: string;
  sourceItemKey: string;
  title: string;
  description: string;
}): string {
  return [
    input.inspectionId,
    input.sectionKey,
    input.sourceItemKey,
    normalize(input.title) || normalize(input.description),
    normalize(input.description),
  ]
    .filter(Boolean)
    .join(":");
}

function stableImportKey(input: {
  inspectionId: string;
  workOrderId: string;
  items: CanonicalQuoteItem[];
}): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        inspectionId: input.inspectionId,
        workOrderId: input.workOrderId,
        identities: input.items.map((item) => item.findingIdentity).sort(),
      }),
    )
    .digest("hex");
}

export async function insertPrioritizedJobsFromInspection(
  args: ImportFromInspectionArgs,
): Promise<ImportFromInspectionResult> {
  const {
    supabase,
    inspectionId,
    workOrderId,
    vehicleId = null,
    userId,
    autoGenerateParts = true,
  } = args;

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .eq("is_canonical", true)
    .maybeSingle<InspectionRow>();
  if (inspectionError) {
    return { ok: false, error: `Failed to fetch inspection: ${inspectionError.message}` };
  }
  if (!inspection?.shop_id) {
    return { ok: false, error: "Inspection not found or missing shop scope." };
  }

  const rawResult = inspection.summary as unknown as InspectionResult | undefined;
  if (!rawResult?.sections || !Array.isArray(rawResult.sections)) {
    return { ok: false, error: "Invalid inspection format: missing sections." };
  }

  const quoteItems: CanonicalQuoteItem[] = [];
  const autoPartKeywords = ["brake", "pads", "rotor", "fluid", "coolant", "filter", "belt"];

  for (const [sectionIndex, section] of rawResult.sections.entries()) {
    const sectionTitle =
      safeString(section.title) || safeString(section.name) || `Section ${sectionIndex + 1}`;
    const sectionKey =
      safeString(section.key) ||
      safeString(section.id) ||
      normalize(sectionTitle) ||
      `section-${sectionIndex}`;

    for (const [itemIndex, item] of (section.items ?? []).entries()) {
      const title = itemTitle(item);
      if (!title || !isExplicitInspectionRecommendation(item)) continue;

      const jobType = classifyEligibleInspectionFinding({
        title,
        status: item.status,
      });
      const key = sourceKey({
        inspectionId,
        sectionIndex,
        itemIndex,
        sectionKey,
        sectionTitle,
        title,
        unit: item.unit,
      });
      const notes = itemNotes(item);
      const measurement =
        item.value != null ? `${String(item.value)}${item.unit ?? ""}` : "";
      const description = [
        title,
        measurement ? `(${measurement})` : "",
        notes ? `- ${notes}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const identity = findingIdentity({
        inspectionId,
        sectionKey,
        sourceItemKey: key,
        title,
        description,
      });

      const explicitLabor =
        finiteNumber(item.laborHours) ?? finiteNumber(item.labor_hours);
      const laborHours =
        explicitLabor ??
        normalizeLaborHoursInput(await estimateLabor(title, jobType), true);
      const parts = itemParts(item);
      if (
        autoGenerateParts &&
        parts.length === 0 &&
        autoPartKeywords.some((keyword) =>
          description.toLowerCase().includes(keyword),
        )
      ) {
        parts.push({
          description: title,
          qty: 1,
          cost: null,
          unitCost: null,
          unitPrice: null,
          notes: "Auto-generated from inspection",
        });
      }

      const partsTotal = parts.reduce(
        (sum, part) =>
          sum +
          (finiteNumber(part.unitCost) ?? finiteNumber(part.cost) ?? 0) *
            (part.qty ?? 1),
        0,
      );
      const hasUnpricedParts = parts.some(
        (part) =>
          finiteNumber(part.unitPrice) == null &&
          finiteNumber(part.unitCost) == null &&
          finiteNumber(part.cost) == null,
      );

      const metadata: Record<string, Json | undefined> = {
        legacy_import_route: "/api/work-orders/import-from-inspection",
        canonicalized_phase: "5",
        inspection_id: inspectionId,
        source_inspection_item_key: key,
        source_section_key: sectionKey,
        source_section_title: sectionTitle,
        source_item_title: title,
        technician_notes: notes || undefined,
        measurement: measurement || undefined,
        inspection_status: safeString(item.status) || undefined,
        recommend: typeof item.recommend === "boolean" ? item.recommend : undefined,
        recommendation_metadata: {
          severity: item.severity ?? null,
          recommendation: item.recommendation ?? null,
          recommendationType: item.recommendationType ?? null,
          priority: item.priority ?? null,
        },
        photo_urls: itemPhotoUrls(item),
      };

      quoteItems.push({
        description,
        title,
        source: "inspection",
        sourceInspectionId: inspectionId,
        sourceWorkOrderLineId:
          (inspection as unknown as { work_order_line_id?: string | null })
            .work_order_line_id ?? null,
        sourceSectionKey: sectionKey,
        sourceSectionTitle: sectionTitle,
        sourceItemKey: key,
        sourceFindingTitle: title,
        normalizedFindingTitle: normalize(title),
        findingIdentity: identity,
        photoUrls: itemPhotoUrls(item),
        jobType,
        estLaborHours: laborHours,
        laborHours,
        partsTotal,
        subtotal: partsTotal,
        grandTotal: partsTotal,
        notes: notes || null,
        complaint: notes || description,
        aiComplaint: notes || description,
        status:
          parts.length > 0 && hasUnpricedParts
            ? "pending_parts"
            : "advisor_pending",
        stage: "advisor_pending",
        parts,
        metadata,
      });
    }
  }

  if (quoteItems.length === 0) {
    return {
      ok: true,
      insertedCount: 0,
      quoteLineIds: [],
      createdQuoteLines: [],
      skippedDuplicates: 0,
      skippedCount: 0,
      partsRequestsCount: 0,
      createdPartRequestIds: [],
      skippedPartsRequestsCount: 0,
      message: "No failed or recommended inspection findings were eligible for Quote Review.",
      insertedJobIds: null,
      workOrderLineIds: null,
    };
  }

  const operationKey =
    args.operationKey?.trim() ||
    stableImportKey({ inspectionId, workOrderId, items: quoteItems });
  const rpc = supabase as unknown as RpcClient;
  const { data, error } = await rpc.rpc("import_inspection_quote_package_atomic", {
    p_shop_id: inspection.shop_id,
    p_work_order_id: workOrderId,
    p_inspection_id: inspectionId,
    p_requested_vehicle_id: vehicleId,
    p_actor_user_id: userId,
    p_operation_key: `${inspection.shop_id}:inspection-import:${operationKey}`,
    p_items: quoteItems,
    p_at: new Date().toISOString(),
  });

  if (error) {
    return {
      ok: false,
      error: [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — "),
    };
  }

  const result = data && typeof data === "object" ? (data as AtomicImportResult) : {};
  const items = Array.isArray(result.items) ? result.items : [];
  const createdQuoteLines = items
    .filter((item) => item.created === true && typeof item.id === "string")
    .map((item) => ({
      id: item.id as string,
      findingIdentity:
        typeof item.findingIdentity === "string" ? item.findingIdentity : null,
    }));
  const quoteLineIds = Array.isArray(result.ids)
    ? result.ids.filter((id): id is string => typeof id === "string")
    : items
        .map((item) => item.id)
        .filter((id): id is string => typeof id === "string");
  const createdPartRequestIds = Array.isArray(result.createdPartRequestIds)
    ? result.createdPartRequestIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];

  return {
    ok: true,
    insertedCount: Number(result.createdCount ?? createdQuoteLines.length),
    quoteLineIds,
    createdQuoteLines,
    skippedDuplicates: Number(result.skippedDuplicateCount ?? 0),
    skippedCount: Number(result.skippedDuplicateCount ?? 0),
    partsRequestsCount: createdPartRequestIds.length,
    createdPartRequestIds,
    skippedPartsRequestsCount: Number(
      result.skippedPartRequestItemCount ?? 0,
    ),
    message:
      "Imported findings to Quote Review. No work order lines were created before customer approval.",
    insertedJobIds: null,
    workOrderLineIds: null,
    idempotent: result.idempotent === true,
  };
}
