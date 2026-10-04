import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { recordPortalPartsQuoteCheckoutSession } from "@/features/portal/server/recordPortalPartsQuotePayment";
import { listPortalPartsQuotes } from "@/features/portal/server/portalPartsQuotes";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type Body = { sessionId?: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Called when the customer returns from Stripe Checkout. It verifies the
 * session with Stripe on the shop's connected account and records the payment
 * idempotently, so the portal is correct even if the webhook is delayed.
 */
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    if (!process.env.STRIPE_SECRET_KEY) return bad("Missing STRIPE_SECRET_KEY", 500);
    const supabase = createServerSupabaseRoute();
    const actor = await requirePortalCustomerActor(supabase);
    const shopId = actor.customer.shop_id;
    if (!shopId) return bad("Customer is not linked to a shop", 409);
    if (!UUID_PATTERN.test(id)) return bad("This quote is unavailable.", 404);

    const body = (await req.json().catch(() => null)) as Body | null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return bad("A checkout session is required.", 400);

    const admin = createAdminSupabase();
    const { rows } = await listPortalPartsQuotes({
      admin,
      shopId,
      customerId: actor.customer.id,
      id,
    });
    if (!rows[0]) return bad("This quote is unavailable.", 404);

    const { data: shop, error: shopError } = await admin
      .from("shops")
      .select("stripe_account_id")
      .eq("id", shopId)
      .maybeSingle();
    if (shopError) return bad("Payment could not be verified.", 500);
    const accountId = String(shop?.stripe_account_id ?? "").trim();
    if (!accountId.startsWith("acct_")) return bad("Payment could not be verified.", 409);

    const session = await createStripeClient(process.env.STRIPE_SECRET_KEY).checkout.sessions.retrieve(
      sessionId,
      undefined,
      { stripeAccount: accountId },
    );
    if (session.metadata?.parts_quote_request_id !== id) {
      return bad("This payment does not belong to this quote.", 403);
    }

    const result = await recordPortalPartsQuoteCheckoutSession({
      supabase: admin,
      session,
      connectedAccountId: accountId,
    });

    const { quotes } = await listPortalPartsQuotes({
      admin,
      shopId,
      customerId: actor.customer.id,
      id,
    });
    return NextResponse.json({ ok: true, recorded: result.recorded, quote: quotes[0] ?? null });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    console.error("[portal/parts-quotes/confirm-payment] failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return bad("Payment could not be verified.", 500);
  }
}
