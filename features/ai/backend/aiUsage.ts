import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@shared/types/types/supabase"

export type DbClient = SupabaseClient<Database>

/**
 * All AI-related feature slugs we want to track.
 * These are just labels written into `usage_logs.feature`.
 * You can expand this list as you wire more systems.
 */
export type AiFeatureSlug =
  | "work_order_summarize"
  | "work_order_suggest_repairs"
  | "inspection_summarize"
  | "inspection_suggest_repairs"
  | "parts_suggest"
  | "customer_message_suggest_reply"
  | "diagnostic_agent"
  | "planner_agent"
  | "assistant_agent"

/**
 * Basic wrapper around the existing `usage_logs` table.
 * This is our central "AI usage" tracker.
 */
export async function logAiUsage(
  db: DbClient,
  params: {
    feature: AiFeatureSlug
    userId?: string | null
    usedAt?: string | Date
  },
): Promise<void> {
  const userId = params.userId ?? (await getCurrentUserId(db))
  if (!userId) {
    // We don't throw — AI should never hard fail just because we can't log usage.
    console.warn("[aiUsage] logAiUsage called without user id; skipping log.")
    return
  }

  const usedAtIso =
    typeof params.usedAt === "string"
      ? params.usedAt
      : params.usedAt instanceof Date
        ? params.usedAt.toISOString()
        : new Date().toISOString()

  const { error } = await db.from("usage_logs").insert({
    feature: params.feature,
    user_id: userId,
    used_at: usedAtIso,
  })

  if (error) {
    console.error("[aiUsage] Failed to insert usage_logs row:", error)
  }
}

/**
 * Helper to fetch the current authenticated user id when the caller
 * doesn't explicitly pass a userId.
 *
 * Works when `db` is a client created with auth attached
 * (e.g. createBrowserSupabase / createServerSupabaseWithAuth).
 */
async function getCurrentUserId(db: DbClient): Promise<string | null> {
  // This call signature is for supabase-js v2.
  // If your local type complains, you can patch it or
  // pass userId explicitly from your calling code.
  // @ts-ignore - keep this flexible
  const { data, error } = await db.auth.getUser()

  if (error || !data?.user) {
    if (error) {
      console.warn("[aiUsage] getUser error while resolving user id:", error)
    }
    return null
  }

  return data.user.id
}
