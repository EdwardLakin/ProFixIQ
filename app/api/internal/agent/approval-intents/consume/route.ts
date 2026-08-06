import { NextResponse } from "next/server";
import {
  consumeAgentHumanApprovalIntent,
  type AgentHumanApprovalKind,
} from "@/features/agent/server/humanApprovalIntent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isApprovalKind(value: unknown): value is AgentHumanApprovalKind {
  return value === "mission" || value === "release";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || !isApprovalKind(body.approvalKind)) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  try {
    const valid = await consumeAgentHumanApprovalIntent({
      proof: String(body.approvalProof ?? ""),
      approvalKind: body.approvalKind,
      approverUserId: String(body.approvedBy ?? ""),
      engineeringCaseId: String(body.engineeringCaseId ?? ""),
      missionId: body.approvalKind === "mission"
        ? String(body.missionId ?? "")
        : null,
    });
    return NextResponse.json({ valid });
  } catch (error) {
    console.error("Agent human approval intent consumption failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { valid: false, error: "approval intent verification unavailable" },
      { status: 503 },
    );
  }
}
