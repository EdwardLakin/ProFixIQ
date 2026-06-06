import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { buildOptimizationOpportunities } from "@/features/optimization/server/buildOptimizationOpportunities";


export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("shop_id")
    .or(`id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  if (profileError || !profile?.shop_id) {
    return NextResponse.json({ error: "Unable to resolve shop context" }, { status: 400 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "10");
  const lookbackParam = Number(req.nextUrl.searchParams.get("lookbackDays") ?? "365");

  try {
    const payload = await buildOptimizationOpportunities({
      supabase,
      shopId: profile.shop_id,
      limit: Number.isFinite(limitParam) ? Math.max(1, Math.min(30, Math.round(limitParam))) : 10,
      lookbackDays: Number.isFinite(lookbackParam)
        ? Math.max(90, Math.min(730, Math.round(lookbackParam)))
        : 365,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build optimization opportunities";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
