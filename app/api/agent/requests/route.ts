import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import {
  AgentTeamRequestError,
  agentTeamRequest,
  mapAgentTeamRequestStatus,
  projectAgentTeamCase,
  readAgentTeamCase,
  type AgentTeamProjection,
} from "@/features/agent/server/teamClient";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

type AgentGithubMeta = {
  issueNumber?: number | null;
  issueUrl?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  branchName?: string | null;
  commitSha?: string | null;
  fileUrl?: string | null;
};

type AgentLLMMeta = {
  model?: string | null;
  confidence?: number | null;
  notes?: string | null;
  commentary?: string | null;
  summary?: string | null;
};

type AgentWorkerKick = {
  attempted?: boolean;
  ok?: boolean;
  status?: number;
};

type AgentServiceResponse = {
  ok?: boolean;
  message?: string;
  requestId?: string | null;
  intent?: string | null;
  request?: Record<string, unknown> | null;
  engineeringCaseId?: string | null;
  currentStage?: string | null;
  status?: string | null;
  intakeJobId?: string | null;
  workerKick?: AgentWorkerKick | null;
  github?: AgentGithubMeta | null;
  llm?: AgentLLMMeta | null;
  analysis?: AgentLLMMeta | null;
};

type AgentIntent =
  | "feature_request"
  | "bug_report"
  | "inspection_catalog_add"
  | "service_catalog_add"
  | "refactor";

type AgentRequestStatus =
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged";

type AgentRequestRow = Database["public"]["Tables"]["agent_requests"]["Row"];

const AGENT_INTENTS: AgentIntent[] = [
  "feature_request",
  "bug_report",
  "inspection_catalog_add",
  "service_catalog_add",
  "refactor",
];

function normalizeIntent(raw: unknown): AgentIntent {
  if (typeof raw === "string") {
    const match = AGENT_INTENTS.find((value) => value === raw);
    if (match) return match;
  }
  return "feature_request";
}

