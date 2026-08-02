// app/api/agent/requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const AGENT_SERVICE_URL = String(process.env.PROFIXIQ_AGENT_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  },
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

function agentApiSecret(): string {
  return String(
    process.env.AGENT_API_SECRET
      ?? process.env.PROFIXIQ_AGENT_API_SECRET
      ?? process.env.INTERNAL_AGENT_SECRET
      ?? "",
  ).trim();
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

  return NextResponse.json({ requests: data });
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
      .createSignedUrls(attachmentIds, 60 * 60 * 24);

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
  const agentSecret = agentApiSecret();

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
    if (!AGENT_SERVICE_URL) {
      throw new Error("PROFIXIQ_AGENT_URL is not configured");
    }
    if (!agentSecret) {
      throw new Error("AGENT_API_SECRET is not configured");
    }

    const endpoint = intent === "refactor" ? "/refactors" : "/feature-requests";
    const payload = intent === "refactor"
      ? {
          requestId,
          source: profile.role ?? "user",
          reporterId: profile.id,
          shopId: profile.shop_id,
          title: `Refactor: ${description.slice(0, 80)}`,
          description,
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

    const response = await fetch(`${AGENT_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-api-secret": agentSecret,
        "x-agent-secret": agentSecret,
        Authorization: `Bearer ${agentSecret}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const rawResponse = await response.text();
    if (!response.ok) {
      agentFailure = {
        status: response.status,
        detail: rawResponse.slice(0, 2_000) || `HTTP ${response.status}`,
      };
    } else {
      try {
        agentResponse = JSON.parse(rawResponse) as AgentServiceResponse;
      } catch {
        agentFailure = {
          status: response.status,
          detail: "ProFixIQ-Agent returned invalid JSON",
        };
      }
    }
  } catch (error) {
    agentFailure = {
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
        request: failedRequest ?? inserted,
      },
      { status: 502 },
    );
  }

  const github = agentResponse?.github ?? null;
  const llmMeta = agentResponse?.llm ?? agentResponse?.analysis ?? null;
  const llmConfidence = llmMeta?.confidence ?? null;
  const llmNotes =
    llmMeta?.notes
    ?? llmMeta?.commentary
    ?? llmMeta?.summary
    ?? agentResponse?.message
    ?? null;

  let finalIntent: AgentIntent = intent;
  const agentIntent = agentResponse?.intent as AgentIntent | null | undefined;
  if (
    agentIntent === "inspection_catalog_add"
    || agentIntent === "service_catalog_add"
  ) {
    finalIntent = agentIntent;
  }

  const hasPersistedEngineeringCase = Boolean(
    agentResponse?.engineeringCaseId
    || agentResponse?.intakeJobId,
  );
  const status: AgentRequestStatus = github?.prUrl
    ? "awaiting_approval"
    : github?.issueUrl
      ? "in_progress"
      : hasPersistedEngineeringCase
        ? "in_progress"
        : finalIntent === "inspection_catalog_add"
            || finalIntent === "service_catalog_add"
          ? "merged"
          : "submitted";

  const { data: updated, error: updateError } = await supabase
    .from("agent_requests")
    .update({
      intent: finalIntent,
      normalized_json: {
        ...structuredContext,
        agentRequest: agentResponse ?? {},
      },
      github_issue_number: github?.issueNumber ?? null,
      github_issue_url: github?.issueUrl ?? null,
      github_pr_number: github?.prNumber ?? null,
      github_pr_url: github?.prUrl ?? null,
      github_branch: github?.branchName ?? null,
      github_commit_sha: github?.commitSha ?? null,
      llm_model: llmMeta?.model ?? null,
      llm_confidence: llmConfidence,
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
  });
}
