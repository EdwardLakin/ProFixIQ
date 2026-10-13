import "server-only";

import { defaultOpsOperatorEmails } from "@/features/ops/lib/operatorAccess";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<"delivered" | "unknown"> {
  try {
    const admin = createAdminSupabase();
    const { error } = await admin.functions.invoke("send-email", {
      body: { to, subject, text },
    });
    if (error) {
      console.error("feedback email delivery failed", { to, subject, error });
      return "unknown";
    }
    return "delivered";
  } catch (error) {
    console.error("feedback email outcome unknown", error);
    return "unknown";
  }
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
}): Promise<"delivered" | "unknown"> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://profixiq.com";
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
  return results.every((result) => result === "delivered")
    ? "delivered"
    : "unknown";
}

export type FeedbackCompletionDelivery = {
  deliveredReporterIds: string[];
  retryReporterIds: string[];
  unreachableReporterIds: string[];
  unknownReporterIds: string[];
};

/**
 * Requester-facing completion mail intentionally contains no canonical title,
 * summary, notes, AI output, shop identifiers, or other cluster text. A cluster
 * may contain submissions from more than one tenant, so external messaging must
 * be product-authored and tenant-neutral.
 */
export async function sendFeedbackCompletedEmails(input: {
  reporterIds: string[];
  beforeSend?: () => Promise<boolean>;
}): Promise<FeedbackCompletionDelivery> {
  const admin = createAdminSupabase();
  const uniqueReporterIds = [...new Set(input.reporterIds.filter(Boolean))];
  const reportersByEmail = new Map<string, string[]>();
  const retryReporterIds: string[] = [];
  const unknownReporterIds: string[] = [];
  const unreachableReporterIds: string[] = [];

  for (const reporterId of uniqueReporterIds) {
    const { data, error } = await admin.auth.admin.getUserById(reporterId);
    if (error) {
      console.warn("feedback completion reporter lookup failed", {
        reporterId,
        error,
      });
      if (error.status === 404) unreachableReporterIds.push(reporterId);
      else retryReporterIds.push(reporterId);
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

  const subject = "A ProFixIQ improvement you requested is now available";
  const text = [
    "Thanks for helping improve ProFixIQ.",
    "",
    "An item you previously asked us to improve has now been completed in ProFixIQ.",
    "",
    "We appreciate the feedback — it directly helps us decide what to improve next.",
  ].join("\n");

  const deliveredReporterIds: string[] = [];
  for (const [email, reporterIds] of reportersByEmail) {
    if (input.beforeSend && !(await input.beforeSend())) {
      retryReporterIds.push(...reporterIds);
      continue;
    }
    if ((await sendEmail(email, subject, text)) === "delivered") {
      deliveredReporterIds.push(...reporterIds);
    } else {
      unknownReporterIds.push(...reporterIds);
    }
  }

  return {
    deliveredReporterIds: [...new Set(deliveredReporterIds)],
    unknownReporterIds: [...new Set(unknownReporterIds)],
    retryReporterIds: [...new Set(retryReporterIds)],
    unreachableReporterIds: [...new Set(unreachableReporterIds)],
  };
}
