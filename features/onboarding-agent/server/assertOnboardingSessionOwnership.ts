import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertOnboardingSessionOwnership(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
}) {
  const { data: session, error } = await (params.supabase as any)
    .from("onboarding_sessions")
    .select("id")
    .eq("id", params.sessionId)
    .eq("shop_id", params.shopId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!session) throw new Error("Session not found for this shop");
}
