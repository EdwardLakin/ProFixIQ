import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

type OnboardingFileRef = {
  id: string;
  storage_bucket: string | null;
  storage_path: string | null;
};

export async function deleteOnboardingSession(params: {
  supabase: SupabaseClient;
  shopId: string;
  sessionId: string;
}) {
  const sb = params.supabase as any;

  await assertOnboardingSessionOwnership({
    supabase: params.supabase,
    shopId: params.shopId,
    sessionId: params.sessionId,
  });

  const { data: files, error: filesError } = await sb
    .from("onboarding_files")
    .select("id, storage_bucket, storage_path")
    .eq("shop_id", params.shopId)
    .eq("session_id", params.sessionId);

  if (filesError) throw new Error(filesError.message);

  const safeFiles = (files ?? []) as OnboardingFileRef[];

  const deletionSteps: Array<{ table: string; matchSessionId?: boolean }> = [
    { table: "onboarding_entity_links", matchSessionId: true },
    { table: "onboarding_review_items", matchSessionId: true },
    { table: "onboarding_entities", matchSessionId: true },
    { table: "onboarding_raw_rows", matchSessionId: true },
    { table: "onboarding_files", matchSessionId: true },
    { table: "onboarding_activation_plans", matchSessionId: true },
    { table: "onboarding_sessions" },
  ];

  for (const step of deletionSteps) {
    let query = sb.from(step.table).delete().eq("shop_id", params.shopId);
    if (step.matchSessionId ?? false) {
      query = query.eq("session_id", params.sessionId);
    } else {
      query = query.eq("id", params.sessionId);
    }

    const { error } = await query;
    if (error) throw new Error(error.message);
  }

  const bucketPaths = safeFiles.reduce<Map<string, string[]>>((acc, file) => {
    if (!file.storage_bucket || !file.storage_path) return acc;
    const list = acc.get(file.storage_bucket) ?? [];
    list.push(file.storage_path);
    acc.set(file.storage_bucket, list);
    return acc;
  }, new Map());

  const storageWarnings: string[] = [];
  for (const [bucket, paths] of bucketPaths.entries()) {
    const { error } = await sb.storage.from(bucket).remove(paths);
    if (error) {
      storageWarnings.push(`Failed to remove ${paths.length} file(s) from ${bucket}: ${error.message}`);
    }
  }

  return {
    deletedSessionId: params.sessionId,
    deletedFiles: safeFiles.length,
    storageWarnings,
  };
}
