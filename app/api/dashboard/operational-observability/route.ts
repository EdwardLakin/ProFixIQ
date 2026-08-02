import { NextResponse } from "next/server";
import { getAiOperationsObservability } from "@/features/ai/server";
import { getOperationalObservability } from "@/features/operations/server/getOperationalObservability";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | null): string | null {
  if (!value) return null;
  return UUID_PATTERN.test(value) ? value : null;
}

function finiteDomainCounts(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => Number.isFinite(count))
      .map(([domain, count]) => [domain, Number(count)]),
  );
}

export async function GET(request: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageWorkOrders",
    allowRoles: ["owner", "admin", "manager"],
  });

  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const rawEntityId = url.searchParams.get("entityId");
  const rawCorrelationId = url.searchParams.get("correlationId");
  const entityId = optionalUuid(rawEntityId);
  const correlationId = optionalUuid(rawCorrelationId);

  if ((rawEntityId && !entityId) || (rawCorrelationId && !correlationId)) {
    return NextResponse.json({ error: "Invalid observability filter" }, { status: 400 });
  }

  const entityType = url.searchParams.get("entityType")?.trim() || null;
  const requestedLimit = Number(url.searchParams.get("limit") ?? 160);

  try {
    const [operational, ai] = await Promise.all([
      getOperationalObservability({
        supabase: access.supabase,
        shopId: access.profile.shop_id,
        entityType,
        entityId,
        correlationId,
        limit: Number.isFinite(requestedLimit) ? requestedLimit : 160,
      }),
      getAiOperationsObservability({
        supabase: access.supabase,
        actorContext: {
          shopId: access.profile.shop_id,
          actorId: access.profile.id,
          role: access.profile.role,
          source: "manual",
        },
      }),
    ]);

    const byDomain = finiteDomainCounts(
      ai.recommendations.byDomain as Record<string, number>,
    );
    const categorizedRecommendations = Object.values(byDomain).reduce(
      (sum, value) => sum + value,
      0,
    );

    return NextResponse.json({
      operational,
      ai: {
        generatedAt: ai.generatedAt,
        recommendations: {
          totalActive: ai.recommendations.totalActive,
          stale: ai.recommendations.stale,
          highOrCriticalRisk: ai.recommendations.highOrCriticalRisk,
          needsRefresh: ai.recommendations.needsRefresh,
          byDomain,
          uncategorized: Math.max(
            0,
            ai.recommendations.totalActive - categorizedRecommendations,
          ),
        },
        approvals: ai.approvals,
        expiration: ai.expiration,
        events: ai.events,
        health: ai.health,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load operational observability",
      },
      { status: 500 },
    );
  }
}
