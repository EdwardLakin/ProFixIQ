import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { getShopPaymentSettings } from "@/features/stripe/lib/server/shop-payment-settings";
import { sendPortalPartsQuoteEmail } from "@/features/email/server/sendPortalPartsQuoteEmail";
import { upsertPortalNotification } from "@/features/portal/server/upsertPortalNotification";
import { formatPartsQuoteMoney } from "@/features/portal/lib/partsQuotePresentation";

type DB = Database;
type RpcResult = Record<string, unknown>;

function unwrap(
  fn: string,
  response: { data: unknown; error: { message: string } | null },
): RpcResult {
  if (response.error) throw new Error(`${fn}: ${response.error.message}`);
  return (response.data ?? {}) as RpcResult;
}

export type ProcessPortalPartsQuotesResult = {
  examined: number;
  quoted: number;
  sent: number;
  failed: number;
};

type ShopPricing = { taxRate: number; currency: "cad" | "usd"; name: string };

function siteUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

async function loadShopPricing(
  supabase: SupabaseClient<DB>,
  shopId: string,
  cache: Map<string, ShopPricing>,
): Promise<ShopPricing> {
  const cached = cache.get(shopId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("shops")
    .select("business_name, shop_name, name, tax_rate")
    .eq("id", shopId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const settings = await getShopPaymentSettings(supabase, shopId);

  const pricing: ShopPricing = {
    taxRate: Math.max(0, Number(data?.tax_rate ?? 0) || 0),
    currency: settings.default_currency,
    name: data?.business_name?.trim() || data?.shop_name?.trim() || data?.name?.trim() || "Your shop",
  };
  cache.set(shopId, pricing);
  return pricing;
}

/**
 * Prices customer parts quote requests from their Parts items and, once every
 * item is priced, emails the customer a portal link. Safe to run concurrently:
 * pricing is idempotent and exactly one worker wins the send claim.
 */
export async function processPortalPartsQuotes(
  supabase: SupabaseClient<DB>,
  limit = 25,
): Promise<ProcessPortalPartsQuotesResult> {
  const result: ProcessPortalPartsQuotesResult = { examined: 0, quoted: 0, sent: 0, failed: 0 };

  const { data: pending, error } = await supabase
    .from("portal_parts_quote_requests")
    .select("id, shop_id, customer_id")
    .in("status", ["requested", "quoted"])
    .is("email_sent_at", null)
    // Least-recently-checked first so unpriced requests rotate instead of
    // starving newer ones that are ready to send.
    .order("pricing_checked_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const shops = new Map<string, ShopPricing>();

  for (const request of pending ?? []) {
    result.examined += 1;
    try {
      const pricing = await loadShopPricing(supabase, request.shop_id, shops);
      const priced = unwrap(
        "price_portal_parts_quote_request",
        await supabase.rpc("price_portal_parts_quote_request", {
          p_request_id: request.id,
          p_tax_rate: pricing.taxRate,
          p_currency: pricing.currency,
        }),
      );
      if (priced.status !== "quoted") continue;
      result.quoted += 1;

      const claim = unwrap(
        "claim_portal_parts_quote_request_send",
        await supabase.rpc("claim_portal_parts_quote_request_send", {
          p_request_id: request.id,
          p_claim_seconds: 600,
        }),
      );
      if (claim.claimed !== true) continue;

      try {
        await deliverQuote(supabase, request.id, request.shop_id, request.customer_id, pricing, {
          description: String(claim.description ?? "your parts"),
          total: Number(claim.total ?? 0),
          currency: claim.currency === "usd" ? "usd" : "cad",
        });
        unwrap(
          "mark_portal_parts_quote_request_sent",
          await supabase.rpc("mark_portal_parts_quote_request_sent", {
            p_request_id: request.id,
            p_at: new Date().toISOString(),
          }),
        );
        result.sent += 1;
      } catch (deliveryError) {
        await supabase
          .rpc("release_portal_parts_quote_request_send_claim", {
            p_request_id: request.id,
          })
          .then(
            () => undefined,
            () => undefined,
          );
        throw deliveryError;
      }
    } catch (processError) {
      result.failed += 1;
      console.error("[portal/parts-quotes] processing failed", {
        requestId: request.id,
        message: processError instanceof Error ? processError.message : "unknown",
      });
    }
  }

  return result;
}

async function deliverQuote(
  supabase: SupabaseClient<DB>,
  requestId: string,
  shopId: string,
  customerId: string,
  pricing: ShopPricing,
  quote: { description: string; total: number; currency: "cad" | "usd" },
): Promise<void> {
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, user_id, email, first_name, last_name")
    .eq("id", customerId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) throw new Error("Customer not found for parts quote");

  const portalUrl = `${siteUrl()}/portal/parts-quotes/${requestId}`;
  const totalLabel = formatPartsQuoteMoney(quote.total, quote.currency);

  // The in-portal notification is best effort; the email is the delivery that
  // must succeed (when the customer has an address) before the quote is sent.
  if (customer.user_id) {
    await upsertPortalNotification(supabase, {
      userId: customer.user_id,
      customerId: customer.id,
      kind: "parts_quote_ready",
      title: "Your parts quote is ready",
      body: `${pricing.name} priced ${quote.description}. Total ${totalLabel}.`,
      eventKey: `parts_quote:${requestId}:ready`,
      href: `/portal/parts-quotes/${requestId}`,
      metadata: { parts_quote_request_id: requestId },
    }).catch((notificationError: unknown) => {
      console.error("[portal/parts-quotes] notification failed", {
        requestId,
        message: notificationError instanceof Error ? notificationError.message : "unknown",
      });
    });
  }

  const email = customer.email?.trim();
  if (!email) return;

  await sendPortalPartsQuoteEmail({
    to: email,
    shopName: pricing.name,
    customerName: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
    description: quote.description,
    totalLabel,
    portalUrl,
    requestId,
  });
}
