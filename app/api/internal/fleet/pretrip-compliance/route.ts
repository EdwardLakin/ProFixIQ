import { NextResponse } from "next/server";
import { requireInternalApiSecret } from "@/features/shared/lib/server/api-route-guard";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(request: Request) {
  const value = request.headers.get("authorization")?.trim() ?? "";
  const [scheme, token] = value.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? token ?? null : null;
}

export async function GET(request: Request) {
  const gate = requireInternalApiSecret({
    request,
    envSecretName: "INTERNAL_CRON_SECRET",
    headerName: "x-internal-cron-secret",
    routeLabel: "internal/fleet/pretrip-compliance",
  });
  const configured = process.env.INTERNAL_CRON_SECRET;
  if (!gate.ok && (!configured || bearer(request) !== configured)) {
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
