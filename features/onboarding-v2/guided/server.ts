import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import {
  GUIDED_ONBOARDING_STEPS,
  getGuidedOnboardingStep,
  isGuidedOnboardingStatus,
  isGuidedOnboardingStepKey,
  type GuidedOnboardingStatus,
  type GuidedOnboardingStepKey,
} from "./steps";
import type { GuidedOnboardingPayload, GuidedSessionRow, GuidedStepRow, JsonObject } from "./types";

type GuidedPayload = GuidedOnboardingPayload;

// The generated Supabase types intentionally lag additive migrations in this repo.
type UntypedSupabase = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function asGuidedDb(supabase: unknown): UntypedSupabase {
  return supabase as UntypedSupabase;
}

export async function requireGuidedOwnerAdminAccess() {
  return requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
}

export function assertGuidedStepKey(stepKey: string): GuidedOnboardingStepKey | null {
  return isGuidedOnboardingStepKey(stepKey) ? stepKey : null;
}

function nextActionableStep(steps: GuidedStepRow[]): GuidedOnboardingStepKey | null {
  return steps.find((step) => !["completed", "skipped"].includes(step.status))?.step_key ?? null;
}

async function insertGuidedEvent(db: UntypedSupabase, args: {
  shopId: string;
  sessionId: string;
  stepKey?: GuidedOnboardingStepKey | null;
  eventType: string;
  payload?: JsonObject;
}) {
  await db.from("guided_onboarding_events").insert({
    shop_id: args.shopId,
    session_id: args.sessionId,
    step_key: args.stepKey ?? null,
    event_type: args.eventType,
    payload: args.payload ?? {},
  });
}

async function ensureSessionSteps(db: UntypedSupabase, shopId: string, sessionId: string) {
  const rows = GUIDED_ONBOARDING_STEPS.map((step) => ({
    session_id: sessionId,
    shop_id: shopId,
    step_key: step.stepKey,
    status: "not_started",
    destination_path: step.destinationPath,
    highlight_key: step.highlightKey,
    summary: {},
  }));

  await db
    .from("guided_onboarding_steps")
    .upsert(rows, { onConflict: "session_id,step_key", ignoreDuplicates: true });
}

