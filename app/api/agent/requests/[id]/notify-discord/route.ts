import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const APPROVER_ROLES = ["developer"] as const;

// Service-role client to enqueue jobs
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type PostBody = {
  message?: string;
};

type EnqueueJobInsert = {
  request_id: string | null;
  kind: string;
  status: "queued";
  priority: number;
  payload: Record<string, unknown>;
  run_after: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params?.id;

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

  if (!APPROVER_ROLES.includes((profile.agent_role ?? "") as any)) {
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
    .filter(Boolean)
    .join("\n");

  const message = String(body?.message ?? defaultMessage).trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // enqueue job for worker
  const job: EnqueueJobInsert = {
    request_id: requestRow.id,
    kind: "notify_discord",
    status: "queued",
    priority: 80,
    payload: { message },
    run_after: new Date().toISOString(),
  };

  // NOTE: if your table name differs, change "agent_jobs" here.
  const { data: insertedJob, error: jobError } = await supabaseAdmin
    .from("agent_jobs" as any)
    .insert(job as any)
    .select("id")
    .single();

  if (jobError) {
    console.error("notify-discord enqueue error", jobError);
    return NextResponse.json(
      { error: "Failed to enqueue notify_discord job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, jobId: (insertedJob as any)?.id ?? null });
}