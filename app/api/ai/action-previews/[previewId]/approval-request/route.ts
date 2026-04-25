import { NextResponse } from "next/server";
import { requestAiActionPreviewApproval, serializeAiApprovalRequestForUi } from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type ApprovalRequestBody = {
  reason?: string;
  ownerPinProofRef?: unknown;
  expiresAt?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBody(value: unknown): ApprovalRequestBody {
  if (value == null) return {};
  if (!isObject(value)) {
    throw new Error("invalid request body");
  }

  const reason = typeof value.reason === "string" ? value.reason.trim() : undefined;
  const ownerPinProofRef = value.ownerPinProofRef;
  const expiresAt = typeof value.expiresAt === "string" ? value.expiresAt : undefined;

  return {
    reason: reason && reason.length > 0 ? reason : undefined,
    ownerPinProofRef,
    expiresAt,
  };
}

function mapStatusFromError(message: string): number {
  if (message === "action preview not found") return 404;
  if (
    message.includes("cannot request approval") ||
    message.includes("terminal state") ||
    message.includes("does not require approval")
  ) {
    return 409;
  }
  if (message.includes("owner PIN proof") || message.includes("invalid request body") || message.includes("invalid expiresAt")) {
    return 400;
  }
  return 500;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ previewId: string }> },
) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  const { previewId } = await context.params;
  if (!previewId) {
    return NextResponse.json({ error: "Missing preview id" }, { status: 400 });
  }

  const shopId = access.profile.shop_id;
  if (!shopId) {
    return NextResponse.json({ error: "Shop not found" }, { status: 403 });
  }

  let parsedBody: ApprovalRequestBody;
  try {
    parsedBody = parseBody(await req.json());
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
    const result = await requestAiActionPreviewApproval(access.supabase, actor, {
      previewId,
      reason: parsedBody.reason,
      ownerPinProofRef: parsedBody.ownerPinProofRef as never,
      expiresAt: parsedBody.expiresAt,
    });

    return NextResponse.json(
      {
        approval: serializeAiApprovalRequestForUi({
          approval: result.approval,
          preview: result.preview,
        }),
        created: result.created,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request approval";
    return NextResponse.json({ error: message }, { status: mapStatusFromError(message) });
  }
}
