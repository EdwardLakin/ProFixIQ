import sgMail from "@sendgrid/mail";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";
import { getTemplateId, type EmailTemplateKey } from "./templateIds";
import { sanitizeEmailMetadata } from "./sendgridWebhook";

type DB = Database;

type SendDynamicTemplateEmailInput = {
  shopId: string;
  templateKey: EmailTemplateKey;
  to: string;
  dynamicTemplateData?: Record<string, unknown>;
  subject?: string | null;
  createdBy?: string | null;
  metadata?: Json;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getAdminClient() {
  return createClient<DB>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

let configured = false;

function ensureSendGridConfigured() {
  if (configured) return;
  sgMail.setApiKey(requiredEnv("SENDGRID_API_KEY"));
  configured = true;
}

export async function sendDynamicTemplateEmail(
  input: SendDynamicTemplateEmailInput,
): Promise<void> {
  ensureSendGridConfigured();

  const supabase = getAdminClient();
  const templateId = getTemplateId(input.templateKey);
  const fromEmail = requiredEnv("SENDGRID_FROM_EMAIL");
  const to = input.to.trim().toLowerCase();

  const { data: suppression, error: suppressionError } = await supabase
    .from("email_suppressions")
    .select("reason")
    .eq("email", to)
    .eq("suppressed", true)
    .maybeSingle<{ reason: string | null }>();

  if (suppressionError) {
    throw new Error(`Failed to verify email suppression: ${suppressionError.message}`);
  }

  const { data: logRow, error: insertError } = await supabase
    .from("email_logs")
    .insert({
      shop_id: input.shopId,
      template_key: input.templateKey,
      template_id: templateId,
      to_email: to,
      subject: input.subject ?? null,
      status: "queued",
      provider: "sendgrid",
      metadata: sanitizeEmailMetadata(
        (input.metadata ?? {}) as Record<string, unknown>,
      ) as Json,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  if (suppression) {
    const { error: suppressedLogError } = await supabase
      .from("email_logs")
      .update({
        status: "suppressed",
        error_text: suppression.reason ?? "Recipient is suppressed",
      })
      .eq("id", logRow.id);
    if (suppressedLogError) throw new Error(suppressedLogError.message);
    return;
  }

  try {
    const [response] = await sgMail.send({
      to,
      from: fromEmail,
      templateId,
      dynamicTemplateData: input.dynamicTemplateData ?? {},
      customArgs: {
        email_log_id: logRow.id,
      },
      ...(input.subject ? { subject: input.subject } : {}),
    });

    const headerValue =
      response.headers["x-message-id"] ?? response.headers["X-Message-Id"] ?? null;

    const providerMessageId = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;

    const { error: updateError } = await supabase
      .from("email_logs")
      .update({
        status: "accepted",
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
      })
      .eq("id", logRow.id);

    if (updateError) {
      console.error(
        "[email/sendDynamicTemplateEmail] failed to mark email log as sent",
        {
          emailLogId: logRow.id,
          templateKey: input.templateKey,
          to,
          error: updateError.message,
        },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown SendGrid error";

    await supabase
      .from("email_logs")
      .update({
        status: "failed",
        error_text: message,
      })
      .eq("id", logRow.id);

    throw error;
  }
}
