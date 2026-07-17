import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { resolveAndMaterializeReviewItem } from "@/features/integrations/shopBoost/reviewMaterialization";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;
  const shopId = access.profile.shop_id!;

  const body = (await req.json().catch(() => ({}))) as {
    resolution_action?: "linked_to_existing" | "created_new" | "ignored";
    confirm_high_risk_action?: boolean;
    ignore_reason_code?:
      | "duplicate"
      | "obsolete"
      | "invalid"
      | "test_data"
      | "intentionally_skipped"
      | "unsupported_format"
      | "other";
    ignore_note?: string | null;
  };

  const result = await resolveAndMaterializeReviewItem({
    reviewItemId: id,
    shopId,
    userId: access.profile.id,
    resolutionAction: body.resolution_action ?? "ignored",
    confirmHighRiskAction: body.confirm_high_risk_action === true,
    ignoreReasonCode: body.ignore_reason_code,
    ignoreNote: body.ignore_note,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? "Materialization failed.",
        item: result.item,
        appliedResult: result.appliedResult,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    item: result.item,
    materializedRecord: result.materializedRecord,
    appliedResult: result.appliedResult,
  });
}
