import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return { ok: true } as const;
  }

  return requireInternalApiSecret({
    request,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/fleet/pretrip-compliance",
  });
}

export async function GET(request: Request) {
  const gate = authorize(request);
  if (!gate.ok) {
    return gate.response;
  }

  const supabase = createAdminSupabase();
  const evaluatedAt = new Date().toISOString();
  const { data, error } = await supabase.rpc("evaluate_fleet_pretrip_compliance", {
    p_at: evaluatedAt,
  });
  if (error) {
    console.error("[fleet/pretrip-compliance] evaluation failed", error);
    return NextResponse.json({ error: "Fleet pre-trip compliance evaluation failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}
