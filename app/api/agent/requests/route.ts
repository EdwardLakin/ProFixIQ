// app/api/agent/requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Normalize URL so we don't get `//feature-requests`
const AGENT_SERVICE_URL =
  process.env.PROFIXIQ_AGENT_URL?.replace(/\/$/, "") ||
  "https://obscure-space-guacamole-69pvggxvgrxj2qxr-4001.app.github.dev";

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
};

type AgentServiceResponse = {
  message?: string;
  intent?: string | null;
  request?: Record<string, unknown> | null;
  github?: AgentGithubMeta | null;
  llm?: AgentLLMMeta | null;
};

// DB enum values for agent_requests.intent
type AgentIntent =
  | "feature_request"
  | "bug_report"
  | "inspection_catalog_add"
  | "service_catalog_add"
  | "refactor";

const AGENT_INTENTS: AgentIntent[] = [
  "feature_request",
  "bug_report",
  "inspection_catalog_add",
  "service_catalog_add",
  "refactor",
];

function normalizeIntent(raw: unknown): AgentIntent {
  if (typeof raw === "string") {
    const match = AGENT_INTENTS.find((v) => v === raw);
    if (match) return match;
  }
  // safe default that always exists in your enum
  return "feature_request";
}

type CreateAgentRequestBody = {
  description?: string;
  intent?: string;
  context?: Record<string, unknown>;
  // v2 structured fields for QA:
  location?: string;
  steps?: string;
  expected?: string;
  actual?: string;
  device?: string;
  attachmentIds?: string[]; // ids from agent_attachments (future)
};

export async function GET(_req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore,
  });

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
      { status: 500 }
    );
  }

  return NextResponse.json({ requests: data });
}

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as CreateAgentRequestBody | null;

  if (!body || !body.description || !body.description.trim()) {
    return NextResponse.json(
      {
        error: "description is required",
        example: {
          description:
            "tabbing is not working in corner grids; focus jumps out",
        },
      },
      { status: 400 }
    );
  }

  const description = body.description.trim();
  const intent = normalizeIntent(body.intent);

  // Pull user profile (assumes profiles.id === auth.users.id)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("agent_requests profile error", profileError);
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 400 }
    );
  }

  // v2: structured context object we pass both to DB + agent
  const structuredContext = {
    location: body.location ?? null,
    steps: body.steps ?? null,
    expected: body.expected ?? null,
    actual: body.actual ?? null,
    device: body.device ?? null,
    attachmentIds: body.attachmentIds ?? [],
    rawContext: body.context ?? {},
  };

  // 1. Insert initial request entry (persist structured context right away)
  const { data: inserted, error: insertError } = await supabase
    .from("agent_requests")
    .insert({
      shop_id: profile.shop_id,
      reporter_id: profile.id,
      reporter_role: profile.role,
      description,
      intent, // always a valid enum value
      status: "submitted", // valid status enum
      normalized_json: structuredContext,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    console.error("agent_requests insert error", insertError);
    return NextResponse.json(
      { error: "Failed to create agent request" },
      { status: 500 }
    );
  }

  // 2. Call the external agent service
  let agentResponse: AgentServiceResponse | null = null;
  try {
    const res = await fetch(`${AGENT_SERVICE_URL}/feature-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: profile.role ?? "user",
        reporterId: profile.id,
        shopId: profile.shop_id,
        description,
        context: structuredContext,
      }),
    });

    // If the agent service errors, we still keep the local row as "submitted"
    if (res.ok) {
      agentResponse = (await res.json()) as AgentServiceResponse;
    } else {
      console.error(
        "ProFixIQ-Agent returned non-OK status",
        res.status,
        await res.text()
      );
    }
  } catch (err) {
    console.error("Error calling ProFixIQ-Agent", err);
  }

  // 3. Update row with returned GitHub & LLM metadata
  const github = agentResponse?.github ?? null;
  const llm_confidence = agentResponse?.llm?.confidence ?? null;
  const llm_notes = agentResponse?.llm?.notes ?? null;
  const finalIntent =
    (agentResponse?.intent as AgentIntent | null | undefined) ?? intent;

  const status: AgentIntent | AgentIntent | "submitted" | "in_progress" | "awaiting_approval" | "merged" =
    github && github.prUrl
      ? "awaiting_approval"
      : github && github.issueUrl
      ? "in_progress"
      : finalIntent === "inspection_catalog_add" ||
        finalIntent === "service_catalog_add"
      ? "merged" // small catalog updates auto-merged
      : "submitted";

  const { data: updated, error: updateError } = await supabase
    .from("agent_requests")
    .update({
      intent: finalIntent,
      normalized_json: {
        ...structuredContext,
        agentRequest: agentResponse?.request ?? {},
      },
      github_issue_number: github?.issueNumber ?? null,
      github_issue_url: github?.issueUrl ?? null,
      github_pr_number: github?.prNumber ?? null,
      github_pr_url: github?.prUrl ?? null,
      github_branch: github?.branchName ?? null,
      github_commit_sha: github?.commitSha ?? null,
      llm_model: agentResponse?.llm?.model ?? null,
      llm_confidence,
      llm_notes,
      status,
    })
    .eq("id", inserted.id)
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