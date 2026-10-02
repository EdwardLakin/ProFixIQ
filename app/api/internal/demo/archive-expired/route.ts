import { NextResponse } from "next/server";
import { archiveExpiredDemoProspects } from "@/features/ops/server/demoAccess";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A demo prospect's own shop is archived (never deleted -- see
// shops.demo_shop_archived_at) once their demo_access_expires_at is more
// than GRACE_MS in the past, so an operator who extends right after expiry
// still has a window before the shop is excluded from ops/login.
const GRACE_MS = 24 * 60 * 60 * 1000;

function authorizeInternalRequest(
  req: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/demo/archive-expired",
    bearerEnvSecretName: "CRON_SECRET",
  });
}

function failureResponse(error: unknown): NextResponse {
  console.error("[internal/demo/archive-expired] archive failed", error);
  return NextResponse.json({ error: "Failed to archive expired demo prospects" }, { status: 500 });
}

export async function GET(req: Request) {
  const gate = authorizeInternalRequest(req);
  if (!gate.ok) return gate.response;

  try {
    const result = await archiveExpiredDemoProspects({ graceMs: GRACE_MS });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(req: Request) {
  const gate = authorizeInternalRequest(req);
  if (!gate.ok) return gate.response;

  try {
    const result = await archiveExpiredDemoProspects({ graceMs: GRACE_MS });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return failureResponse(error);
  }
}
