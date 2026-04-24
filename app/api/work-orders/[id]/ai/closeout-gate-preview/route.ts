import { NextResponse } from "next/server";
import { getWorkOrderCloseoutGatePreview } from "@/features/ai/server/domains/workOrders";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing work order id" }, { status: 400 });
  }

  const shopId = access.profile.shop_id;
  if (!shopId) {
    return NextResponse.json({ error: "Shop not found" }, { status: 403 });
  }

  try {
    const actor = {
      shopId,
      actorId: access.profile.id,
      role: access.profile.role,
      source: "manual" as const,
    };

    const preview = await getWorkOrderCloseoutGatePreview({
      supabase: access.supabase,
      actor,
      workOrderId: id,
    });

    if (!preview) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    return NextResponse.json(preview);
  } catch {
    return NextResponse.json({ error: "Failed to load closeout gate preview" }, { status: 500 });
  }
}
