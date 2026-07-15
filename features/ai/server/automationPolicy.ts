import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

import {
  AI_AUTOMATION_CAPABILITIES,
  isAiAutomationCapability,
  isAiAutomationEvidenceOutcome,
  type AiAutomationCapability,
  type AiAutomationEvidenceOutcome,
  type AiAutomationPolicy,
  type AiAutomationReadiness,
} from "../automation/types";

type DB = Database;

export const AI_AUTOMATION_EXECUTION_AVAILABLE: Record<
  AiAutomationCapability,
  boolean
> = {
  appointment_intake: false,
  customer_status_updates: false,
  work_order_line_creation: false,
  quote_preparation: false,
  approval_request_delivery: false,
  parts_ordering: false,
  appointment_reminders: false,
  advisor_follow_up: false,
  invoice_preparation: false,
  payment_collection: false,
};

export const AI_AUTOMATION_READINESS_REQUIREMENTS: Record<
  AiAutomationCapability,
  { minimumObservations: number; minimumComparisons: number }
> = {
  appointment_intake: { minimumObservations: 100, minimumComparisons: 50 },
  customer_status_updates: { minimumObservations: 100, minimumComparisons: 50 },
  work_order_line_creation: { minimumObservations: 100, minimumComparisons: 50 },
  quote_preparation: { minimumObservations: 100, minimumComparisons: 50 },
  approval_request_delivery: { minimumObservations: 100, minimumComparisons: 50 },
  parts_ordering: { minimumObservations: 75, minimumComparisons: 40 },
  appointment_reminders: { minimumObservations: 100, minimumComparisons: 50 },
  advisor_follow_up: { minimumObservations: 100, minimumComparisons: 50 },
  invoice_preparation: { minimumObservations: 100, minimumComparisons: 50 },
  payment_collection: { minimumObservations: 100, minimumComparisons: 50 },
};

const MINIMUM_AGREEMENT_RATE = 0.95;
const MAXIMUM_EXCEPTION_RATE = 0.02;
const READINESS_WINDOW_DAYS = 180;

type EvidenceSample = { capability: string; outcome: string };

export function emptyOwnerEnabled(): Record<AiAutomationCapability, boolean> {
  return Object.fromEntries(
    AI_AUTOMATION_CAPABILITIES.map((capability) => [capability, false]),
  ) as Record<AiAutomationCapability, boolean>;
}

export function isAutomationCapabilityEffective(args: {
  automationPaused: boolean;
  ownerEnabled: boolean;
  readinessStatus: AiAutomationReadiness["status"];
  executionAvailable: boolean;
}): boolean {
  return !args.automationPaused && args.ownerEnabled &&
    args.readinessStatus === "ready" && args.executionAvailable;
}

