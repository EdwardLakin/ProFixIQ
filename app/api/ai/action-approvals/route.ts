import { NextResponse } from "next/server";
import { listAiActionApprovalsForReview, type AiApprovalInboxDomainFilter, type AiApprovalInboxRiskFilter, type AiApprovalInboxStatusFilter } from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

function parseStatus(value: string | null): AiApprovalInboxStatusFilter {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "expired" || value === "all") {
    return value;
  }
  return "pending";
}

function parseDomain(value: string | null): AiApprovalInboxDomainFilter {
  if (value === "work_orders" || value === "shop_boost" || value === "all") return value;
  return "all";
}

function parseRisk(value: string | null): AiApprovalInboxRiskFilter {
  if (value === "low" || value === "medium" || value === "high" || value === "critical" || value === "all") return value;
  return "all";
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });

  if (!access.ok) return access.response;

  try {
    const shopId = access.profile.shop_id;
    if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const status = parseStatus(params.get("status"));
    const domain = parseDomain(params.get("domain"));
    const risk = parseRisk(params.get("risk"));
    const search = params.get("search") ?? undefined;
    const cursor = params.get("cursor");
    const parsedLimit = Number.parseInt(params.get("limit") ?? "25", 10);

    const result = await listAiActionApprovalsForReview({
      supabase: access.supabase,
      actorContext: {
        shopId,
        actorId: access.profile.id,
        role: access.profile.role,
        source: "manual",
      },
      filters: { status, domain, risk, search },
      pagination: {
        cursor,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 25,
      },
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to load AI approval inbox" }, { status: 500 });
  }
}
