import { NextResponse } from "next/server";
import { syncOperationalObservabilityAlerts } from "@/features/operations/server/syncOperationalObservabilityAlerts";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SHOPS_PER_RUN = 500;
const CONCURRENCY = 5;

function parseBearerSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function authorizeInternalRequest(
  request: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  const internalGate = requireInternalApiSecret({
    request,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/observability/health",
  });

  const configuredSecret = process.env.INTERNAL_CRON_SECRET;
  const bearerAuthorized =
    !!configuredSecret && parseBearerSecret(request) === configuredSecret;

  if (internalGate.ok || bearerAuthorized) return { ok: true };
  return { ok: false, response: internalGate.response };
}

export async function GET(request: Request) {
  const gate = authorizeInternalRequest(request);
  if (!gate.ok) return gate.response;

  const supabase = createAdminSupabase();
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(MAX_SHOPS_PER_RUN);

  if (error) {
    return NextResponse.json(
      { error: "Failed to list shops for observability health" },
      { status: 500 },
    );
  }

  const summaries: Awaited<
    ReturnType<typeof syncOperationalObservabilityAlerts>
  >[] = [];
  const warnings: Array<{ shopId: string; error: string }> = [];
  const shopIds = (shops ?? []).map((shop) => shop.id);

  for (let index = 0; index < shopIds.length; index += CONCURRENCY) {
    const batch = shopIds.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((shopId) =>
        syncOperationalObservabilityAlerts({ supabase, shopId }),
      ),
    );

    results.forEach((result, resultIndex) => {
      const shopId = batch[resultIndex];
      if (result.status === "fulfilled") {
        summaries.push(result.value);
        return;
      }
      warnings.push({
        shopId,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown observability health error",
      });
    });
  }

  return NextResponse.json({
    ok: warnings.length === 0,
    checkedShops: shopIds.length,
    alerts: {
      pipelineStalled: summaries.filter((item) => item.pipelineStalled).length,
      activeFailures: summaries.reduce(
        (sum, item) => sum + item.activeFailures,
        0,
      ),
      eventVolumeDropped: summaries.filter((item) => item.eventVolumeDropped)
        .length,
      aiExpirationNeedsReview: summaries.filter(
        (item) => item.aiExpirationNeedsReview,
      ).length,
    },
    warnings,
  });
}
