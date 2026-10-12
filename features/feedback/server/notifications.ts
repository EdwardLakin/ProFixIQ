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

export async function sendFeedbackCompletedEmails(input: {
  reporterIds: string[];
  title: string;
  summary: string;
}): Promise<number> {
  const admin = createAdminSupabase();
  const uniqueReporterIds = [...new Set(input.reporterIds.filter(Boolean))];
  const emails = new Set<string>();

  for (const reporterId of uniqueReporterIds) {
    const { data, error } = await admin.auth.admin.getUserById(reporterId);
    if (error) {
      console.warn("feedback completion reporter lookup failed", { reporterId, error });
      continue;
    }
    const email = data.user?.email?.trim().toLowerCase();
    if (email) emails.add(email);
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

  let sent = 0;
  for (const email of emails) {
    if (await sendEmail(email, subject, text)) sent += 1;
  }
  return sent;
}
