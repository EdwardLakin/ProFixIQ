import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { applyHighConfidenceRecommendations } from "@/features/integrations/shopBoost/reviewMaterialization";

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({ allowRoles: ["owner", "admin"] });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => ({}))) as { intakeId?: string };
  const intakeId = typeof body.intakeId === "string" ? body.intakeId.trim() : "";
  if (!intakeId) {
    return NextResponse.json({ ok: false, error: "intakeId is required." }, { status: 400 });
  }

  const results = await applyHighConfidenceRecommendations({
    shopId: access.profile.shop_id!,
    userId: access.profile.id,
    intakeId,
    threshold: 0.85,
  });

  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;

  return NextResponse.json({
    ok: failed === 0,
    attempted: results.length,
    succeeded,
    failed,
    results,
  });
}
