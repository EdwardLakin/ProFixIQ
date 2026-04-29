import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOnboardingSessionOwnership } from "@/features/onboarding-agent/server/assertOnboardingSessionOwnership";

type OnboardingFileRef = {
  id: string;
  storage_bucket: string | null;
  storage_path: string | null;
};

const DELETE_CHUNK_SIZE = 500;

async function deleteRowsByChunk(params: {
  supabase: any;
  table: string;
  shopId: string;
  sessionId: string;
  matchSessionId?: boolean;
}) {
  const { supabase, table, shopId, sessionId, matchSessionId = true } = params;
  let deleted = 0;

  while (true) {
    let selectQuery = supabase
      .from(table)
      .select("id")
      .eq("shop_id", shopId);

    selectQuery = matchSessionId
      ? selectQuery.eq("session_id", sessionId)
      : selectQuery.eq("id", sessionId);

    const { data, error } = await selectQuery
      .order("id", { ascending: true })
      .limit(DELETE_CHUNK_SIZE);

    if (error) throw new Error(error.message);

    const ids = ((data ?? []) as Array<{ id: string | null }>)
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) break;

    let deleteQuery = supabase
      .from(table)
      .delete()
      .eq("shop_id", shopId)
      .in("id", ids);

    if (matchSessionId) {
      deleteQuery = deleteQuery.eq("session_id", sessionId);
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw new Error(deleteError.message);

    deleted += ids.length;
    if (ids.length < DELETE_CHUNK_SIZE) break;
  }

  return deleted;
}

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
    await deleteRowsByChunk({
      supabase: sb,
      table: step.table,
      shopId: params.shopId,
      sessionId: params.sessionId,
      matchSessionId: step.matchSessionId ?? false,
    });
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
