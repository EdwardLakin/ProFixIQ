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
    | {
        description?: string;
        intent?: string;
        context?: Record<string, unknown>;
      }
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

  // Pull user profile
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

  // 1. Insert initial request entry
  const { data: inserted, error: insertError } = await supabase
    .from("agent_requests")
    .insert({
      shop_id: profile.shop_id,
      reporter_id: profile.id,
      reporter_role: profile.role,
      description,
      intent: body.intent ?? null,
      status: "submitted",
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
        context: body.context ?? {},
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
  const intent = agentResponse?.intent ?? inserted.intent;

  const status =
    github && github.prUrl
      ? "awaiting_approval"
      : github && github.issueUrl
      ? "in_progress"
      : "submitted";

  const { data: updated, error: updateError } = await supabase
    .from("agent_requests")
    .update({
      intent,
      normalized_json: agentResponse?.request ?? {},
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