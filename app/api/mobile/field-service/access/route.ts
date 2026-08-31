import { NextResponse } from "next/server";

import { getMobileFieldServiceWorkspaceAccess } from "@/features/mobile/service/server/access";
import { FIELD_PRODUCT_CAPABILITIES } from "@/features/shared/lib/product-access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredProductCapabilities: FIELD_PRODUCT_CAPABILITIES,
  });
  if (!access.ok) return access.response;

  try {
    const fieldAccess = await getMobileFieldServiceWorkspaceAccess(access);
    const response = NextResponse.json(
      {
        ...fieldAccess,
        userId: access.authUserId,
        shopId: access.profile.shop_id,
        mustChangePassword: access.profile.must_change_password === true,
      },
      {
        status:
          fieldAccess.decision === "plan_required" ||
          fieldAccess.decision === "forbidden"
            ? 403
            : 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
    return response;
  } catch {
    return NextResponse.json(
      { error: "Unable to verify Field Service access." },
      { status: 500 },
    );
  }
}
