import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DB,
  MaintenanceRuleRow,
  MaintenanceServiceRow,
  MaintenanceSuggestionItem,
  VehicleRow,
  WorkOrderRow,
} from "./types";
import { getVehicleMaintenanceHistory } from "./getVehicleMaintenanceHistory";
import { resolveMaintenanceMenuMap } from "./resolveMaintenanceMenuMap";

function parseMileage(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: string | null | undefined): string | null {
  const next = value?.trim().toLowerCase() ?? "";
  return next.length ? next : null;
}

function ruleMatchesVehicle(
  vehicle: VehicleRow,
  rule: MaintenanceRuleRow,
): boolean {
  const year = vehicle.year ?? null;

  if (year != null && rule.year_from != null && year < rule.year_from) return false;
  if (year != null && rule.year_to != null && year > rule.year_to) return false;

  const vehicleMake = normalizeText(vehicle.make);
  const ruleMake = normalizeText(rule.make);
  if (ruleMake && vehicleMake && ruleMake !== vehicleMake) return false;

  const vehicleModel = normalizeText(vehicle.model);
  const ruleModel = normalizeText(rule.model);
  if (ruleModel && vehicleModel && ruleModel !== vehicleModel) return false;

  const vehicleEngine = normalizeText(vehicle.engine_family);
  const ruleEngine = normalizeText(rule.engine_family);
  if (ruleEngine && vehicleEngine && ruleEngine !== vehicleEngine) return false;

  return true;
}

function monthsBetween(fromIso: string | null, now: Date): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return null;

  return (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
}

function computeTriggerMileageKm(
  historyMileageKm: number | null,
  rule: MaintenanceRuleRow,
): number | null {
  if (historyMileageKm != null) {
    const interval = rule.distance_km_severe ?? rule.distance_km_normal ?? null;
    return interval != null ? historyMileageKm + interval : null;
  }

  return rule.first_due_km ?? null;
}

function evaluateDue(
  currentMileageKm: number | null,
  currentAgeMonths: number | null,
  lastCompletedMileageKm: number | null,
  lastCompletedAt: string | null,
  rule: MaintenanceRuleRow,
  now: Date,
): {
  dueNow: boolean;
  overdue: boolean;
  triggerMileageKm: number | null;
  triggerAgeMonths: number | null;
} {
  const triggerMileageKm = computeTriggerMileageKm(
    lastCompletedMileageKm,
    rule,
  );

  let triggerAgeMonths: number | null = null;
  if (lastCompletedAt) {
    const monthsSince = monthsBetween(lastCompletedAt, now);
    const ageInterval = rule.time_months_severe ?? rule.time_months_normal ?? null;
    triggerAgeMonths =
      monthsSince != null && ageInterval != null ? monthsSince + ageInterval : null;
  } else {
    triggerAgeMonths = rule.first_due_months ?? null;
  }

  const mileageDue =
    currentMileageKm != null && triggerMileageKm != null
      ? currentMileageKm >= triggerMileageKm
      : false;

  const ageDue =
    currentAgeMonths != null && triggerAgeMonths != null
      ? currentAgeMonths >= triggerAgeMonths
      : false;

  const dueNow = mileageDue || ageDue;

  const mileageOverdue =
    currentMileageKm != null && triggerMileageKm != null
      ? currentMileageKm > triggerMileageKm
      : false;

  const ageOverdue =
    currentAgeMonths != null && triggerAgeMonths != null
      ? currentAgeMonths > triggerAgeMonths
      : false;

  return {
    dueNow,
    overdue: mileageOverdue || ageOverdue,
    triggerMileageKm,
    triggerAgeMonths,
  };
}

/**
 * Core server function:
 * - Reads WO + vehicle + history + maintenance_rules + maintenance_services
 * - Computes due/overdue services
 * - Upserts into maintenance_suggestions
 * - Returns suggestions for UI
 */
