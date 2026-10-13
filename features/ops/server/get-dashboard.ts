import "server-only";

import { readFeedbackMetadata } from "@/features/feedback/lib/feedback";
import type { OpsFeedbackSummary } from "@/features/ops/lib/dashboard";
import { fetchAllLedgerRows } from "@/features/feedback/server/ledger";
import { requireOpsOperatorPageAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

/**
 * Returns one summary per canonical feedback cluster — the same grouped
 * representation Feedback Control uses — so duplicates are not double counted,
 * lifecycle status comes from the canonical item, and links resolve to the
 * canonical cluster id.
 */
export async function getOpsDashboardFeedback(): Promise<OpsFeedbackSummary[]> {
  await requireOpsOperatorPageAccess();
  const { rows, error } = await fetchAllLedgerRows(createAdminSupabase());

  if (error) {
    throw new Error(`Unable to load Ops feedback: ${error}`);
  }

  const clusters = new Map<string, typeof rows>();
  for (const row of rows) {
    const clusterId =
      readFeedbackMetadata(row.normalized_json)?.clusterId ?? row.id;
    clusters.set(clusterId, [...(clusters.get(clusterId) ?? []), row]);
  }

  return [...clusters.entries()]
    .map(([clusterId, members]) => {
      const canonical =
        members.find((row) => row.id === clusterId) ??
        members[members.length - 1];
      return {
        id: clusterId,
        submissionCount: members.length,
        description: canonical.description,
        intent: canonical.intent ?? null,
        status: canonical.status,
        normalized_json: canonical.normalized_json,
        reporter_id: canonical.reporter_id,
        shop_id: canonical.shop_id,
        created_at: canonical.created_at,
        updated_at: canonical.updated_at,
      } satisfies OpsFeedbackSummary;
    })
    .sort(
      (left, right) =>
        Date.parse(right.updated_at) - Date.parse(left.updated_at),
    );
}
