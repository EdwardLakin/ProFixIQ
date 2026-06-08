import "server-only";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { GUIDED_ONBOARDING_STEPS, isGuidedOnboardingStepKey } from "./steps";
import { buildGuidedSessionDetail, findNextGuidedStepKey, orderGuidedSteps } from "./query";
import type { GuidedOnboardingSessionRow, GuidedOnboardingStepRow, GuidedOnboardingStepStatus } from "./types";

const GUIDED_TABLE_PREFIX = "guided_onboarding_";
const SESSIONS_TABLE = `${GUIDED_TABLE_PREFIX}sessions`;
const STEPS_TABLE = `${GUIDED_TABLE_PREFIX}steps`;
const EVENTS_TABLE = `${GUIDED_TABLE_PREFIX}events`;

const SAFE_STEP_STATUSES: GuidedOnboardingStepStatus[] = ["not_started", "in_progress", "completed", "skipped"];

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

async function detailResponse(access: Access, sessionId: string) {
  const session = await getSessionForShop(access, sessionId);
  if (!session) return jsonError("Guided onboarding session not found", 404);

  const steps = await getStepsForSession(access, sessionId);
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

  const existingSteps = await getStepsForSession(access, session.id);
  const existingKeys = new Set(existingSteps.map((step) => step.step_key));
  const missingSteps = GUIDED_ONBOARDING_STEPS.filter((step) => !existingKeys.has(step.key));

  if (missingSteps.length > 0) {
    const { error: insertStepsError } = await db(access)
      .from(STEPS_TABLE)
      .insert(
        missingSteps.map((step) => ({
          session_id: session!.id,
          shop_id: access.profile.shop_id,
          step_key: step.key,
          status: "not_started",
        })),
      );

    if (insertStepsError) return jsonError(insertStepsError.message, 500);
  }

  const steps = await getStepsForSession(access, session.id);
  if (!session.current_step_key) {
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
  const { error } = await db(access)
    .from(SESSIONS_TABLE)
    .update({ existing_system: value, ...nowPatch() })
    .eq("id", sessionId)
    .eq("shop_id", access.profile.shop_id);

  if (error) return jsonError(error.message, 500);
  await logGuidedEvent(access, sessionId, null, "existing_system_answered", { existing_system: value });
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

  const timestamp = new Date().toISOString();
  const { error: stepError } = await db(access)
    .from(STEPS_TABLE)
    .update({
      status,
      completed_at: status === "completed" ? timestamp : null,
      skipped_at: status === "skipped" ? timestamp : null,
      ...nowPatch(),
    })
    .eq("session_id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .eq("step_key", stepKey);

  if (stepError) return jsonError(stepError.message, 500);

  let steps = await getStepsForSession(access, sessionId);
  let session = await updateSessionCurrentStep(access, sessionId, steps);
  steps = await getStepsForSession(access, sessionId);

  await logGuidedEvent(access, sessionId, stepKey, status === "completed" ? "step_completed" : "step_skipped", {
    nextStepKey: session.current_step_key,
  });
  return NextResponse.json(buildGuidedSessionDetail(session, steps));
}

export async function setGuidedStepStatus(sessionId: string, stepKey: string, body: JsonPayload) {
  const access = await requireGuidedAccess();
  if (!access.ok) return access.response;
  if (!isGuidedOnboardingStepKey(stepKey)) return jsonError("Invalid guided onboarding step", 400);

  const status = typeof body.status === "string" ? body.status : "";
  if (!SAFE_STEP_STATUSES.includes(status as GuidedOnboardingStepStatus)) return jsonError("Invalid step status", 400);

  const timestamp = new Date().toISOString();
  const { error } = await db(access)
    .from(STEPS_TABLE)
    .update({
      status,
      started_at: status === "in_progress" ? timestamp : undefined,
      completed_at: status === "completed" ? timestamp : null,
      skipped_at: status === "skipped" ? timestamp : null,
      ...nowPatch(),
    })
    .eq("session_id", sessionId)
    .eq("shop_id", access.profile.shop_id)
    .eq("step_key", stepKey);

  if (error) return jsonError(error.message, 500);

  const steps = await getStepsForSession(access, sessionId);
  const session = status === "in_progress"
    ? await updateSessionPointer(access, sessionId, stepKey)
    : await updateSessionCurrentStep(access, sessionId, steps);

  await logGuidedEvent(access, sessionId, stepKey, "step_status_updated", { status });
  return NextResponse.json(buildGuidedSessionDetail(session, steps));
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
