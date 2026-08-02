import { NextResponse } from "next/server";
import { monitorOperationalObservability } from "@/features/operations/server/monitorOperationalObservability";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBearerSecret(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function isVercelCronAuthorized(request: Request): boolean {
  const configuredSecret = process.env.INTERNAL_CRON_SECRET;
  const suppliedSecret = parseBearerSecret(request);
  return Boolean(configuredSecret && suppliedSecret === configuredSecret);
}

function authorize(request: Request): { ok: true } | { ok: false; response: NextResponse } {
  const internalGate = requireInternalApiSecret({
    request,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/operations/observability-health",
  });

  if (internalGate.ok || isVercelCronAuthorized(request)) return { ok: true };
  return { ok: false, response: internalGate.response };
}

export async function GET(request: Request) {
  const gate = authorize(request);
  if (!gate.ok) return gate.response;

  try {
    const summary = await monitorOperationalObservability({
      supabase: createAdminSupabase(),
    });
    return NextResponse.json({ ok: true, summary });
  } catch {
    return NextResponse.json(
      { error: "Failed to evaluate operational observability health" },
      { status: 500 },
    );
  }
}
