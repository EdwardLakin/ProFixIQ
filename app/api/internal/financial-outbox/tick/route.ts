import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { processFinancialOutbox } from "@/features/invoices/server/processFinancialOutbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return { ok: true } as const;
  }
  return requireInternalApiSecret({
    request: req,
    envSecretName: "INTERNAL_FINANCIAL_OUTBOX_SECRET",
    headerName: "x-internal-financial-outbox-secret",
    routeLabel: "internal/financial-outbox/tick",
  });
}

export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return auth.response;

  try {
    const result = await processFinancialOutbox(createAdminSupabase(), 25);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Financial outbox processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
