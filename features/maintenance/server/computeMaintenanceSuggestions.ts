//features/maintenance/server/computeMaintenanceSuggestions.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export type MaintenanceSuggestionItem = {
  name: string;
  serviceCode: string;
  laborHours: number;
  jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

type MaintenanceServiceRow = {
  code: string;
  label: string;
  default_job_type: string | null;
  default_labor_hours: number | null;
  default_notes: string | null;
};

type MaintenanceRuleRow = {
  id: string;
  service_code: string;
  make: string | null;
  model: string | null;
  year_from: number | null;
  year_to: number | null;
  engine_family: string | null;
  distance_km_normal: number | null;
  distance_km_severe: number | null;
  time_months_normal: number | null;
  time_months_severe: number | null;
  first_due_km: number | null;
  first_due_months: number | null;
  is_critical: boolean;
};

type ServiceHistory = {
  lastMileage: number | null;
  lastDate: string | null;
};

type VehicleRow = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  mileage: string | null; // existing schema
  engine_family: string | null;
};

type WorkOrderRow = {
  id: string;
  vehicle_id: string | null;
  odometer_km: number | null;
  created_at: string;
};

type WorkOrderLineHistoryRow = {
  service_code: string | null;
  odometer_km: number | null;
  created_at: string | null;
};

function parseMileage(
  mileage: string | number | null | undefined,
): number | null {
  if (mileage == null) return null;
  const n = Number(mileage);
  return Number.isFinite(n) ? n : null;
}

function ruleAppliesToVehicle(
  rule: MaintenanceRuleRow,
  vehicle: VehicleRow,
): boolean {
  const make = (vehicle.make ?? "").trim().toLowerCase();
  const model = (vehicle.model ?? "").trim().toLowerCase();
  const year = vehicle.year ?? null;
  const engineFamily = (vehicle.engine_family ?? "").trim().toLowerCase();

  if (rule.make && make && rule.make.toLowerCase() !== make) return false;
  if (rule.model && model && rule.model.toLowerCase() !== model) return false;

  if (year != null) {
    if (rule.year_from != null && year < rule.year_from) return false;
    if (rule.year_to != null && year > rule.year_to) return false;
  }

  if (rule.engine_family && engineFamily) {
    if (rule.engine_family.toLowerCase() !== engineFamily) return false;
  }

  return true;
}

function isServiceDue(
  rule: MaintenanceRuleRow,
  ctx: {
    mode: "normal" | "severe";
    currentMileageKm: number | null;
    currentAgeMonths: number | null;
    history: ServiceHistory | null;
  },
): boolean {
  const distanceInterval =
    ctx.mode === "severe"
      ? rule.distance_km_severe ?? rule.distance_km_normal
      : rule.distance_km_normal;

  const timeInterval =
    ctx.mode === "severe"
      ? rule.time_months_severe ?? rule.time_months_normal
      : rule.time_months_normal;

  if (distanceInterval == null && timeInterval == null) {
    // no interval defined → cannot compute due
    return false;
  }

  const lastMileage = ctx.history?.lastMileage ?? null;
  const lastDateStr = ctx.history?.lastDate ?? null;

  let kmSince: number | null = null;
  if (ctx.currentMileageKm != null && lastMileage != null) {
    kmSince = ctx.currentMileageKm - lastMileage;
  } else if (ctx.currentMileageKm != null && lastMileage == null) {
    kmSince = ctx.currentMileageKm;
  }

  let monthsSince: number | null = null;
  if (lastDateStr) {
    const lastDate = new Date(lastDateStr);
    const now = new Date();
    monthsSince =
      (now.getFullYear() - lastDate.getFullYear()) * 12 +
      (now.getMonth() - lastDate.getMonth());
  } else if (ctx.currentAgeMonths != null) {
    monthsSince = ctx.currentAgeMonths;
  }

  const distanceDue =
    distanceInterval != null && kmSince != null
      ? kmSince >= distanceInterval
      : false;
  const timeDue =
    timeInterval != null && monthsSince != null
      ? monthsSince >= timeInterval
      : false;

  return distanceDue || timeDue;
}

/**
 * Core server function:
 * - Reads WO + vehicle + history + maintenance_rules + maintenance_services
 * - Computes services that should have appeared in the schedule
 * - Upserts into maintenance_suggestions
 * - Returns suggestions for UI
 */
