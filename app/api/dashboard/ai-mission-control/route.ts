import { NextResponse } from "next/server";
import { getAiMissionControlSummary } from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET() {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });

  if (!access.ok) return access.response;

  try {
    const shopId = access.profile.shop_id;
    if (!shopId) {
      return NextResponse.json({ error: "Shop not found" }, { status: 403 });
    }

    const actor = {
      shopId,
      actorId: access.profile.id,
      role: access.profile.role,
      source: "manual" as const,
    };

    const summary = await getAiMissionControlSummary({
      supabase: access.supabase,
      actorContext: actor,
      limit: 5,
      domains: ["work_orders", "shop_boost"],
    });

    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ error: "Failed to load AI mission control summary" }, { status: 500 });
  }
}