export async function createOrResumeGuidedSession(args: {
  supabase: unknown;
  shopId: string;
  userId: string;
}): Promise<GuidedPayload> {
  const db = asGuidedDb(args.supabase);

  const { data: existing, error: existingError } = await db
    .from("guided_onboarding_sessions")
    .select("*")
    .eq("shop_id", args.shopId)
    .in("status", ["active", "in_progress"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message ?? "Unable to resume guided onboarding session");

  let session = existing as GuidedSessionRow | null;
  if (!session) {
    const id = randomUUID();
    const { data: inserted, error } = await db
      .from("guided_onboarding_sessions")
      .insert({ id, shop_id: args.shopId, created_by: args.userId, status: "active", current_step_key: "customers", summary: {} })
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Unable to create guided onboarding session");
    session = inserted as GuidedSessionRow;
    await insertGuidedEvent(db, { shopId: args.shopId, sessionId: session.id, eventType: "session_created" });
  }

  await ensureSessionSteps(db, args.shopId, session.id);
  return fetchGuidedSession({ supabase: args.supabase, shopId: args.shopId, sessionId: session.id });
}

export async function fetchGuidedSession(args: {
  supabase: unknown;
  shopId: string;
  sessionId: string;
}): Promise<GuidedPayload> {
  const db = asGuidedDb(args.supabase);
  const { data: session, error: sessionError } = await db
    .from("guided_onboarding_sessions")
    .select("*")
    .eq("id", args.sessionId)
    .eq("shop_id", args.shopId)
    .maybeSingle();

  if (sessionError) throw new Error(sessionError.message ?? "Unable to fetch guided onboarding session");
  if (!session) throw new Error("Guided onboarding session not found");

  await ensureSessionSteps(db, args.shopId, args.sessionId);

  const { data: steps, error: stepsError } = await db
    .from("guided_onboarding_steps")
    .select("*")
    .eq("session_id", args.sessionId)
    .eq("shop_id", args.shopId)
    .order("created_at", { ascending: true });

  if (stepsError) throw new Error(stepsError.message ?? "Unable to fetch guided onboarding steps");

  const ordered = GUIDED_ONBOARDING_STEPS.map((definition) =>
    (steps as GuidedStepRow[]).find((step) => step.step_key === definition.stepKey),
  ).filter((step): step is GuidedStepRow => Boolean(step));

  return { session: session as GuidedSessionRow, steps: ordered };
}

export async function updateGuidedStepStatus(args: {
  supabase: unknown;
  shopId: string;
  sessionId: string;
  stepKey: GuidedOnboardingStepKey;
  status: GuidedOnboardingStatus;
  skippedReason?: string | null;
  summary?: JsonObject;
  error?: string | null;
}) {
  const db = asGuidedDb(args.supabase);
  const definition = getGuidedOnboardingStep(args.stepKey);
  const current = await fetchGuidedSession({ supabase: args.supabase, shopId: args.shopId, sessionId: args.sessionId });
  const existing = current.steps.find((step) => step.step_key === args.stepKey);

  const retryCount = args.status === "retry_requested" ? (existing?.retry_count ?? 0) + 1 : (existing?.retry_count ?? 0);
  const patch = {
    status: args.status,
    destination_path: definition.destinationPath,
    highlight_key: definition.highlightKey,
    skipped_reason: args.skippedReason ?? existing?.skipped_reason ?? null,
    summary: args.summary ?? existing?.summary ?? {},
    error: args.error ?? (args.status === "failed" ? existing?.error ?? "Step failed" : null),
    retry_count: retryCount,
    completed_at: args.status === "completed" ? new Date().toISOString() : existing?.completed_at ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("guided_onboarding_steps")
    .update(patch)
    .eq("session_id", args.sessionId)
    .eq("shop_id", args.shopId)
    .eq("step_key", args.stepKey);
  if (error) throw new Error(error.message ?? "Unable to update guided onboarding step");

  await insertGuidedEvent(db, {
    shopId: args.shopId,
    sessionId: args.sessionId,
    stepKey: args.stepKey,
    eventType: `step_${args.status}`,
    payload: { summary: args.summary ?? {}, error: args.error ?? null },
  });

  const refreshed = await fetchGuidedSession({ supabase: args.supabase, shopId: args.shopId, sessionId: args.sessionId });
  const currentStepKey = nextActionableStep(refreshed.steps);
  const sessionComplete = currentStepKey === null;

  const { error: sessionError } = await db
    .from("guided_onboarding_sessions")
    .update({
      current_step_key: currentStepKey,
      status: sessionComplete ? "completed" : "active",
      completed_at: sessionComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.sessionId)
    .eq("shop_id", args.shopId);
  if (sessionError) throw new Error(sessionError.message ?? "Unable to update guided onboarding session");

  return fetchGuidedSession({ supabase: args.supabase, shopId: args.shopId, sessionId: args.sessionId });
}

export async function answerGuidedStepYes(args: {
  supabase: unknown;
  shopId: string;
  sessionId: string;
  stepKey: GuidedOnboardingStepKey;
}) {
  return updateGuidedStepStatus({ ...args, status: "routing" });
}

export function guardedJsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Guided onboarding request failed";
  const responseStatus = message.includes("not found") ? 404 : status;
  return NextResponse.json({ error: message }, { status: responseStatus });
}

export function parseGuidedStatusPayload(payload: unknown): {
  status: GuidedOnboardingStatus;
  summary?: JsonObject;
  error?: string | null;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const status = typeof record.status === "string" && isGuidedOnboardingStatus(record.status) ? record.status : null;
  if (!status) return null;
  const summary = record.summary && typeof record.summary === "object" && !Array.isArray(record.summary) ? record.summary as JsonObject : undefined;
  const error = typeof record.error === "string" ? record.error : null;
  return { status, summary, error };
}
