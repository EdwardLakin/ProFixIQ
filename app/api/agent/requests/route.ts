// app/api/agent/requests/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

// Normalize URL so we don't get `//feature-requests`
const AGENT_SERVICE_URL =
  process.env.PROFIXIQ_AGENT_URL?.replace(/\/$/, "") ||
  "https://obscure-space-guacamole-69pvggxvgrxj2qxr-4001.app.github.dev";

// Service-role client used ONLY to sign private screenshot URLs
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
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

type AgentServiceResponse = {
  message?: string;
  intent?: string | null;
  request?: Record<string, unknown> | null;
  github?: AgentGithubMeta | null;
  llm?: AgentLLMMeta | null;
};

// DB enum values
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
    const match = AGENT_INTENTS.find((v) => v === raw);
    if (match) return match;
  }
  return "feature_request";
}

type CreateAgentRequestBody = {
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

  const body = (await req.json().catch(() => null)) as
    | CreateAgentRequestBody
    | null;

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

  // Load profile
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("agent_requests profile error", profileError);
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  // ---------------------------------------------------------------------------
  // Create SHORT-LIVED SIGNED URLS for uploaded screenshots
  // (bucket `agent_uploads` stays private, RLS unchanged)
  // ---------------------------------------------------------------------------
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds
    : [];

  let signedAttachments: { path: string; url: string; name: string }[] = [];

  if (attachmentIds.length > 0) {
    const { data, error } = await supabaseAdmin.storage
      .from("agent_uploads")
      .createSignedUrls(attachmentIds, 60 * 60 * 24); // 24 hours

    if (error) {
      console.error("createSignedUrls error for agent_uploads:", error);
    } else if (data) {
      signedAttachments = data.map((row, i) => ({
        path: attachmentIds[i],
        url: row.signedUrl,
        name: attachmentIds[i].split("/").pop() ?? attachmentIds[i],
      }));
    }
  }

  // Structured context (what we store in DB)
  const structuredContext = {
    location: body.location ?? null,
    steps: body.steps ?? null,
    expected: body.expected ?? null,
    actual: body.actual ?? null,
    device: body.device ?? null,
    attachmentIds,
    attachments: signedAttachments,
    rawContext: body.context ?? {},
  };

  // Insert initial request
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
      { status: 500 }
    );
  }

  // Context we send to the Agent service (includes signed attachment URLs)
  const contextForAgent = {
    ...structuredContext,
  };

  // Call agent service
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
        intent,
        context: contextForAgent,
      }),
    });

    if (res.ok) {
      agentResponse = (await res.json()) as AgentServiceResponse;
      console.log(
        "ProFixIQ-Agent response",
        inserted.id,
        JSON.stringify(agentResponse, null, 2)
      );
    } else {
      console.error(
        "ProFixIQ-Agent returned non-OK",
        res.status,
        await res.text()
      );
    }
  } catch (err) {
    console.error("Error calling ProFixIQ-Agent", err);
  }

  // Extract GitHub + LLM
  const github = agentResponse?.github ?? null;
  const llmMeta = agentResponse?.llm ?? null;
  const llm_confidence = llmMeta?.confidence ?? null;

  const llm_notes =
    llmMeta?.notes ??
    llmMeta?.commentary ??
    llmMeta?.summary ??
    agentResponse?.message ??
    null;

  // -----------------------------------------------------
  // Final intent logic (UI choice wins unless LLM switched
  // into one of the catalog-add flows)
  // -----------------------------------------------------
  let finalIntent: AgentIntent = intent;
  const agentIntent = agentResponse?.intent as AgentIntent | null | undefined;

  if (
    agentIntent === "inspection_catalog_add" ||
    agentIntent === "service_catalog_add"
  ) {
    finalIntent = agentIntent;
  }

  // Status selection
  const status: AgentRequestStatus =
    github?.prUrl
      ? "awaiting_approval"
      : github?.issueUrl
      ? "in_progress"
      : finalIntent === "inspection_catalog_add" ||
        finalIntent === "service_catalog_add"
      ? "merged"
      : "submitted";

  // Update row with agent details
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
      llm_model: llmMeta?.model ?? null,
      llm_confidence,
      llm_notes: llm_notes ?? null,
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
