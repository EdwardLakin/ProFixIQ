export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

export async function GET(req: Request) {
  try {
    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageBilling",
      allowRoles: ["owner", "admin"],
      requireOwnerPin: true,
      ownerPinRequest: req,
    });
    if (!access.ok) return access.response;

    const url = new URL(req.url);
    const sessionId = (url.searchParams.get("session_id") ?? "").trim();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    if (!sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "Invalid session_id" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.shop_id !== access.profile.shop_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let email: string | null = session.customer_details?.email ?? null;

    if (!email && typeof session.customer === "string") {
      const customer = await stripe.customers.retrieve(session.customer);

      if (customer && !("deleted" in customer)) {
        email = customer.email ?? null;
      }
    }

    return NextResponse.json({ email }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe session lookup failed:", message);
    return NextResponse.json(
      { error: "Failed to fetch session", details: message },
      { status: 500 },
    );
  }
}
