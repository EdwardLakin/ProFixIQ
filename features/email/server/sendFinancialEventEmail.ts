import sgMail from "@sendgrid/mail";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@shared/types/types/supabase";

type DB = Database;
let configured = false;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function configure() {
  if (configured) return;
  sgMail.setApiKey(requiredEnv("SENDGRID_API_KEY"));
  configured = true;
}

export async function sendFinancialEventEmail(input: {
  shopId: string;
  to: string;
  subject: string;
  heading: string;
  body: string;
  portalUrl?: string | null;
  metadata?: Json;
}) {
  configure();
  const admin = createClient<DB>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: log, error: logError } = await admin
    .from("email_logs")
    .insert({
      shop_id: input.shopId,
      template_key: "financial_event",
      template_id: null,
      to_email: input.to,
      subject: input.subject,
      status: "queued",
      provider: "sendgrid",
      metadata: input.metadata ?? {},
    } as unknown as DB["public"]["Tables"]["email_logs"]["Insert"])
    .select("id")
    .single<{ id: string }>();
  if (logError) throw new Error(logError.message);

  const action = input.portalUrl
    ? `<p style="margin-top:24px"><a href="${input.portalUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#c57a4a;color:#fff;text-decoration:none">View in portal</a></p>`
    : "";

  try {
    const [response] = await sgMail.send({
      to: input.to,
      from: requiredEnv("SENDGRID_FROM_EMAIL"),
      subject: input.subject,
      text: `${input.heading}\n\n${input.body}${input.portalUrl ? `\n\n${input.portalUrl}` : ""}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#111827"><h1 style="font-size:22px">${input.heading}</h1><p style="font-size:15px;line-height:1.6">${input.body}</p>${action}<p style="margin-top:28px;color:#6b7280;font-size:12px">Sent by ProFixIQ</p></div>`,
    });
    const header = response.headers["x-message-id"] ?? response.headers["X-Message-Id"] ?? null;
    const providerMessageId = Array.isArray(header) ? header[0] : header;
    await admin
      .from("email_logs")
      .update({
        status: "sent",
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
      } as DB["public"]["Tables"]["email_logs"]["Update"])
      .eq("id", log.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SendGrid error";
    await admin
      .from("email_logs")
      .update({ status: "failed", error_text: message } as DB["public"]["Tables"]["email_logs"]["Update"])
      .eq("id", log.id);
    throw error;
  }
}
