import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import { PortalAccessError } from "@/features/portal/server/portalAuth";
import { requirePortalCustomerActor } from "@/features/portal/server/requirePortalActor";
import { createPortalPartsQuoteCheckout } from "@/features/stripe/lib/server/portal-parts-quote-checkout";
import { partsQuoteTotalCents } from "@/features/portal/lib/partsQuotePresentation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function statusForError(message: string): number {
  return /not connected|not complete|disabled|upgraded|no payable/i.test(message) ? 409 : 500;
}

export async function POST(_req: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    if (!process.env.STRIPE_SECRET_KEY) return bad("Missing STRIPE_SECRET_KEY", 500);
    const supabase = createServerSupabaseRoute();
    const actor = await requirePortalCustomerActor(supabase);
    const shopId = actor.customer.shop_id;
    if (!shopId) return bad("Customer is not linked to a shop", 409);
    if (!UUID_PATTERN.test(id)) return bad("This quote is unavailable.", 404);

    const admin = createAdminSupabase();
    const { data: request, error } = await admin
      .from("portal_parts_quote_requests")
      .select("id, shop_id, customer_id, status, description, total, currency, paid_at")
      .eq("id", id)
      .eq("shop_id", shopId)
      .eq("customer_id", actor.customer.id)
      .maybeSingle();
    if (error) {
      console.error("[portal/parts-quotes/checkout] lookup failed", { message: error.message });
      return bad("This quote could not be loaded.", 500);
    }
    if (!request) return bad("This quote is unavailable.", 404);
    if (request.paid_at) return bad("This quote has already been paid.", 409);
    if (request.status !== "approved") return bad("Approve this quote before paying.", 409);

    const totalCents = partsQuoteTotalCents(request.total);
    if (totalCents <= 0) return bad("This quote has no payable balance.", 409);

    const { data: { user } } = await supabase.auth.getUser();
    const base = getBaseUrl();
    const session = await createPortalPartsQuoteCheckout({
      stripe: createStripeClient(process.env.STRIPE_SECRET_KEY),
      supabase: admin,
      shopId,
      requestId: request.id,
      description: request.description,
      totalCents,
      currency: request.currency,
      customerEmail: user?.email ?? null,
      customerId: actor.customer.id,
      createdBy: actor.userId,
      successUrl: `${base}/portal/parts-quotes/${request.id}?payment_session={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/portal/parts-quotes/${request.id}`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof PortalAccessError) return bad(error.message, error.status);
    const message = error instanceof Error ? error.message : "Server error";
    return bad(message, statusForError(message));
  }
}
