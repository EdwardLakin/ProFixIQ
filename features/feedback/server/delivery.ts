import "server-only";
import {
  isRecord,
  notificationCounts,
  readFeedbackMetadata,
} from "@/features/feedback/lib/feedback";
import {
  fetchClusterRows,
  reporterAuthId,
} from "@/features/feedback/server/ledger";
import {
  sendFeedbackAttentionEmail,
  sendFeedbackCompletedEmails,
} from "@/features/feedback/server/notifications";
import type { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type Admin = ReturnType<typeof createAdminSupabase>;
type Options = {
  owner?: boolean;
  requesters?: boolean;
  retryUnknown?: boolean;
};

/** Fenced reservations recover automatically before dispatch. Unknown external
 * outcomes require an explicit Ops resend, never an automatic duplicate. */
export async function deliverFeedbackNotifications(
  admin: Admin,
  clusterId: string,
  options: Options,
) {
  let notified = 0;
  let pendingNotifications = 0;
  let unknownNotifications = 0;
  try {
    const { rows, error } = await fetchClusterRows(admin, clusterId);
    if (error) throw new Error(error);
    const canonical = rows.find((row) => row.id === clusterId);
    const metadata = readFeedbackMetadata(canonical?.normalized_json);
    if (!metadata)
      return { notified, pendingNotifications, unknownNotifications };
    const reporterIds = [
      ...new Set(
        rows.map(reporterAuthId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const jobs = [
      ...(options.owner
        ? (metadata.ownerPendingNotificationKeys ?? []).map((key) => ({
            kind: "owner" as const,
            key,
          }))
        : []),
      ...(options.requesters && metadata.status === "completed"
        ? reporterIds.map((key) => ({ kind: "requester" as const, key }))
        : []),
    ];
    for (const job of jobs) {
      const call = async (action: string, token?: string) => {
        const { data, error: rpcError } = await admin.rpc(
          "feedback_notification",
          {
            p_id: clusterId,
            p_kind: job.kind,
            p_key: job.key,
            p_action: action,
            ...(token ? { p_token: token } : {}),
          },
        );
        if (rpcError) throw new Error(rpcError.message);
        const result: unknown = data;
        return isRecord(result) && typeof result.token === "string"
          ? result.token
          : null;
      };
      const token = await call(
        options.retryUnknown ? "retry_unknown" : "claim",
      );
      if (!token) continue;
      let settlement = "release";
      if (job.kind === "owner") {
        if (!(await call("begin", token))) continue;
        settlement = await sendFeedbackAttentionEmail({
          title: metadata.title,
          summary: metadata.summary,
          surface: metadata.surface,
          kind: metadata.kind,
          severity: metadata.severity,
          recommendation: metadata.recommendation,
          submissionCount: rows.length,
          uniqueShopCount: new Set(
            rows.map((row) => row.shop_id).filter(Boolean),
          ).size,
          feedbackId: clusterId,
        });
      } else {
        const result = await sendFeedbackCompletedEmails({
          reporterIds: [job.key],
          beforeSend: async () => Boolean(await call("begin", token)),
        });
        if (result.deliveredReporterIds.includes(job.key)) {
          settlement = "delivered";
          notified += 1;
        } else if (result.unreachableReporterIds.includes(job.key))
          settlement = "skipped";
        else if (result.unknownReporterIds.includes(job.key))
          settlement = "unknown";
      }
      await call(settlement, token);
    }
    const { data: fresh, error: freshError } = await admin
      .from("agent_requests")
      .select("*")
      .eq("id", clusterId)
      .single();
    if (freshError) throw new Error(freshError.message);
    const latest = readFeedbackMetadata(fresh.normalized_json);
    const counts = notificationCounts(
      reporterIds,
      latest?.requesterNotifiedReporterIds ?? [],
      latest?.requesterNotificationSkippedReporterIds ?? [],
      latest?.requesterNotificationClaims ?? {},
    );
    pendingNotifications = counts.pending;
    unknownNotifications = counts.unknown;
  } catch (error) {
    // A committed report/lifecycle remains successful. Durable jobs are still
    // available on the next replay or Ops retry, including a failed receipt write.
    console.error("feedback notification processing interrupted", error);
    pendingNotifications = Math.max(1, pendingNotifications);
  }
  return { notified, pendingNotifications, unknownNotifications };
}
