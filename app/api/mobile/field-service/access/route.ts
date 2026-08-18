import { NextResponse } from "next/server";

import { getMobileFieldServiceWorkspaceAccess } from "@/features/mobile/service/server/access";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  try {
    const fieldAccess = await getMobileFieldServiceWorkspaceAccess(access);
    return NextResponse.json(
      {
        ...fieldAccess,
        userId: access.authUserId,
        shopId: access.profile.shop_id,
        mustChangePassword: access.profile.must_change_password === true,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to verify Field Service access." },
      { status: 500 },
    );
  }
}
