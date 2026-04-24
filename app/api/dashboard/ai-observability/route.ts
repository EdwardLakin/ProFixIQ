import { NextResponse } from "next/server";
import { getAiOperationsObservability } from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager"],
  });

  if (!access.ok) return access.response;

  try {
    const shopId = access.profile.shop_id;
    if (!shopId) {
      return NextResponse.json({ error: "Shop not found" }, { status: 403 });
    }

    const observability = await getAiOperationsObservability({
      supabase: access.supabase,
      actorContext: {
        shopId,
        actorId: access.profile.id,
        role: access.profile.role,
        source: "manual",
      },
    });

    return NextResponse.json({ observability });
  } catch {
    return NextResponse.json({ error: "Failed to load AI observability" }, { status: 500 });
  }
}
