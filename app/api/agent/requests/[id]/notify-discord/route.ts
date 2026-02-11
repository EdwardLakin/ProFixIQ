// app/api/agent/requests/[id]/notify-discord/route.ts (FULL FILE REPLACEMENT)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const APPROVER_ROLES = ["developer"] as const;
type ApproverRole = (typeof APPROVER_ROLES)[number];

type PostBody = {
  message?: string;
};

type AgentJobKind = DB["public"]["Enums"]["agent_job_kind"];

function isApproverRole(v: unknown): v is ApproverRole {
  return typeof v === "string" && (APPROVER_ROLES as readonly string[]).includes(v);
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function parseJobKind(v: string | undefined): AgentJobKind | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  // Keep this list in sync with your Supabase enum: public.agent_job_kind
  const allowed: readonly AgentJobKind[] = ["notify_discord", "analyze_request"];
  return (allowed as readonly string[]).includes(s) ? (s as AgentJobKind) : null;
}

export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const id = (context?.params?.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing agent request id" }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<DB>({
      cookies: () => cookieStore,
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json(
        { error: "Failed to read auth session", details: authError.message },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // role gate
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, agent_role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("notify-discord profile error", profileError);
      return NextResponse.json({ error: "Profile not found" }, { status: 400 });
    }

    if (!isApproverRole(profile.agent_role)) {
      return NextResponse.json(
        { error: "Forbidden – insufficient role to notify Discord" },
        { status: 403 }
      );
    }

    // load the request to build a default message
    const { data: requestRow, error: requestError } = await supabase
      .from("agent_requests")
      .select(
        "id, status, intent, description, github_issue_url, github_pr_url, created_at, reporter_role"
      )
      .eq("id", id)
      .single();

    if (requestError || !requestRow) {
      console.error("notify-discord load error", requestError);
      return NextResponse.json({ error: "Agent request not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as PostBody | null;

    const defaultMessage = [
      "🧠 ProFixIQ Agent Request",
      `• ID: ${requestRow.id}`,
      `• Status: ${requestRow.status}`,
      `• Intent: ${requestRow.intent ?? "unknown"}`,
      `• Reporter Role: ${requestRow.reporter_role ?? "unknown"}`,
      `• Description: ${requestRow.description}`,
      requestRow.github_issue_url ? `• Issue: ${requestRow.github_issue_url}` : null,
      requestRow.github_pr_url ? `• PR: ${requestRow.github_pr_url}` : null,
      requestRow.created_at
        ? `• Created: ${new Date(requestRow.created_at).toLocaleString()}`
        : null,
    ]
      .filter((v): v is string => Boolean(v))
      .join("\n");

    const message = String(body?.message ?? defaultMessage).trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // Create service-role client lazily (avoids crashing at module load)
    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

    const supabaseAdmin = createClient<DB>(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Allow env override to match worker expectation (type-safe against enum)
    const jobKind: AgentJobKind =
      parseJobKind(process.env.AGENT_NOTIFY_DISCORD_JOB_KIND) ?? "notify_discord";

    // enqueue job for worker
    type AgentJobInsert = DB["public"]["Tables"]["agent_jobs"]["Insert"];

    const job: AgentJobInsert = {
      request_id: requestRow.id,
      kind: jobKind,
      status: "queued",
      priority: 80,
      payload: { message },
      run_after: new Date().toISOString(),
    };

    const { data: insertedJob, error: jobError } = await supabaseAdmin
      .from("agent_jobs")
      .insert(job)
      .select("id, kind, status")
      .single();

    if (jobError) {
      console.error("notify-discord enqueue error", jobError);
      return NextResponse.json(
        { error: "Failed to enqueue notify_discord job", details: jobError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      jobId: insertedJob?.id ?? null,
      kind: insertedJob?.kind ?? null,
      status: insertedJob?.status ?? null,
    });
  } catch (err: unknown) {
    const details = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: "Internal Server Error", details }, { status: 500 });
  }
}