import { NextResponse } from "next/server";

import { syncAppointmentPreparations } from "@/features/operations/server/syncAppointmentPreparations";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { fetchAllShopIds } from "@/features/shared/lib/server/fetchAllShopIds";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONCURRENCY = 5;

function authorizeInternalRequest(
  request: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  return requireInternalApiSecret({
    request,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/appointment-preparations",
    bearerEnvSecretName: "CRON_SECRET",
  });
}

export async function GET(request: Request) {
  const gate = authorizeInternalRequest(request);
  if (!gate.ok) return gate.response;

  const supabase = createAdminSupabase();
  const now = new Date();

  let shopIds: string[];
  try {
    shopIds = await fetchAllShopIds(supabase);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list shops",
      },
      { status: 500 },
    );
  }

  const summaries: Awaited<ReturnType<typeof syncAppointmentPreparations>>[] =
    [];
  const warnings: Array<{ shopId: string; error: string }> = [];

  for (let index = 0; index < shopIds.length; index += CONCURRENCY) {
    const batch = shopIds.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((shopId) =>
        syncAppointmentPreparations({ supabase, shopId, now }),
      ),
    );

    results.forEach((result, resultIndex) => {
      const shopId = batch[resultIndex] ?? "unknown";
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
            : "Unknown appointment preparation sync error",
      });
    });
  }

  return NextResponse.json({
    ok: warnings.length === 0,
    checkedShops: shopIds.length,
    upcoming: summaries.reduce((sum, item) => sum + item.upcoming, 0),
    resolved: summaries.reduce((sum, item) => sum + item.resolved, 0),
    warnings,
  });
}
