import { NextResponse } from "next/server";

import { syncShopBlockerObservations } from "@/features/operations/server/syncShopBlockerObservations";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SHOPS_PER_RUN = 500;
const CONCURRENCY = 5;

function authorizeInternalRequest(
  request: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  return requireInternalApiSecret({
    request,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/observability/shop-blockers",
    bearerEnvSecretName: "CRON_SECRET",
  });
}

export async function GET(request: Request) {
  const gate = authorizeInternalRequest(request);
  if (!gate.ok) return gate.response;

  const supabase = createAdminSupabase();
  const now = new Date();

  const { data: shops, error: shopsError } = await supabase
    .from("shops")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(MAX_SHOPS_PER_RUN);

  if (shopsError) {
    return NextResponse.json({ error: shopsError.message }, { status: 500 });
  }

  const summaries: Awaited<
    ReturnType<typeof syncShopBlockerObservations>
  >[] = [];
  const warnings: Array<{ shopId: string; error: string }> = [];

  const rows = shops ?? [];
  for (let index = 0; index < rows.length; index += CONCURRENCY) {
    const batch = rows.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((row) =>
        syncShopBlockerObservations({ supabase, shopId: row.id, now }),
      ),
    );

    results.forEach((result, resultIndex) => {
      const shopId = batch[resultIndex]?.id ?? "unknown";
      if (result.status === "fulfilled") {
        summaries.push(result.value);
        if (result.value.errors.length > 0) {
          warnings.push({ shopId, error: result.value.errors.join("; ") });
        }
        return;
      }
      warnings.push({
        shopId,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown shop blocker observation error",
      });
    });
  }

  return NextResponse.json({
    ok: warnings.length === 0,
    checkedShops: rows.length,
    observed: summaries.reduce((sum, item) => sum + item.observed, 0),
    opened: summaries.reduce((sum, item) => sum + item.opened, 0),
    continuing: summaries.reduce((sum, item) => sum + item.continuing, 0),
    resolved: summaries.reduce((sum, item) => sum + item.resolved, 0),
    warnings,
  });
}
