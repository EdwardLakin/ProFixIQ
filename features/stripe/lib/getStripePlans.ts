"use server";

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10" as Stripe.LatestApiVersion,
});

export async function getStripePlans() {
  try {
    console.log("📦 Fetching Stripe plans...");

    const prices = await stripe.prices.list({
      expand: ["data.product"],
      active: true,
      limit: 100,
    });

    const plans = prices.data
      .filter((price) => price.type === "recurring")
      .map((price) => {
        const productName =
          typeof price.product === "object" && "name" in price.product
            ? price.product.name
            : "Unnamed Product";

        const features =
          typeof price.product === "object" &&
          "metadata" in price.product &&
          price.product.metadata?.features
            ? price.product.metadata.features.split("|")
            : [];

        return {
          id: price.id,
          nickname: price.nickname || "",
          amount: (price.unit_amount || 0) / 100,
          interval: price.recurring?.interval || "month",
          productName,
          features,
        };
      });

    console.log(`✅ Retrieved ${plans.length} plans from Stripe`);
    return plans;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Failed to fetch Stripe plans:", message);
    throw new Error(`Failed to fetch Stripe plans: ${message}`);
  }
}
