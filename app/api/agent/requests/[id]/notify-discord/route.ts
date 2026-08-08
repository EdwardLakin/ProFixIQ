import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import {
  AgentTeamRequestError,
  agentTeamRequest,
} from "@/features/agent/server/teamClient";


type PostBody = {
  message?: string;
};

function requestIdFromUrl(url: string): string | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  const requestsIndex = parts.findIndex((part) => part === "requests");
  const id = requestsIndex >= 0 ? parts[requestsIndex + 1] : null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function engineeringCaseId(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.agentTeam)) return null;
  const id = value.agentTeam.engineeringCaseId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function POST(req: Request) {
  const id = requestIdFromUrl(req.url);
  if (!id) {
    return NextResponse.json({ error: "Missing agent request id" }, { status: 400 });
  }

  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;
  const { supabase } = access;

  const { data: requestRow, error: requestError } = await supabase
    .from("agent_requests")
    .select(
      "id, status, intent, description, github_issue_url, github_pr_url, created_at, reporter_role, normalized_json",
    )
    .eq("id", id)
    .single();
  if (requestError || !requestRow) {
    return NextResponse.json({ error: "Agent request not found" }, { status: 404 });
  }

  const caseId = engineeringCaseId(requestRow.normalized_json);
  if (!caseId) {
    return NextResponse.json(
      { error: "This request is not linked to a canonical Agent engineering case" },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const defaultMessage = [
    "🧠 **ProFixIQ engineering case update**",
    `• **Request:** \`${requestRow.id}\``,
    `• **Engineering case:** \`${caseId}\``,
    `• **Status:** ${requestRow.status}`,
    `• **Intent:** ${requestRow.intent ?? "unknown"}`,
    `• **Reporter role:** ${requestRow.reporter_role ?? "unknown"}`,
    `• **Description:** ${requestRow.description}`,
    requestRow.github_issue_url ? `• **Issue:** ${requestRow.github_issue_url}` : null,
    requestRow.github_pr_url ? `• **PR:** ${requestRow.github_pr_url}` : null,
    requestRow.created_at
      ? `• **Created:** ${new Date(requestRow.created_at).toISOString()}`
      : null,
  ].filter((value): value is string => Boolean(value)).join("\n");
  const message = String(body?.message ?? defaultMessage).trim();

  try {
    const result = await agentTeamRequest<Record<string, unknown>>(
      "/notify-discord",
      {
        method: "POST",
        body: JSON.stringify({
          requestId: requestRow.id,
          message,
        }),
      },
    );
    return NextResponse.json({
      ok: true,
      requestId: requestRow.id,
      engineeringCaseId: caseId,
      agent: result,
    });
  } catch (error) {
    if (error instanceof AgentTeamRequestError) {
      return NextResponse.json(
        {
          error: error.message,
          detail: error.detail,
          agentStatus: error.status,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        error: "Agent Discord notification failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
