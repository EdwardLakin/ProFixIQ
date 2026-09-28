import { NextResponse } from "next/server";
import { expireAbandonedReceiptAttachments } from "@/features/invoices/server/expireAbandonedReceiptAttachments";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExpireStaleReceiptsBody = {
  dryRun?: unknown;
  shopId?: unknown;
  limit?: unknown;
};

const DEFAULT_LIMIT = 50;
const SCHEDULED_GET_LIMIT = 100;
const MAX_LIMIT = 100;

function parseBody(
  raw: ExpireStaleReceiptsBody | null,
): { dryRun: boolean; shopId?: string; limit: number } {
  const dryRun = typeof raw?.dryRun === "boolean" ? raw.dryRun : true;

  const shopId =
    typeof raw?.shopId === "string" && raw.shopId.trim().length > 0
      ? raw.shopId.trim()
      : undefined;

  let limit = DEFAULT_LIMIT;
  if (typeof raw?.limit === "number" && Number.isFinite(raw.limit)) {
    limit = Math.max(1, Math.min(Math.floor(raw.limit), MAX_LIMIT));
  }

  return { dryRun, shopId, limit };
}

function authorizeInternalRequest(
  req: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/payments/expire-stale-receipts",
    bearerEnvSecretName: "CRON_SECRET",
  });
}

function expirationFailureResponse(error: unknown): NextResponse {
  console.error(
    "[internal/payments/expire-stale-receipts] cleanup failed",
    error,
  );
  return NextResponse.json(
    { error: "Failed to clean up abandoned receipt attachments" },
    { status: 500 },
  );
}

async function runExpiration(input: {
  dryRun: boolean;
  shopId?: string;
  limit: number;
}) {
  const result = await expireAbandonedReceiptAttachments({
    supabase: createAdminSupabase(),
    dryRun: input.dryRun,
    shopId: input.shopId,
    limit: input.limit,
  });

  return NextResponse.json({
    ok: true,
    summary: {
      dryRun: result.dryRun,
      now: result.now,
      candidates: result.candidates,
      deleted: result.deleted,
      warnings: result.warnings,
    },
  });
}

export async function GET(req: Request) {
  const gate = authorizeInternalRequest(req);
  if (!gate.ok) {
    return gate.response;
  }

  try {
    return await runExpiration({ dryRun: false, limit: SCHEDULED_GET_LIMIT });
  } catch (error) {
    return expirationFailureResponse(error);
  }
}

export async function POST(req: Request) {
  const gate = authorizeInternalRequest(req);
  if (!gate.ok) {
    return gate.response;
  }

  let input: { dryRun: boolean; shopId?: string; limit: number };
  try {
    const body = (await req.json().catch(() => null)) as ExpireStaleReceiptsBody | null;
    input = parseBody(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    return await runExpiration(input);
  } catch (error) {
    return expirationFailureResponse(error);
  }
}
