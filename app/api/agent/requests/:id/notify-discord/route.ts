// app/api/agent/requests/[id]/notify-discord/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const APPROVER_ROLES = ["developer"]; // keep same gate as approve/reject

// Service-role client to enqueue jobs into public.agent_jobs
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type PostBody = {
  message?: string;
};

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  const id = ctx?.params?.id;

  if (!id) {
    return NextResponse.json({ error: "Missing agent request id" }, { status: 400 });
  }

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

  // Role gate (same pattern as PATCH /api/agent/requests/:id)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, agent_role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("notify-discord POST profile error", profileError);
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  if (!APPROVER_ROLES.includes(profile.agent_role ?? "")) {
    return NextResponse.json(
      { error: "Forbidden – insufficient role to notify Discord" },
      { status: 403 }
    );
  }

  // Load request so we can build a default message
  const { data: requestRow, error: requestError } = await supabase
    .from("agent_requests")
    .select(
      "id, status, intent, description, github_issue_url, github_pr_url, created_at, reporter_role"
    )
    .eq("id", id)
    .single();

  if (requestError || !requestRow) {
    console.error("notify-discord POST load error", requestError);
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
    requestRow.created_at ? `• Created: ${new Date(requestRow.created_at).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const message = String(body?.message ?? defaultMessage).trim();

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Enqueue job (expects worker handler to read payload.message)
  const jobInsert = {
    request_id: requestRow.id,
    kind: "notify_discord",
    status: "queued",
    priority: 80,
    payload: { message },
    run_after: new Date().toISOString(),
  };

  const { data: job, error: jobError } = await supabaseAdmin
    .from("agent_jobs" as any)
    .insert(jobInsert as any)
    .select("id")
    .single();

  if (jobError) {
    console.error("notify-discord enqueue error", jobError);
    return NextResponse.json(
      { error: "Failed to enqueue notify_discord job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, jobId: (job as any)?.id ?? null });
}