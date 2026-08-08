import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { decideAgentRequestRetry } from "@/features/agent/lib/requestRetry";
import {
  AgentTeamRequestError,
  mapAgentTeamRequestStatus,
  projectAgentTeamCase,
  readAgentTeamCase,
  resumeAgentTeamCase,
  type AgentTeamProjection,
} from "@/features/agent/server/teamClient";
import {
  submitAgentTeamRequest,
  type AgentIntakeIntent,
  type AgentServiceResponse,
} from "@/features/agent/server/requestIntake";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";

const AGENT_INTENTS = new Set<AgentIntakeIntent>([
  "feature_request",
  "bug_report",
  "inspection_catalog_add",
  "service_catalog_add",
  "refactor",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => nullableString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function routeId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const requestsIndex = segments.findIndex((segment) => segment === "requests");
  const id = requestsIndex >= 0 ? segments[requestsIndex + 1] : null;
  return nullableString(id);
}

function normalizeIntent(value: unknown): AgentIntakeIntent {
  const intent = nullableString(value) as AgentIntakeIntent | null;
  return intent && AGENT_INTENTS.has(intent) ? intent : "feature_request";
}

function engineeringCaseId(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.agentTeam)) return null;
  return nullableString(value.agentTeam.engineeringCaseId);
}

function projectionQuestions(projection: AgentTeamProjection) {
  return projection.missingInformation.map((question, index) => ({
    id: `team-${projection.engineeringCaseId}-${index}`,
    question,
  }));
}

function agentFailure(error: unknown) {
  if (error instanceof AgentTeamRequestError) {
    return NextResponse.json(
      {
        error: error.message,
        detail: error.detail,
        agentStatus: error.status,
      },
      { status: error.status === 409 ? 409 : 502 },
    );
  }
  return NextResponse.json(
    {
      error: "Agent request retry failed",
      detail: error instanceof Error ? error.message : String(error),
    },
    { status: 502 },
  );
}

async function signedScreenshots(
  supabase: SupabaseClient<Database>,
  attachmentIds: string[],
): Promise<{ path: string; url: string; name: string }[]> {
  if (attachmentIds.length === 0) return [];
  const result = await supabase.storage
    .from("agent_uploads")
    .createSignedUrls(attachmentIds, 60 * 60 * 24 * 7);
  if (result.error) {
    throw new Error(`Unable to restore request evidence: ${result.error.message}`);
  }

  const attachments = (result.data ?? []).flatMap((row, index) => {
    const url = nullableString(row.signedUrl);
    if (!url) return [];
    const path = attachmentIds[index];
    return [{
      path,
      url,
      name: path.split("/").pop() ?? path,
    }];
  });
  if (attachments.length !== attachmentIds.length) {
    throw new Error("Unable to restore all request evidence for retry");
  }
  return attachments;
}

/**
 * POST /api/agent/requests/:id/retry
 *
 * Reuses the durable local request and canonical engineering case. Failed
 * transports are resubmitted with the same request id; blocked cases resume
 * their current stage; stale failed projections only synchronize.
 */
