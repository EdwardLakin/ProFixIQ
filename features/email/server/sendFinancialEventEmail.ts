import sgMail from "@sendgrid/mail";

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

export function assertFinancialEventEmailConfigured() {
  requiredEnv("SENDGRID_API_KEY");
  requiredEnv("SENDGRID_FROM_EMAIL");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendFinancialEventEmail(input: {
  shopId: string;
  to: string;
  subject: string;
  heading: string;
  body: string;
  portalUrl?: string | null;
  deliveryKey: string;
  outboxId: string;
  recipientKind: "customer" | "staff";
  metadata?: Record<string, unknown>;
}): Promise<{ providerMessageId: string | null }> {
  assertFinancialEventEmailConfigured();
  configure();
  const heading = escapeHtml(input.heading);
  const body = escapeHtml(input.body);
  const portalUrl = input.portalUrl?.trim() || null;
  const action = portalUrl
    ? `<p style="margin-top:24px"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#c57a4a;color:#fff;text-decoration:none">View in portal</a></p>`
    : "";

  const [response] = await sgMail.send({
    to: input.to.trim().toLowerCase(),
    from: requiredEnv("SENDGRID_FROM_EMAIL"),
    subject: input.subject,
    text: `${input.heading}\n\n${input.body}${portalUrl ? `\n\n${portalUrl}` : ""}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#111827"><h1 style="font-size:22px">${heading}</h1><p style="font-size:15px;line-height:1.6">${body}</p>${action}<p style="margin-top:28px;color:#6b7280;font-size:12px">Sent by ProFixIQ</p></div>`,
    customArgs: {
      financial_delivery_key: input.deliveryKey,
      financial_outbox_id: input.outboxId,
      financial_recipient_kind: input.recipientKind,
      event_type: String(input.metadata?.event_type ?? "financial_event"),
    },
  });

  const headerValue =
    response.headers["x-message-id"] ?? response.headers["X-Message-Id"] ?? null;

  return {
    providerMessageId: Array.isArray(headerValue)
      ? (headerValue[0] ?? null)
      : headerValue,
  };
}
