import { NextResponse } from "next/server";
import { listAiRecommendationsForReview } from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

function parseBooleanFilter(value: string | null): "all" | boolean {
  if (!value || value === "all") return "all";
  if (value === "true") return true;
  if (value === "false") return false;
  return "all";
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });

  if (!access.ok) return access.response;

  try {
    const url = new URL(request.url);
    const params = url.searchParams;

    const domain = params.get("domain") ?? "all";
    const status = params.get("status") ?? "all";
    const risk = params.get("risk") ?? "all";
    const missingData = parseBooleanFilter(params.get("missingData"));
    const hasPreview = parseBooleanFilter(params.get("hasPreview"));
    const requiresApproval = parseBooleanFilter(params.get("requiresApproval"));
    const search = params.get("search") ?? undefined;
    const createdFrom = params.get("createdFrom") ?? undefined;
    const createdTo = params.get("createdTo") ?? undefined;
    const cursor = params.get("cursor");
    const limit = Number.parseInt(params.get("limit") ?? "25", 10);

    const shopId = access.profile.shop_id;
    if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

    const result = await listAiRecommendationsForReview({
      supabase: access.supabase,
      actorContext: {
        shopId,
        actorId: access.profile.id,
        role: access.profile.role,
        source: "manual",
      },
      filters: {
        domain: domain as "all" | "work_orders" | "shop_boost",
        status: status as "all" | "open" | "acknowledged" | "resolved" | "dismissed" | "expired" | "superseded",
        risk: risk as "all" | "urgent" | "high" | "medium" | "low",
        missingData,
        hasPreview,
        requiresApproval,
        search,
        createdFrom,
        createdTo,
      },
      pagination: {
        cursor,
        limit: Number.isFinite(limit) ? limit : 25,
      },
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to load AI recommendations" }, { status: 500 });
  }
}
