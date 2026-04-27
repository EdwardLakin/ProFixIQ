import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

export async function registerOnboardingFile(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename?: string | null;
  declaredDomain?: string | null;
}) {
  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const { data, error } = await (params.supabase as any)
    .from("onboarding_files")
    .insert({
      shop_id: params.shopId,
      session_id: params.sessionId,
      storage_bucket: params.storageBucket,
      storage_path: params.storagePath,
      original_filename: params.originalFilename ?? null,
      declared_domain: params.declaredDomain ?? null,
      parse_status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await (params.supabase as any)
    .from("onboarding_sessions")
    .update({ status: "files_uploaded" })
    .eq("id", params.sessionId)
    .eq("shop_id", params.shopId);

  return { fileId: data.id as string };
}
