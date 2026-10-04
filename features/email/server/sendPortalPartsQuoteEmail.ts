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

export type PortalPartsQuoteEmailInput = {
  to: string;
  shopName: string;
  customerName: string | null;
  description: string;
  totalLabel: string;
  portalUrl: string;
  requestId: string;
};

/** "Your parts quote is ready" email with a link to review it in the portal. */
export async function sendPortalPartsQuoteEmail(
  input: PortalPartsQuoteEmailInput,
): Promise<{ providerMessageId: string | null }> {
  configure();
  const shop = input.shopName.trim() || "Your shop";
  const greeting = input.customerName?.trim() ? `Hi ${input.customerName.trim()},` : "Hi,";
  const subject = `Your parts quote from ${shop} is ready`;
  const intro = `${shop} has priced the parts you asked about (${input.description}). The quote total is ${input.totalLabel}.`;
  const next = "Review the quote in your portal to approve it, and pay once it is approved.";

  const [response] = await sgMail.send({
    to: input.to.trim().toLowerCase(),
    from: requiredEnv("SENDGRID_FROM_EMAIL"),
    subject,
    text: `${greeting}\n\n${intro}\n\n${next}\n\n${input.portalUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#111827"><h1 style="font-size:22px">Your parts quote is ready</h1><p style="font-size:15px;line-height:1.6">${escapeHtml(greeting)}</p><p style="font-size:15px;line-height:1.6">${escapeHtml(intro)}</p><p style="font-size:15px;line-height:1.6">${escapeHtml(next)}</p><p style="margin-top:24px"><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#c57a4a;color:#fff;text-decoration:none">Review your quote</a></p><p style="margin-top:28px;color:#6b7280;font-size:12px">Sent by ProFixIQ on behalf of ${escapeHtml(shop)}</p></div>`,
    customArgs: {
      portal_parts_quote_request_id: input.requestId,
      event_type: "portal_parts_quote_ready",
    },
  });

  const headerValue = response.headers["x-message-id"] ?? response.headers["X-Message-Id"] ?? null;
  return {
    providerMessageId: Array.isArray(headerValue) ? (headerValue[0] ?? null) : headerValue,
  };
}
