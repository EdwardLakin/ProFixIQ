import { NextResponse } from "next/server";
import { approveAiActionPreview, rejectAiActionPreview } from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DecisionBody = {
  decision: "approved" | "rejected";
  decisionNote?: string;
};

function parseBody(value: unknown): DecisionBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid request body");
  }

  const raw = value as Record<string, unknown>;
  const decision = raw.decision;
  if (decision !== "approved" && decision !== "rejected") {
    throw new Error("invalid decision");
  }

  const decisionNote = typeof raw.decisionNote === "string" ? raw.decisionNote.trim() : undefined;

  return {
    decision,
    decisionNote: decisionNote && decisionNote.length > 0 ? decisionNote : undefined,
  };
}

function mapStatusFromError(message: string): number {
  if (message === "approval not found") return 404;
  if (message.includes("invalid approval status transition")) return 409;
  if (message.includes("owner PIN")) return 409;
  if (message.includes("invalid decision") || message.includes("invalid request body")) return 400;
  return 500;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });

  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const { approvalId } = await context.params;
  if (!approvalId) return NextResponse.json({ error: "Missing approval id" }, { status: 400 });

  let body: DecisionBody;
  try {
    body = parseBody(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const actor = {
    shopId,
    actorId: access.profile.id,
    role: access.profile.role,
    source: "manual" as const,
  };

  try {
    const approval = body.decision === "approved"
      ? await approveAiActionPreview(access.supabase, actor, { approvalId, decisionNote: body.decisionNote })
      : await rejectAiActionPreview(access.supabase, actor, { approvalId, decisionNote: body.decisionNote });

    return NextResponse.json({
      approval: {
        id: approval.id,
        status: approval.status,
        decidedAt: approval.decided_at,
        decidedBy: approval.decided_by,
      },
      executionBlocked: true,
      message: "Approving records review approval only. It does not execute the action.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update approval";
    return NextResponse.json({ error: message }, { status: mapStatusFromError(message) });
  }
}
