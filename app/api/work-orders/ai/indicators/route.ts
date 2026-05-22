import { NextResponse } from "next/server";
import { getWorkOrderRecommendationIndicators } from "@/features/ai/server/domains/workOrders/getWorkOrderRecommendationIndicators";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const MAX_IDS = 100;

function parseWorkOrderIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const ids = (body as { workOrderIds?: unknown }).workOrderIds;
  if (!Array.isArray(ids)) return [];
  return ids
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin", "manager", "advisor", "mechanic", "lead_hand", "foreman"],
    requiredCapability: "canManageWorkOrders",
  });
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => ({}));
  const requestedIds = Array.from(new Set(parseWorkOrderIds(body)));

  if (requestedIds.length === 0) {
    return NextResponse.json({ indicators: {} });
  }

  if (requestedIds.length > MAX_IDS) {
    return NextResponse.json({ error: `A maximum of ${MAX_IDS} work orders is allowed per request.` }, { status: 400 });
  }

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  const { data: scopedWorkOrders, error: scopedError } = await access.supabase
    .from("work_orders")
    .select("id")
    .eq("shop_id", shopId)
    .in("id", requestedIds);

  if (scopedError) {
    return NextResponse.json({ error: "Failed to validate work order scope." }, { status: 500 });
  }

  const scopedIds = new Set((scopedWorkOrders ?? []).map((row) => row.id));
  let visibleIds = requestedIds.filter((id) => scopedIds.has(id));

  const isTechScoped = access.canonicalRole === "mechanic";

  if (isTechScoped && visibleIds.length > 0) {
    const { data: assignedRows, error: assignmentError } = await access.supabase
      .from("work_order_lines")
      .select("work_order_id")
      .eq("shop_id", shopId)
      .eq("assigned_tech_id", access.profile.id)
      .in("work_order_id", visibleIds);

    if (assignmentError) {
      return NextResponse.json({ error: "Failed to verify technician work-order access." }, { status: 500 });
    }

    const assignedIds = new Set((assignedRows ?? []).map((row) => row.work_order_id).filter((id): id is string => Boolean(id)));
    visibleIds = visibleIds.filter((id) => assignedIds.has(id));
  }

  const actorContext = {
    shopId,
    actorId: access.profile.id,
    role: access.profile.role,
    source: "ops" as const,
  };

  const indicators = await getWorkOrderRecommendationIndicators({
    supabase: access.supabase,
    actorContext,
    workOrderIds: visibleIds,
  });

  return NextResponse.json({ indicators });
}
