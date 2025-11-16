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
  // optional: let you override notes on decision later
  llm_notes?: string;
};

const APPROVER_ROLES = ["owner", "admin", "manager"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

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
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 400 }
    );
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
      // optionally store decision notes or override LLM notes
      llm_notes: body.llm_notes ?? undefined,
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