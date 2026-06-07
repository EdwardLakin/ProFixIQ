import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { GUIDED_ONBOARDING_STEPS, getGuidedOnboardingStep, type GuidedOnboardingStepKey } from "@/features/onboarding-v2/guided/steps";
import type { GuidedOnboardingSessionPayload, GuidedOnboardingSessionState, GuidedStepSessionState, GuidedStepSessionStatus } from "@/features/onboarding-v2/guided/sessionTypes";

type Supabase = SupabaseClient<Database>;
type JsonRecord = Record<string, unknown>;

type OnboardingSessionRow = Pick<
  Database["public"]["Tables"]["onboarding_sessions"]["Row"],
  "id" | "shop_id" | "created_by" | "status" | "source" | "title" | "notes" | "summary" | "stats" | "created_at" | "updated_at"
>;

export const GUIDED_ONBOARDING_SOURCE = "guided_onboarding";
export const GUIDED_ONBOARDING_SUMMARY_KEY = "guidedOnboarding";

const stepKeys = GUIDED_ONBOARDING_STEPS.map((step) => step.stepKey);

export function isGuidedOnboardingStepKey(value: unknown): value is GuidedOnboardingStepKey {
  return typeof value === "string" && stepKeys.includes(value as GuidedOnboardingStepKey);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyGuidedSessionState(existingSystem: string | null = null): GuidedOnboardingSessionState {
  return {
    version: 1,
    sessionStatus: "active",
    currentStepKey: GUIDED_ONBOARDING_STEPS[0].stepKey,
    existingSystem,
    steps: {},
  };
}

function normalizeStepState(value: unknown): GuidedStepSessionState | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status;
  if (status !== "not_started" && status !== "in_progress" && status !== "complete" && status !== "skipped") return undefined;
  return {
    status,
    answers: isRecord(value.answers) ? value.answers : {},
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
    completedAt: typeof value.completedAt === "string" ? value.completedAt : undefined,
    skippedAt: typeof value.skippedAt === "string" ? value.skippedAt : undefined,
  };
}

function normalizeGuidedState(summary: unknown): GuidedOnboardingSessionState {
  if (!isRecord(summary) || !isRecord(summary[GUIDED_ONBOARDING_SUMMARY_KEY])) return emptyGuidedSessionState();
  const guided = summary[GUIDED_ONBOARDING_SUMMARY_KEY];
  const currentStepKey = isGuidedOnboardingStepKey(guided.currentStepKey) ? guided.currentStepKey : GUIDED_ONBOARDING_STEPS[0].stepKey;
  const sessionStatus = guided.sessionStatus === "complete" ? "complete" : "active";
  const existingSystem = typeof guided.existingSystem === "string" && guided.existingSystem.trim() ? guided.existingSystem.trim() : null;
  const rawSteps = isRecord(guided.steps) ? guided.steps : {};
  const steps = stepKeys.reduce<GuidedOnboardingSessionState["steps"]>((acc, stepKey) => {
    const next = normalizeStepState(rawSteps[stepKey]);
    if (next) acc[stepKey] = next;
    return acc;
  }, {});

  return { version: 1, sessionStatus, currentStepKey, existingSystem, steps };
}

function mergeGuidedSummary(summary: unknown, guided: GuidedOnboardingSessionState): JsonRecord {
  const base = isRecord(summary) ? { ...summary } : {};
  base[GUIDED_ONBOARDING_SUMMARY_KEY] = guided;
  return base;
}

function toPayload(row: OnboardingSessionRow): GuidedOnboardingSessionPayload {
  return {
    id: row.id,
    shopId: row.shop_id,
    createdBy: row.created_by,
    status: row.status,
    source: row.source,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    guided: normalizeGuidedState(row.summary),
  };
}

export async function listGuidedOnboardingSessions(supabase: Supabase, shopId: string): Promise<GuidedOnboardingSessionPayload[]> {
  const { data, error } = await supabase
    .from("onboarding_sessions")
    .select("id, shop_id, created_by, status, source, title, notes, summary, stats, created_at, updated_at")
    .eq("shop_id", shopId)
    .eq("source", GUIDED_ONBOARDING_SOURCE)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toPayload(row as OnboardingSessionRow));
}

export async function createGuidedOnboardingSession(
  supabase: Supabase,
  params: { shopId: string; userId: string; title?: string | null; existingSystem?: string | null; currentStepKey?: GuidedOnboardingStepKey | null },
): Promise<GuidedOnboardingSessionPayload> {
  const guided = emptyGuidedSessionState(params.existingSystem ?? null);
  if (params.currentStepKey) guided.currentStepKey = params.currentStepKey;
  const title = params.title?.trim() || "Guided onboarding workspace";

  const { data, error } = await supabase
    .from("onboarding_sessions")
    .insert({
      shop_id: params.shopId,
      created_by: params.userId,
      status: "draft",
      source: GUIDED_ONBOARDING_SOURCE,
      title,
      summary: mergeGuidedSummary({}, guided),
      stats: { guidedStepCount: GUIDED_ONBOARDING_STEPS.length },
    })
    .select("id, shop_id, created_by, status, source, title, notes, summary, stats, created_at, updated_at")
    .single();

  if (error) throw new Error(error.message);
  return toPayload(data as OnboardingSessionRow);
}

