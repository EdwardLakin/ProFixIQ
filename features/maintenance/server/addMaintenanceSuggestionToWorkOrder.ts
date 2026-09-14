import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CanonicalQuoteItem,
} from "@/features/work-orders/lib/work-orders/canonicalQuoteLines";
import {
  createCanonicalQuoteLines,
} from "@/features/work-orders/lib/work-orders/canonicalQuoteLines";
import type { DB, MaintenanceSuggestionItem } from "./types";

type AddMaintenanceSuggestionOpts = {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  serviceCode: string;
  userId: string;
};

type AddMaintenanceSuggestionsOpts = {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  serviceCodes: string[];
  userId: string;
};

export type AddMaintenanceSuggestionResult = {
  ok: true;
  addedLineId: string;
  addedQuoteLineId: string;
  addPath: "menu_item" | "generic";
  serviceCode: string;
  created: boolean;
};

export type AddMaintenanceSuggestionsResult = {
  ok: true;
  added: AddMaintenanceSuggestionResult[];
  skipped: Array<{ serviceCode: string; error: string }>;
};

function normalizeServiceCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeJobType(
  value: string,
): NonNullable<CanonicalQuoteItem["jobType"]> {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "diagnosis" ||
    normalized === "repair" ||
    normalized === "maintenance" ||
    normalized === "inspection" ||
    normalized === "inspection-fail" ||
    normalized === "tech-suggested"
  ) {
    return normalized;
  }
  return "maintenance";
}

function finiteNonNegative(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function quoteItemFor(
  suggestion: MaintenanceSuggestionItem,
  serviceCode: string,
): CanonicalQuoteItem {
  const effectivePrice = finiteNonNegative(suggestion.effectivePrice);

  return {
    description: suggestion.label.trim(),
    jobType: normalizeJobType(suggestion.jobType),
    estLaborHours: finiteNonNegative(suggestion.laborHours),
    laborHours: finiteNonNegative(suggestion.laborHours),
    notes: suggestion.notes,
    source: "maintenance_suggestion",
    findingIdentity: `maintenance_suggestion:${serviceCode}`,
    ...(effectivePrice == null
      ? {}
      : { subtotal: effectivePrice, grandTotal: effectivePrice }),
    metadata: {
      maintenance_service_code: serviceCode,
      maintenance_menu_item_id: suggestion.menuItemId,
      maintenance_menu_repair_item_id: suggestion.menuRepairItemId,
      maintenance_mapping_source: suggestion.mappingSource,
      maintenance_why_due: suggestion.whyDue,
      maintenance_effective_price: effectivePrice,
    },
  };
}

export function getMaintenanceSuggestionErrorMessage(
  error: unknown,
  fallback = "Failed to add maintenance suggestion",
): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    for (const value of [
      candidate.message,
      candidate.details,
      candidate.hint,
    ]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

async function loadSuggestionCache(
  supabase: SupabaseClient<DB>,
  workOrderId: string,
  vehicleId: string | null,
): Promise<MaintenanceSuggestionItem[]> {
  const byWorkOrder = await supabase
    .from("maintenance_suggestions")
    .select("suggestions")
    .eq("work_order_id", workOrderId)
    .maybeSingle();

  if (byWorkOrder.error) throw byWorkOrder.error;
  let suggestionCache = byWorkOrder.data as { suggestions?: unknown } | null;

  if (!suggestionCache && vehicleId) {
    const byVehicle = await supabase
      .from("maintenance_suggestions")
      .select("suggestions")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byVehicle.error) throw byVehicle.error;
    suggestionCache = byVehicle.data as { suggestions?: unknown } | null;
  }

  if (!suggestionCache) {
    throw new Error(
      "No maintenance suggestion record found for this vehicle/work order",
    );
  }

  return Array.isArray(suggestionCache.suggestions)
    ? (suggestionCache.suggestions as MaintenanceSuggestionItem[])
    : [];
}

export async function addMaintenanceSuggestionsToWorkOrder(
  opts: AddMaintenanceSuggestionsOpts,
): Promise<AddMaintenanceSuggestionsResult> {
  const { supabase, workOrderId, userId } = opts;
  const requestedCodes = Array.from(
    new Set(opts.serviceCodes.map(normalizeServiceCode).filter(Boolean)),
  );

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id")
    .eq("id", workOrderId)
    .maybeSingle();

  if (workOrderError) throw workOrderError;
  if (!workOrder) throw new Error("Work order not found");
  if (!workOrder.shop_id) throw new Error("Work order is missing shop_id");

  const suggestions = await loadSuggestionCache(
    supabase,
    workOrderId,
    workOrder.vehicle_id,
  );
  const suggestionsByCode = new Map(
    suggestions.map((suggestion) => [
      normalizeServiceCode(suggestion.serviceCode),
      suggestion,
    ]),
  );

  const skipped: Array<{ serviceCode: string; error: string }> = [];
  const candidates: Array<{
    serviceCode: string;
    suggestion: MaintenanceSuggestionItem;
    item: CanonicalQuoteItem;
  }> = [];

  for (const serviceCode of requestedCodes) {
    const suggestion = suggestionsByCode.get(serviceCode);
    if (!suggestion) {
      skipped.push({
        serviceCode,
        error: "Requested maintenance suggestion was not found",
      });
      continue;
    }
    if (suggestion.suppressed) {
      skipped.push({
        serviceCode,
        error: "This maintenance suggestion is suppressed and cannot be added",
      });
      continue;
    }

    candidates.push({
      serviceCode,
      suggestion,
      item: quoteItemFor(suggestion, serviceCode),
    });
  }

  if (candidates.length === 0) return { ok: true, added: [], skipped };

  const quoteResult = await createCanonicalQuoteLines({
    supabase,
    shopId: workOrder.shop_id,
    workOrderId,
    vehicleId: workOrder.vehicle_id,
    suggestedBy: userId,
    items: candidates.map((candidate) => candidate.item),
  });

  if (!quoteResult.ok) throw new Error(quoteResult.error);

  const resultsByIdentity = new Map(
    quoteResult.items.map((item) => [item.findingIdentity, item]),
  );
  const added: AddMaintenanceSuggestionResult[] = [];

  for (const candidate of candidates) {
    const result = resultsByIdentity.get(
      `maintenance_suggestion:${candidate.serviceCode}`,
    );
    if (!result?.id) {
      skipped.push({
        serviceCode: candidate.serviceCode,
        error: "Failed to resolve the maintenance quote line",
      });
      continue;
    }

    added.push({
      ok: true,
      addedLineId: result.id,
      addedQuoteLineId: result.id,
      addPath: candidate.suggestion.addPath,
      serviceCode: candidate.serviceCode,
      created: result.created,
    });
  }

  return { ok: true, added, skipped };
}

export async function addMaintenanceSuggestionToWorkOrder(
  opts: AddMaintenanceSuggestionOpts,
): Promise<AddMaintenanceSuggestionResult> {
  const result = await addMaintenanceSuggestionsToWorkOrder({
    ...opts,
    serviceCodes: [opts.serviceCode],
  });
  const added = result.added[0];
  if (added) return added;

  throw new Error(
    result.skipped[0]?.error ?? "Failed to add maintenance suggestion",
  );
}