function asNullableString(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function projectionQuestions(projection: AgentTeamProjection) {
  return projection.missingInformation.map((question, index) => ({
    id: `team-${projection.engineeringCaseId}-${index}`,
    question,
  }));
}

function teamCaseId(row: AgentRequestRow): string | null {
  if (!isRecord(row.normalized_json)) return null;
  const team = isRecord(row.normalized_json.agentTeam)
    ? row.normalized_json.agentTeam
    : null;
  return team ? asNullableString(team.engineeringCaseId) : null;
}

function lastTeamSyncAt(row: AgentRequestRow): number | null {
  if (!isRecord(row.normalized_json)) return null;
  const team = isRecord(row.normalized_json.agentTeam)
    ? row.normalized_json.agentTeam
    : null;
  const value = team ? asNullableString(team.syncedAt) : null;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function initialProjection(
  response: AgentServiceResponse,
  requestId: string,
): AgentTeamProjection {
  return {
    engineeringCaseId: String(response.engineeringCaseId ?? ""),
    requestId,
    currentStage: String(response.currentStage ?? "intake"),
    caseStatus: String(response.status ?? "active"),
    stepStatus: "pending",
    summary: response.message ?? "Accepted into the ProFixIQ engineering organization.",
    decision: null,
    missingInformation: [],
    updatedAt: new Date().toISOString(),
    mission: null,
    pullRequest: {
      number: response.github?.prNumber ?? null,
      url: response.github?.prUrl ?? null,
      branch: response.github?.branchName ?? null,
      headSha: response.github?.commitSha ?? null,
    },
  };
}

async function syncAgentRequestRow(row: AgentRequestRow): Promise<AgentRequestRow> {
  const activeStatuses: AgentRequestStatus[] = [
    "submitted",
    "in_progress",
    "awaiting_approval",
    "approved",
  ];
  if (!activeStatuses.includes(row.status as AgentRequestStatus)) return row;

  const engineeringCaseId = teamCaseId(row);
  if (!engineeringCaseId) return row;

  const lastSync = lastTeamSyncAt(row);
  if (lastSync && Date.now() - lastSync < 5_000) return row;

  try {
    const envelope = await readAgentTeamCase(engineeringCaseId);
    const projection = projectAgentTeamCase(envelope);
    const normalized = isRecord(row.normalized_json) ? row.normalized_json : {};
    const nextStatus = mapAgentTeamRequestStatus(projection);
    const synchronizedAt = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
      .from("agent_requests")
      .update({
        status: nextStatus,
        normalized_json: {
          ...normalized,
          questions: projectionQuestions(projection),
          agentTeam: { ...projection, syncedAt: synchronizedAt },
        },
        github_pr_number: projection.pullRequest.number,
        github_pr_url: projection.pullRequest.url,
        github_branch: projection.pullRequest.branch,
        github_commit_sha: projection.pullRequest.headSha,
        llm_notes: projection.summary,
      })
      .eq("id", row.id)
      .select("*")
      .single();

    if (error || !updated) {
      console.error("agent request team synchronization failed", error);
      return row;
    }
    return updated;
  } catch (error) {
    console.error("agent request team read failed", {
      requestId: row.id,
      engineeringCaseId,
      error: error instanceof Error ? error.message : String(error),
    });
    return row;
  }
}

type CreateAgentRequestBody = {
  requestId?: string;
  reporterId?: string;
  description?: string;
  intent?: string;
  context?: Record<string, unknown>;
  location?: string;
  steps?: string;
  expected?: string;
  actual?: string;
  device?: string;
  attachmentIds?: string[];
};

export async function GET() {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("agent_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("agent_requests GET error", error);
    return NextResponse.json(
      { error: "Failed to load agent requests" },
      { status: 500 },
    );
  }

  const requests = await Promise.all((data ?? []).map(syncAgentRequestRow));
  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | CreateAgentRequestBody
    | null;

  if (!body?.description?.trim()) {
    return NextResponse.json(
      {
        error: "description is required",
        example: {
          description: "tabbing is not working in corner grids; focus jumps out",
        },
      },
      { status: 400 },
    );
  }

  const description = body.description.trim();
  const intent = normalizeIntent(body.intent);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("agent_requests profile error", profileError);
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds
    : [];

  let signedAttachments: { path: string; url: string; name: string }[] = [];
  if (attachmentIds.length > 0) {
    const { data, error } = await supabaseAdmin.storage
      .from("agent_uploads")
      .createSignedUrls(attachmentIds, 60 * 60 * 24 * 7);

    if (error) {
      console.error("createSignedUrls error for agent_uploads:", error);
    } else if (data) {
      signedAttachments = data.map((row, index) => ({
        path: attachmentIds[index],
        url: row.signedUrl,
        name: attachmentIds[index].split("/").pop() ?? attachmentIds[index],
      }));
    }
  }

  const submittedRequestId = asNullableString(body.requestId)
    ?? asNullableString(body.context?.requestId);

  const structuredContext = {
    requestId: submittedRequestId,
    location: asNullableString(body.location),
    steps: asNullableString(body.steps),
    expected: asNullableString(body.expected),
    actual: asNullableString(body.actual),
    device: asNullableString(body.device),
    attachmentIds,
    attachments: signedAttachments,
    rawContext: body.context ?? {},
  };

  const { data: inserted, error: insertError } = await supabase
    .from("agent_requests")
    .insert({
      shop_id: profile.shop_id,
      reporter_id: profile.id,
      reporter_role: profile.role,
      description,
      intent,
      status: "submitted" as AgentRequestStatus,
      normalized_json: structuredContext,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    console.error("agent_requests insert error", insertError);
    return NextResponse.json(
      { error: "Failed to create agent request" },
      { status: 500 },
    );
  }

  const requestId = inserted.id;
  const signedScreenshotUrls = signedAttachments.map((attachment) => attachment.url);
  const expectedBehavior = asNullableString(body.expected);
  const actualBehavior = asNullableString(body.actual) ?? description;
  const route = asNullableString(body.location);
  const browser = asNullableString(body.device);

  const contextForAgent = {
    ...structuredContext,
    requestId,
    expectedBehavior,
    actualBehavior,
    route,
    browser,
    platform: browser,
    screenshots: signedScreenshotUrls,
    role: profile.role,
    shopId: profile.shop_id,
  };

  let agentResponse: AgentServiceResponse | null = null;
  let agentFailure: { status: number | null; detail: string } | null = null;

  try {
    const endpoint = intent === "refactor" ? "/refactors" : "/feature-requests";
    const payload = intent === "refactor"
      ? {
          requestId,
          source: profile.role ?? "user",
          reporterId: profile.id,
          shopId: profile.shop_id,
          title: `Refactor: ${description.slice(0, 80)}`,
          description,
          expectedBehavior,
          actualBehavior,
          route,
          platform: browser,
          context: contextForAgent,
        }
      : {
          requestId,
          source: profile.role ?? "user",
          reporterId: profile.id,
          shopId: profile.shop_id,
          role: profile.role,
          description,
          intent,
          expectedBehavior,
          actualBehavior,
          route,
          browser,
          platform: browser,
          screenshots: signedScreenshotUrls,
          context: contextForAgent,
        };

    agentResponse = await agentTeamRequest<AgentServiceResponse>(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!agentResponse.engineeringCaseId) {
      throw new AgentTeamRequestError(
        "ProFixIQ-Agent did not return an engineering case",
        502,
        "The Agent accepted the request without a durable engineeringCaseId.",
      );
    }
  } catch (error) {
    agentFailure = error instanceof AgentTeamRequestError
      ? { status: error.status, detail: error.detail }
      : {
          status: null,
          detail: error instanceof Error ? error.message : String(error),
        };
  }

  if (agentFailure) {
    const failureNote = [
      "ProFixIQ-Agent request failed",
      agentFailure.status ? `HTTP ${agentFailure.status}` : null,
      agentFailure.detail,
    ].filter(Boolean).join(": ");

    const { data: failedRequest, error: failureUpdateError } = await supabase
      .from("agent_requests")
      .update({
        status: "failed" as AgentRequestStatus,
        normalized_json: {
          ...structuredContext,
          agentRequest: {
            ok: false,
            status: agentFailure.status,
            error: agentFailure.detail,
          },
        },
        llm_notes: failureNote,
      })
      .eq("id", requestId)
      .select("*")
      .single();

    if (failureUpdateError) {
      console.error("agent_requests failure update error", failureUpdateError);
    }
    console.error("Error calling ProFixIQ-Agent", agentFailure);

    return NextResponse.json(
      {
        error: "ProFixIQ-Agent request failed",
        detail: agentFailure.detail,
        requestId,
        savedLocally: true,
        engineeringCaseCreated: false,
        request: failedRequest ?? inserted,
      },
      { status: 502 },
    );
  }

  const engineeringCaseId = String(agentResponse?.engineeringCaseId ?? "");
  let projection = initialProjection(agentResponse ?? {}, requestId);
  try {
    projection = projectAgentTeamCase(await readAgentTeamCase(engineeringCaseId));
  } catch (error) {
    console.warn("Agent case created but initial synchronization failed", {
      requestId,
      engineeringCaseId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const finalIntent = normalizeIntent(agentResponse?.intent ?? intent);
  const status = mapAgentTeamRequestStatus(projection);
  const synchronizedAt = new Date().toISOString();
  const llmMeta = agentResponse?.llm ?? agentResponse?.analysis ?? null;
  const llmNotes = projection.summary
    ?? llmMeta?.notes
    ?? llmMeta?.commentary
    ?? llmMeta?.summary
    ?? agentResponse?.message
    ?? null;

  const { data: updated, error: updateError } = await supabase
    .from("agent_requests")
    .update({
      intent: finalIntent,
      normalized_json: {
        ...structuredContext,
        questions: projectionQuestions(projection),
        agentRequest: agentResponse ?? {},
        agentTeam: { ...projection, syncedAt: synchronizedAt },
      },
      github_issue_number: agentResponse?.github?.issueNumber ?? null,
      github_issue_url: agentResponse?.github?.issueUrl ?? null,
      github_pr_number: projection.pullRequest.number,
      github_pr_url: projection.pullRequest.url,
      github_branch: projection.pullRequest.branch,
      github_commit_sha: projection.pullRequest.headSha,
      llm_model: llmMeta?.model ?? null,
      llm_confidence: llmMeta?.confidence ?? null,
      llm_notes: llmNotes,
      status,
    })
    .eq("id", requestId)
    .select("*")
    .single();

  if (updateError) {
    console.error("agent_requests update error", updateError);
  }

  return NextResponse.json({
    request: updated ?? inserted,
    agent: agentResponse,
    engineeringCaseId,
    currentStage: projection.currentStage,
    caseStatus: projection.caseStatus,
  });
}