export async function loadGuidedOnboardingSession(
  supabase: Supabase,
  params: { shopId: string; sessionId: string },
): Promise<GuidedOnboardingSessionPayload | null> {
  const { data, error } = await supabase
    .from("onboarding_sessions")
    .select("id, shop_id, created_by, status, source, title, notes, summary, stats, created_at, updated_at")
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId)
    .eq("source", GUIDED_ONBOARDING_SOURCE)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toPayload(data as OnboardingSessionRow) : null;
}

export async function updateGuidedOnboardingSession(
  supabase: Supabase,
  params: { shopId: string; sessionId: string; title?: string | null; notes?: string | null; existingSystem?: string | null; currentStepKey?: GuidedOnboardingStepKey | null },
): Promise<GuidedOnboardingSessionPayload | null> {
  const existing = await loadGuidedOnboardingSession(supabase, params);
  if (!existing) return null;

  const guided: GuidedOnboardingSessionState = {
    ...existing.guided,
    existingSystem: params.existingSystem === undefined ? existing.guided.existingSystem : params.existingSystem,
    currentStepKey: params.currentStepKey ?? existing.guided.currentStepKey,
  };

  const update: JsonRecord = {
    summary: mergeGuidedSummary(existing.guided ? { [GUIDED_ONBOARDING_SUMMARY_KEY]: existing.guided } : {}, guided),
    updated_at: nowIso(),
  };
  if (params.title !== undefined) update.title = params.title?.trim() || "Guided onboarding workspace";
  if (params.notes !== undefined) update.notes = params.notes;

  const { data, error } = await supabase
    .from("onboarding_sessions")
    .update(update)
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId)
    .eq("source", GUIDED_ONBOARDING_SOURCE)
    .select("id, shop_id, created_by, status, source, title, notes, summary, stats, created_at, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toPayload(data as OnboardingSessionRow) : null;
}

export async function updateGuidedOnboardingStep(
  supabase: Supabase,
  params: { shopId: string; sessionId: string; stepKey: GuidedOnboardingStepKey; action: "answer" | "complete" | "skip" | "status"; answers?: JsonRecord; status?: GuidedStepSessionStatus },
): Promise<GuidedOnboardingSessionPayload | null> {
  getGuidedOnboardingStep(params.stepKey);
  const existing = await loadGuidedOnboardingSession(supabase, params);
  if (!existing) return null;

  const timestamp = nowIso();
  const currentStep = existing.guided.steps[params.stepKey] ?? { status: "not_started", answers: {}, updatedAt: timestamp };
  const answers = params.answers ? { ...currentStep.answers, ...params.answers } : currentStep.answers;
  const nextStep: GuidedStepSessionState = { ...currentStep, answers, updatedAt: timestamp };

  if (params.action === "answer") {
    nextStep.status = currentStep.status === "complete" || currentStep.status === "skipped" ? currentStep.status : "in_progress";
  } else if (params.action === "complete") {
    nextStep.status = "complete";
    nextStep.completedAt = timestamp;
    delete nextStep.skippedAt;
  } else if (params.action === "skip") {
    nextStep.status = "skipped";
    nextStep.skippedAt = timestamp;
    delete nextStep.completedAt;
  } else if (params.status) {
    nextStep.status = params.status;
    if (params.status === "complete") nextStep.completedAt = timestamp;
    if (params.status === "skipped") nextStep.skippedAt = timestamp;
  }

  const steps = { ...existing.guided.steps, [params.stepKey]: nextStep };
  const allResolved = stepKeys.every((stepKey) => steps[stepKey]?.status === "complete" || steps[stepKey]?.status === "skipped");
  const guided: GuidedOnboardingSessionState = {
    ...existing.guided,
    sessionStatus: allResolved ? "complete" : "active",
    currentStepKey: params.stepKey,
    steps,
  };

  const { data, error } = await supabase
    .from("onboarding_sessions")
    .update({
      summary: mergeGuidedSummary({ [GUIDED_ONBOARDING_SUMMARY_KEY]: existing.guided }, guided),
      updated_at: timestamp,
    })
    .eq("shop_id", params.shopId)
    .eq("id", params.sessionId)
    .eq("source", GUIDED_ONBOARDING_SOURCE)
    .select("id, shop_id, created_by, status, source, title, notes, summary, stats, created_at, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toPayload(data as OnboardingSessionRow) : null;
}
