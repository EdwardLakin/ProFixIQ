import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  AgentTeamRequestError,
  mapAgentTeamRequestStatus,
  projectAgentTeamCase,
  readAgentTeamCase,
  resumeAgentTeamCase,
} from "@/features/agent/server/teamClient";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type ReplyBody = {
  message: string;
  answers?: Record<string, string>;
};

type AgentResponse = {
  id: string;
  created_at: string;
  user_id: string | null;
  message: string;
  answers?: Record<string, string> | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function toJsonRecord(value: unknown): Record<string, Json | undefined> {
  return isRecord(value)
    ? value as Record<string, Json | undefined>
    : {};
}

function routeId(req: Request): string | null {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const requestsIndex = segments.findIndex((segment) => segment === "requests");
  const id = requestsIndex >= 0 ? segments[requestsIndex + 1] : null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function engineeringCaseId(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.agentTeam)) return null;
  const id = value.agentTeam.engineeringCaseId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
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
      error: "Agent team reply failed",
      detail: error instanceof Error ? error.message : String(error),
    },
    { status: 502 },
  );
}

export async function POST(req: Request) {
  const id = routeId(req);
  if (!id) {
    return NextResponse.json({ error: "missing route param id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as ReplyBody | null;
  const message = body?.message?.trim() ?? "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const supabase = createServerSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error: selectError } = await supabase
    .from("agent_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (selectError) {
    return NextResponse.json(
      { error: `select failed: ${selectError.message}` },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const caseId = engineeringCaseId(row.normalized_json);
  if (!caseId) {
    return NextResponse.json(
      { error: "This request is not linked to a canonical Agent engineering case" },
      { status: 409 },
    );
  }

  try {
    await resumeAgentTeamCase({
      engineeringCaseId: caseId,
      resumedBy: user.id,
      message,
      answers: body?.answers,
    });
  } catch (error) {
    return agentFailure(error);
  }

  let projection;
  try {
    projection = projectAgentTeamCase(await readAgentTeamCase(caseId));
  } catch (error) {
    return agentFailure(error);
  }

  const normalized = toJsonRecord(row.normalized_json);
  const previousResponses = safeArray<AgentResponse>(normalized.responses);
  const newResponse: AgentResponse = {
    id: `resp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: nowIso(),
    user_id: user.id,
    message,
    answers: body?.answers && isRecord(body.answers) ? body.answers : null,
  };

  const nextNormalized: Record<string, Json | undefined> = {
    ...normalized,
    responses: [...previousResponses, newResponse] as unknown as Json,
    last_response_at: nowIso(),
    agentTeam: {
      ...projection,
      syncedAt: nowIso(),
    } as unknown as Json,
  };

  const { data: updated, error: updateError } = await supabase
    .from("agent_requests")
    .update({
      normalized_json: nextNormalized as Json,
      status: mapAgentTeamRequestStatus(projection),
      github_pr_number: projection.pullRequest.number,
      github_pr_url: projection.pullRequest.url,
      github_branch: projection.pullRequest.branch,
      github_commit_sha: projection.pullRequest.headSha,
      llm_notes: projection.summary,
      updated_at: nowIso(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json(
      {
        error: "The Agent case resumed, but the local reply projection failed",
        detail: updateError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    request: updated,
    engineeringCaseId: caseId,
    currentStage: projection.currentStage,
    caseStatus: projection.caseStatus,
  });
}