export async function computeMaintenanceSuggestionsForWorkOrder(opts: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
}): Promise<{ suggestions: MaintenanceSuggestionItem[] }> {
  const { supabase, workOrderId } = opts;

  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .select("id, shop_id, vehicle_id, odometer_km, created_at")
    .eq("id", workOrderId)
    .maybeSingle();

  if (woError) throw woError;
  if (!wo) throw new Error("Work order not found");
  if (!wo.vehicle_id) throw new Error("Work order has no vehicle linked");
  if (!wo.shop_id) throw new Error("Work order has no shop linked");

  const workOrder = wo as WorkOrderRow;

  const { data: vehicleRow, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, year, make, model, mileage, engine_family")
    .eq("id", workOrder.vehicle_id)
    .maybeSingle();

  if (vehicleError) throw vehicleError;
  if (!vehicleRow) throw new Error("Vehicle not found");

  const vehicle = vehicleRow as VehicleRow;

  const currentMileageKm = workOrder.odometer_km ?? parseMileage(vehicle.mileage) ?? null;
  const vehicleYear = vehicle.year ?? null;
  const now = new Date();

  const currentAgeMonths =
    vehicleYear != null
      ? (now.getFullYear() - vehicleYear) * 12 + now.getMonth()
      : null;

  const { data: servicesData, error: servicesError } = await supabase
    .from("maintenance_services")
    .select("*");

  if (servicesError) throw servicesError;

  const services = (servicesData ?? []) as MaintenanceServiceRow[];
  const servicesByCode = new Map<string, MaintenanceServiceRow>(
    services.map((service) => [service.code, service]),
  );

  const { data: rulesData, error: rulesError } = await supabase
    .from("maintenance_rules")
    .select("*");

  if (rulesError) throw rulesError;

  const rules = (rulesData ?? []) as MaintenanceRuleRow[];

  const matchedRules = rules.filter((rule) => ruleMatchesVehicle(vehicle, rule));
  const suggestions: MaintenanceSuggestionItem[] = [];

  for (const rule of matchedRules) {
    const service = servicesByCode.get(rule.service_code);
    if (!service) continue;

    const mapping = await resolveMaintenanceMenuMap({
      supabase,
      shopId: workOrder.shop_id,
      serviceCode: service.code,
      vehicle: {
        year: vehicle.year ?? null,
        make: vehicle.make ?? null,
        model: vehicle.model ?? null,
        engineFamily: vehicle.engine_family ?? null,
      },
    });

    const history = await getVehicleMaintenanceHistory({
      supabase,
      vehicleId: vehicle.id,
      shopId: workOrder.shop_id,
      serviceCode: service.code,
      menuItemId: mapping.menuItemId,
      label: service.label,
    });

    const dueEval = evaluateDue(
      currentMileageKm,
      currentAgeMonths,
      history.lastCompletedMileageKm,
      history.lastCompletedAt,
      rule,
      now,
    );

    if (!dueEval.dueNow) {
      continue;
    }

    suggestions.push({
      serviceCode: service.code,
      label: service.label,
      jobType: service.default_job_type ?? "maintenance",
      laborHours: service.default_labor_hours ?? null,
      notes: service.default_notes ?? null,
      isCritical: Boolean(rule.is_critical),
      dueNow: dueEval.dueNow,
      overdue: dueEval.overdue,
      currentMileageKm,
      currentAgeMonths,
      triggerMileageKm: dueEval.triggerMileageKm,
      triggerAgeMonths: dueEval.triggerAgeMonths,
      lastCompletedAt: history.lastCompletedAt,
      lastCompletedMileageKm: history.lastCompletedMileageKm,
      historyMatchSource: history.historyMatchSource,
      menuItemId: mapping.menuItemId,
      menuRepairItemId: mapping.menuRepairItemId,
      addPath: mapping.menuItemId ? "menu_item" : "generic",
      mappingSource: mapping.mappingSource,
      suppressed: false,
      suppressedReason: null,
    });
  }

  suggestions.sort((a, b) => {
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  const upsertPayload = {
    work_order_id: workOrderId,
    vehicle_id: vehicle.id,
    mileage_km: currentMileageKm,
    status: "ready",
    suggestions,
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from("maintenance_suggestions")
    .upsert(upsertPayload, { onConflict: "work_order_id" });

  if (upsertError) {
    throw upsertError;
  }

  return { suggestions };
}
