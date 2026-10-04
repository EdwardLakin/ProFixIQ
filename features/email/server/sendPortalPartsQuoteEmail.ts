import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { sendDynamicTemplateEmail } from "./sendDynamicTemplateEmail";

type DB = Database;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type PortalPartsQuoteEmailInput = {
  shopId: string;
  to: string;
  shopName: string;
  customerName: string | null;
  description: string;
  totalLabel: string;
  portalUrl: string;
  requestId: string;
  /** Identifies this exact quote so a retry never sends it twice. */
  deliveryKey: string;
};

/** One quote revision per request and total; a re-priced quote gets a new key. */
export function portalPartsQuoteDeliveryKey(requestId: string, totalCents: number): string {
  return `portal-parts-quote:${requestId}:${totalCents}`;
}

/**
 * True when a delivery attempt for this quote already reached the provider (or
 * was deliberately suppressed). A queued or failed log does not count, so a
 * crashed attempt is retried while an accepted one is never duplicated.
 */
export async function portalPartsQuoteEmailAlreadyHandled(
  supabase: SupabaseClient<DB>,
  shopId: string,
  deliveryKey: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("email_logs")
    .select("id")
    .eq("shop_id", shopId)
    .eq("template_key", "quote_ready")
    .eq("metadata->>delivery_key", deliveryKey)
    .not("status", "in", "(queued,failed)")
    .limit(1);
  if (error) throw new Error(`Failed to check prior quote delivery: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * "Your parts quote is ready" email with a portal link. Sent through the
 * canonical email service so suppressions are honoured and every attempt has an
 * email_logs record for webhook reconciliation and support.
 */
export async function sendPortalPartsQuoteEmail(
  input: PortalPartsQuoteEmailInput,
): Promise<{ status: "accepted" | "suppressed"; emailLogId: string }> {
  const shop = input.shopName.trim() || "Your shop";
  const greeting = input.customerName?.trim() ? `Hi ${input.customerName.trim()},` : "Hi,";
  const subject = `Your parts quote from ${shop} is ready`;
  const intro = `${shop} has priced the parts you asked about (${input.description}). The quote total is ${input.totalLabel}.`;
  const next = "Review the quote in your portal to approve it, and pay once it is approved.";

  const result = await sendDynamicTemplateEmail({
    shopId: input.shopId,
    templateKey: "quote_ready",
    to: input.to,
    subject,
    content: {
      text: `${greeting}\n\n${intro}\n\n${next}\n\n${input.portalUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#111827"><h1 style="font-size:22px">Your parts quote is ready</h1><p style="font-size:15px;line-height:1.6">${escapeHtml(greeting)}</p><p style="font-size:15px;line-height:1.6">${escapeHtml(intro)}</p><p style="font-size:15px;line-height:1.6">${escapeHtml(next)}</p><p style="margin-top:24px"><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#c57a4a;color:#fff;text-decoration:none">Review your quote</a></p><p style="margin-top:28px;color:#6b7280;font-size:12px">Sent by ProFixIQ on behalf of ${escapeHtml(shop)}</p></div>`,
    },
    fromName: shop,
    metadata: {
      portal_parts_quote_request_id: input.requestId,
      delivery_key: input.deliveryKey,
      event_type: "portal_parts_quote_ready",
    },
  });

  return { status: result.status, emailLogId: result.emailLogId };
}
