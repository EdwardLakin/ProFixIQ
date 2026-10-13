import type { Json } from "@shared/types/types/supabase";
import {
  feedbackStatusFromLegacy,
  readFeedbackMetadata,
  type FeedbackStatus,
} from "@/features/feedback/lib/feedback";

export type OpsFeedbackSummary = {
  id: string;
  description: string;
  intent: string | null;
  status: string;
  normalized_json: Json | null;
  reporter_id: string | null;
  shop_id: string | null;
  created_at: string;
  updated_at: string;
  submissionCount?: number;
};

export type OpsDashboardMetrics = {
  totalSubmissions: number;
  newSubmissions: number;
  needsAttention: number;
  inProgress: number;
  completed: number;
};

export function opsFeedbackStatus(item: OpsFeedbackSummary): FeedbackStatus {
  return (
    readFeedbackMetadata(item.normalized_json)?.status ??
    feedbackStatusFromLegacy(item.status)
  );
}

export function opsFeedbackNeedsAttention(item: OpsFeedbackSummary): boolean {
  const metadata = readFeedbackMetadata(item.normalized_json);
  return metadata?.needsAttention === true || item.status === "failed";
}

export function opsFeedbackTitle(item: OpsFeedbackSummary): string {
  return readFeedbackMetadata(item.normalized_json)?.title ?? item.description;
}

export function opsFeedbackSurface(item: OpsFeedbackSummary): string {
  return readFeedbackMetadata(item.normalized_json)?.surface ?? "historical";
}

export function opsFeedbackKind(item: OpsFeedbackSummary): string {
  const metadata = readFeedbackMetadata(item.normalized_json);
  if (metadata?.kind) return metadata.kind;
  return item.intent === "bug_report" ? "bug" : "feature_request";
}

export function buildOpsDashboardMetrics(
  items: OpsFeedbackSummary[],
): OpsDashboardMetrics {
  return {
    totalSubmissions: items.reduce(
      (total, item) => total + (item.submissionCount ?? 1),
      0,
    ),
    newSubmissions: items
      .filter((item) => opsFeedbackStatus(item) === "new")
      .reduce((total, item) => total + (item.submissionCount ?? 1), 0),
    needsAttention: items.filter(
      (item) =>
        opsFeedbackNeedsAttention(item) &&
        !["completed", "declined"].includes(opsFeedbackStatus(item)),
    ).length,
    inProgress: items.filter(
      (item) => opsFeedbackStatus(item) === "in_progress",
    ).length,
    completed: items.filter((item) => opsFeedbackStatus(item) === "completed")
      .length,
  };
}

export function attentionFeedback(
  items: OpsFeedbackSummary[],
  limit = 6,
): OpsFeedbackSummary[] {
  return items
    .filter((item) => {
      const status = opsFeedbackStatus(item);
      return (
        opsFeedbackNeedsAttention(item) ||
        status === "new" ||
        status === "reviewing"
      );
    })
    .filter(
      (item) => !["completed", "declined"].includes(opsFeedbackStatus(item)),
    )
    .sort((left, right) => {
      const attentionDelta =
        Number(opsFeedbackNeedsAttention(right)) -
        Number(opsFeedbackNeedsAttention(left));
      if (attentionDelta !== 0) return attentionDelta;
      return Date.parse(right.updated_at) - Date.parse(left.updated_at);
    })
    .slice(0, limit);
}
