
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/features/shared/types/types/supabase";

type AdminSupabase = SupabaseClient<Database>;

type JsonObject = Record<string, unknown>;

export type CustomerVehicleActivationStage = "initialize" | "customers" | "vehicles" | "links" | "completed";

export type CustomerVehicleActivationStatus = "running" | "completed" | "failed";

export type CustomerVehicleTotals = {

  customersTotal: number;

  vehiclesTotal: number;

  linksTotal: number;

};

export type CustomerVehicleCheckpoint = CustomerVehicleTotals & {

  phase: "customers_vehicles";

  status: CustomerVehicleActivationStatus;

  stage: CustomerVehicleActivationStage;

  startedAt?: string | null;

  completedAt?: string | null;

  failedAt?: string | null;

  lastError?: string | null;

  updatedAt: string;

  resultCounters?: {

    customersInserted: number;

    customersUpdated: number;

    customersMatchedExisting: number;

    vehiclesInserted: number;

    vehiclesUpdated: number;

    vehiclesMatchedExisting: number;

    linksMaterialized: number;

    linksUnresolved: number;

    customerEntityCanonicalWritebacks: number;

    vehicleEntityCanonicalWritebacks: number;

  };

};

function isRecord(value: unknown): value is JsonObject {

  return value !== null && typeof value === "object" && !Array.isArray(value);

}

function toJsonObject(value: unknown): JsonObject {

  return isRecord(value) ? { ...value } : {};

}

function toNumber(value: number | null | undefined): number {

  return Number(value ?? 0);

}

export function getCustomerVehicleCheckpoint(summary: unknown): CustomerVehicleCheckpoint | null {

  const root = toJsonObject(summary);

  const onboardingActivation = toJsonObject(root.onboardingActivation);

  const checkpoint = onboardingActivation.customersVehicles;

  if (!isRecord(checkpoint)) return null;

  if (checkpoint.phase !== "customers_vehicles") return null;

  return {

    phase: "customers_vehicles",

    status: checkpoint.status === "completed" ? "completed" : checkpoint.status === "failed" ? "failed" : "running",

    stage:

      checkpoint.stage === "vehicles" || checkpoint.stage === "links" || checkpoint.stage === "completed" || checkpoint.stage === "customers"

        ? checkpoint.stage

        : "initialize",

    customersTotal: typeof checkpoint.customersTotal === "number" ? checkpoint.customersTotal : 0,

    vehiclesTotal: typeof checkpoint.vehiclesTotal === "number" ? checkpoint.vehiclesTotal : 0,

    linksTotal: typeof checkpoint.linksTotal === "number" ? checkpoint.linksTotal : 0,

    startedAt: typeof checkpoint.startedAt === "string" ? checkpoint.startedAt : null,

    completedAt: typeof checkpoint.completedAt === "string" ? checkpoint.completedAt : null,

    failedAt: typeof checkpoint.failedAt === "string" ? checkpoint.failedAt : null,

    lastError: typeof checkpoint.lastError === "string" ? checkpoint.lastError : null,

    updatedAt: typeof checkpoint.updatedAt === "string" ? checkpoint.updatedAt : new Date(0).toISOString(),

    resultCounters: isRecord(checkpoint.resultCounters)

      ? {

        customersInserted: typeof checkpoint.resultCounters.customersInserted === "number" ? checkpoint.resultCounters.customersInserted : 0,

        customersUpdated: typeof checkpoint.resultCounters.customersUpdated === "number" ? checkpoint.resultCounters.customersUpdated : 0,

        customersMatchedExisting: typeof checkpoint.resultCounters.customersMatchedExisting === "number" ? checkpoint.resultCounters.customersMatchedExisting : 0,

        vehiclesInserted: typeof checkpoint.resultCounters.vehiclesInserted === "number" ? checkpoint.resultCounters.vehiclesInserted : 0,

        vehiclesUpdated: typeof checkpoint.resultCounters.vehiclesUpdated === "number" ? checkpoint.resultCounters.vehiclesUpdated : 0,

        vehiclesMatchedExisting: typeof checkpoint.resultCounters.vehiclesMatchedExisting === "number" ? checkpoint.resultCounters.vehiclesMatchedExisting : 0,

        linksMaterialized: typeof checkpoint.resultCounters.linksMaterialized === "number" ? checkpoint.resultCounters.linksMaterialized : 0,

        linksUnresolved: typeof checkpoint.resultCounters.linksUnresolved === "number" ? checkpoint.resultCounters.linksUnresolved : 0,

        customerEntityCanonicalWritebacks: typeof checkpoint.resultCounters.customerEntityCanonicalWritebacks === "number" ? checkpoint.resultCounters.customerEntityCanonicalWritebacks : 0,

        vehicleEntityCanonicalWritebacks: typeof checkpoint.resultCounters.vehicleEntityCanonicalWritebacks === "number" ? checkpoint.resultCounters.vehicleEntityCanonicalWritebacks : 0,

      }

      : undefined,

  };

}

