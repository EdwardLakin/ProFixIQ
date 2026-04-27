import type { SupabaseClient } from "@supabase/supabase-js";

export async function createOnboardingSession(params: {
  supabase: SupabaseClient;
  shopId: string;
  createdBy?: string | null;
  title?: string | null;
  source?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await (params.supabase as any)
    .from("onboarding_sessions")
    .insert({
      shop_id: params.shopId,
      created_by: params.createdBy ?? null,
      title: params.title ?? null,
      source: params.source ?? "manual_upload",
      notes: params.notes ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { sessionId: data.id as string };
}
