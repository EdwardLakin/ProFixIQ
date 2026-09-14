import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

import { syncShopBlockerObservations } from "@/features/operations/server/syncShopBlockerObservations";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOP_PAGE_SIZE = 500;
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

// A single fixed-size, oldest-first page would permanently exclude every
// shop past the page size once the shop count grows beyond it - the same
// page would be selected on every run. Page through the full table by
// created_at instead so a growing shop count degrades run time, not
// coverage.
async function fetchAllShopIds(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  for (;;) {
    let query = supabase
      .from("shops")
      .select("id, created_at")
      .order("created_at", { ascending: true })
      .limit(SHOP_PAGE_SIZE);

    if (cursor) {
      query = query.gt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    ids.push(...rows.map((row) => row.id));
    if (rows.length < SHOP_PAGE_SIZE) break;
    cursor = rows[rows.length - 1]?.created_at ?? null;
    if (!cursor) break;
  }

  return ids;
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

  const summaries: Awaited<
    ReturnType<typeof syncShopBlockerObservations>
  >[] = [];
  const warnings: Array<{ shopId: string; error: string }> = [];

  for (let index = 0; index < shopIds.length; index += CONCURRENCY) {
    const batch = shopIds.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((shopId) =>
        syncShopBlockerObservations({ supabase, shopId, now }),
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
            : "Unknown shop blocker observation error",
      });
    });
  }

  return NextResponse.json({
    ok: warnings.length === 0,
    checkedShops: shopIds.length,
    observed: summaries.reduce((sum, item) => sum + item.observed, 0),
    opened: summaries.reduce((sum, item) => sum + item.opened, 0),
    continuing: summaries.reduce((sum, item) => sum + item.continuing, 0),
    resolved: summaries.reduce((sum, item) => sum + item.resolved, 0),
    warnings,
  });
}
