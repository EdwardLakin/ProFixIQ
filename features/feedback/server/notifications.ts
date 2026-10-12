import "server-only";

import { defaultOpsOperatorEmails } from "@/features/ops/lib/operatorAccess";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const { error } = await createAdminSupabase().functions.invoke("send-email", {
    body: { to, subject, text },
  });
  if (error) {
    console.error("feedback email delivery failed", { to, subject, error });
    return false;
  }
  return true;
}

export async function sendFeedbackAttentionEmail(input: {
  title: string;
  summary: string;
  surface: string;
  kind: string;
  severity: string;
  submissionCount: number;
  uniqueShopCount: number;
  recommendation: string;
  feedbackId: string;
}): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://profixiq.com";
  const subject = `[ProFixIQ Feedback] ${input.title}`;
  const text = [
    "A feedback item needs your attention.",
    "",
    `Title: ${input.title}`,
    `Surface: ${input.surface}`,
    `Type: ${input.kind}`,
    `Severity: ${input.severity}`,
    `Reports: ${input.submissionCount} from ${input.uniqueShopCount} shop${input.uniqueShopCount === 1 ? "" : "s"}`,
    "",
    input.summary,
    "",
    `AI recommendation: ${input.recommendation}`,
    "",
    `Open in Ops Console: ${baseUrl}/ops/feedback?feedback=${encodeURIComponent(input.feedbackId)}`,
  ].join("\n");

  const results = await Promise.all(
    defaultOpsOperatorEmails.map((email) => sendEmail(email, subject, text)),
  );
  return results.some(Boolean);
}

export type FeedbackCompletionDelivery = {
  deliveredReporterIds: string[];
  retryReporterIds: string[];
  unreachableReporterIds: string[];
};

export async function sendFeedbackCompletedEmails(input: {
  reporterIds: string[];
  title: string;
  summary: string;
}): Promise<FeedbackCompletionDelivery> {
  const admin = createAdminSupabase();
  const uniqueReporterIds = [...new Set(input.reporterIds.filter(Boolean))];
  const reportersByEmail = new Map<string, string[]>();
  const retryReporterIds: string[] = [];
  const unreachableReporterIds: string[] = [];

  for (const reporterId of uniqueReporterIds) {
    const { data, error } = await admin.auth.admin.getUserById(reporterId);
    if (error) {
      console.warn("feedback completion reporter lookup failed", { reporterId, error });
      retryReporterIds.push(reporterId);
      continue;
    }
    const email = data.user?.email?.trim().toLowerCase();
    if (!email) {
      unreachableReporterIds.push(reporterId);
      continue;
    }
    reportersByEmail.set(email, [
      ...(reportersByEmail.get(email) ?? []),
      reporterId,
    ]);
  }

  const subject = `You asked, we shipped it: ${input.title}`;
  const text = [
    "Thanks for helping improve ProFixIQ.",
    "",
    `You previously sent feedback about: ${input.title}`,
    "",
    input.summary,
    "",
    "This item has now been completed in ProFixIQ.",
    "",
    "We appreciate the feedback — it directly helps us decide what to improve next.",
  ].join("\n");

  const deliveredReporterIds: string[] = [];
  for (const [email, reporterIds] of reportersByEmail) {
    if (await sendEmail(email, subject, text)) {
      deliveredReporterIds.push(...reporterIds);
    } else {
      retryReporterIds.push(...reporterIds);
    }
  }

  return {
    deliveredReporterIds: [...new Set(deliveredReporterIds)],
    retryReporterIds: [...new Set(retryReporterIds)],
    unreachableReporterIds: [...new Set(unreachableReporterIds)],
  };
}
