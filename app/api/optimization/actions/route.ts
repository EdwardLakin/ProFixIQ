import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

export async function GET() {
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

  const { data: actions, error: actionsError } = await supabase
    .from("optimization_actions")
    .select("opportunity_id, action, type, created_at, payload")
    .eq("shop_id", profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (actionsError) {
    return NextResponse.json({ error: actionsError.message }, { status: 500 });
  }

  return NextResponse.json(
    (actions ?? []).map((action) => ({
      opportunityId: action.opportunity_id,
      action: action.action,
      type: action.type,
      createdAt: action.created_at,
      result:
        action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
          ? ((action.payload as Record<string, unknown>).result as string | undefined) ?? null
          : null,
    })),
  );
}