export function evaluateAutomationReadiness(args: {
  capability: AiAutomationCapability;
  evidence: EvidenceSample[];
  evaluatedAt?: string;
}): AiAutomationReadiness {
  const outcomes = args.evidence
    .filter((row) => row.capability === args.capability && isAiAutomationEvidenceOutcome(row.outcome))
    .map((row) => row.outcome as AiAutomationEvidenceOutcome);
  const requirements = AI_AUTOMATION_READINESS_REQUIREMENTS[args.capability];
  const observationCount = outcomes.length;
  const matchCount = outcomes.filter((value) => value === "matched").length;
  const correctionCount = outcomes.filter((value) => value === "corrected").length;
  const exceptionCount = outcomes.filter((value) => value === "exception").length;
  const criticalFailureCount = outcomes.filter((value) => value === "critical_failure").length;
  const comparisonCount = matchCount + correctionCount + exceptionCount + criticalFailureCount;
  const agreementRate = comparisonCount > 0 ? matchCount / comparisonCount : null;
  const exceptionRate = comparisonCount > 0
    ? (exceptionCount + criticalFailureCount) / comparisonCount
    : null;
  const ready = observationCount >= requirements.minimumObservations &&
    comparisonCount >= requirements.minimumComparisons &&
    (agreementRate ?? 0) >= MINIMUM_AGREEMENT_RATE &&
    (exceptionRate ?? 1) <= MAXIMUM_EXCEPTION_RATE &&
    criticalFailureCount === 0;
  const progress = Math.floor(Math.min(
    1,
    observationCount / requirements.minimumObservations,
    comparisonCount / requirements.minimumComparisons,
    (agreementRate ?? 0) / MINIMUM_AGREEMENT_RATE,
    exceptionRate === null ? 0 : exceptionRate === 0 ? 1 : MAXIMUM_EXCEPTION_RATE / exceptionRate,
    criticalFailureCount === 0 ? 1 : 0,
  ) * 100);

  return {
    capability: args.capability,
    status: criticalFailureCount > 0 ? "suspended" : ready ? "ready" : "learning",
    observationCount,
    comparisonCount,
    matchCount,
    correctionCount,
    exceptionCount,
    criticalFailureCount,
    minimumObservationCount: requirements.minimumObservations,
    minimumComparisonCount: requirements.minimumComparisons,
    agreementRate,
    exceptionRate,
    readinessPercent: ready ? 100 : Math.min(99, progress),
    evaluatedAt: args.evaluatedAt ?? new Date().toISOString(),
  };
}

export function isMissingAutomationPolicySchemaError(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205" ||
    (message.includes("ai_automation_") &&
      (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find")));
}

export async function getAiAutomationPolicy(
  supabase: SupabaseClient<DB>,
  shopId: string,
): Promise<AiAutomationPolicy> {
  const since = new Date(Date.now() - READINESS_WINDOW_DAYS * 86400000).toISOString();
  const [settingsResult, controlsResult, evidenceResult] = await Promise.all([
    supabase.from("ai_automation_capability_settings").select("capability,enabled").eq("shop_id", shopId),
    supabase.from("ai_automation_shop_controls").select("automation_paused").eq("shop_id", shopId).maybeSingle(),
    supabase.from("ai_automation_evidence").select("capability,outcome").eq("shop_id", shopId).gte("occurred_at", since),
  ]);
  for (const error of [settingsResult.error, controlsResult.error, evidenceResult.error]) {
    if (error && !isMissingAutomationPolicySchemaError(error)) throw new Error(error.message);
  }

  const ownerEnabled = emptyOwnerEnabled();
  for (const row of settingsResult.data ?? []) {
    if (isAiAutomationCapability(row.capability)) ownerEnabled[row.capability] = row.enabled === true;
  }
  const evaluatedAt = new Date().toISOString();
  const readiness = Object.fromEntries(
    AI_AUTOMATION_CAPABILITIES.map((capability) => [capability, evaluateAutomationReadiness({
      capability,
      evidence: evidenceResult.data ?? [],
      evaluatedAt,
    })]),
  ) as Record<AiAutomationCapability, AiAutomationReadiness>;
  const automationPaused = controlsResult.data?.automation_paused === true;
  const effectiveEnabled = Object.fromEntries(
    AI_AUTOMATION_CAPABILITIES.map((capability) => [capability, isAutomationCapabilityEffective({
      automationPaused,
      ownerEnabled: ownerEnabled[capability],
      readinessStatus: readiness[capability].status,
      executionAvailable: AI_AUTOMATION_EXECUTION_AVAILABLE[capability],
    })]),
  ) as Record<AiAutomationCapability, boolean>;

  return { automationPaused, ownerEnabled, readiness, executionAvailable: { ...AI_AUTOMATION_EXECUTION_AVAILABLE }, effectiveEnabled };
}

export async function isAiAutomaticExecutionEnabled(
  supabase: SupabaseClient<DB>,
  shopId: string,
  capability: AiAutomationCapability,
): Promise<boolean> {
  return (await getAiAutomationPolicy(supabase, shopId)).effectiveEnabled[capability];
}
