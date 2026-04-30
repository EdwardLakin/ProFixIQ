import type { SupabaseClient } from "@supabase/supabase-js";
import { activateOnboardingCustomersVehicles } from "@/features/onboarding-agent/server/activateOnboardingCustomersVehicles";
import {
  buildOnboardingCompletionSummary,
  mergeCompletionSummary,
} from "@/features/onboarding-agent/server/buildOnboardingCompletionSummary";
import { activateOnboardingHistory } from "@/features/onboarding-agent/server/activateOnboardingHistory";
import { activateOnboardingParts } from "@/features/onboarding-agent/server/activateOnboardingParts";
import { activateOnboardingVendors } from "@/features/onboarding-agent/server/activateOnboardingVendors";
import {
  getCustomerVehicleTotals,
  readOnboardingSessionSummary,
  writeCustomerVehicleCheckpoint,
} from "@/features/onboarding-agent/server/onboardingActivationProgress";
import type { Database } from "@/features/shared/types/types/supabase";

type AdminSupabase = SupabaseClient<Database>;
type JsonObject = Record<string, unknown>;

export type OnboardingActivationPhase = "vendors" | "customers_vehicles" | "parts" | "history" | "completed";

export type ActivateOnboardingSessionResult = {
  ok: true;
  phase: OnboardingActivationPhase;
  completed: boolean;
  message: string;
  result: unknown;
  checkpoint?: JsonObject | null;
};

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject {
  return isRecord(value) ? { ...value } : {};
}

function getPhaseStatus(summary: JsonObject, phase: OnboardingActivationPhase): string | null {
  const activation = toJsonObject(summary.onboardingActivation);
  const phases = toJsonObject(activation.phases);
  const phaseRecord = toJsonObject(phases[phase]);
  return typeof phaseRecord.status === "string" ? phaseRecord.status : null;
}

function getHistoryChunkCursor(summary: JsonObject): string | null {
  const activation = toJsonObject(summary.onboardingActivation);
  const phases = toJsonObject(activation.phases);
  const historyPhase = toJsonObject(phases.history);
  const result = toJsonObject(historyPhase.result);
  return typeof result.nextCursor === "string" && result.nextCursor ? result.nextCursor : null;
}

const HISTORY_ACTIVATION_BATCH_LIMIT = 250;

async function writePhaseStatus(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
  phase: OnboardingActivationPhase;
  status: "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  lastError?: string | null;
  result?: unknown;
}): Promise<JsonObject> {
  const summary = await readOnboardingSessionSummary(params);
  const activation = toJsonObject(summary.onboardingActivation);
  const phases = toJsonObject(activation.phases);
  const existingPhase = toJsonObject(phases[params.phase]);
  const now = new Date().toISOString();

  const nextPhase = {
    ...existingPhase,
    status: params.status,
    startedAt: params.startedAt ?? existingPhase.startedAt ?? now,
    completedAt: params.completedAt ?? existingPhase.completedAt ?? null,
    failedAt: params.failedAt ?? existingPhase.failedAt ?? null,
    lastError: params.lastError ?? null,
    updatedAt: now,
    result: params.result ?? existingPhase.result ?? null,
  };

  const nextSummary: JsonObject = {
    ...summary,
    onboardingActivation: {
      ...activation,
      status: params.status === "completed" && params.phase === "completed" ? "completed" : "running",
      currentPhase: params.phase,
      updatedAt: now,
      phases: {
        ...phases,
        [params.phase]: nextPhase,
      },
    },
  };

  const { error } = await params.supabase
    .from("onboarding_sessions")
    .update({ summary: nextSummary })
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId);

  if (error) throw new Error(error.message);
  return nextSummary;
}

async function completeSession(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
  actorId: string;
}): Promise<ActivateOnboardingSessionResult> {
  const now = new Date().toISOString();
  const phaseSummary = await writePhaseStatus({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
    phase: "completed",
    status: "completed",
    completedAt: now,
    result: {
      completedBy: params.actorId,
      completedAt: now,
    },
  });

  const completion = await buildOnboardingCompletionSummary({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
    actorId: params.actorId,
  });
  const summary = mergeCompletionSummary(phaseSummary, completion);

  const { error } = await params.supabase
    .from("onboarding_sessions")
    .update({
      status: "activated",
      activated_at: now,
      summary,
    })
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId);

  if (error) throw new Error(error.message);

  return {
    ok: true,
    phase: "completed",
    completed: true,
    message: "Onboarding activation completed.",
    result: { completedAt: now },
    checkpoint: summary,
  };
}