export async function computeMaintenanceSuggestionsForWorkOrder(opts: {
  supabase: SupabaseClient<DB>;
  workOrderId: string;
}): Promise<{ suggestions: MaintenanceSuggestionItem[] }> {
  const { supabase, workOrderId } = opts;

  // 1) Load work order
  const { data: wo, error: woError } = await supabase
    .from("work_orders")
    .select("id, vehicle_id, odometer_km, created_at")
    .eq("id", workOrderId)
    .maybeSingle();

  if (woError) throw woError;
  if (!wo) throw new Error("Work order not found");
  if (!wo.vehicle_id) throw new Error("Work order has no vehicle linked");

  const workOrder = wo as WorkOrderRow;

  // 2) Load vehicle
  const { data: vehicleRow, error: vehicleError } = await supabase
    .from("vehicles")
    .select("id, year, make, model, mileage, engine_family")
    .eq("id", workOrder.vehicle_id)
    .maybeSingle();

  if (vehicleError) throw vehicleError;
  if (!vehicleRow) throw new Error("Vehicle not found");

  const vehicle = vehicleRow as VehicleRow;

  // 3) Compute mileage & age
  const currentMileageKm =
    workOrder.odometer_km ?? parseMileage(vehicle.mileage) ?? null;

  const vehicleYear = vehicle.year ?? null;
  const now = new Date();
  const currentAgeMonths =
    vehicleYear != null
      ? (now.getFullYear() - vehicleYear) * 12 + (now.getMonth() + 1)
      : null;

  // 4) Load rules & services (small tables, safe to filter in memory)
  const { data: servicesData, error: servicesError } = await supabase
    .from("maintenance_services")
    .select("*");

  if (servicesError) throw servicesError;

  const services = (servicesData ?? []) as MaintenanceServiceRow[];
  const servicesByCode = new Map<string, MaintenanceServiceRow>(
    services.map((s) => [s.code, s]),
  );

  const { data: rulesData, error: rulesError } = await supabase
    .from("maintenance_rules")
    .select("*");

  if (rulesError) throw rulesError;

  const rules = (rulesData ?? []) as MaintenanceRuleRow[];

  // 5) Load service history for this vehicle
  const { data: historyData, error: historyError } = await supabase
    .from("work_order_lines")
    .select("service_code, odometer_km, created_at")
    .eq("vehicle_id", vehicle.id)
    .not("service_code", "is", null);

  if (historyError) throw historyError;

  const historyLines: WorkOrderLineHistoryRow[] =
    (historyData as WorkOrderLineHistoryRow[]) ?? [];

  const historyByCode = new Map<string, ServiceHistory>();

  for (const row of historyLines) {
    const code = row.service_code;
    if (!code) continue;

    const prev = historyByCode.get(code) ?? {
      lastMileage: null,
      lastDate: null,
    };

    const thisMileage = row.odometer_km;
    const createdAt = row.created_at;

    if (!createdAt) continue;

    const newer = prev.lastDate == null || createdAt > prev.lastDate;

    historyByCode.set(code, {
      lastMileage: newer && thisMileage != null ? thisMileage : prev.lastMileage,
      lastDate: newer ? createdAt : prev.lastDate,
    });
  }

  // 6) Evaluate rules → suggestions
  const suggestions: MaintenanceSuggestionItem[] = [];

  const mode: "normal" | "severe" = "severe"; // can be made configurable later

  // Helper: should this service have been on the schedule at least once
  const isEverRecommended = (rule: MaintenanceRuleRow): boolean => {
    const firstKm =
      rule.first_due_km ??
      rule.distance_km_normal ??
      rule.distance_km_severe;
    const firstMonths =
      rule.first_due_months ??
      rule.time_months_normal ??
      rule.time_months_severe;

    const hasMileageTrigger =
      firstKm != null &&
      currentMileageKm != null &&
      currentMileageKm >= firstKm;

    const hasTimeTrigger =
      firstMonths != null &&
      currentAgeMonths != null &&
      currentAgeMonths >= firstMonths;

    if (firstKm == null && firstMonths == null) {
      // No explicit thresholds: if we know either mileage or age, assume
      // it should have appeared in the schedule at least once by now.
      return currentMileageKm != null || currentAgeMonths != null;
    }

    return hasMileageTrigger || hasTimeTrigger;
  };

  for (const rule of rules) {
    // Must match this vehicle
    if (!ruleAppliesToVehicle(rule, vehicle)) continue;

    const service = servicesByCode.get(rule.service_code);
    if (!service) continue;

    // Only include services that should have appeared at least once
    if (!isEverRecommended(rule)) continue;

    const history = historyByCode.get(rule.service_code) ?? null;

    // Still compute "due now" using mileage/age + history
    const dueNow = isServiceDue(rule, {
      mode,
      currentMileageKm,
      currentAgeMonths,
      history,
    });

    const jobType: MaintenanceSuggestionItem["jobType"] =
      service.default_job_type === "diagnosis" ||
      service.default_job_type === "repair" ||
      service.default_job_type === "maintenance" ||
      service.default_job_type === "tech-suggested"
        ? service.default_job_type
        : "maintenance";

    const metaNoteParts: string[] = [];

    if (dueNow) {
      metaNoteParts.push("Due now based on mileage/age.");
    } else if (!history) {
      metaNoteParts.push(
        "Recommended in schedule; no previous service recorded for this vehicle.",
      );
    } else {
      metaNoteParts.push(
        "Previously performed; verify interval vs current mileage/age.",
      );
      if (history.lastMileage != null) {
        metaNoteParts.push(`Last recorded at ~${history.lastMileage} km.`);
      }
      if (history.lastDate) {
        metaNoteParts.push(`Last recorded date: ${history.lastDate}.`);
      }
    }

    const combinedNotes = [
      service.default_notes ?? "",
      ...metaNoteParts,
    ]
      .filter((s) => s && s.trim().length > 0)
      .join(" ");

    suggestions.push({
      name: service.label,
      serviceCode: service.code,
      laborHours: service.default_labor_hours ?? 1,
      jobType,
      notes: combinedNotes,
    });
  }

  // 7) Upsert into maintenance_suggestions cache
  await supabase
    .from("maintenance_suggestions")
    .upsert(
      {
        work_order_id: workOrder.id,
        vehicle_id: vehicle.id,
        mileage_km: currentMileageKm,
        status: "ready",
        suggestions,
        error_message: null,
      },
      { onConflict: "work_order_id" },
    );

  return { suggestions };
}