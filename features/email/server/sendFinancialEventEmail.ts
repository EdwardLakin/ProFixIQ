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
  metadata?: Record<string, unknown>;
}) {
  configure();
  const heading = escapeHtml(input.heading);
  const body = escapeHtml(input.body);
  const portalUrl = input.portalUrl?.trim() || null;
  const action = portalUrl
    ? `<p style="margin-top:24px"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#c57a4a;color:#fff;text-decoration:none">View in portal</a></p>`
    : "";

  await sgMail.send({
    to: input.to,
    from: requiredEnv("SENDGRID_FROM_EMAIL"),
    subject: input.subject,
    text: `${input.heading}\n\n${input.body}${portalUrl ? `\n\n${portalUrl}` : ""}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#111827"><h1 style="font-size:22px">${heading}</h1><p style="font-size:15px;line-height:1.6">${body}</p>${action}<p style="margin-top:28px;color:#6b7280;font-size:12px">Sent by ProFixIQ</p></div>`,
    customArgs: {
      shop_id: input.shopId,
      event_type: String(input.metadata?.event_type ?? "financial_event"),
      dedupe_key: String(input.metadata?.dedupe_key ?? ""),
    },
  });
}
