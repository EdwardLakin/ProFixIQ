export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/server/owner-pin";

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = (url.searchParams.get("session_id") ?? "").trim();

    if (!sessionId) {
      return noStoreJson({ error: "Missing session_id" }, 400);
    }

    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      return noStoreJson({ error: "Invalid session_id" }, 400);
    }

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
      ownerPinAllowedPurposes: [OWNER_PIN_PURPOSES.BILLING, OWNER_PIN_PURPOSES.PRIVILEGED],
    });
    if (!access.ok) return access.response;

    const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
    if (!secretKey) return noStoreJson({ error: "Billing unavailable" }, 503);
    const stripe = createStripeClient(secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadataPurpose = String(session.metadata?.purpose ?? "").trim();

    const { data: shop } = await access.supabase
      .from("shops")
      .select("id, stripe_customer_id")
      .eq("id", access.profile.shop_id)
      .maybeSingle();

    if (!shop) {
      return noStoreJson({ error: "Shop not found" }, 404);
    }

    const metadataShopId = String(session.metadata?.shop_id ?? "").trim();
    const sessionCustomer = typeof session.customer === "string" ? session.customer : null;
    const shopCustomer = String(shop.stripe_customer_id ?? "").trim() || null;

    if (
      metadataShopId !== access.profile.shop_id ||
      metadataPurpose !== "profixiq_subscription" ||
      !sessionCustomer ||
      !shopCustomer ||
      sessionCustomer !== shopCustomer
    ) {
      return noStoreJson({ error: "Forbidden" }, 403);
    }

    let email: string | null = session.customer_details?.email ?? null;

    if (!email && typeof session.customer === "string") {
      const customer = await stripe.customers.retrieve(session.customer);

      if (customer && !("deleted" in customer)) {
        email = customer.email ?? null;
      }
    }

    return noStoreJson({ email });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe session lookup failed:", message);
    return noStoreJson({ error: "Failed to fetch session" }, 500);
  }
}
