import { NextResponse } from "next/server";
import {
  syncOperationalObservabilityAlerts,
  type OperationalHealthProjection,
} from "@/features/operations/server/syncOperationalObservabilityAlerts";
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

function projectionUnavailable(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  const code = String(candidate?.code ?? "");
  const message = String(candidate?.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    message.includes("get_operational_observability_health")
  );
}

async function loadHealthInputs() {
  const supabase = createAdminSupabase();
  const now = new Date();
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;

  const projectionResult = await rpc("get_operational_observability_health", {
    p_now: now.toISOString(),
  });

  if (!projectionResult.error) {
    return {
      supabase,
      now,
      rows: ((projectionResult.data ?? []) as OperationalHealthProjection[]).slice(
        0,
        MAX_SHOPS_PER_RUN,
      ),
      projectionUsed: true,
    };
  }

  if (!projectionUnavailable(projectionResult.error)) {
    const message =
      (projectionResult.error as { message?: string } | null)?.message ??
      "Failed to load observability health projection";
    throw new Error(message);
  }

  const { data: shops, error } = await supabase
    .from("shops")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(MAX_SHOPS_PER_RUN);

  if (error) throw new Error(error.message);

  return {
    supabase,
    now,
    rows: (shops ?? []).map((shop) => ({
      shop_id: shop.id,
      recent_business_writes: null,
      events_last_6h: null,
      events_last_24h: null,
      events_previous_24h: null,
      last_event_at: null,
      unresolved_failure_count: null,
      health_status: null,
    })) satisfies OperationalHealthProjection[],
    projectionUsed: false,
  };
}

export async function GET(request: Request) {
  const gate = authorizeInternalRequest(request);
  if (!gate.ok) return gate.response;

  let healthInputs: Awaited<ReturnType<typeof loadHealthInputs>>;
  try {
    healthInputs = await loadHealthInputs();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load observability health inputs",
      },
      { status: 500 },
    );
  }

  const summaries: Awaited<
    ReturnType<typeof syncOperationalObservabilityAlerts>
  >[] = [];
  const warnings: Array<{ shopId: string; error: string }> = [];

  for (
    let index = 0;
    index < healthInputs.rows.length;
    index += CONCURRENCY
  ) {
    const batch = healthInputs.rows.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((row) =>
        syncOperationalObservabilityAlerts({
          supabase: healthInputs.supabase,
          shopId: row.shop_id,
          now: healthInputs.now,
          operationalHealth: healthInputs.projectionUsed ? row : undefined,
        }),
      ),
    );

    results.forEach((result, resultIndex) => {
      const shopId = batch[resultIndex]?.shop_id ?? "unknown";
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
    checkedShops: healthInputs.rows.length,
    projectionUsed: healthInputs.projectionUsed,
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
