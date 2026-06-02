import "server-only";

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { estimateLabor } from "@ai/lib/ai/estimateLabor";
import { normalizeLaborHoursInput } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import {
  createCanonicalQuoteLines,
  type CanonicalQuoteItem,
  type CanonicalQuotePart,
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
  status?: "ok" | "fail" | "na" | "recommend" | string | null;
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

export type ImportFromInspectionArgs = {
  supabase: SupabaseClient<DB>;
  inspectionId: string;
  workOrderId: string;
  vehicleId?: string | null;
  userId: string;
  autoGenerateParts?: boolean;
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
      /** @deprecated Legacy work_order_lines are no longer created by inspection import. */
      insertedJobIds: null;
      /** @deprecated Legacy work_order_lines are no longer created by inspection import. */
      workOrderLineIds: null;
    }
  | { ok: false; error: string };

function normalizeSourceComponent(value: string | number | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTitle(value: unknown): string {
  return safeString(value).toLowerCase().replace(/\s+/g, " ");
}

function buildInspectionSourceKey(args: {
  inspectionId: string;
  sectionIndex: number;
  itemIndex: number;
  sectionTitle?: string;
  sectionKey?: string;
  itemName?: string;
  itemLabel?: string;
  unit?: string | null;
}): string {
  const normalizedSectionTitle = normalizeSourceComponent(args.sectionTitle);
  const normalizedSectionKey = normalizeSourceComponent(args.sectionKey);
  const normalizedItemName = normalizeSourceComponent(args.itemName || args.itemLabel);
  const normalizedUnit = normalizeSourceComponent(args.unit);
  const raw = `${args.inspectionId}|${args.sectionIndex}|${args.itemIndex}|${normalizedSectionKey}|${normalizedSectionTitle}|${normalizedItemName}|${normalizedUnit}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildFindingIdentity(args: {
  inspectionId: string;
  sourceKey: string;
  sectionKey: string;
  normalizedTitle: string;
  normalizedDescription: string;
}): string {
  return [
    args.inspectionId,
    args.sectionKey,
    args.sourceKey,
    args.normalizedTitle || args.normalizedDescription,
    args.normalizedDescription,
  ]
    .filter(Boolean)
    .join(":");
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
  return Array.isArray(raw) ? raw.filter((url): url is string => typeof url === "string" && url.trim().length > 0) : [];
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
    .filter((part) => part.description.length > 0);
}

function shouldIncludeInspectionItem(item: InspectionItem, jobType: CanonicalQuoteItem["jobType"]): boolean {
  return item.status === "fail" || item.status === "recommend" || item.recommend === true || jobType !== "repair";
}

export async function insertPrioritizedJobsFromInspection(
  args: ImportFromInspectionArgs,
): Promise<ImportFromInspectionResult> {
  const {
    supabase,
    inspectionId,
    workOrderId,
    vehicleId,
    userId,
    autoGenerateParts = true,
  } = args;

  const { data: inspection, error: inspErr } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle<InspectionRow>();

  if (inspErr) {
    return { ok: false, error: `Failed to fetch inspection: ${inspErr.message}` };
  }
  if (!inspection) {
    return { ok: false, error: "Inspection not found." };
  }
  if (!inspection.shop_id) {
    return { ok: false, error: "Inspection is missing shop_id." };
  }

  const { data: workOrder, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id, status")
    .eq("id", workOrderId)
    .maybeSingle<{ id: string; shop_id: string | null; vehicle_id: string | null; status: string | null }>();

  if (woErr) {
    return { ok: false, error: `Failed to fetch work order: ${woErr.message}` };
  }
  if (!workOrder) {
    return { ok: false, error: "Work order not found." };
  }
  if (!workOrder.shop_id || workOrder.shop_id !== inspection.shop_id) {
    return { ok: false, error: "Inspection and work order must belong to the same shop." };
  }

  const blockedStatuses = new Set(["cancelled", "canceled", "invoiced", "closed"]);
  if (blockedStatuses.has((workOrder.status ?? "").toLowerCase())) {
    return { ok: false, error: "Cannot import inspection findings into a cancelled, closed, or invoiced work order." };
  }

  const shopId = inspection.shop_id;
  const result = (inspection as unknown as { result?: unknown })?.result as InspectionResult | undefined;

  if (!result?.sections || !Array.isArray(result.sections)) {
    return { ok: false, error: "Invalid inspection format: missing sections." };
  }

  const diagnosisKeywords = ["check engine", "diagnose", "misfire", "no start"];
  const maintenanceKeywords = ["oil", "fluid", "filter", "belt", "coolant"];
  const autoPartsKeywords = ["brake", "pads", "rotor", "fluid", "coolant", "filter", "belt"];

  const quoteItems: CanonicalQuoteItem[] = [];

  for (const [sectionIndex, section] of result.sections.entries()) {
    const sectionTitle = safeString(section.title) || safeString(section.name) || `Section ${sectionIndex + 1}`;
    const sectionKey = safeString(section.key) || safeString(section.id) || normalizeTitle(sectionTitle) || `section-${sectionIndex}`;

    for (const [itemIndex, item] of (section.items ?? []).entries()) {
      const title = itemTitle(item);
      if (!title) continue;

      const titleLower = title.toLowerCase();
      let jobType: CanonicalQuoteItem["jobType"] = "repair";

      if (diagnosisKeywords.some((keyword) => titleLower.includes(keyword))) jobType = "diagnosis";
      else if (item.status === "fail") jobType = "inspection-fail";
      else if (maintenanceKeywords.some((keyword) => titleLower.includes(keyword))) jobType = "maintenance";

      if (!shouldIncludeInspectionItem(item, jobType)) continue;

      const sourceKey = buildInspectionSourceKey({
        inspectionId,
        sectionIndex,
        itemIndex,
        sectionTitle,
        sectionKey,
        itemName: title,
        itemLabel: item.label,
        unit: item.unit,
      });
      const notes = itemNotes(item);
      const value = item.value != null ? String(item.value) : "";
      const measurement = value ? `${value}${item.unit ?? ""}` : "";
      const descriptionParts = [title, measurement ? `(${measurement})` : "", notes ? `- ${notes}` : ""];
      const description = descriptionParts.filter(Boolean).join(" ");
      const normalizedFindingTitle = normalizeTitle(title);
      const normalizedDescription = normalizeTitle(description);
      const findingIdentity = buildFindingIdentity({
        inspectionId,
        sourceKey,
        sectionKey,
        normalizedTitle: normalizedFindingTitle,
        normalizedDescription,
      });

      const explicitLaborHours = finiteNumber(item.laborHours) ?? finiteNumber(item.labor_hours);
      const laborHours = explicitLaborHours ?? normalizeLaborHoursInput(await estimateLabor(title, jobType ?? "repair"), true);
      const parts = itemParts(item);

      if (autoGenerateParts && parts.length === 0 && autoPartsKeywords.some((keyword) => description.toLowerCase().includes(keyword))) {
        parts.push({ description: title, qty: 1, cost: null, unitCost: null, unitPrice: null, notes: "Auto-generated from inspection" });
      }

      const partsTotal = parts.reduce((sum, part) => sum + (finiteNumber(part.unitCost) ?? finiteNumber(part.cost) ?? 0) * (part.qty ?? 1), 0);
      const hasUnpricedParts = parts.some((part) => finiteNumber(part.unitPrice) == null && finiteNumber(part.unitCost) == null && finiteNumber(part.cost) == null);

      const metadata: Record<string, Json | undefined> = {
        legacy_import_route: "/api/work-orders/import-from-inspection",
        canonicalized_phase: "5E-1",
        shop_id: shopId,
        work_order_id: workOrderId,
        vehicle_id: vehicleId || workOrder.vehicle_id || undefined,
        inspection_id: inspectionId,
        source_inspection_item_key: sourceKey,
        source_section_key: sectionKey,
        source_section_title: sectionTitle,
        source_item_title: title,
        source_item_description: safeString(item.description) || undefined,
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
        labor_estimate_hours: laborHours,
        parts_estimate: parts,
        photo_urls: itemPhotoUrls(item),
      };

      quoteItems.push({
        description,
        title,
        source: "inspection",
        sourceInspectionId: inspectionId,
        sourceSectionKey: sectionKey,
        sourceSectionTitle: sectionTitle,
        sourceItemKey: sourceKey,
        sourceFindingTitle: title,
        normalizedFindingTitle,
        findingIdentity,
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
        status: parts.length > 0 && hasUnpricedParts ? "pending_parts" : "advisor_pending",
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

  const resultFromQuoteLines = await createCanonicalQuoteLines({
    supabase,
    shopId,
    workOrderId,
    vehicleId: vehicleId || workOrder.vehicle_id || null,
    suggestedBy: userId,
    items: quoteItems,
  });

  if (!resultFromQuoteLines.ok) {
    return { ok: false, error: resultFromQuoteLines.error };
  }

  const createdQuoteLines = resultFromQuoteLines.items
    .filter((item) => item.created)
    .map((item) => ({ id: item.id, findingIdentity: item.findingIdentity }));

  return {
    ok: true,
    insertedCount: resultFromQuoteLines.createdCount,
    quoteLineIds: resultFromQuoteLines.ids,
    createdQuoteLines,
    skippedDuplicates: resultFromQuoteLines.skippedDuplicateCount,
    skippedCount: resultFromQuoteLines.skippedDuplicateCount,
    partsRequestsCount: resultFromQuoteLines.createdPartRequestIds.length,
    createdPartRequestIds: resultFromQuoteLines.createdPartRequestIds,
    skippedPartsRequestsCount: resultFromQuoteLines.skippedPartRequestItemCount,
    message: "Imported findings to Quote Review. No work order lines were created before customer approval.",
    insertedJobIds: null,
    workOrderLineIds: null,
  };
}
