import "server-only";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { GUIDED_ONBOARDING_STEPS, getGuidedOnboardingStep, isGuidedOnboardingStepKey } from "./steps";
import { buildGuidedSessionDetail, findNextGuidedStepKey, orderGuidedSteps } from "./query";
import type { GuidedOnboardingSessionRow, GuidedOnboardingStepRow, GuidedOnboardingStepStatus } from "./types";

const GUIDED_TABLE_PREFIX = "guided_onboarding_";
const SESSIONS_TABLE = `${GUIDED_TABLE_PREFIX}sessions`;
const STEPS_TABLE = `${GUIDED_TABLE_PREFIX}steps`;
const EVENTS_TABLE = `${GUIDED_TABLE_PREFIX}events`;

const SAFE_STEP_STATUSES: GuidedOnboardingStepStatus[] = ["not_started", "in_progress", "completed", "skipped"];
const STARTING_FROM_SCRATCH_SKIP_STEPS = ["customers", "vehicles", "vehicle_history", "invoices", "parts"] as const;
const STARTING_FROM_SCRATCH_FIRST_STEP = "shop_settings";

type Access = Extract<Awaited<ReturnType<typeof requireShopScopedApiAccess>>, { ok: true }>;

type JsonPayload = Record<string, unknown>;

async function requireGuidedAccess() {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access;

  await access.supabase.rpc("set_current_shop_id", { p_shop_id: access.profile.shop_id! });
  return access;
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function db(access: Access) {
  return access.supabase as any;
}

function nowPatch() {
  return { updated_at: new Date().toISOString() };
}

function stepInsertPayload(step: (typeof GUIDED_ONBOARDING_STEPS)[number], sessionId: string, shopId: string) {
  return {
    session_id: sessionId,
    shop_id: shopId,
    step_key: step.key,
    status: "not_started",
    answer: {},
    destination_path: step.destinationPath,
    title: step.title,
    question: step.question,
    description: step.shortDescription,
    highlight_key: step.highlightQuery?.highlight ?? step.key,
  };
}

async function logGuidedEvent(
  access: Access,
  sessionId: string,
  stepKey: string | null,
  eventType: string,
  payload: JsonPayload = {},
) {
  await db(access)
    .from(EVENTS_TABLE)
    .insert({
      session_id: sessionId,
      shop_id: access.profile.shop_id,
      step_key: stepKey,
      event_type: eventType,
      payload,
      created_by: access.profile.id,
    });
}

async function getSessionForShop(access: Access, sessionId: string) {
  const { data, error } = await db(access)
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as GuidedOnboardingSessionRow | null;
}

async function getStepsForSession(access: Access, sessionId: string) {
  const { data, error } = await db(access)
    .from(STEPS_TABLE)
    .select("*")
    .eq("session_id", sessionId)
    .eq("shop_id", access.profile.shop_id);

  if (error) throw new Error(error.message);
  return orderGuidedSteps((data ?? []) as GuidedOnboardingStepRow[]);
}

async function updateSessionCurrentStep(access: Access, sessionId: string, steps: GuidedOnboardingStepRow[]) {
  const currentStepKey = findNextGuidedStepKey(steps);
  const statusPatch = currentStepKey
    ? { status: "active", completed_at: null }
    : { status: "completed", completed_at: new Date().toISOString() };

  const { data, error } = await db(access)
    .from(SESSIONS_TABLE)
    .update({ ...statusPatch, current_step_key: currentStepKey, ...nowPatch() })
    .eq("id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as GuidedOnboardingSessionRow;
}

async function ensureGuidedSteps(access: Access, sessionId: string) {
  const existingSteps = await getStepsForSession(access, sessionId);
  const existingKeys = new Set(existingSteps.map((step) => step.step_key));
  const missingSteps = GUIDED_ONBOARDING_STEPS.filter((step) => !existingKeys.has(step.key));

  if (missingSteps.length > 0) {
    const { error } = await db(access)
      .from(STEPS_TABLE)
      .insert(missingSteps.map((step) => stepInsertPayload(step, sessionId, access.profile.shop_id!)));

    if (error) throw new Error(error.message);
    return getStepsForSession(access, sessionId);
  }

  return existingSteps;
}

async function detailResponse(access: Access, sessionId: string) {
  let session = await getSessionForShop(access, sessionId);
  if (!session) return jsonError("Guided onboarding session not found", 404);

  const steps = await ensureGuidedSteps(access, sessionId);
  if (session.status === "active" && (!session.current_step_key || !isGuidedOnboardingStepKey(session.current_step_key))) {
    session = await updateSessionCurrentStep(access, sessionId, steps);
  }

  return NextResponse.json(buildGuidedSessionDetail(session, steps));
}

export async function listGuidedSessions() {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;

  const { data, error } = await db(access)
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("shop_id", access.profile.shop_id)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ sessions: data ?? [] });
}

