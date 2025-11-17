// app/api/agent/requests/[id]/route.ts
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
  // optional: allow overriding / adding notes when deciding
  llm_notes?: string;
};

const APPROVER_ROLES = ["developer"];

// Same base URL as /app/api/agent/requests/route.ts
const AGENT_SERVICE_URL =
  process.env.PROFIXIQ_AGENT_URL?.replace(/\/$/, "") ||
  "https://obscure-space-guacamole-69pvggxvgrxj2qxr-4001.app.github.dev";

// Helper to extract id from /api/agent/requests/:id
function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/$/, "");
  const segments = pathname.split("/");
  const id = segments[segments.length - 1];
  return id || null;
}

/**
 * PATCH /api/agent/requests/:id
 * - approve / reject a request
 * - when approving a PR in awaiting_approval, call the agent merge endpoint
 */
export async function PATCH(req: NextRequest) {
  const id = getIdFromUrl(req);

  if (!id) {
    return NextResponse.json(
      { error: "Missing agent request id" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;

  if (!body || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json(
      {
        error: "action is required and must be 'approve' or 'reject'",
        example: { action: "approve" },
      },
      { status: 400 }
    );
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

  // Load profile to enforce role-based approval
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
      { status: 403 }
    );
  }

  // Load current request so we know PR info & current status
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("agent_requests")
    .select(
      "id, status, github_pr_number, github_pr_url, github_branch, github_commit_sha"
    )
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    console.error("agent_requests PATCH load error", existingError);
    return NextResponse.json(
      { error: "Agent request not found" },
      { status: 404 }
    );
  }

  // Default new status based on action
  let finalStatus: AgentRequestStatus =
    body.action === "approve" ? "approved" : "rejected";

  // We may update these if merge succeeds
  let newCommitSha: string | null = existing.github_commit_sha;
  let newBranch: string | null = existing.github_branch;

  // If approving and we have a PR, ask the Agent service to merge & delete branch
  if (
    body.action === "approve" &&
    existing.github_pr_number != null &&
    existing.status === "awaiting_approval"
  ) {
    try {
      const mergeRes = await fetch(
        `${AGENT_SERVICE_URL}/feature-requests/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prNumber: existing.github_pr_number }),
        }
      );

      if (!mergeRes.ok) {
        console.error(
          "Agent merge endpoint returned non-OK",
          mergeRes.status,
          await mergeRes.text()
        );
        // mark as failed so you know merge didn't happen
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

  // Update row
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
    return NextResponse.json(
      { error: "Failed to update agent request" },
      { status: 500 }
    );
  }

  return NextResponse.json({ request: data });
}

/**
 * DELETE /api/agent/requests/:id
 * - developer-only
 * - best-effort cleanup of screenshot files in agent_uploads
 */
export async function DELETE(req: NextRequest) {
  const id = getIdFromUrl(req);

  if (!id) {
    return NextResponse.json(
      { error: "Missing agent request id" },
      { status: 400 }
    );
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

  // Same role gate as PATCH: only developer (agent_role) can delete
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
      { status: 403 }
    );
  }

  // Fetch the row so we can see any attachmentIds
  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from("agent_requests")
    .select("id, normalized_json")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    console.error("agent_requests DELETE load error", existingError);
    return NextResponse.json(
      { error: "Agent request not found" },
      { status: 404 }
    );
  }

  // Best-effort cleanup of screenshot files in agent_uploads
  try {
    const ctx = (existing.normalized_json ?? {}) as {
      attachmentIds?: string[];
    };

    if (Array.isArray(ctx.attachmentIds) && ctx.attachmentIds.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("agent_uploads")
        .remove(ctx.attachmentIds);

      if (storageError) {
        console.error("agent_uploads cleanup error", storageError);
        // don't fail the whole delete because of storage
      }
    }
  } catch (err) {
    console.error("Error processing attachmentIds for cleanup", err);
  }

  // Finally remove the DB row
  const { error: deleteError } = await supabase
    .from("agent_requests")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("agent_requests DELETE error", deleteError);
    return NextResponse.json(
      { error: "Failed to delete agent request" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}