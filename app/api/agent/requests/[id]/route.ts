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

const APPROVER_ROLES = ["owner", "admin", "manager"];

export async function PATCH(req: NextRequest) {
  // derive id from URL path, so we don't need a typed `params` arg
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/$/, "");
  const segments = pathname.split("/");
  const id = segments[segments.length - 1] ?? "";

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
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    console.error("agent_requests PATCH profile error", profileError);
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  if (!APPROVER_ROLES.includes(profile.role ?? "")) {
    return NextResponse.json(
      { error: "Forbidden – insufficient role to approve/reject" },
      { status: 403 }
    );
  }

  const newStatus: AgentRequestStatus =
    body.action === "approve" ? "approved" : "rejected";

  // Update row
  const { data, error } = await supabase
    .from("agent_requests")
    .update({
      status: newStatus,
      // if llm_notes is undefined, Supabase ignores the field; if string, it overwrites
      llm_notes: body.llm_notes,
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