export async function getCustomerVehicleTotals(params: {

  supabase: AdminSupabase;

  shopId: string;

  sessionId: string;

}): Promise<CustomerVehicleTotals> {

  const [customerResult, vehicleResult, linkResult] = await Promise.all([

    params.supabase

      .from("onboarding_entities")

      .select("id", { head: true, count: "exact" })

      .eq("shop_id", params.shopId)

      .eq("session_id", params.sessionId)

      .eq("entity_type", "customer")

      .in("status", ["ready", "matched", "activated"]),

    params.supabase

      .from("onboarding_entities")

      .select("id", { head: true, count: "exact" })

      .eq("shop_id", params.shopId)

      .eq("session_id", params.sessionId)

      .eq("entity_type", "vehicle")

      .in("status", ["ready", "matched", "activated"]),

    params.supabase

      .from("onboarding_entity_links")

      .select("id", { head: true, count: "exact" })

      .eq("shop_id", params.shopId)

      .eq("session_id", params.sessionId)

      .eq("link_type", "customer_vehicle"),

  ]);

  if (customerResult.error) throw new Error(customerResult.error.message);

  if (vehicleResult.error) throw new Error(vehicleResult.error.message);

  if (linkResult.error) throw new Error(linkResult.error.message);

  return {

    customersTotal: toNumber(customerResult.count),

    vehiclesTotal: toNumber(vehicleResult.count),

    linksTotal: toNumber(linkResult.count),

  };

}

export async function readOnboardingSessionSummary(params: {

  supabase: AdminSupabase;

  shopId: string;

  sessionId: string;

}): Promise<JsonObject> {

  const { data, error } = await params.supabase

    .from("onboarding_sessions")

    .select("summary")

    .eq("shop_id", params.shopId)

    .eq("id", params.sessionId)

    .maybeSingle();

  if (error) throw new Error(error.message);

  return toJsonObject(data?.summary);

}

export async function writeCustomerVehicleCheckpoint(params: {

  supabase: AdminSupabase;

  shopId: string;

  sessionId: string;

  patch: Omit<Partial<CustomerVehicleCheckpoint>, "phase" | "updatedAt">;

}): Promise<CustomerVehicleCheckpoint> {

  const summary = await readOnboardingSessionSummary(params);

  const onboardingActivation = toJsonObject(summary.onboardingActivation);

  const existing = getCustomerVehicleCheckpoint(summary);

  const next: CustomerVehicleCheckpoint = {

    phase: "customers_vehicles",

    status: params.patch.status ?? existing?.status ?? "running",

    stage: params.patch.stage ?? existing?.stage ?? "initialize",

    customersTotal: params.patch.customersTotal ?? existing?.customersTotal ?? 0,

    vehiclesTotal: params.patch.vehiclesTotal ?? existing?.vehiclesTotal ?? 0,

    linksTotal: params.patch.linksTotal ?? existing?.linksTotal ?? 0,

    startedAt: params.patch.startedAt ?? existing?.startedAt ?? null,

    completedAt: params.patch.completedAt ?? existing?.completedAt ?? null,

    failedAt: params.patch.failedAt ?? existing?.failedAt ?? null,

    lastError: params.patch.lastError ?? existing?.lastError ?? null,

    resultCounters: params.patch.resultCounters ?? existing?.resultCounters,

    updatedAt: new Date().toISOString(),

  };

  const nextSummary: JsonObject = {

    ...summary,

    onboardingActivation: {

      ...onboardingActivation,

      customersVehicles: next,

    },

  };

  const { error } = await params.supabase

    .from("onboarding_sessions")

    .update({ summary: nextSummary })

    .eq("shop_id", params.shopId)

    .eq("id", params.sessionId);

  if (error) throw new Error(error.message);

  return next;

}