export async function activateOnboardingSession(params: {
  supabase: AdminSupabase;
  shopId: string;
  sessionId: string;
  actorId: string;
}): Promise<ActivateOnboardingSessionResult> {
  const summary = await readOnboardingSessionSummary(params);

  if (getPhaseStatus(summary, "vendors") !== "completed") {
    await writePhaseStatus({ ...params, phase: "vendors", status: "running" });
    const result = await activateOnboardingVendors(params);
    const checkpoint = await writePhaseStatus({
      ...params,
      phase: "vendors",
      status: "completed",
      completedAt: new Date().toISOString(),
      result,
    });

    return {
      ok: true,
      phase: "vendors",
      completed: false,
      message: "Vendor activation completed. Continue activation to process customers and vehicles.",
      result,
      checkpoint,
    };
  }

  if (getPhaseStatus(summary, "customers_vehicles") !== "completed") {
    const totals = await getCustomerVehicleTotals(params);
    await writeCustomerVehicleCheckpoint({
      ...params,
      patch: {
        status: "running",
        stage: "customers",
        startedAt: new Date().toISOString(),
        failedAt: null,
        lastError: null,
        ...totals,
      },
    });
    await writePhaseStatus({ ...params, phase: "customers_vehicles", status: "running" });

    const result = await activateOnboardingCustomersVehicles(params);

    const customerVehicleCheckpoint = await writeCustomerVehicleCheckpoint({
      ...params,
      patch: {
        status: "completed",
        stage: "completed",
        completedAt: new Date().toISOString(),
        failedAt: null,
        lastError: null,
        ...totals,
        resultCounters: {
          customersInserted: result.customersInserted,
          customersUpdated: result.customersUpdated,
          customersMatchedExisting: result.customersMatchedExisting,
          vehiclesInserted: result.vehiclesInserted,
          vehiclesUpdated: result.vehiclesUpdated,
          vehiclesMatchedExisting: result.vehiclesMatchedExisting,
          linksMaterialized: result.vehicleCustomerLinksMaterialized,
          linksUnresolved: result.vehicleCustomerLinksUnresolved,
          customerEntityCanonicalWritebacks: result.customerEntityCanonicalWritebacks,
          vehicleEntityCanonicalWritebacks: result.vehicleEntityCanonicalWritebacks,
        },
      },
    });

    const checkpoint = await writePhaseStatus({
      ...params,
      phase: "customers_vehicles",
      status: "completed",
      completedAt: new Date().toISOString(),
      result,
    });

    return {
      ok: true,
      phase: "customers_vehicles",
      completed: false,
      message: "Customer and vehicle activation completed. Continue activation to process parts.",
      result,
      checkpoint: {
        ...checkpoint,
        customersVehicles: customerVehicleCheckpoint,
      },
    };
  }

  if (getPhaseStatus(summary, "parts") !== "completed") {
    await writePhaseStatus({ ...params, phase: "parts", status: "running" });
    const result = await activateOnboardingParts(params);
    const checkpoint = await writePhaseStatus({
      ...params,
      phase: "parts",
      status: "completed",
      completedAt: new Date().toISOString(),
      result,
    });

    return {
      ok: true,
      phase: "parts",
      completed: false,
      message: "Parts activation completed. Continue activation to process historical work orders.",
      result,
      checkpoint,
    };
  }

  if (getPhaseStatus(summary, "history") !== "completed") {
    await writePhaseStatus({ ...params, phase: "history", status: "running" });

    const result = await activateOnboardingHistory({
      ...params,
      limit: HISTORY_ACTIVATION_BATCH_LIMIT,
      startAfterId: getHistoryChunkCursor(summary),
    });

    const now = new Date().toISOString();
    const checkpoint = await writePhaseStatus({
      ...params,
      phase: "history",
      status: result.completed ? "completed" : "running",
      completedAt: result.completed ? now : undefined,
      result,
    });

    return {
      ok: true,
      phase: "history",
      completed: false,
      message: result.completed
        ? "Historical work order activation completed. Continue once more to finalize onboarding."
        : `Historical work order activation processed ${result.processedThisRun.toLocaleString()} rows. Continue activation to process the next chunk.`,
      result,
      checkpoint,
    };
  }

  return completeSession(params);
}
