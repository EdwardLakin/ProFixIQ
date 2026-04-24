import { NextResponse } from "next/server";
import { expireStaleAiRecords } from "@/features/ai/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpireStaleBody = {
  dryRun?: unknown;
  shopId?: unknown;
  limit?: unknown;
};

const MAX_LIMIT = 100;

function parseBody(raw: ExpireStaleBody | null): { dryRun: boolean; shopId?: string; limit: number } {
  const dryRun = typeof raw?.dryRun === "boolean" ? raw.dryRun : true;

  const shopId = typeof raw?.shopId === "string" && raw.shopId.trim().length > 0
    ? raw.shopId.trim()
    : undefined;

  let limit = 50;
  if (typeof raw?.limit === "number" && Number.isFinite(raw.limit)) {
    limit = Math.max(1, Math.min(Math.floor(raw.limit), MAX_LIMIT));
  }

  return { dryRun, shopId, limit };
}

export async function POST(req: Request) {
  const internalGate = requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/ai/expire-stale",
  });

  if (!internalGate.ok) {
    return internalGate.response;
  }

  let input: { dryRun: boolean; shopId?: string; limit: number };
  try {
    const body = (await req.json().catch(() => null)) as ExpireStaleBody | null;
    input = parseBody(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await expireStaleAiRecords({
      supabase: createAdminSupabase(),
      dryRun: input.dryRun,
      shopId: input.shopId,
      limit: input.limit,
      actorContext: input.shopId
        ? {
          shopId: input.shopId,
          actorId: "internal-ai-expirer",
          role: "system",
          source: "system",
        }
        : undefined,
    });

    return NextResponse.json({
      ok: true,
      summary: {
        dryRun: result.dryRun,
        now: result.now,
        recommendations: {
          candidates: result.recommendations.candidates,
          expired: result.recommendations.expired,
        },
        previews: {
          candidates: result.previews.candidates,
          expired: result.previews.expired,
        },
        approvals: {
          candidates: result.approvals.candidates,
          expired: result.approvals.expired,
        },
        warnings: result.warnings,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to expire stale AI records" }, { status: 500 });
  }
}