export async function createOrResumeGuidedSession() {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;

  const { data: existing, error: existingError } = await db(access)
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("shop_id", access.profile.shop_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) return jsonError(existingError.message, 500);

  let session = existing as GuidedOnboardingSessionRow | null;

  if (!session) {
    const firstStepKey = GUIDED_ONBOARDING_STEPS[0]?.key ?? null;
    const { data: created, error: createError } = await db(access)
      .from(SESSIONS_TABLE)
      .insert({
        shop_id: access.profile.shop_id,
        created_by: access.profile.id,
        status: "active",
        current_step_key: firstStepKey,
      })
      .select("*")
      .single();

    if (createError) return jsonError(createError.message, 500);
    session = created as GuidedOnboardingSessionRow;

    await logGuidedEvent(access, session.id, null, "session_created", { stepCount: GUIDED_ONBOARDING_STEPS.length });
  }

  let steps: GuidedOnboardingStepRow[];
  try {
    steps = await ensureGuidedSteps(access, session.id);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to seed guided setup steps", 500);
  }
  if (!session.current_step_key || !isGuidedOnboardingStepKey(session.current_step_key)) {
    session = await updateSessionCurrentStep(access, session.id, steps);
  }

  await logGuidedEvent(access, session.id, session.current_step_key, "session_resumed", {});
  return NextResponse.json(buildGuidedSessionDetail(session, steps));
}

