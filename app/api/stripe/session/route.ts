// app/api/stripe/session/route.ts

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Try customer_details first
    let email: string | null = session.customer_details?.email ?? null;

    // If session.customer is an ID, fetch customer
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