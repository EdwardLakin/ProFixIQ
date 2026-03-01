// /app/api/agent/requests/[id]/route.ts (FULL FILE REPLACEMENT)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type AgentRequestStatus =
  | "submitted"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "failed"
  | "merged";

type PatchBody = {
  action?: "approve" | "reject";
  llm_notes?: string;
};

const APPROVER_ROLES = ["developer"];

// Same base URL as /app/api/agent/requests/route.ts
const AGENT_SERVICE_URL =
  process.env.PROFIXIQ_AGENT_URL?.replace(/\/$/, "") ||
  "https://obscure-space-guacamole-69pvggxvgrxj2qxr-4001.app.github.dev";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/$/, "");
  const segments = pathname.split("/");
  const id = segments[segments.length - 1];
  return id || null;
}

function nowIso(): string {
  return new Date().toISOString();
}

type AgentActionRisk = "low" | "medium" | "high" | "unknown";

type AgentActionRow = {
  id: string;
  request_id: string;
  kind: string;
  status: string;
  risk: AgentActionRisk | null;
  summary: string | null;
  payload: unknown;
  created_at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeUuid(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  // Supabase UUIDs are standard 36-char (with hyphens)
  return s.length === 36 ? s : null;
}

async function approveActionsAndEnqueueJobs(params: {
  supabase: ReturnType<typeof createRouteHandlerClient<Database>>;
  requestId: string;
  approvedBy: string;
}) {
  const { supabase, requestId, approvedBy } = params;

  const { data: actions, error: actionsErr } = await supabase
    .from("agent_actions")
    .select("id, request_id, kind, status, risk, summary, payload, created_at")
    .eq("request_id", requestId)
    .in("status", ["awaiting_approval", "pending_approval", "needs_approval"])
    .order("created_at", { ascending: true });

  if (actionsErr) {
    throw new Error(`Failed to load agent_actions: ${actionsErr.message}`);
  }

  const list = (actions ?? []) as AgentActionRow[];
  if (list.length === 0) {
    return { approvedActionIds: [] as string[], enqueuedJobIds: [] as string[] };
  }

  const approvedActionIds: string[] = [];
  const enqueuedJobIds: string[] = [];

  for (const a of list) {
    const actionId = safeUuid(a.id);
    if (!actionId) continue;

    // 1) Approve via RPC (source-of-truth)
    const { error: rpcErr } = await supabase.rpc("agent_approve_action", {
      p_action_id: actionId,
      p_approved_by: approvedBy,
    });

    if (rpcErr) {
      throw new Error(`agent_approve_action failed: ${rpcErr.message}`);
    }

    approvedActionIds.push(actionId);

    // 2) Enqueue job for worker
    const payload = isRecord(a.payload)
      ? { ...a.payload, actionId }
      : { actionId, payload: a.payload };

    const { data: jobRow, error: jobErr } = await supabase
      .from("agent_jobs")
      .insert({
        request_id: requestId,
        kind: a.kind,
        status: "queued",
        priority: 100,
        payload,
        run_after: nowIso(),
      })
      .select("id")
      .single();

    if (jobErr) {
      throw new Error(`Failed to enqueue agent_jobs: ${jobErr.message}`);
    }

    enqueuedJobIds.push(String(jobRow.id));
  }

  return { approvedActionIds, enqueuedJobIds };
}

/**
 * PATCH /api/agent/requests/:id
 * - approve / reject a request
 * - approving ALSO approves any pending agent_actions and enqueues agent_jobs
 * - PR merge step stays separate (best-effort)
 */
export async function PATCH(req: NextRequest) {
  const id = getIdFromUrl(req);

  if (!id) {
    return NextResponse.json({ error: "Missing agent request id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;

  if (!body || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json(
      {
        error: "action is required and must be 'approve' or 'reject'",
        example: { action: "approve" },
      },
      { status: 400 },
    );
  }

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore,
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Role gate
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, agent_role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("agent_requests PATCH profile error", profileError);
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  if (!APPROVER_ROLES.includes(profile.agent_role ?? "")) {
    return NextResponse.json(
      { error: "Forbidden – insufficient role to approve/reject" },
      { status: 403 },
    );
  }

  // Load request (PR info)
  const { data: existing, error: existingError } = await supabase
    .from("agent_requests")
    .select("id, status, github_pr_number, github_pr_url, github_branch, github_commit_sha")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    console.error("agent_requests PATCH load error", existingError);
    return NextResponse.json({ error: "Agent request not found" }, { status: 404 });
  }

  let finalStatus: AgentRequestStatus = body.action === "approve" ? "approved" : "rejected";
  let newCommitSha: string | null = existing.github_commit_sha;
  let newBranch: string | null = existing.github_branch;

  let approvedActionIds: string[] = [];
  let enqueuedJobIds: string[] = [];

  if (body.action === "approve") {
    try {
      const out = await approveActionsAndEnqueueJobs({
        supabase,
        requestId: id,
        approvedBy: user.id,
      });
      approvedActionIds = out.approvedActionIds;
      enqueuedJobIds = out.enqueuedJobIds;
    } catch (err) {
      console.error("Approve actions/enqueue jobs failed", err);
      finalStatus = "failed";
    }
  } else {
    // Reject pending actions (best-effort)
    try {
      const { data: actions, error: actionsErr } = await supabase
        .from("agent_actions")
        .select("id, status")
        .eq("request_id", id)
        .in("status", ["awaiting_approval", "pending_approval", "needs_approval"])
        .order("created_at", { ascending: true });

      if (actionsErr) throw new Error(actionsErr.message);

      for (const a of actions ?? []) {
        const actionId = safeUuid((a as { id: unknown }).id);
        if (!actionId) continue;

        const { error: rpcErr } = await supabase.rpc("agent_reject_action", {
          p_action_id: actionId,
          p_rejected_by: user.id,
          p_reason: "Rejected from Agent Console UI",
        });

        if (rpcErr) throw new Error(rpcErr.message);
      }
    } catch (err) {
      console.error("Reject actions failed (continuing)", err);
    }
  }

  // PR merge step (only if PR exists and request was awaiting_approval)
  if (
    body.action === "approve" &&
    existing.github_pr_number != null &&
    existing.status === "awaiting_approval"
  ) {
    try {
      const mergeRes = await fetch(`${AGENT_SERVICE_URL}/feature-requests/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: existing.github_pr_number }),
      });

      if (!mergeRes.ok) {
        console.error("Agent merge endpoint returned non-OK", mergeRes.status, await mergeRes.text());
        finalStatus = "failed";
      } else {
        const mergeJson = (await mergeRes.json()) as {
          merged?: boolean;
          alreadyMerged?: boolean;
          branch?: string;
          sha?: string;
        };

        if (mergeJson.merged || mergeJson.alreadyMerged) {
          finalStatus = "merged";
          newCommitSha = mergeJson.sha ?? newCommitSha;
          newBranch = mergeJson.branch ?? newBranch;
        } else {
          finalStatus = "failed";
        }
      }
    } catch (err) {
      console.error("Error calling Agent merge endpoint", err);
      finalStatus = "failed";
    }
  }

  // Update request row
  const { data, error } = await supabase
    .from("agent_requests")
    .update({
      status: finalStatus,
      llm_notes: body.llm_notes,
      github_commit_sha: newCommitSha,
      github_branch: newBranch,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("agent_requests PATCH update error", error);
    return NextResponse.json({ error: "Failed to update agent request" }, { status: 500 });
  }

  return NextResponse.json({
    request: data,
    approvedActionIds,
    enqueuedJobIds,
  });
}

export async function DELETE(req: NextRequest) {
  const id = getIdFromUrl(req);

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

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, agent_role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("agent_requests DELETE profile error", profileError);
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  if (!APPROVER_ROLES.includes(profile.agent_role ?? "")) {
    return NextResponse.json(
      { error: "Forbidden – insufficient role to delete requests" },
      { status: 403 },
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("agent_requests")
    .select("id, normalized_json")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    console.error("agent_requests DELETE load error", existingError);
    return NextResponse.json({ error: "Agent request not found" }, { status: 404 });
  }

  // Cleanup screenshot files (best-effort)
  try {
    const ctx = (existing.normalized_json ?? {}) as { attachmentIds?: string[] };

    if (Array.isArray(ctx.attachmentIds) && ctx.attachmentIds.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("agent_uploads")
        .remove(ctx.attachmentIds);

      if (storageError) console.error("agent_uploads cleanup error", storageError);
    }
  } catch (err) {
    console.error("Error processing attachmentIds for cleanup", err);
  }

  const { error: deleteError } = await supabase.from("agent_requests").delete().eq("id", id);

  if (deleteError) {
    console.error("agent_requests DELETE error", deleteError);
    return NextResponse.json({ error: "Failed to delete agent request" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}