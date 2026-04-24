import { NextResponse } from "next/server";
import { BULK_RECOMMENDATION_MAX_LIMIT, bulkUpdateAiRecommendationsForReview } from "@/features/ai/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type BulkAction = "dismiss" | "resolve";
type BulkDomain = "work_orders" | "shop_boost";
type BulkStatusFilter = "open" | "acknowledged";
type BulkRiskFilter = "low" | "medium" | "high" | "critical";

type RequestBody = {
  action?: unknown;
  domain?: unknown;
  confirm?: unknown;
  limit?: unknown;
  filters?: {
    status?: unknown;
    risk?: unknown;
    recommendationType?: unknown;
    subjectType?: unknown;
    subjectId?: unknown;
    olderThan?: unknown;
    staleOnly?: unknown;
  };
};

function parseString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function parseOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid string filter value");
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseBody(raw: RequestBody) {
  const action = parseString(raw.action, "action");
  if (action !== "dismiss" && action !== "resolve") {
    throw new Error("action must be dismiss or resolve");
  }

  const domain = parseString(raw.domain, "domain");
  if (domain !== "work_orders" && domain !== "shop_boost") {
    throw new Error("domain must be work_orders or shop_boost");
  }

  const confirm = parseString(raw.confirm, "confirm");

  const parsedLimit = raw.limit == null ? 50 : Number(raw.limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > BULK_RECOMMENDATION_MAX_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${BULK_RECOMMENDATION_MAX_LIMIT}`);
  }

  const filtersRaw = raw.filters ?? {};
  const status = filtersRaw.status == null ? undefined : parseString(filtersRaw.status, "filters.status");
  if (status && status !== "open" && status !== "acknowledged") {
    throw new Error("filters.status must be open or acknowledged");
  }

  const risk = filtersRaw.risk == null ? undefined : parseString(filtersRaw.risk, "filters.risk");
  if (risk && risk !== "low" && risk !== "medium" && risk !== "high" && risk !== "critical") {
    throw new Error("filters.risk must be low, medium, high, or critical");
  }

  if (filtersRaw.staleOnly != null && typeof filtersRaw.staleOnly !== "boolean") {
    throw new Error("filters.staleOnly must be boolean");
  }

  return {
    action: action as BulkAction,
    domain: domain as BulkDomain,
    confirm,
    limit: parsedLimit,
    filters: {
      status: status as BulkStatusFilter | undefined,
      risk: risk as BulkRiskFilter | undefined,
      recommendationType: parseOptionalString(filtersRaw.recommendationType),
      subjectType: parseOptionalString(filtersRaw.subjectType),
      subjectId: parseOptionalString(filtersRaw.subjectId),
      olderThan: parseOptionalString(filtersRaw.olderThan),
      staleOnly: filtersRaw.staleOnly === true,
    },
  };
}

export async function POST(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager", "advisor"],
  });

  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) return NextResponse.json({ error: "Shop not found" }, { status: 403 });

  try {
    const raw = (await request.json().catch(() => null)) as RequestBody | null;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const body = parseBody(raw);

    const result = await bulkUpdateAiRecommendationsForReview({
      supabase: access.supabase,
      actorContext: {
        shopId,
        actorId: access.profile.id,
        role: access.profile.role,
        source: "manual",
      },
      action: body.action,
      domain: body.domain,
      confirm: body.confirm,
      limit: body.limit,
      filters: body.filters,
    });

    return NextResponse.json({
      ...result,
      executionBlocked: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = message.includes("required") || message.includes("must be") || message.includes("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
