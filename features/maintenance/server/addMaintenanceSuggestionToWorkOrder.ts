import type { SupabaseClient } from "@supabase/supabase-js";
import type { DB, MaintenanceSuggestionItem } from "./types";

type AddMaintenanceSuggestionOpts = {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
  serviceCode: string;
  userId: string;
};

type AddMaintenanceSuggestionResult = {
  ok: true;
  addedLineId: string;
  addPath: "menu_item" | "generic";
  serviceCode: string;
};

function normalizeServiceCode(value: string): string {
  return value.trim().toUpperCase();
}

function buildGenericLineDescription(suggestion: MaintenanceSuggestionItem): string {
  return suggestion.label.trim();
}

export async function addMaintenanceSuggestionToWorkOrder(
  opts: AddMaintenanceSuggestionOpts,
): Promise<AddMaintenanceSuggestionResult> {
  const { supabase, workOrderId, serviceCode, userId } = opts;
  const normalizedCode = normalizeServiceCode(serviceCode);

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id, customer_id")
    .eq("id", workOrderId)
    .maybeSingle();

  if (workOrderError) throw workOrderError;
  if (!workOrder) throw new Error("Work order not found");
  if (!workOrder.shop_id) throw new Error("Work order is missing shop_id");

  const { data: suggestionCache, error: suggestionCacheError } = await supabase
    .from("maintenance_suggestions")
    .select("id, suggestions")
    .eq("work_order_id", workOrderId)
    .maybeSingle();

  if (suggestionCacheError) throw suggestionCacheError;
  if (!suggestionCache) {
    throw new Error("No maintenance suggestion record found for this work order");
  }

  const suggestions = Array.isArray(suggestionCache.suggestions)
    ? (suggestionCache.suggestions as MaintenanceSuggestionItem[])
    : [];

  const suggestion = suggestions.find(
    (item) => normalizeServiceCode(item.serviceCode) === normalizedCode,
  );

  if (!suggestion) {
    throw new Error("Requested maintenance suggestion was not found");
  }

  if (suggestion.suppressed) {
    throw new Error("This maintenance suggestion is suppressed and cannot be added");
  }

  const { data: existingLines, error: existingLinesError } = await supabase
    .from("work_order_lines")
    .select("id, service_code, menu_item_id, description, line_status, status")
    .eq("work_order_id", workOrderId)
    .limit(200);

  if (existingLinesError) throw existingLinesError;

  const alreadyExists = (existingLines ?? []).some((line) => {
    const lineServiceCode = (line.service_code ?? "").trim().toUpperCase();
    if (lineServiceCode && lineServiceCode === normalizedCode) return true;
    if (suggestion.menuItemId && line.menu_item_id && line.menu_item_id === suggestion.menuItemId) {
      return true;
    }
    return false;
  });

  if (alreadyExists) {
    throw new Error("A matching maintenance line already exists on this work order");
  }

  const insertPayload = {
    work_order_id: workOrderId,
    shop_id: workOrder.shop_id,
    vehicle_id: workOrder.vehicle_id ?? null,
    customer_id: workOrder.customer_id ?? null,
    menu_item_id: suggestion.menuItemId ?? null,
    description: buildGenericLineDescription(suggestion),
    job_type: suggestion.jobType ?? "maintenance",
    estimated_hours: suggestion.laborHours ?? null,
    quoted_hours: suggestion.laborHours ?? null,
    service_code: normalizedCode,
    note: suggestion.notes ?? null,
    status: "pending",
    line_status: "pending",
    source: "maintenance_suggestion",
    created_by: userId,
  };

  const { data: insertedLine, error: insertError } = await supabase
    .from("work_order_lines")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) throw insertError;
  if (!insertedLine) {
    throw new Error("Failed to create maintenance work order line");
  }

  return {
    ok: true,
    addedLineId: insertedLine.id,
    addPath: suggestion.menuItemId ? "menu_item" : "generic",
    serviceCode: normalizedCode,
  };
}
