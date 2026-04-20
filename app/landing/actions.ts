"use server";

import { createStripeClient } from "@/features/stripe/lib/stripe/client";

const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY!);

export async function fetchPlans() {
  try {
    const prices = await stripe.prices.list({
      active: true,
      expand: ["data.product"],
      limit: 100,
    });

    return prices.data
      .filter((price) => price.unit_amount && price.nickname)
      .map((price) => ({
        id: price.id,
        nickname: price.nickname!,
        unit_amount: price.unit_amount!,
        interval: price.recurring?.interval || "month",
      }));
  } catch (err) {
    console.error("❌ Error loading Stripe prices:", err);
    return [];
  }
}
