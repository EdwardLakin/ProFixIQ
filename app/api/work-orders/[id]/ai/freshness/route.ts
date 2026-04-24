import { NextResponse } from "next/server";
import { getWorkOrderAiFreshness } from "@/features/ai/server/domains/workOrders/getWorkOrderAiFreshness";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });
  if (!access.ok) return access.response;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing work order id" }, { status: 400 });

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const { data: scopedWorkOrder, error: workOrderError } = await access.supabase
    .from("work_orders")
    .select("id")
    .eq("id", id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (workOrderError) {
    return NextResponse.json({ error: "Failed to validate work order scope." }, { status: 500 });
  }

  if (!scopedWorkOrder) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  try {
    const freshness = await getWorkOrderAiFreshness({
      supabase: access.supabase,
      actorContext: {
        shopId,
        actorId: access.profile.id,
        role: access.profile.role,
        source: "ops",
      },
      workOrderId: id,
    });

    return NextResponse.json(freshness);
  } catch {
    return NextResponse.json({ error: "Failed to load AI freshness" }, { status: 500 });
  }
}
