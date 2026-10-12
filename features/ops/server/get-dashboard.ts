import "server-only";

import type { Database } from "@shared/types/types/supabase";
import type { OpsFeedbackSummary } from "@/features/ops/lib/dashboard";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type FeedbackRow = Pick<
  Database["public"]["Tables"]["agent_requests"]["Row"],
  | "id"
  | "description"
  | "intent"
  | "status"
  | "normalized_json"
  | "reporter_id"
  | "shop_id"
  | "created_at"
  | "updated_at"
>;

export async function getOpsDashboardFeedback(): Promise<OpsFeedbackSummary[]> {
  await requireOpsOperatorPageAccess();
  const { data, error } = await createAdminSupabase()
    .from("agent_requests")
    .select(
      "id, description, intent, status, normalized_json, reporter_id, shop_id, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(500)
    .returns<FeedbackRow[]>();

  if (error) {
    throw new Error(`Unable to load Ops feedback: ${error.message}`);
  }

  return (data ?? []).map((item) => ({
    ...item,
    intent: item.intent ?? null,
  }));
}