export async function POST(req: Request) {
  const id = routeId(req);
  if (!id) {
    return NextResponse.json({ error: "Missing agent request id" }, { status: 400 });
  }

  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;
  const { supabase, user } = access;

  const { data: row, error: selectError } = await supabase
    .from("agent_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (selectError) {
    return NextResponse.json(
      { error: "Failed to load the agent request", detail: selectError.message },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ error: "Agent request not found" }, { status: 404 });
  }

  const normalized = isRecord(row.normalized_json) ? row.normalized_json : {};
  let caseId = engineeringCaseId(normalized);
  let projection: AgentTeamProjection | null = null;
  let agentResponse: AgentServiceResponse | null = null;
  let action: "resubmit" | "resume" | "synchronize";

  try {
    if (caseId) {
      projection = projectAgentTeamCase(await readAgentTeamCase(caseId));
    }

    let decision = decideAgentRequestRetry({
      requestStatus: row.status,
      caseStatus: projection?.caseStatus,
      stepStatus: projection?.stepStatus,
    });
    if (!decision.allowed || !decision.action) {
      return NextResponse.json(
        {
          error: "This request is not retryable",
          detail: decision.reason,
          caseStatus: projection?.caseStatus ?? null,
          stepStatus: projection?.stepStatus ?? null,
        },
        { status: 409 },
      );
    }
    action = decision.action;

    if (action === "resubmit") {
      const attachmentIds = stringArray(normalized.attachmentIds);
      const attachments = await signedScreenshots(supabase, attachmentIds);
      const expectedBehavior = nullableString(normalized.expected);
      const actualBehavior = nullableString(normalized.actual) ?? row.description;
      const route = nullableString(normalized.location);
      const browser = nullableString(normalized.device);
      const rawContext = isRecord(normalized.rawContext)
        ? normalized.rawContext
        : {};
      const context = {
        ...rawContext,
        requestId: id,
        location: route,
        steps: nullableString(normalized.steps),
        expected: expectedBehavior,
        actual: nullableString(normalized.actual),
        device: browser,
        attachmentIds,
        expectedBehavior,
        actualBehavior,
        route,
        browser,
        platform: browser,
        screenshots: attachments.map((attachment) => attachment.url),
        role: row.reporter_role,
        shopId: row.shop_id,
      };

      agentResponse = await submitAgentTeamRequest({
        requestId: id,
        source: row.reporter_role ?? "owner",
        reporterId: row.reporter_id ?? user.id,
        shopId: row.shop_id,
        role: row.reporter_role,
        description: row.description,
        intent: normalizeIntent(row.intent),
        expectedBehavior,
        actualBehavior,
        route,
        browser,
        screenshots: attachments.map((attachment) => attachment.url),
        context,
      });
      caseId = String(agentResponse.engineeringCaseId);
      projection = projectAgentTeamCase(await readAgentTeamCase(caseId));

      decision = decideAgentRequestRetry({
        requestStatus: row.status,
        caseStatus: projection.caseStatus,
        stepStatus: projection.stepStatus,
      });
      if (decision.action === "resume") action = "resume";
    }

    if (action === "resume") {
      if (!caseId) throw new Error("Retry did not resolve an engineering case");
      await resumeAgentTeamCase({
        engineeringCaseId: caseId,
        resumedBy: user.id,
        message: "Developer requested a retry from Agent Control. Reuse the original report and evidence, then re-investigate the current code and database schema.",
      });
      projection = projectAgentTeamCase(await readAgentTeamCase(caseId));
    }

    if (!projection || !caseId) {
      throw new Error("Retry did not return a canonical engineering case");
    }
  } catch (error) {
    return agentFailure(error);
  }

  const now = new Date().toISOString();
  const previousRetryHistory = Array.isArray(normalized.retryHistory)
    ? normalized.retryHistory.filter(isRecord).slice(-19)
    : [];
  const llmMeta = agentResponse?.llm ?? agentResponse?.analysis ?? null;
  const nextNormalized = {
    ...normalized,
    questions: projectionQuestions(projection),
    agentRequest: agentResponse ?? normalized.agentRequest ?? {},
    agentTeam: { ...projection, syncedAt: now },
    retryHistory: [
      ...previousRetryHistory,
      {
        action,
        requestedAt: now,
        requestedBy: user.id,
        engineeringCaseId: caseId,
      },
    ],
  } satisfies Record<string, unknown>;

  const { data: updated, error: updateError } = await supabase
    .from("agent_requests")
    .update({
      intent: normalizeIntent(agentResponse?.intent ?? row.intent),
      status: mapAgentTeamRequestStatus(projection),
      normalized_json: nextNormalized as Json,
      github_issue_number: agentResponse?.github?.issueNumber ?? row.github_issue_number,
      github_issue_url: agentResponse?.github?.issueUrl ?? row.github_issue_url,
      github_pr_number: projection.pullRequest.number,
      github_pr_url: projection.pullRequest.url,
      github_branch: projection.pullRequest.branch,
      github_commit_sha: projection.pullRequest.headSha,
      llm_model: llmMeta?.model ?? row.llm_model,
      llm_confidence: llmMeta?.confidence ?? row.llm_confidence,
      llm_notes: projection.summary
        ?? llmMeta?.notes
        ?? llmMeta?.commentary
        ?? llmMeta?.summary
        ?? row.llm_notes,
      updated_at: now,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      {
        error: "The Agent retry started, but the local projection failed to refresh",
        detail: updateError?.message ?? "Updated request was not returned",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    action,
    request: updated,
    engineeringCaseId: caseId,
    currentStage: projection.currentStage,
    caseStatus: projection.caseStatus,
  });
}