export async function getGuidedSession(sessionId: string) {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;
  try {
    return await detailResponse(access, sessionId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to load guided onboarding session", 500);
  }
}

export async function patchGuidedSession(sessionId: string, body: JsonPayload) {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;

  const patch: JsonPayload = { ...nowPatch() };
  if (typeof body.existing_system === "string" || body.existing_system === null) patch.existing_system = body.existing_system;
  if (typeof body.current_step_key === "string") {
    if (!isGuidedOnboardingStepKey(body.current_step_key)) return jsonError("Invalid current_step_key", 400);
    patch.current_step_key = body.current_step_key;
  }

  const { data, error } = await db(access)
    .from(SESSIONS_TABLE)
    .update(patch)
    .eq("id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .select("*")
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Guided onboarding session not found", 404);

  await logGuidedEvent(access, sessionId, (patch.current_step_key as string | undefined) ?? null, "session_updated", patch);
  return detailResponse(access, sessionId);
}

export async function setExistingSystem(sessionId: string, body: JsonPayload) {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;

  const value = typeof body.existing_system === "string" ? body.existing_system.trim() : null;
  const skipGuidedSetup = body.skip_guided_setup === true;
  const skipImportSteps = body.skip_import_steps === true;
  const requestedStepKey = typeof body.current_step_key === "string" && isGuidedOnboardingStepKey(body.current_step_key)
    ? body.current_step_key
    : null;
  const startingFromScratch = value === "starting_from_scratch";
  const currentStepKey = startingFromScratch
    ? requestedStepKey ?? STARTING_FROM_SCRATCH_FIRST_STEP
    : requestedStepKey;
  const sessionPatch = skipGuidedSetup
    ? { existing_system: value, status: "skipped", current_step_key: null, completed_at: new Date().toISOString(), ...nowPatch() }
    : { existing_system: value, status: "active", current_step_key: currentStepKey, completed_at: null, ...nowPatch() };

  const { error } = await db(access)
    .from(SESSIONS_TABLE)
    .update(sessionPatch)
    .eq("id", sessionId)
    .eq("shop_id", access.profile.shop_id);

  if (error) return jsonError(error.message, 500);

  if (!skipGuidedSetup && startingFromScratch && skipImportSteps) {
    const timestamp = new Date().toISOString();
    const { error: skipStepsError } = await db(access)
      .from(STEPS_TABLE)
      .update({ status: "skipped", skipped_at: timestamp, completed_at: null, ...nowPatch() })
      .eq("session_id", sessionId)
      .eq("shop_id", access.profile.shop_id)
      .in("step_key", STARTING_FROM_SCRATCH_SKIP_STEPS);

    if (skipStepsError) return jsonError(skipStepsError.message, 500);
  }

  await logGuidedEvent(access, sessionId, null, "existing_system_answered", {
    existing_system: value,
    skipGuidedSetup,
    skipImportSteps,
    currentStepKey,
  });
  return detailResponse(access, sessionId);
}

export async function answerGuidedStep(sessionId: string, stepKey: string, body: JsonPayload) {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;
  if (!isGuidedOnboardingStepKey(stepKey)) return jsonError("Invalid guided onboarding step", 400);

  const answer = typeof body.answer === "object" && body.answer !== null && !Array.isArray(body.answer) ? body.answer : body;
  const startedAt = new Date().toISOString();

  const { error: stepError } = await db(access)
    .from(STEPS_TABLE)
    .update({ answer, status: "in_progress", started_at: startedAt, completed_at: null, skipped_at: null, ...nowPatch() })
    .eq("session_id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .eq("step_key", stepKey);

  if (stepError) return jsonError(stepError.message, 500);

  const { error: sessionError } = await db(access)
    .from(SESSIONS_TABLE)
    .update({ current_step_key: stepKey, status: "active", completed_at: null, ...nowPatch() })
    .eq("id", sessionId)
    .eq("shop_id", access.profile.shop_id);

  if (sessionError) return jsonError(sessionError.message, 500);

  await logGuidedEvent(access, sessionId, stepKey, "step_answered", { answer });
  return detailResponse(access, sessionId);
}

export async function completeGuidedStep(sessionId: string, stepKey: string) {
  return finishGuidedStep(sessionId, stepKey, "completed");
}

export async function skipGuidedStep(sessionId: string, stepKey: string) {
  return finishGuidedStep(sessionId, stepKey, "skipped");
}

async function finishGuidedStep(sessionId: string, stepKey: string, status: "completed" | "skipped") {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;
  if (!isGuidedOnboardingStepKey(stepKey)) return jsonError("Invalid guided onboarding step", 400);

  const session = await getSessionForShop(access, sessionId);
  if (!session) return jsonError("Guided onboarding session not found", 404);

  try {
    await ensureGuidedSteps(access, sessionId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to seed guided setup steps", 500);
  }

  const canonicalStep = getGuidedOnboardingStep(stepKey);
  const timestamp = new Date().toISOString();
  const { data: updatedSteps, error: stepError } = await db(access)
    .from(STEPS_TABLE)
    .update({
      status,
      completed_at: status === "completed" ? timestamp : null,
      skipped_at: status === "skipped" ? timestamp : null,
      ...(canonicalStep ? {
        destination_path: canonicalStep.destinationPath,
        title: canonicalStep.title,
        question: canonicalStep.question,
        description: canonicalStep.shortDescription,
        highlight_key: canonicalStep.highlightQuery?.highlight ?? canonicalStep.key,
      } : {}),
      ...nowPatch(),
    })
    .eq("session_id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .eq("step_key", stepKey)
    .select("id");

  if (stepError) return jsonError(stepError.message, 500);
  if (!updatedSteps?.length) return jsonError("Guided onboarding step not found", 404);

  let steps = await getStepsForSession(access, sessionId);
  const updatedSession = await updateSessionCurrentStep(access, sessionId, steps);
  steps = await getStepsForSession(access, sessionId);

  await logGuidedEvent(access, sessionId, stepKey, status === "completed" ? "step_completed" : "step_skipped", {
    nextStepKey: updatedSession.current_step_key,
  });
  return NextResponse.json(buildGuidedSessionDetail(updatedSession, steps));
}

export async function setGuidedStepStatus(sessionId: string, stepKey: string, body: JsonPayload) {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;
  if (!isGuidedOnboardingStepKey(stepKey)) return jsonError("Invalid guided onboarding step", 400);

  const status = typeof body.status === "string" ? body.status : "";
  if (!SAFE_STEP_STATUSES.includes(status as GuidedOnboardingStepStatus)) return jsonError("Invalid step status", 400);

  const session = await getSessionForShop(access, sessionId);
  if (!session) return jsonError("Guided onboarding session not found", 404);

  try {
    await ensureGuidedSteps(access, sessionId);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to seed guided setup steps", 500);
  }

  const canonicalStep = getGuidedOnboardingStep(stepKey);
  const timestamp = new Date().toISOString();
  const { data: updatedSteps, error } = await db(access)
    .from(STEPS_TABLE)
    .update({
      status,
      started_at: status === "in_progress" ? timestamp : undefined,
      completed_at: status === "completed" ? timestamp : null,
      skipped_at: status === "skipped" ? timestamp : null,
      ...(canonicalStep ? {
        destination_path: canonicalStep.destinationPath,
        title: canonicalStep.title,
        question: canonicalStep.question,
        description: canonicalStep.shortDescription,
        highlight_key: canonicalStep.highlightQuery?.highlight ?? canonicalStep.key,
      } : {}),
      ...nowPatch(),
    })
    .eq("session_id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .eq("step_key", stepKey)
    .select("id");

  if (error) return jsonError(error.message, 500);
  if (!updatedSteps?.length) return jsonError("Guided onboarding step not found", 404);

  const steps = await getStepsForSession(access, sessionId);
  const updatedSession = status === "in_progress"
    ? await updateSessionPointer(access, sessionId, stepKey)
    : await updateSessionCurrentStep(access, sessionId, steps);

  await logGuidedEvent(access, sessionId, stepKey, "step_status_updated", { status });
  return NextResponse.json(buildGuidedSessionDetail(updatedSession, steps));
}

async function updateSessionPointer(access: Access, sessionId: string, stepKey: string) {
  const { data, error } = await db(access)
    .from(SESSIONS_TABLE)
    .update({ current_step_key: stepKey, status: "active", completed_at: null, ...nowPatch() })
    .eq("id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as GuidedOnboardingSessionRow;
}
