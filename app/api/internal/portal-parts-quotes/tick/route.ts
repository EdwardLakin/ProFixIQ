import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { processPortalPartsQuotes } from "@/features/portal/server/processPortalPartsQuotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return { ok: true } as const;
  }
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_PORTAL_PARTS_QUOTES_SECRET",
    headerName: "x-internal-portal-parts-quotes-secret",
    routeLabel: "internal/portal-parts-quotes/tick",
  });
}

export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;

  try {
    const result = await processPortalPartsQuotes(createAdminSupabase(), 25);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Portal parts quote processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
